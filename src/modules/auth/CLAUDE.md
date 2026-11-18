# Módulo Auth — Registro, Login y Middleware JWT

## Estructura
```
src/modules/auth/
├── auth.routes.ts        — POST /auth/register, POST /auth/login. Validación HTTP y mapeo AuthError → status
├── auth.service.ts       — lógica de registro y login (bcrypt + emisión del JWT), AuthError, tipos de entrada/salida
├── auth.repository.ts    — queries sobre users: findByEmail, create
├── auth.service.test.ts  — tests unitarios del servicio (SQLite ':memory:')
└── auth.test.ts          — tests de integración HTTP del módulo

src/middleware/
├── require-auth.ts       — createRequireAuth (verificación JWT, adjunta req.user) y getAuthUser
└── require-auth.test.ts
```

No hay `auth.middleware.ts` ni `auth.types.ts`: el middleware vive en `src/middleware/require-auth.ts` y los tipos se declaran junto a quien los define (`RegisterInput`, `LoginInput`, `PublicUser`, `AuthResult` en el servicio; `User`, `NewUser` en el repositorio; `AuthUser` en el middleware).

## Reglas del módulo
- Hash de contraseña: bcryptjs con salt rounds = 12 (`DEFAULT_SALT_ROUNDS`). Solo los tests lo bajan a 4 vía `createApp({ db, saltRounds: 4 })`
- IMPORTANT: Nunca retornar password_hash al cliente. El repositorio sí lo lee (el login lo necesita), pero todo lo que sale del servicio pasa por `toPublicUser()`, y las rutas solo devuelven `{ user, token }` con `PublicUser`
- Tokens JWT: HS256, firmados con `config.jwtSecret` (variable de entorno `JWT_SECRET`) que se **inyecta** en `createAuthService` y `createRequireAuth`; nunca leer `process.env` en el módulo. Expiración: 24h (`TOKEN_EXPIRES_IN`). Payload: `sub` = id del usuario (string) y `email`
- El middleware DEBE adjuntar `{ id, email }` en `req.user` tras verificar el token (`id` es number). Las rutas protegidas lo leen con `getAuthUser(req)`, nunca con `req.user` directamente
- `jwt.verify` siempre con `algorithms: ['HS256']` fijo
- Si el token es inválido, falta o expiró, responder 401 con `{ error: "Unauthorized", message }` y el header `WWW-Authenticate: Bearer`
- Emails normalizados con `normalizeEmail()` (trim + minúsculas) antes de guardar o buscar
- Sin enumeración de usuarios: email inexistente y password incorrecto dan el mismo 401 (`"Email o password incorrectos"`) y tardan lo mismo (se compara contra un hash dummy)
- Errores de dominio: el servicio lanza `AuthError` con un `code` (`EMAIL_TAKEN`, `INVALID_CREDENTIALS`); las rutas lo traducen con `AUTH_ERROR_STATUS`. Un código nuevo exige añadir su entrada ahí
- El email duplicado se detecta con `INSERT OR IGNORE` (atómico): `create` devuelve `undefined`, no lanza

## Endpoints
| Método | Ruta             | Auth | Descripción          |
|--------|------------------|------|----------------------|
| POST   | /auth/register   | No   | Crear cuenta nueva → 201 `{ user, token }` |
| POST   | /auth/login      | No   | Obtener JWT → 200 `{ user, token }`        |

## Validaciones requeridas
- register: email válido (≤ 254 caracteres), password ≥ 8 caracteres y ≤ 72 **bytes** (límite de bcrypt), name no vacío y ≤ 100 caracteres (se recorta)
- login: email válido y password obligatorios. No se aplica la longitud mínima del password, para no dejar fuera a usuarios antiguos si cambia la regla
- Responder 400 `{ error: "Bad Request", message }` con el primer error encontrado
- Responder 409 si el email ya existe al registrar, sin distinguir mayúsculas
- Si cambias una regla, actualiza también `web/src/auth/validation.ts` y el README

## Tests obligatorios
- Registro exitoso → 201 + token (`auth.test.ts`)
- Registro con email duplicado → 409 (`auth.test.ts`)
- Login exitoso → 200 + token válido (`auth.test.ts`)
- Login con credenciales incorrectas → 401, misma respuesta para email inexistente y password incorrecto (`auth.test.ts`)
- Nunca se expone el hash del password (`auth.test.ts`, `auth.service.test.ts`)
- Acceso a ruta protegida sin token → 401 (`src/middleware/require-auth.test.ts`)
- Acceso con token expirado → 401 (`src/middleware/require-auth.test.ts`)

Ejecutar: `npx vitest run src/modules/auth src/middleware/require-auth.test.ts`
