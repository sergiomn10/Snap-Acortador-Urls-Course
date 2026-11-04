<p align="center">
  <img src="imagePortadaREADME.jpg" width="400" alt="Node JS Logo" />
</p>

# Snap

Acortador de URLs con analíticas, construido con **Node.js**, **Express 5**, **TypeScript** y **SQLite**.

Snap recibe una URL larga, genera un código corto aleatorio y redirige a la URL original cuando alguien visita ese código. Los usuarios se registran, inician sesión con un JWT y gestionan sus propias URLs.

> **Estado:** en desarrollo. La autenticación, el acortado, el borrado, la redirección y el listado ya funcionan. Los módulos `dashboard` y `analytics` están planificados, pero todavía no tienen código.

---

## Tabla de contenidos

- [Características](#características)
- [Requisitos](#requisitos)
- [Puesta en marcha](#puesta-en-marcha)
- [Configuración](#configuración)
- [Autenticación](#autenticación)
- [API](#api)
- [Arquitectura](#arquitectura)
- [Base de datos](#base-de-datos)
- [Tests](#tests)
- [Convenciones](#convenciones)
- [Añadir un módulo nuevo](#añadir-un-módulo-nuevo)

---

## Características

**URLs**

- **Códigos cortos impredecibles:** 7 caracteres base62 generados con `crypto.randomInt`. Hay unos 3,5 billones de combinaciones.
- **Colisiones controladas:** si un código ya existe, se reintenta con otro.
- **Validación de entrada:** solo se aceptan URLs `http` o `https` de hasta 2048 caracteres. Así se evita redirigir a `javascript:`, `data:`, `file:`, etc.
- **Redirección 302:** la respuesta no queda cacheada en el navegador, de modo que cada visita llega al servidor. Esto es necesario para las analíticas.
- **Propiedad:** cada URL pertenece a quien la crea, y solo esa persona puede borrarla.

**Autenticación**

- **Registro e inicio de sesión con JWT** (HS256), con una validez de 24 horas.
- **Passwords hasheados con bcrypt** (coste 12). Nunca se guardan ni se devuelven en claro.
- **Emails normalizados:** `Ana@Example.com` y `ana@example.com` son la misma cuenta.
- **Sin enumeración de usuarios:** un email inexistente y un password incorrecto dan la misma respuesta y tardan lo mismo.

**General**

- **Sin dependencias de base de datos:** se usa el módulo `node:sqlite` que trae Node.
- **Configuración validada al arrancar:** si la configuración no es válida, el proceso no arranca.
- **Errores homogéneos:** todas las respuestas de error son JSON con la forma `{ error, message }`. En producción no se exponen detalles internos.
- **Logging de peticiones:** se registran método, ruta, status y duración. Nunca se registran el body, la query ni los headers, así que tampoco los tokens ni los passwords.

## Requisitos

- **Node.js ≥ 22.18.** TypeScript se ejecuta directamente, sin compilar, y se usa `node:sqlite`.
- npm

> En algunas versiones de Node 22, `node:sqlite` muestra un `ExperimentalWarning` al arrancar. Es inofensivo.

## Puesta en marcha

```bash
npm install
npm run dev
```

El servidor queda escuchando en `http://localhost:3000` y se reinicia al cambiar el código. La base de datos `snap.db` se crea automáticamente en el directorio actual.

En desarrollo no hace falta configurar nada: `JWT_SECRET` usa un valor por defecto que **solo sirve para desarrollo**.

### Scripts

| Script | Descripción |
|---|---|
| `npm run dev` | Arranca en modo desarrollo con recarga automática (`node --watch`). |
| `npm run build` | Compila a JavaScript en `dist/`. Excluye los tests. |
| `npm start` | Ejecuta la versión compilada (`dist/server.js`). |
| `npm run typecheck` | Comprueba los tipos sin generar salida. |
| `npm test` | Ejecuta todos los tests una vez. |
| `npm run test:watch` | Ejecuta los tests en modo watch. |

### Producción

```bash
npm ci
npm run build

# Genera un secreto aleatorio, una sola vez, y guárdalo en tu gestor de secretos
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64'))"

NODE_ENV=production \
DB_NAME=/var/lib/snap/snap.db \
JWT_SECRET='<secreto generado>' \
PORT=8080 \
npm start
```

## Configuración

La configuración se lee de variables de entorno en [`src/config.ts`](src/config.ts) y se valida al importar el módulo. Si hay algún error, el proceso termina con un `ConfigError` que enumera todos los problemas. Los mensajes nunca incluyen el valor de los secretos.

| Variable | Por defecto | Descripción |
|---|---|---|
| `NODE_ENV` | `development` | `development`, `production` o `test`. |
| `PORT` | `3000` | Puerto HTTP. Debe ser un entero entre 1 y 65535. |
| `DB_NAME` | `snap.db` | Ruta del archivo SQLite. **Obligatoria en producción.** |
| `JWT_SECRET` | Valor fijo de desarrollo | Clave para firmar los JWT. Mínimo 32 caracteres. **Obligatoria en producción.** |

En `production`, los errores 500 no incluyen el mensaje interno. En `test`, el logger de peticiones está desactivado.

> ⚠️ Si cambias `JWT_SECRET`, todos los tokens emitidos dejan de ser válidos y los usuarios tendrán que volver a iniciar sesión.

## Autenticación

1. El cliente se registra (`POST /auth/register`) o inicia sesión (`POST /auth/login`) y recibe un `token`.
2. En las rutas protegidas, envía ese token en el header `Authorization`:

   ```
   Authorization: Bearer <token>
   ```

3. El token expira a las **24 horas**. Después hay que volver a hacer login.

El JWT está firmado con HS256 y contiene:

| Claim | Contenido |
|---|---|
| `sub` | Id del usuario (string). |
| `email` | Email normalizado. |
| `iat` / `exp` | Emisión y expiración (+24 h). |

### Qué rutas exigen token

| Ruta | Acceso |
|---|---|
| `POST /auth/register`, `POST /auth/login` | Público |
| `POST /urls` | 🔒 Token |
| `DELETE /urls/:code` | 🔒 Token, y solo el creador de la URL |
| `GET /urls` | Público |
| `GET /:code` | Público |
| `GET /health` | Público |

Si falta el token, el header está mal formado, la firma no es válida o el token ha expirado, la respuesta es `401` con el header `WWW-Authenticate: Bearer`:

```json
{ "error": "Unauthorized", "message": "El token ha expirado" }
```

## API

Todas las respuestas son JSON, excepto la redirección y el `204` del borrado.

### `POST /auth/register`: crear una cuenta

```bash
curl -X POST http://localhost:3000/auth/register \
  -H 'content-type: application/json' \
  -d '{"email": "ana@example.com", "password": "contraseña-segura", "name": "Ana"}'
```

**201 Created**

```json
{
  "user": { "id": 1, "email": "ana@example.com", "name": "Ana", "createdAt": "2026-11-04T09:15:02.118Z" },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

| Status | Cuándo |
|---|---|
| `400` | `email` ausente o inválido; `password` ausente, con menos de 8 caracteres o con más de 72 bytes; `name` ausente, en blanco o con más de 100 caracteres. |
| `409` | El email ya está registrado, sin distinguir mayúsculas de minúsculas. |

> bcrypt solo tiene en cuenta los primeros 72 **bytes**. Un carácter como `ñ` ocupa 2 bytes, así que el límite real en caracteres puede ser menor.

### `POST /auth/login`: iniciar sesión

```bash
curl -X POST http://localhost:3000/auth/login \
  -H 'content-type: application/json' \
  -d '{"email": "ana@example.com", "password": "contraseña-segura"}'
```

**200 OK** con el mismo formato que el registro: `{ user, token }`.

| Status | Cuándo |
|---|---|
| `400` | `email` ausente o inválido, o `password` ausente. |
| `401` | Email inexistente **o** password incorrecto. Es la misma respuesta en los dos casos: `"Email o password incorrectos"`. |

El email no distingue mayúsculas de minúsculas. En el login no se aplica la regla de longitud mínima del password, para que un cambio futuro de esa regla no deje fuera a usuarios antiguos.

### `POST /urls`: acortar una URL 🔒

```bash
curl -X POST http://localhost:3000/urls \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN" \
  -d '{"url": "https://example.com/una/ruta/muy/larga"}'
```

**201 Created**

```json
{
  "code": "jPOgMYB",
  "url": "https://example.com/una/ruta/muy/larga",
  "createdAt": "2026-11-04T09:16:40.512Z",
  "userId": 1,
  "shortUrl": "http://localhost:3000/jPOgMYB"
}
```

| Status | Cuándo |
|---|---|
| `400` | `url` ausente, no es un string, no es una URL válida, no usa `http`/`https` o supera los 2048 caracteres. |
| `401` | Sin token, token inválido o expirado, o el usuario del token ya no existe. |

### `DELETE /urls/:code`: borrar una URL 🔒

```bash
curl -X DELETE http://localhost:3000/urls/jPOgMYB \
  -H "authorization: Bearer $TOKEN"
```

| Status | Cuándo |
|---|---|
| `204` | Borrada. El código deja de redirigir. |
| `401` | Sin token, o token inválido o expirado. |
| `403` | La URL pertenece a otro usuario, o no tiene dueño (ver [URLs sin dueño](#urls-sin-dueño)). |
| `404` | El código no existe. |

### `GET /urls`: listar URLs

Devuelve todas las URLs de todos los usuarios, de la más reciente a la más antigua.

```json
[
  {
    "code": "jPOgMYB",
    "url": "https://example.com/una/ruta/muy/larga",
    "createdAt": "2026-11-04T09:16:40.512Z",
    "userId": 1
  }
]
```

### `GET /:code`: redirigir

| Caso | Respuesta |
|---|---|
| El código existe | `302 Found` con `Location: <url original>` |
| El código no existe | `404` `{ "error": "Not Found", "message": "El código abc1234 no existe" }` |

### `GET /health`: estado del servicio

```json
{ "status": "ok", "uptime": 12.34 }
```

### Resumen de errores

| Status | `error` | Cuándo |
|---|---|---|
| `400` | `Bad Request` | Body JSON malformado o datos de entrada inválidos. |
| `401` | `Unauthorized` | Falta autenticación, o el token o las credenciales no son válidos. |
| `403` | `Forbidden` | Autenticado, pero sin permiso sobre ese recurso. |
| `404` | `Not Found` | Ruta o código inexistente. |
| `409` | `Conflict` | Email ya registrado. |
| `500` | `Internal Server Error` | Error inesperado. El mensaje solo se incluye fuera de producción. |

## Arquitectura

```
src/
├── server.ts                    # Punto de entrada: abre la BD y arranca el servidor
├── app.ts                       # createApp({ db }): monta middlewares y routers
├── config.ts                    # Carga y validación de variables de entorno
├── db/
│   └── database.ts              # createDatabase(path): conexión, esquema y migraciones
├── middleware/
│   ├── errors.ts                # notFoundHandler y createErrorHandler
│   ├── request-logger.ts        # createRequestLogger
│   └── require-auth.ts          # createRequireAuth (verifica el JWT) y getAuthUser
├── modules/
│   ├── health/
│   │   └── health.routes.ts
│   ├── auth/
│   │   ├── auth.repository.ts   # Acceso a la tabla users
│   │   ├── auth.service.ts      # register/login: bcrypt + emisión del JWT
│   │   └── auth.routes.ts       # Validación HTTP, /auth/register y /auth/login
│   ├── urls/
│   │   ├── urls.repository.ts   # Acceso a datos y generación de códigos
│   │   └── urls.routes.ts       # Validación HTTP, /urls y /:code
│   ├── dashboard/               # (pendiente)
│   └── analytics/               # (pendiente)
└── testing/
    └── listen.ts                # Utilidad para levantar la app en tests
```

### Principios

- **Un módulo por funcionalidad.** Cada carpeta de `src/modules/` agrupa sus rutas, su lógica, su acceso a datos y sus tests.
- **La app no arranca el servidor.** `createApp()` solo construye la aplicación de Express y `server.ts` la pone a escuchar. Así los tests pueden levantar instancias aisladas en puertos libres.
- **Las dependencias se pasan como parámetros.** Las funciones `createX(...)` reciben lo que necesitan (la base de datos, el secreto JWT, el middleware de autenticación, opciones), en vez de leer estado global. En los tests se les pasa una base en memoria o funciones falsas.
- **Separación por capas:**
  - **Rutas:** HTTP (validar la entrada, elegir el status, dar forma a la respuesta).
  - **Servicio:** la lógica de negocio, cuando la hay (`auth.service.ts`: hashing, credenciales, tokens). Lanza errores propios, como `AuthError`, que las rutas convierten en status HTTP.
  - **Repositorio:** SQL. Ni las rutas ni los servicios acceden a la base de datos directamente.

  Un módulo sencillo como `urls` no necesita servicio: las rutas hablan directamente con el repositorio.
- **La autenticación es un middleware.** `createRequireAuth()` se aplica ruta a ruta. Las rutas protegidas leen el usuario con `getAuthUser(req)`, que lanza un error si la ruta no está protegida, para detectar ese olvido.

### Orden de la cadena de middlewares

```
request-logger → express.json() → /health → /auth → /urls → /:code → notFoundHandler → errorHandler
```

`GET /:code` captura cualquier ruta de un solo segmento, así que **cualquier router nuevo debe montarse antes que él**.

## Base de datos

SQLite mediante `node:sqlite` (`DatabaseSync`). Al abrir cada conexión, `createDatabase()`:

1. activa las claves foráneas (`PRAGMA foreign_keys = ON`), que SQLite tiene desactivadas por defecto;
2. crea las tablas que falten (`CREATE TABLE IF NOT EXISTS`);
3. aplica las migraciones pendientes.

Todas las fechas se guardan como texto ISO 8601 en UTC.

### `users`

Cuentas de usuario. Las usa el módulo `auth`.

```sql
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT    NOT NULL,
  name          TEXT    NOT NULL,
  created_at    TEXT    NOT NULL
);
```

| Columna | Descripción |
|---|---|
| `id` | Identificador interno. Es el `sub` del JWT. |
| `email` | Email de acceso, guardado en minúsculas. Único sin distinguir mayúsculas de minúsculas (`COLLATE NOCASE`). |
| `password_hash` | Hash bcrypt del password. Nunca se guarda el password en claro. |
| `name` | Nombre visible del usuario. |
| `created_at` | Fecha de registro. |

### `urls`

URLs acortadas. Las usa el módulo `urls`.

```sql
CREATE TABLE urls (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT    NOT NULL UNIQUE,
  original_url TEXT    NOT NULL,
  created_at   TEXT    NOT NULL,
  user_id      INTEGER REFERENCES users(id)
);

CREATE INDEX urls_user_id ON urls (user_id);
```

| Columna | Descripción |
|---|---|
| `id` | Identificador interno. |
| `code` | Código corto público (7 caracteres base62). Único. |
| `original_url` | URL de destino, ya validada y normalizada. |
| `created_at` | Fecha de creación. |
| `user_id` | Usuario que la creó. `NULL` en las URLs anteriores a la autenticación. |

### URLs sin dueño

Las URLs creadas antes de que existiera la autenticación tienen `user_id = NULL`. Siguen redirigiendo y apareciendo en `GET /urls`, pero **nadie puede borrarlas por la API**: siempre responden `403`. Para asignarlas a un usuario o eliminarlas, hay que hacerlo directamente en SQL.

### Migraciones

`CREATE TABLE IF NOT EXISTS` no modifica las tablas que ya existen. Los cambios de columnas en tablas existentes se aplican en la función `migrate()` de [`database.ts`](src/db/database.ts). Cada migración comprueba primero si ya está aplicada, así que se pueden ejecutar todas cada vez que se abre la base.

| Migración | Cambio |
|---|---|
| `urls.user_id` | Añade la columna y su índice a bases anteriores a la autenticación. Las filas existentes quedan con `NULL`. |

Los archivos `*.db` están en `.gitignore`.

## Tests

```bash
npm test
```

Se usa [Vitest](https://vitest.dev/). Los tests están junto al código que prueban (`*.test.ts`) y son de dos tipos:

- **Unitarios:** por ejemplo, `auth.service.test.ts` o `urls.repository.test.ts`, contra una base SQLite en memoria (`':memory:'`).
- **HTTP de integración:** por ejemplo, `auth.test.ts` o `urls.test.ts`. Levantan la app real con `listen(createApp({ db }))` en un puerto aleatorio y le hacen peticiones con `fetch`. Para probar rutas protegidas, registran usuarios reales por la API y usan sus tokens.

Detalles:

- Cada suite usa su propia base en memoria, así que no hay estado compartido. La única excepción es el test de migraciones, que necesita un archivo real: lo crea en un directorio temporal y lo borra al terminar.
- Los tests usan bcrypt con coste 4 (`createApp({ db, saltRounds: 4 })`) en lugar de 12. Así van rápidos sin cambiar el comportamiento.

## Convenciones

| Elemento | Convención | Ejemplo |
|---|---|---|
| Archivos | kebab-case, con sufijo de rol | `require-auth.ts`, `auth.service.ts` |
| Tests | Junto al archivo que prueban | `auth.test.ts` |
| Funciones fábrica | `createX` | `createApp`, `createAuthService`, `createRequireAuth` |
| Tipos e interfaces | PascalCase | `Config`, `UrlsRepository`, `AuthUser` |
| Errores de dominio | Clase `XError` que extiende `Error` | `AuthError`, `UnknownUserError` |
| Constantes | UPPER_SNAKE_CASE | `CODE_LENGTH`, `MIN_PASSWORD_LENGTH` |
| Parámetros sin usar | Prefijo `_` | `(_req, res)` |
| Columnas SQL | snake_case; en TypeScript se exponen en camelCase | `password_hash` → `passwordHash` |

- Los imports relativos llevan la extensión `.ts`, y los tipos se importan con `import type`.
- Comentarios y mensajes en español.
- TypeScript en modo estricto con `erasableSyntaxOnly`, por lo que no se pueden usar `enum`, `namespace` ni parameter properties. La única excepción es `declare global { namespace Express }` en `require-auth.ts`: es una declaración de tipos, no genera código, y es la forma que exige `@types/express` para añadir `req.user`.

## Añadir un módulo nuevo

Para un módulo hipotético `foo`:

1. Si necesita tablas, añadir el esquema en `src/db/database.ts`. Si modifica una tabla existente, añadir también una migración en `migrate()`.
2. Crear `src/modules/foo/foo.repository.ts` con `createFooRepository(db)`.
3. Si tiene lógica de negocio más allá de leer y escribir, crear `foo.service.ts` con `createFooService(...)`.
4. Crear `src/modules/foo/foo.routes.ts` con `createFooRouter(...)`. Si tiene rutas protegidas, recibir `requireAuth` como parámetro y usar `getAuthUser(req)` en ellas.
5. Montarlo en `src/app.ts` **antes** del router de redirección:
   ```ts
   app.use('/foo', createFooRouter(createFooRepository(db), requireAuth));
   ```
6. Añadir los tests (`foo.repository.test.ts`, `foo.test.ts`…) y ejecutar `npm test`.
