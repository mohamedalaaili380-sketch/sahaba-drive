# ☁️ Sahaba — Your drive

A file-storage app built from scratch as a practical alternative to Google Drive, OneDrive, and Dropbox. Metadata lives in SQLite, while file content lives either on the server disk or on Google Drive through Apps Script — no API keys and no external database.

> The old Drive project (Next.js + GCS) remains in the `src/` and `legacy/` folders of the original repo and has not been modified.

---

## Features

| Feature | Details |
| --- | --- |
| **Version history** | Every upload/edit creates a new version. Browse it, download any version, restore it as a new version, and automatically prune versions older than 50. |
| **Editing and comments** | Text/Markdown editor with autosave, collaboration notifications, file comments, and live presence. |
| **Departments and shared spaces** | Create departments with owner/editor/viewer roles, add members by email, send invite notifications, and give every department its own space. Quick-create and “Add all” are available from the sidebar. |
| **Tags and advanced search** | Colored tags plus search by name, description, type, tag, date, size, and starred state, with multiple sort options. |
| **Protected links** | Public links with view/download/comment permissions, password protection, expiry, view and download limits, an activity log, and revocation. |
| **Desktop and mobile apps** | Installable PWA on every platform plus a desktop sync client (`sync/client.mjs`) that uploads a local folder automatically. |
| **Fundamentals** | Drag-and-drop uploads, folders, copy/move/rename, starred files, trash and restore, image/video/audio/PDF/text previews, and a responsive English-only interface with light and dark themes. |
| **Realtime** | WebSocket updates for changes, notifications, comments, and connection status — no polling. |
| **Bulk actions** | Select multiple items (Ctrl/Shift + click or Ctrl+A) and download, star, tag, move, delete, or restore them in one request. |
| **Monitoring and maintenance** | `/api/health` checks SQLite and Drive, periodic SQLite backups, and per-IP rate limiting. |

---

## Running it

Requirements: **Node.js 22.5+** (developed and tested on Node 26 — `node:sqlite` is built in, so `better-sqlite3` is not needed).

```bash
cd sahaba-drive
npm install
npm run dev
```

Open **http://localhost:5173** and create an account. New accounts need approval from the main admin before they can sign in.

For production:

```bash
npm run build
npm start          # http://localhost:4000 — serves the UI and API together
```

### Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Runs the API on port 4000 and Vite on 5173 with a proxy. |
| `npm run build` | Builds the frontend into `dist/`. |
| `npm start` | Runs the production server (serves `dist/`). |
| `npm run typecheck` | Runs TypeScript checks. |

### Environment variables (all optional)

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `4000` | API / production port. |
| `HOST` | `0.0.0.0` | Bind address. |
| `SAHABA_DATA_DIR` | `./data` | Database folder (and `blobs/` in local mode). |
| `SAHABA_MAX_UPLOAD_MB` | `4096` / `20` in Drive mode | Maximum upload size. |
| `SAHABA_MAX_VERSIONS` | `50` | Versions retained per file. |
| `SAHABA_STORAGE_LIMIT_MB` | `10240` | Storage quota per user. |
| `SAHABA_STORAGE_MODE` | `local` / `drive` | Chooses file content storage: server disk or Google Drive. Setting `SAHABA_DRIVE_WEBAPP_URL` automatically enables `drive`. |
| `SAHABA_DRIVE_WEBAPP_URL` | — | `/exec` URL of the Apps Script Web App for the current Drive account. |
| `SAHABA_DRIVE_TOKEN` | — | Secret token matching `SAHABA_TOKEN` inside `Code.gs`. |
| `SAHABA_DRIVE_MIGRATE_FROM_URL` | — | `/exec` URL of an older Web App. Setting this triggers a one-time blob migration at startup. |
| `SAHABA_DRIVE_MIGRATE_FROM_TOKEN` | — | Token for the old Web App. Required with the previous variable; both are removed after migration. |
| `SAHABA_BACKUP_ENABLED` | `1` | Enables periodic SQLite backups (`0` disables). |
| `SAHABA_BACKUP_INTERVAL_HOURS` | `24` | Hours between backups. |
| `SAHABA_BACKUP_INITIAL_DELAY_MS` | `15000` | Delay before the first backup (useful for testing). |
| `SAHABA_BACKUP_RETENTION` | `7` | Number of backups retained; older ones are deleted automatically. |
| `SAHABA_BACKUP_SPACE` | `backups` | Drive folder that receives backups: `sahaba-drive-storage-backups`. |
| `SAHABA_RATE_WINDOW_MS` | `60000` | Per-IP rate-limit window. |
| `SAHABA_RATE_MAX` | `120` | Maximum requests per IP per window (except auth and health). |
| `SAHABA_AUTH_RATE_WINDOW_MS` | `600000` | Login/registration rate-limit window. |
| `SAHABA_AUTH_RATE_MAX` | `10` | Maximum login/registration attempts per IP per window. |
| `SAHABA_ADMIN_EMAIL` | — | Email promoted to main admin at startup. Set this to your account email before first launch. |

