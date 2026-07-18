# Faith Harbor OS — cPanel / WHM Deployment

This guide deploys Faith Harbor OS to a cPanel account on a dedicated
server with WHM/root access, at a domain such as
`os.faithharborwebsolutions.com`.

A single Node.js process serves both the REST API and the React user
interface from one origin, so no separate frontend server or Vite dev
server is needed in production.

## Requirements

- **Node.js 20 or newer** (the app uses the built-in `node:sqlite`
  module). Node 22+ is recommended. Do not rely on an old cPanel Node
  version — install a current one (see below).
- WHM/root access to create the subdomain, the Node application, and to
  install Node if needed.
- The ability to set environment variables for the app.

## 1. Create the subdomain

In WHM or cPanel, create the subdomain (for example
`os.faithharborwebsolutions.com`) and point it at a document root such
as `/home/<cpaneluser>/os`.

## 2. Get the code onto the server

From the app root on the server (`/home/<cpaneluser>/os`):

```bash
git clone <your-repo-url> .
cp .env.example .env
# edit .env: set NODE_ENV=production and any AI keys
```

### Authentication (required)

The app **refuses to start in production** unless a login is
configured. In `.env` set:

```bash
ADMIN_EMAIL=you@faithharborwebsolutions.com
# Simplest: a plaintext password
ADMIN_PASSWORD=choose-a-strong-password
```

For a hashed password instead of plaintext, run locally:

```bash
npm run hash-password "choose-a-strong-password"
# then put the printed scrypt$... value in .env as ADMIN_PASSWORD_HASH
```

Only this account can sign in, and every page and API route requires
a valid session. Keep `.env` readable only by the cPanel user.

## 3. Install dependencies and build

```bash
npm ci
npm run build:all
```

`npm run build:all` compiles the backend to `dist/` (entry point
`dist/server.js`) and builds the React frontend to `frontend/dist/`,
which the server serves automatically.

If the server has limited memory, run the frontend build locally and
upload `frontend/dist/` and `dist/` instead.

## 4. Create the Node application in cPanel

cPanel → **Setup Node.js App** → Create Application:

- **Node.js version:** 20+ (22+ preferred)
- **Application mode:** Production
- **Application root:** `os` (the folder from step 1)
- **Application URL:** `os.faithharborwebsolutions.com`
- **Application startup file:** `dist/server.js`

Add the environment variables from your `.env` (at minimum
`NODE_ENV=production`; add `OPENAI_API_KEY` etc. if using AI).

Then use **Run NPM Install** and, if you did not already build, run the
build. Finally **Restart** the application.

> Passenger sets `PORT` automatically; the server reads it. No manual
> port configuration is required in the cPanel setup.

## 5. Enable HTTPS

WHM → **Manage AutoSSL** (or cPanel → SSL/TLS Status) → issue a
certificate for `os.faithharborwebsolutions.com`.

## 6. Verify

Visit `https://os.faithharborwebsolutions.com/` — the Faith Harbor OS
dashboard should load. Check:

- `/` → the application UI
- `/api` → JSON service information
- `/health` → `{ "status": "ok" }`
- `/api/v1/departments` → 12 departments

## Alternative: PM2 + Apache reverse proxy (no cPanel Node selector)

If you prefer to run the process yourself:

```bash
npm ci && npm run build:all
pm2 start dist/server.js --name faith-harbor-os --update-env
pm2 save
pm2 startup   # follow the printed instruction to enable boot start
```

Set `PORT` (for example `3000`) in the environment, then add an Apache
reverse proxy for the subdomain (WHM → Apache Configuration → Include
Editor, or a `.htaccess` proxy) forwarding HTTPS traffic to
`http://127.0.0.1:3000`, and issue SSL with AutoSSL.

## Data and backups

- The SQLite database is created at `data/faith-harbor.db` under the app
  root on first run. Ensure the app root is writable (it is for cPanel
  Node apps).
- Include `data/faith-harbor.db` in your backup rotation. It holds all
  clients, proposals, projects, invoices, and support tickets.

## Updating a deployed instance

```bash
git pull
npm ci
npm run build:all
# cPanel: Restart the Node app.  PM2: pm2 restart faith-harbor-os
```

## Notes

- `.env` and `data/` are git-ignored and never committed.
- The API and UI share one origin in production, so no CORS or proxy
  configuration is needed for the frontend.
- Human approval safeguards (delete confirmations, human-authority AI
  governance) remain in place in production.
