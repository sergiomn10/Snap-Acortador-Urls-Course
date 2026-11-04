import type { Request } from 'express';
import { classifyDevice, hashVisitor, referrerHost } from './click-info.ts';
import type { ClicksRepository } from './clicks.repository.ts';

export type TrackClick = (code: string, req: Request) => void;

interface ClickTrackerOptions {
  clicks: ClicksRepository;
  visitorHashSecret: string;
  now?: (() => Date) | undefined;
  log?: (message: string, err: unknown) => void;
}

/**
 * Registra una visita a partir de la petición de redirección. Nunca lanza: si falla
 * el registro se pierde ese click, pero el usuario llega igualmente a su destino.
 */
export function createClickTracker({
  clicks,
  visitorHashSecret,
  now = () => new Date(),
  log = console.error,
}: ClickTrackerOptions): TrackClick {
  return (code, req) => {
    // Express enruta HEAD como GET: los verificadores de enlaces usan HEAD y no son visitas.
    if (req.method !== 'GET') return;

    const userAgent = req.get('user-agent');
    try {
      clicks.record(code, {
        clickedAt: now().toISOString(),
        // Detrás de un proxy req.ip es la IP del proxy salvo que se configure 'trust proxy'.
        visitor: hashVisitor(req.ip ?? '', userAgent ?? '', visitorHashSecret),
        referrer: referrerHost(req.get('referer')),
        device: classifyDevice(userAgent),
      });
    } catch (err) {
      log(`No se pudo registrar el click de ${code}`, err);
    }
  };
}
