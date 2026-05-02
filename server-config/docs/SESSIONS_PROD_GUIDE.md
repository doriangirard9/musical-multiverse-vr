
## Production Deployment Checklist

### 1. Build the frontend

```bash
npm run build   # outputs to dist/
```

Serve `dist/` as static files from your reverse proxy (Nginx) or from Express itself.

### 2. Environment variables

Set these on the server (`.env`, Docker, systemd, etc.):

| Variable | Required | Description |
|----------|:--------:|-------------|
| `JWT_SECRET` | **Yes** | Long random string (≥32 chars). **Never reuse the dev default.** Generate one: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `NODE_ENV` | Yes | Set to `production` (enables secure cookies) |
| `PORT` | No | Backend port (default: 3000) |

### 3. Things that change in production

| What | Dev | Prod | Where |
|------|-----|------|-------|
| JWT secret | `wamjam-dev-secret-...` | Random 48+ hex chars | `JWT_SECRET` env var → `auth.js:4` |
| Refresh cookie `secure` | `false` | `true` (auto via `NODE_ENV`) | `routes/auth.js:73,126` |
| CORS origin | `true` (any) | Your domain only | `server.js:19` |
| Vite proxy | Active | Not needed (same origin) | `vite.config.js` |
| HTTPS | Vite self-signed | Nginx/Caddy termination | Reverse proxy |

### 4. CORS — lock it down

In `server.js`, replace the permissive CORS:

```js
// Before (dev)
app.use(cors({ origin: true, credentials: true }));

// After (prod)
app.use(cors({
    origin: 'https://your-domain.com',
    credentials: true,
}));
```

### 5. Reverse proxy (Nginx example)

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # Frontend (built files)
    location / {
        root /var/www/wamjam/dist;
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_http_version 1.1;
    }
}
```

### 6. Docker

The `docker-compose.yml` is already configured. Update it before deploying:

```yaml
environment:
  - NODE_ENV=production
  - JWT_SECRET=<your-generated-secret>
```

The SQLite database is persisted via the volume `./server-config/data:/usr/src/app/data`.

### 7. Start the backend

```bash
# Direct
NODE_ENV=production JWT_SECRET=<secret> node --experimental-sqlite server.js

# Or via Docker
docker compose up -d
```

### 8. Post-deploy verification

- [ ] `POST /api/auth/register` → creates a user
- [ ] `POST /api/auth/login` → returns accessToken, sets cookie
- [ ] `POST /api/sessions/:id/join` → returns participantId
- [ ] Refresh cookie has `Secure` flag (check DevTools → Application → Cookies)
- [ ] WebRTC signaling server (`wamjamparty.i3s.univ-cotedazur.fr/rtc`) is reachable from clients
- [ ] Two users can see each other move in the same session

### 9. Backup

The entire database is a single file: `server-config/data/wamjam.db`. Back it up periodically:

```bash
sqlite3 data/wamjam.db ".backup data/wamjam-backup-$(date +%F).db"
```
