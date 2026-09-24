# Álbum privado

Álbum multimedia privado para un grupo pequeño.

| Parte | Tecnología | Carpeta |
|---|---|---|
| Frontend (SPA estática) | Angular 22, GitHub Pages | `/` (`src/`) |
| Autenticación | Auth0 (Authorization Code + PKCE) | — |
| API | Cloudflare Worker (TypeScript) | `worker/` |
| Metadatos | Cloudflare D1 | `worker/migrations/` |
| Archivos | Cloudflare R2 (bucket privado) | — |

**Principio de seguridad:** el frontend es un entorno no confiable. Toda autorización se comprueba
en el Worker (y la aprobación de usuarios, además, en una Action post-login de Auth0).

## Configuración

### Frontend (valores PÚBLICOS, acaban en el bundle)

`scripts/generate-config.mjs` genera `src/app/core/config/app-config.generated.ts` (gitignored) a partir
de variables de entorno o de un fichero `.env` local (ver `.env.example`):

| Variable | Ejemplo |
|---|---|
| `AUTH0_DOMAIN` | `auth.example.com` |
| `AUTH0_CLIENT_ID` | id público de la aplicación SPA |
| `AUTH0_AUDIENCE` | identificador de la API de Auth0 |
| `API_URL` | `https://api.album.example.com` |

Sin valores se usan placeholders (sirve para lint/tests). `npm run build:prod` falla si falta alguno.
En CI se leen de las *variables* del repositorio (no secrets: no son secretos).

### Worker

- Configuración pública: `vars` en `worker/wrangler.jsonc` (los `REPLACE_ME` deben sustituirse;
  mientras no, el Worker responde 500 en todas las rutas).
- Desarrollo local: `worker/.dev.vars` (ver `worker/.dev.vars.example`, gitignored).
- Secretos: sólo con `wrangler secret put`. Nunca en Git.

### Cloudflare (recursos)

| Recurso | Nombre | Notas |
|---|---|---|
| R2 (jurisdicción **UE**) | `album-media` | privado: sin `r2.dev` ni dominio público |
| R2 (jurisdicción **UE**) | `album-media-dev` | sólo para `wrangler dev` (`preview_bucket_name`) |
| D1 | `album` | `npm run db:migrate:remote` |
| Secrets del Worker | `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | token S3 de R2 *Object Read & Write* limitado a los buckets del álbum |

CORS de los buckets (`worker/r2-cors.json`):

```bash
npx wrangler r2 bucket cors set album-media -J eu --file r2-cors.json
```

Flujo de subida: `POST /api/media` → URL PUT presignada de un solo uso (firma `Content-Type`,
`Content-Length` e `If-None-Match: *`, 10 min) → el navegador sube directamente a R2 →
`POST /api/media/:id/complete` (el Worker comprueba tamaño, tipo y *magic bytes*; si no
coinciden borra el objeto). Un cron horario elimina subidas abandonadas (> 6 h).

## Desarrollo

```bash
npm install && npm start            # frontend en http://localhost:4200
cd worker && npm install && npm run dev   # API en http://localhost:8787
```

| Comando | Frontend (`/`) | Worker (`worker/`) |
|---|---|---|
| Lint | `npm run lint` | `npm run lint` |
| Tests | `npm test` | `npm test` |
| Tipos | (en build) | `npm run typecheck` |
| Build | `npm run build` / `npm run build:prod` | `npx wrangler deploy --dry-run` |
| Migraciones D1 | — | `npm run db:migrate:local` |

Tras cambiar `wrangler.jsonc`, regenera los tipos con `npm run types` (en `worker/`).

## Routing

La SPA usa rutas con hash (`/#/album`): GitHub Pages no tiene fallback de servidor para rutas
arbitrarias.
