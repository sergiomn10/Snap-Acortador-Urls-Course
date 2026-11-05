import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Dashboard, MyUrl, ShortUrl } from '../api/types.ts';
import { SESSION_KEY } from '../auth/session.ts';
import { emptyDashboard, emptyDashboardApi, mockApi, renderAt, storeSession, type MockRequest } from '../test/utils.tsx';

const myUrl = (overrides: Partial<MyUrl>): MyUrl => ({
  code: 'abc1234',
  url: 'https://example.com/destino',
  createdAt: '2026-11-01T10:00:00.000Z',
  userId: 1,
  shortUrl: 'http://localhost:3000/abc1234',
  clickCount: 0,
  lastClickAt: null,
  ...overrides,
});

const dashboardWithData = (): Dashboard => ({
  ...emptyDashboard(),
  totals: { urls: 2, clicks: 1234, urlsWithClicks: 1, lastClickAt: new Date().toISOString() },
  trend: { clicks: 120, previousClicks: 100, changePct: 20, uniqueVisitors: 85 },
});

async function fillCreate(url: string, alias = '') {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('URL larga'), url);
  if (alias !== '') await user.type(screen.getByLabelText('Alias (opcional)'), alias);
  await user.click(screen.getByRole('button', { name: 'Acortar' }));
}

const urlsTable = () => screen.findByRole('table');

