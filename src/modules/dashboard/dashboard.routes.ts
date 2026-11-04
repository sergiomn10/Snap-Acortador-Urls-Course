import { Router, type RequestHandler } from 'express';
import { getAuthUser } from '../../middleware/require-auth.ts';
import { DEFAULT_PERIOD, PERIODS, type DashboardService, type Period } from './dashboard.service.ts';

// "7, 30 o 90"
const PERIODS_TEXT = new Intl.ListFormat('es', { type: 'disjunction' }).format(PERIODS.map(String));

function parseDays(value: unknown): Period | undefined {
  if (value === undefined) return DEFAULT_PERIOD;
  return PERIODS.find((days) => String(days) === value);
}

/** Vista general de las URLs del usuario autenticado, montada en /dashboard. */
export function createDashboardRouter(service: DashboardService, requireAuth: RequestHandler): Router {
  const router = Router();

  router.get('/', requireAuth, (req, res) => {
    const days = parseDays(req.query.days);
    if (days === undefined) {
      res.status(400).json({
        error: 'Bad Request',
        message: `El parámetro "days" debe ser ${PERIODS_TEXT}`,
      });
      return;
    }

    res.status(200).json(service.get(getAuthUser(req).id, days));
  });

  return router;
}
