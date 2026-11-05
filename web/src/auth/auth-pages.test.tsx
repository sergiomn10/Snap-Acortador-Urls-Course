import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { authResult, emptyDashboard, emptyDashboardApi, mockApi, renderAt, storeSession } from '../test/utils.tsx';
import { safeNext } from './guards.tsx';
import { SESSION_KEY } from './session.ts';

const dashboardHeading = () => screen.findByRole('heading', { name: 'Dashboard', level: 1 });

/** API en la que el login/registro responde `status` y el dashboard está vacío. */
function mockAuth(endpoint: 'login' | 'register', status: number, body?: unknown) {
  return mockApi({ ...emptyDashboardApi(), [`POST /api/auth/${endpoint}`]: { status, body } });
}

async function fillLogin(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
}

async function fillRegister(name: string, email: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Nombre'), name);
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));
}

describe('LoginPage', () => {
  it('envía las credenciales, guarda la sesión y redirige al dashboard', async () => {
    const fetchMock = mockAuth('login', 200, authResult());
    const router = renderAt('/login');

    await fillLogin('ana@example.com', 'secreto123');

    expect(await dashboardHeading()).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/dashboard');
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ana@example.com', password: 'secreto123' }),
    });
    expect(JSON.parse(localStorage.getItem(SESSION_KEY) ?? '{}')).toMatchObject({
      token: expect.any(String),
      user: { id: 1, name: 'Ana' },
    });
  });

  it('muestra el mensaje de la API si las credenciales son incorrectas', async () => {
    mockAuth('login', 401, { error: 'Unauthorized', message: 'Email o password incorrectos' });
    const router = renderAt('/login');

    await fillLogin('ana@example.com', 'malpassword');

    expect(await screen.findByRole('alert')).toHaveTextContent('Email o password incorrectos');
    expect(router.state.location.pathname).toBe('/login');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('avisa si no se puede conectar con el servidor', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    renderAt('/login');

    await fillLogin('ana@example.com', 'secreto123');

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar con el servidor');
  });

  it('usa un mensaje genérico si un 5xx llega sin cuerpo (API caída tras el proxy)', async () => {
    mockAuth('login', 502);
    renderAt('/login');

    await fillLogin('ana@example.com', 'secreto123');

    expect(await screen.findByRole('alert')).toHaveTextContent('El servidor no ha podido completar la petición');
  });

  it('valida los campos antes de llamar a la API', async () => {
    const fetchMock = mockAuth('login', 200, authResult());
    renderAt('/login');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Entrar' }));

    expect(screen.getByText('Introduce tu email')).toBeInTheDocument();
    expect(screen.getByText('Introduce tu password')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('vuelve a la ruta indicada en ?next tras el login', async () => {
    mockApi({
      ...emptyDashboardApi(),
      'POST /api/auth/login': { status: 200, body: authResult() },
      'GET /api/dashboard?days=7': { status: 200, body: emptyDashboard(7) },
    });
    const router = renderAt('/login?next=%2Fdashboard%3Fdays%3D7');

    await fillLogin('ana@example.com', 'secreto123');

    await dashboardHeading();
    expect(router.state.location.pathname + router.state.location.search).toBe('/dashboard?days=7');
  });
});

describe('RegisterPage', () => {
  it('crea la cuenta, guarda la sesión y redirige al dashboard', async () => {
    const fetchMock = mockAuth('register', 201, authResult());
    const router = renderAt('/register');

    await fillRegister('Ana', 'ana@example.com', 'secreto123');

    expect(await dashboardHeading()).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/dashboard');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/register',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'ana@example.com', password: 'secreto123', name: 'Ana' }),
      }),
    );
    expect(localStorage.getItem(SESSION_KEY)).not.toBeNull();
  });

  it('si el email ya existe muestra el error y ofrece ir al login', async () => {
    mockAuth('register', 409, { error: 'Conflict', message: 'El email ya está registrado' });
    renderAt('/register');

    await fillRegister('Ana', 'ana@example.com', 'secreto123');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('El email ya está registrado');
    expect(screen.getByRole('link', { name: '¿Quieres iniciar sesión?' })).toHaveAttribute('href', '/login');
  });

  it('muestra el mensaje de validación de la API (400)', async () => {
    mockAuth('register', 400, { error: 'Bad Request', message: 'El campo "email" no es un email válido' });
    renderAt('/register');

    await fillRegister('Ana', 'ana@example.com', 'secreto123');

    expect(await screen.findByRole('alert')).toHaveTextContent('El campo "email" no es un email válido');
  });

  it('aplica las mismas reglas que la API antes de enviar', async () => {
    const fetchMock = mockAuth('register', 201, authResult());
    renderAt('/register');

    await fillRegister('   ', 'no-es-un-email', 'corta');

    expect(screen.getByText('Introduce tu nombre')).toBeInTheDocument();
    expect(screen.getByText('El email no es válido')).toBeInTheDocument();
    expect(screen.getByText('El password debe tener al menos 8 caracteres')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('guards', () => {
  it('sin sesión, el dashboard redirige al login recordando el destino', () => {
    const router = renderAt('/dashboard');

    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe('?next=%2Fdashboard');
  });

  it('con una sesión guardada, /login salta directamente al dashboard', async () => {
    mockApi(emptyDashboardApi());
    storeSession();

    const router = renderAt('/login');

    expect(await dashboardHeading()).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/dashboard');
  });

  it('ignora una sesión guardada que ya ha caducado', () => {
    const { token, user } = authResult();
    localStorage.setItem(SESSION_KEY, JSON.stringify({ token, user, expiresAt: Date.now() - 1 }));

    const router = renderAt('/dashboard');

    expect(router.state.location.pathname).toBe('/login');
  });

  it('cerrar sesión borra el token y vuelve al login', async () => {
    mockAuth('login', 200, authResult());
    const router = renderAt('/login');
    await fillLogin('ana@example.com', 'secreto123');

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Cerrar sesión' }));

    expect(router.state.location.pathname).toBe('/login');
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it.each([
    [null, '/dashboard'],
    ['/dashboard?days=7', '/dashboard?days=7'],
    ['https://evil.example', '/dashboard'],
    ['//evil.example', '/dashboard'],
    ['/\\evil.example', '/dashboard'],
  ])('safeNext(%j) → %s', (next, expected) => {
    expect(safeNext(next)).toBe(expected);
  });
});
