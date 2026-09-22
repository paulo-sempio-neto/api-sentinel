# Production deployment checklist

Use this checklist to deploy the Phase 6 configuration. Mark a step only after
its result has been observed in the relevant provider dashboard or browser.

## Before creating public services

- [ ] Confirm the Phase 6 working tree contains only the reviewed deployment files.
- [ ] Run backend tests: `.\\.venv\\Scripts\\python.exe -B -m pytest -q -p no:cacheprovider`.
- [ ] Run the frontend production build: `cd frontend; npm run build`.
- [ ] Confirm `render.yaml` and `frontend/vercel.json` remain unchanged from the
  reviewed Phase 6 state.
- [ ] Do not configure a wildcard CORS origin or put backend credentials in a
  `VITE_*` variable; Vite embeds these variables in the public bundle.

## 1. Create the Vercel frontend project

- [ ] Import this Git repository into Vercel.
- [ ] Set the Vercel **Root Directory** to `api-sentinel-starter/frontend`.
- [ ] Keep the detected Vite build command: `npm run build`.
- [ ] Deploy once to obtain the assigned production origin, for example
  `https://api-sentinel-frontend.vercel.app`.
- [ ] Record the exact origin (scheme and hostname only) for the Render CORS
  allowlist. Do not include a trailing path.

The first frontend deployment may use the default `/api/v1` value and is only for
obtaining the public Vercel origin. Do not treat its dashboard as live until the
backend URL is configured in step 3.

## 2. Create the Render backend service

- [ ] In Render, create a Blueprint from this repository using the repository-root
  `render.yaml`.
- [ ] Confirm the service uses `api-sentinel-starter` as its root directory and
  `uvicorn app:app --host 0.0.0.0 --port $PORT` as its start command.
- [ ] Keep exactly one service instance. The in-process monitor and SQLite disk do
  not support multiple application instances.
- [ ] Keep the persistent disk mounted at `/var/data` and
  `API_SENTINEL_DATABASE_PATH=/var/data/api_sentinel.db`.
- [ ] Set the prompted environment variable to the recorded Vercel origin:

  ```text
  API_SENTINEL_CORS_ALLOWED_ORIGINS=https://<your-vercel-project>.vercel.app
  ```

- [ ] Deploy and record the public backend origin, for example
  `https://api-sentinel-backend.onrender.com`.
- [ ] Verify `https://<your-backend>.onrender.com/health` returns HTTP 200.
- [ ] Verify `https://<your-backend>.onrender.com/docs` loads and exposes
  `/api/v1` routes.

## 3. Configure the deployed frontend

- [ ] In Vercel project environment variables, set this **Production** value:

  ```text
  VITE_API_BASE_URL=https://<your-backend>.onrender.com/api/v1
  ```

- [ ] Redeploy the frontend after setting the variable. This is required because
  Vite embeds it at build time.
- [ ] If using a custom frontend domain, add that exact additional origin to
  `API_SENTINEL_CORS_ALLOWED_ORIGINS` as a comma-separated value, then redeploy
  the backend.

## 4. Production acceptance checks

- [ ] Open the Vercel production URL and confirm the React dashboard renders.
- [ ] In browser DevTools, confirm API requests target the Render
  `/api/v1` origin and receive successful responses (no CORS failure).
- [ ] Confirm the dashboard displays the real endpoint list or its existing empty
  state returned by the deployed backend.
- [ ] Create one non-sensitive test endpoint using the existing API and confirm the
  dashboard shows it after refresh.
- [ ] Open an endpoint-detail URL directly in a new tab to verify the Vercel SPA
  fallback.
- [ ] Restart/redeploy the Render service and confirm the test endpoint still
  exists, verifying the SQLite disk is persistent.

## 5. Close Phase 6 only after all checks pass

- [ ] Run `git diff --check` and `git status`.
- [ ] Commit the already-reviewed Phase 6 files.
- [ ] Push the commit to `origin/main`.
- [ ] Record the final Vercel and Render URLs outside source control if they are
  not intended to be public project documentation.

## Deliberate limits

This is a single-instance public demo. It does not add PostgreSQL,
authentication, Docker, rate limiting, CSRF protection, or complete SSRF
protection. Do not promote it to a multi-user production service without a
separate hardening phase.
