# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Snap is a URL shortener with click analytics. Two independent projects live here:

- `src/` — API: Node.js ≥ 22.18, Express 5, TypeScript, SQLite via built-in `node:sqlite`.
- `web/` — React SPA (React Router, TanStack Query, Vite). It has its **own** `package.json`, `tsconfig` and tests; nothing is shared with the API.

`README.md` @README.md (in Spanish) is the detailed reference for endpoints, status codes, DB schema and conventions. Keep it up to date when behaviour changes.

## Commands

API (repo root):

```bash
npm run dev                 # node --watch src/server.ts (TS runs directly, no build step) → :3000
npm test                    # vitest run, only src/**/*.test.ts
npx vitest run src/modules/urls/urls.test.ts      # single file
npx vitest run -t "nombre del test"                # single test by name
npm run typecheck           # tsc --noEmit
npm run build               # tsc -p tsconfig.build.json → dist/ (excludes tests)
```

Web (`web/`, or from the root with `npm --prefix web ...`):

```bash
npm --prefix web install    # first time only
npm run dev:web             # from root; Vite on :5173, needs the API running on :3000
npm --prefix web test       # Vitest + Testing Library in jsdom
npm --prefix web run typecheck
npm --prefix web run build  # typecheck + vite build → web/dist/
```

No configuration is required in development: `src/config.ts` falls back to dev-only secrets. The SQLite file `snap.db` is created in the cwd.

## API architecture

- **`createApp({ db, saltRounds?, now? })`** in `src/app.ts` builds the Express app; `src/server.ts` opens the DB and listens. Tests never use `server.ts`.
- **Dependency injection via `createX(...)` factories.** Repositories, services, routers and middleware receive their dependencies (db, secrets, `requireAuth`, `now`) as parameters instead of reading global state. The clock (`now`) is injected into the click tracker and dashboard service so tests can fix time.
- **Module layout** (`src/modules/<feature>/`): `*.routes.ts` (HTTP validation, status codes, response shape) → optional `*.service.ts` (business logic, throws domain errors like `AuthError` that routes map to HTTP) → `*.repository.ts` (all SQL). Routes and services never touch the DB directly. Simple modules (`urls`) skip the service.
- **Middleware order matters:** `request-logger → express.json() → /health → /auth → /urls → /dashboard → /:code → notFoundHandler → errorHandler`. `GET /:code` (redirect) catches every single-segment path, so **new routers must be mounted before it**, and their mount names must be added to `RESERVED_ALIASES` in `src/modules/urls/urls.routes.ts` **and** in `web/src/urls/validation.ts`.
- **Auth:** `createRequireAuth()` is applied per route; protected handlers read the user with `getAuthUser(req)`, which throws if the route wasn't protected (catches forgotten middleware).
- **Analytics:** each redirecting `GET /:code` inserts a row in `clicks` (HEAD doesn't). Click tracking failures are logged and must never break the redirect. Visitors are stored as HMAC(IP+UA), referrer as host only, bots are stored but excluded from stats.
- **Config** (`src/config.ts`) is validated at import time and throws `ConfigError`; in production `DB_NAME`, `JWT_SECRET`, `VISITOR_HASH_SECRET` are mandatory.
- **Errors** are always JSON `{ error, message }`; 500 messages are hidden in production.

### Database

`createDatabase(path)` in `src/db/database.ts` enables foreign keys + WAL, runs `CREATE TABLE IF NOT EXISTS`, then `migrate()`, then creates triggers — on every open. Changes to an existing table's columns must go in `migrate()` as idempotent steps (`addColumnIfMissing`), since `CREATE TABLE IF NOT EXISTS` won't alter existing tables.

- `urls.click_count` / `last_click_at` are denormalized and maintained by the `clicks_count_url` trigger (non-bot clicks only) — don't update them from application code.
- `clicks_url_time` is a covering index for dashboard queries; keep `device` and `visitor` in it if you touch it.
- All dates are stored as ISO 8601 UTC text from `toISOString()`; queries compare them as strings, so always use that exact format.
- `node:sqlite` is synchronous: slow queries block the whole server.

## Testing

- Tests sit next to the code (`*.test.ts`). Each suite uses its own `':memory:'` DB.
- HTTP integration tests use `listen(createApp({ db, saltRounds: 4 }))` from `src/testing/listen.ts` (random port) and real `fetch`. Protected routes are tested by registering real users through the API and using their tokens. Use `saltRounds: 4` to keep bcrypt fast.
- Dashboard tests fix the clock with `createApp({ db, now: () => clock })` and generate clicks via real redirects.
- Web tests mount the full app with an in-memory router and a fake `fetch` (`web/src/test/utils.tsx`); no backend needed. `web/src/test/setup.ts` replaces Node 25's global `localStorage` with an in-memory one.

## Web architecture

- All API calls use the `/api` prefix; the Vite dev proxy strips it and forwards to `:3000` (`changeOrigin` so `shortUrl` points at the API host). This avoids CORS and the `/dashboard` SPA-vs-API route clash. `VITE_API_URL` overrides the base at build time.
- `AuthContext` stores the session in `localStorage` (`snap.session`), auto-logs out on token expiry, on any 401 (via `withToken`), and across tabs; logout clears the TanStack Query cache. Wrap authenticated API calls in `withToken`.
- Response types in `web/src/api/types.ts` and form validation in `web/src/auth/validation.ts` / `web/src/urls/validation.ts` are **hand-copied from the API** — update them when API shapes or rules change.
- Production deploy is not yet possible: the API has no CORS middleware.

## Conventions

- Relative imports include the `.ts` extension; use `import type` for types.
- TypeScript strict with `erasableSyntaxOnly`: no `enum`, `namespace` or parameter properties (only exception: `declare global { namespace Express }` in `require-auth.ts`).
- Files kebab-case with role suffix (`auth.service.ts`); factories `createX`; domain errors `XError extends Error`; SQL snake_case exposed as camelCase.
- Code comments and user-facing messages are in Spanish.
