# VIWANDA PORTAL — Frontend tech stack & deployment guide

_Last updated: 29 Oct 2026 (release v37)._

## 1. Tech stack

| Layer | Technology | Version (package.json) | Notes |
|---|---|---|---|
| Runtime for building | Node.js | 20 LTS or 22 LTS (built and tested on 22.23) | Needed only to build; the built site is static files |
| Package manager | npm | lockfile: `package-lock.json` | Use `npm ci` on servers |
| Build tool / dev server | Vite | ^8.3.0 with `@vitejs/plugin-react` ^6.1.1 | `npm run dev`, `npm run build`, `npm run preview` |
| UI library | React + React DOM | ^19.2.8 | Function components and hooks |
| Routing | React Router (`react-router-dom`) | ^7.18.4 | Client-side routes under `/`, `/login`, `/dashboard/...` |
| HTTP client | Axios | ^1.20.0 | `src/API/axios.jsx`: base URL `VITE_API_BASE_URL` or `/api/v1`, 15 s timeout, Bearer token |
| CSS framework | Bootstrap | ^5.3.3 | Plus plain CSS per page/component (no Tailwind, no CSS-in-JS) |
| Icons | lucide-react | ^0.468.0 | |
| Charts | Recharts | ^3.10.1 | Dashboards and analytics |
| Dialogs and toasts | SweetAlert2 | ^11 | Error dialogs (`useErrorDialogState`) and toasts (`showPortalToast`) |
| Linting | ESLint 10 + react-hooks + react-refresh plugins | | `npm run lint` |
| Tests | Node built-in test runner | | `node --test tests/*.test.mjs` (no extra test framework) |

**Unused legacy dependencies:** `jquery` and `toastr` are still listed in `package.json`, but no source file imports them (toasts moved to SweetAlert2). They can be removed with `npm uninstall jquery toastr` at a convenient time.

**Backend:** Laravel REST API at `/api/v1` with Sanctum Bearer tokens. The frontend never stores data of its own; Laravel is the authority.

## 2. Project structure (short)

```
src/
  API/          one module per Laravel resource (lowercase file names)
  Auth/         route guards (RouteAccess, role access)
  components/   shared UI (Sidebar, Topbar, modern/ModernUI, common/*, insights/*)
  config/       sidebarMenu.js, moduleRoutes.js, permissions, report catalogue
  contexts/     appearance (theme), breadcrumb
  pages/        one folder per module (Login, Home, DataEntry, Submissions, HOD, AO, MDO, MDD,
                Admin, StrategicPlans, Analytics, Reports, AuditLogs, Profile, ...)
  services/     multi-step workflows built on API modules
  utils/        pure helpers (unit-tested)
  styles/       shared CSS (admin-modern.css, management.css)
public/reference/  emblem, login artwork, Ministry building photo
tests/          *.test.mjs (node --test)
```

## 3. Environment variables (Vite, read at BUILD time)

| Variable | Meaning | Recommended production value |
|---|---|---|
| `VITE_API_BASE_URL` | Base URL used by Axios | `/api/v1` (same origin, via the web server proxy below). A full URL such as `https://api.example.go.tz/api/v1` also works, but then Laravel CORS must allow the frontend origin |
| `VITE_LARAVEL_PROXY_TARGET` | Laravel address for the **dev server proxy only** | Not used in production |
| `VITE_*_API_PATH` (in `.env.api.example`) | Old optional overrides | Leave unset |

`VITE_*` values are compiled into the JavaScript bundle. Change them, then **rebuild**. Never put secrets in them.

## 4. Build

```bash
npm ci                 # exact versions from package-lock.json
npm run lint           # optional
node --test tests/*.test.mjs
npm run build          # output: dist/  (static HTML/JS/CSS, ~7 MB)
```

## 5. Serving in production

`dist/` is a static single-page application. The web server must:

1. Serve `dist/` as the document root.
2. Send unknown paths (e.g. `/dashboard/strategic-plans`) to `index.html` (SPA fallback).
3. Proxy `/api/v1/` and `/storage/` to Laravel. In development the Vite dev server does this, but in production the web server must.

Example **Nginx**:

```nginx
server {
    listen 443 ssl http2;
    server_name viwanda.example.go.tz;
    root /var/www/viwanda-portal/dist;
    index index.html;

    # Laravel API and public storage (institution logos)
    location /api/v1/  { proxy_pass http://127.0.0.1:8000; proxy_set_header Host $host;
                         proxy_set_header X-Forwarded-Proto $scheme; proxy_set_header X-Real-IP $remote_addr; }
    location /storage/ { proxy_pass http://127.0.0.1:8000; proxy_set_header Host $host; }

    # Long cache for hashed build assets, no cache for index.html
    location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; try_files $uri =404; }
    location = /index.html { add_header Cache-Control "no-store"; }

    # SPA fallback
    location / { try_files $uri $uri/ /index.html; }
}
```

**Apache** (`.htaccess` inside `dist/`, with `mod_rewrite` and `mod_proxy`): proxy `/api/v1` and `/storage` with `ProxyPass` in the vhost, and add the SPA rewrite:

```apache
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ index.html [L]
```

## 6. Production checklist

- [ ] Laravel `.env`: `APP_DEBUG=false`. Error responses currently include file paths and stack traces.
- [ ] Laravel `APP_URL` set to the public HTTPS address, so `profile_image_url` points to a reachable host. The frontend also rewrites `localhost` storage URLs to `/storage/...`.
- [ ] `php artisan storage:link` on the backend, so institution logos under `/storage` load.
- [ ] HTTPS only. The Bearer token lives in `sessionStorage` (per tab, cleared on logout) and must never travel over plain HTTP.
- [ ] If the API is on another domain: Laravel CORS `allowed_origins` = the portal origin, and `VITE_API_BASE_URL` = the full API URL.
- [ ] Home page background currently loads from `images.pexels.com`. For an offline or locked-down network, copy the image into `public/reference/` and update `src/pages/Home/Home.css`.
- [ ] Do not deploy the `.env.development.local` file. It contains a developer LAN address.
- [ ] Rebuild after every frontend change or `VITE_*` change, and replace `dist/` entirely.

## 7. Local development

```bash
cp .env.development.local.example .env.development.local   # set VITE_LARAVEL_PROXY_TARGET=http://<laravel-ip>:8000
npm ci
npm run dev        # http://localhost:5173 (proxies /api/v1 and /storage to Laravel)
```