describe('DashboardPage', () => {
  it('exige sesión: sin token redirige al login', () => {
    const router = renderAt('/dashboard');

    expect(router.state.location.pathname).toBe('/login');
  });

  it('muestra las URLs del usuario con sus estadísticas, pidiéndolas con su token', async () => {
    const token = storeSession();
    const fetchMock = mockApi({
      'GET /api/urls/mine': {
        status: 200,
        body: [
          myUrl({ code: 'promo', shortUrl: 'http://localhost:3000/promo', clickCount: 1234, lastClickAt: new Date().toISOString() }),
          myUrl({ code: 'xyz9876', shortUrl: 'http://localhost:3000/xyz9876', url: 'https://example.org/otra' }),
        ],
      },
      'GET /api/dashboard?days=30': { status: 200, body: dashboardWithData() },
    });

    renderAt('/dashboard');

    const rows = within(await urlsTable()).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByRole('link', { name: 'localhost:3000/promo' })).toHaveAttribute(
      'href',
      'http://localhost:3000/promo',
    );
    expect(rows[0]).toHaveTextContent(new Intl.NumberFormat('es').format(1234));
    expect(rows[0]).toHaveTextContent('ahora mismo');
    expect(rows[1]).toHaveTextContent('example.org/otra');
    expect(rows[1]).toHaveTextContent('Nunca');

    // Resumen del periodo.
    expect(await screen.findByText('120')).toBeInTheDocument();
    expect(screen.getByText('+20 %')).toBeInTheDocument();
    expect(screen.getByText('85')).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith('/api/urls/mine', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
  });

  it('muestra un estado vacío si el usuario no tiene URLs', async () => {
    storeSession();
    mockApi(emptyDashboardApi());

    renderAt('/dashboard');

    expect(await screen.findByText(/Aún no has acortado ninguna URL/)).toBeInTheDocument();
    expect(screen.getByText('Sin clics en el periodo anterior')).toBeInTheDocument();
  });

  it('crea una URL con alias, la muestra y refresca el listado', async () => {
    const token = storeSession();
    const created: ShortUrl = {
      code: 'mi-promo',
      url: 'https://example.com/rebajas',
      createdAt: new Date().toISOString(),
      userId: 1,
      shortUrl: 'http://localhost:3000/mi-promo',
    };
    let list: MyUrl[] = [];
    let posted: MockRequest | undefined;
    mockApi({
      'GET /api/urls/mine': () => ({ status: 200, body: list }),
      'GET /api/dashboard?days=30': { status: 200, body: emptyDashboard() },
      'POST /api/urls': (req) => {
        posted = req;
        list = [{ ...created, clickCount: 0, lastClickAt: null }];
        return { status: 201, body: created };
      },
    });
    renderAt('/dashboard');
    await screen.findByText(/Aún no has acortado ninguna URL/);

    await fillCreate('https://example.com/rebajas', 'mi-promo');

    expect(posted?.body).toEqual({ url: 'https://example.com/rebajas', alias: 'mi-promo' });
    expect(posted?.headers.Authorization).toBe(`Bearer ${token}`);
    const success = await screen.findByRole('status');
    expect(within(success).getByRole('link', { name: 'http://localhost:3000/mi-promo' })).toBeInTheDocument();
    const rows = within(await urlsTable()).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('localhost:3000/mi-promo');
    // El formulario queda listo para otra URL.
    expect(screen.getByLabelText('URL larga')).toHaveValue('');
    expect(screen.getByLabelText('Alias (opcional)')).toHaveValue('');
  });

  it('sin alias no lo envía, y completa https:// si falta el esquema', async () => {
    storeSession();
    let posted: MockRequest | undefined;
    mockApi({
      ...emptyDashboardApi(),
      'POST /api/urls': (req) => {
        posted = req;
        return { status: 201, body: { ...myUrl({}), url: 'https://example.com/x' } };
      },
    });
    renderAt('/dashboard');

    await fillCreate('example.com/x');

    await waitFor(() => expect(posted?.body).toEqual({ url: 'https://example.com/x' }));
  });

  it('si el alias está cogido, muestra el error junto al campo y conserva lo escrito', async () => {
    storeSession();
    mockApi({
      ...emptyDashboardApi(),
      'POST /api/urls': { status: 409, body: { error: 'Conflict', message: 'El alias "promo" ya está en uso' } },
    });
    renderAt('/dashboard');

    await fillCreate('https://example.com', 'promo');

    expect(await screen.findByText('El alias "promo" ya está en uso')).toBeInTheDocument();
    expect(screen.getByLabelText('Alias (opcional)')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Alias (opcional)')).toHaveValue('promo');
    expect(screen.getByLabelText('URL larga')).toHaveValue('https://example.com');
  });

  it('muestra en un banner otros errores de la API al crear', async () => {
    storeSession();
    mockApi({
      ...emptyDashboardApi(),
      'POST /api/urls': { status: 400, body: { error: 'Bad Request', message: 'El campo "url" debe ser una URL http(s) válida' } },
    });
    renderAt('/dashboard');

    await fillCreate('https://example.com');

    expect(await screen.findByRole('alert')).toHaveTextContent('El campo "url" debe ser una URL http(s) válida');
  });

  it('valida URL y alias antes de llamar a la API', async () => {
    storeSession();
    const fetchMock = mockApi(emptyDashboardApi());
    renderAt('/dashboard');
    await screen.findByText(/Aún no has acortado ninguna URL/);

    await fillCreate('ftp://example.com', 'no vale');

    expect(screen.getByText('Introduce una URL válida que empiece por http:// o https://')).toBeInTheDocument();
    expect(screen.getByText('Entre 3 y 32 caracteres: letras, números, "-" o "_"')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('si la API responde 401, cierra la sesión y avisa en el login', async () => {
    storeSession();
    mockApi({
      'GET /api/urls/mine': { status: 401, body: { error: 'Unauthorized', message: 'El token ha expirado' } },
      'GET /api/dashboard?days=30': { status: 401, body: { error: 'Unauthorized', message: 'El token ha expirado' } },
    });

    const router = renderAt('/dashboard');

    expect(await screen.findByText('Tu sesión ha caducado. Vuelve a iniciar sesión.')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('cambia de periodo: pide /dashboard?days=7 y lo refleja en la URL', async () => {
    storeSession();
    const fetchMock = mockApi({
      ...emptyDashboardApi(),
      'GET /api/dashboard?days=7': { status: 200, body: { ...emptyDashboard(7), trend: { ...emptyDashboard(7).trend, clicks: 7 } } },
    });
    const router = renderAt('/dashboard');
    await screen.findByText('Clics · últimos 30 días');

    await userEvent.setup().click(screen.getByRole('button', { name: '7 días' }));

    expect(await screen.findByText('Clics · últimos 7 días')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '7 días' })).toHaveAttribute('aria-pressed', 'true');
    expect(router.state.location.search).toBe('?days=7');
    expect(fetchMock).toHaveBeenCalledWith('/api/dashboard?days=7', expect.anything());
  });
});