---

## Storing files on Google Drive (Apps Script)

Metadata (users, versions, comments, tags, shares) stays in SQLite.
Only file content is stored in `sahaba-drive-storage-*` folders in Google Drive through an Apps Script Web App.

1. Open [Google Apps Script](https://script.google.com), create a project, and paste the contents of `apps-script/Code.gs`.
2. In **Project Settings → Script Properties**, add a property named `SAHABA_TOKEN` with a long random value (`node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`). The token is not written in the source code.
3. Deploy → New deployment → Web app: **Execute as Me** and **Who has access: Anyone**.
4. Put the `/exec` URL in `SAHABA_DRIVE_WEBAPP_URL` and the same token in `SAHABA_DRIVE_TOKEN`, then restart the server.
5. Test it: `curl "<WEBAPP_URL>?token=<TOKEN>&action=ping"` should return `{"ok":true,...}`.

> The token is secret. Anyone who knows it (along with the URL) can upload, download, and delete blobs in Drive. Keep it in Script Properties and server environment variables only — never in the repo.
> The practical upload limit in Drive mode is 20MB per file (Apps Script URL Fetch limit is 50MB and base64 adds roughly 33%).

### Migrating blobs from an old Drive account to a new one

SQLite metadata does not move; only file content (the blobs) and the IDs stored in the database are migrated.

1. Deploy the new Web App and update `SAHABA_DRIVE_WEBAPP_URL` and `SAHABA_DRIVE_TOKEN` with the new URL and token.
2. Add `SAHABA_DRIVE_MIGRATE_FROM_URL` and `SAHABA_DRIVE_MIGRATE_FROM_TOKEN` for the old Web App (do not delete or archive it until migration finishes).
3. Restart the server once. At startup it downloads every blob from the old account, uploads it to the new one, then updates `items.blob_path` and `versions.blob_path` in a single SQLite transaction. You will see:
   ```
   ☁️  Migrated N files to the new Drive
   ```
4. After the migration succeeds and downloads are verified, **remove the two `SAHABA_DRIVE_MIGRATE_*` variables** and restart so the migration does not run again.

> If any file fails during migration, old IDs are left untouched and the server **does not start** (to avoid uploading to the new account while the old one is still in use). Fix the cause and try again. After a successful migration, new files go directly to the new account.

### Health check

`GET /api/health` is public and returns the state of SQLite, the Web App, and the latest backup:

```bash
curl https://sahaba-drive.de.deplexo.com/api/health
```

The response includes `ok`, `db`, `drive.ok`, `drive.latencyMs`, and `backup`. If SQLite or Drive is unhealthy, the status code is `503`.

### SQLite backups

- The first backup runs 15 seconds after startup, then every `SAHABA_BACKUP_INTERVAL_HOURS`.
- In Drive mode a `.sqlite` backup is uploaded to `sahaba-drive-storage-backups`; in local mode it is written to `data/backups/`.
- Retention is controlled by `SAHABA_BACKUP_RETENTION`; older backups are deleted automatically.
- Backups use `VACUUM INTO`, so they are consistent snapshots even with WAL enabled.

### Rate limiting

- All `/api/` requests except `/api/health` are limited to `SAHABA_RATE_MAX` per `SAHABA_RATE_WINDOW_MS` per IP.
- `/api/auth/login` and `/api/auth/register` have a stricter limit: `SAHABA_AUTH_RATE_MAX` per `SAHABA_AUTH_RATE_WINDOW_MS`.
- Exceeding a limit returns `429` with `Retry-After`, and every response includes `x-ratelimit-*` headers.
- Behind a reverse proxy such as Deplexo, `x-forwarded-for` is used to identify the client.

---

## Where is your data?

```
sahaba-drive/data/
├── sahaba.sqlite     # Users, files, versions, tags, comments, shares...
└── blobs/            # File content in local mode only (each filename is a UUID)
```

In local mode everything stays on your machine and no external services are called. In Drive mode file content lives in `sahaba-drive-storage-*` folders in Drive, and SQLite stores only file IDs. Deleting `data/` in local mode starts from scratch.

Passwords are stored with scrypt and a random salt; sessions use HttpOnly + SameSite cookies.

---

## Installing the app on mobile / desktop (PWA)

1. Run the app with `npm run build` then `npm start` (or open the dev URL).
2. In Chrome/Edge: menu ⋮ → **Install app**.
3. On iPhone Safari: Share → **Add to Home Screen**.

The app opens as a standalone window and the shell can work offline — the files themselves require the server to be running.

## Desktop sync client

A small Node client watches a local folder and automatically uploads new or changed files to your space:

```bash
node sync/client.mjs \
  --dir ./my-drive \
  --email you@example.com \
  --password 'your-password' \
  --interval 15
```

Or use environment variables: `SAHABA_DIR`, `SAHABA_EMAIL`, `SAHABA_PASSWORD`, `SAHABA_SPACE`, `SAHABA_URL`.

The client creates remote folders matching the local structure and stores file fingerprints in `.sahaba-sync.json` so it does not upload the same file twice. Every upload creates a new version in the history.

---

## Code structure

```
sahaba-drive/
├── server/
│   ├── index.mjs             # HTTP server + routing + static + production
│   ├── config.mjs            # Paths, environment, and storage mode
│   ├── db.mjs                # SQLite schema (node:sqlite)
│   ├── storage.mjs           # Blob storage: local or Google Drive
│   ├── migrate.mjs           # One-time blob migration from an old Web App to a new one
│   ├── backup.mjs            # SQLite backups to Drive or a local folder
│   ├── rate-limit.mjs        # Per-IP rate limiting
│   ├── util.mjs              # Auth, permissions, storage, events
│   └── routes/
│       ├── health.mjs        # GET /api/health
│       ├── auth.mjs          # Register / login / profile
│       ├── items.mjs         # Files, folders, upload, versions, trash
│       ├── collab.mjs        # WS, comments, tags, notifications, search
│       ├── teams.mjs         # Departments, members, shared-with-me
│       ├── shares.mjs        # Owner-side public links
│       └── public.mjs        # Public access to links
├── src/
│   ├── App.tsx               # Simple routing: auth / drive / public link
│   ├── api.ts / types.ts
│   ├── components/
│   │   ├── Auth.tsx / DriveApp.tsx / PublicShare.tsx
│   │   ├── Dialogs.tsx       # Share, versions, tags, departments, advanced search
│   │   ├── Viewers.tsx       # Preview, editor, comments
│   │   └── ui.tsx
│   └── styles.css            # Tailwind 4 + Ocean Teal light/dark theme
├── sync/client.mjs            # Desktop sync client
└── public/                    # Manifest, service worker, icon
```

---

## Intentional limitations (for clarity)

- **Collaboration**: Currently text-document editing with autosave, instant notifications, and presence — not a multi-author CRDT editor like Google Docs. That is a larger project on its own.
- **Mobile**: Installable PWA, not a native App Store / Google Play binary.
- **Sync**: The desktop client uploads your changes to the cloud (one-way). Reverse sync (automatic download to disk) is not built in; download from the UI or add it to `sync/client.mjs`.
- **Security**: Designed for local/internal use. If you publish it on the internet, put it behind an HTTPS reverse proxy, tune `SAHABA_STORAGE_LIMIT_MB`, and consider adding rate limiting and CSRF tokens to sensitive endpoints.

---

## Troubleshooting

- `node:sqlite` unavailable → update Node to 22.5+ (26 preferred).
- Port 4000 already in use → `PORT=4001 npm start` (also change the proxy in `vite.config.ts` when running dev).
- Uploads fail → make sure `data/blobs/` is writable and `SAHABA_MAX_UPLOAD_MB` is appropriate.
- A public link asks for a password → use the **Unlock** button; the grant is stored in `sessionStorage` for the session.
