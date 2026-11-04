import type { DatabaseSync } from 'node:sqlite';
import type { Device } from './click-info.ts';

export interface Click {
  /** ISO 8601 en UTC, tal como lo da toISOString(): las queries comparan fechas como texto. */
  clickedAt: string;
  visitor: string;
  referrer: string | null;
  device: Device;
}

export interface ClicksRepository {
  /** Devuelve false si el código no existe. */
  record: (code: string, click: Click) => boolean;
}

export function createClicksRepository(db: DatabaseSync): ClicksRepository {
  // Se inserta a partir del código para no exponer el id interno de urls.
  // El trigger clicks_count_url actualiza los contadores de urls en la misma operación.
  const insert = db.prepare(`
    INSERT INTO clicks (url_id, clicked_at, visitor, referrer, device)
    SELECT id, :clickedAt, :visitor, :referrer, :device FROM urls WHERE code = :code
  `);

  return {
    record(code, { clickedAt, visitor, referrer, device }) {
      return insert.run({ code, clickedAt, visitor, referrer, device }).changes === 1;
    },
  };
}
