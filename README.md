# API Sentinel

API Sentinel is a portfolio project for monitoring HTTP APIs from a clean web dashboard. It lets a user register API endpoints, run checks on demand, review the latest status, inspect response time history, and remove endpoints that are no longer monitored.

The project was built as a CS50x final project and evolved into a full-stack demo with a React frontend, a FastAPI backend, and SQLite persistence.

## Links

- **Live Demo:** [api-sentinel-pi.vercel.app](https://api-sentinel-pi.vercel.app)
- **Backend/API:** [api-sentinel-backend-5w2w.onrender.com](https://api-sentinel-backend-5w2w.onrender.com)
- **GitHub Repository:** [github.com/paulo-sempio-neto/api-sentinel](https://github.com/paulo-sempio-neto/api-sentinel)
- **CS50x Certificate:** Public certificate URL not added yet.

## Features

- Register API endpoints with a name and HTTP/HTTPS URL.
- List monitored endpoints in a responsive dashboard.
- Run manual health checks from the dashboard.
- Show current status as `Operational`, `Issue detected`, or `Not checked`.
- Display status code, response time, last check time, and recent check history.
- View a dedicated endpoint detail page with response metrics and check history.
- Delete endpoints with confirmation.
- Handle duplicate URLs, validation errors, backend connection errors, and loading states.
- Expose a documented JSON API through FastAPI/OpenAPI.

## Screenshots

No screenshot images are currently committed to the repository. The live dashboard is available at the Vercel link above.

## Tech Stack

| Layer | Technologies |
| --- | --- |
| Frontend | React, TypeScript, Vite, React Router, CSS |
| Backend | Python, FastAPI, Pydantic, Uvicorn |
| Database | SQLite |
| HTTP checks | HTTPX |
| Testing | pytest, FastAPI TestClient |
| Deployment | Vercel for frontend, Render for backend |

## Architecture

```text
Browser
  -> Vercel static React frontend
  -> FastAPI backend on Render
  -> SQLite database
```

The frontend lives in `api-sentinel-starter/frontend` and communicates with the backend through the existing API routes. In production, Vite embeds the backend URL through `VITE_API_BASE_URL`.

The backend lives in `api-sentinel-starter`. It defines FastAPI routes, validates request payloads with Pydantic, persists endpoints and check results in SQLite, and exposes both legacy routes and `/api/v1` routes.

SQLite stores two core resources:

- `endpoints`: monitored API name and URL.
- `checks`: persisted check results with success, status code, latency, timestamp, and error message.

## API Overview

The frontend uses the existing backend API:

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Backend health check |
| `GET` | `/endpoints` | List monitored endpoints |
| `POST` | `/endpoints` | Create an endpoint |
| `PUT` | `/endpoints/{endpoint_id}` | Update an endpoint |
| `DELETE` | `/endpoints/{endpoint_id}` | Delete an endpoint |
| `POST` | `/endpoints/{endpoint_id}/check` | Run a manual check |
| `GET` | `/endpoints/{endpoint_id}/checks` | Read check history |

The same contract is also available under `/api/v1`.

## Run Locally

### 1. Clone the repository

```powershell
git clone https://github.com/paulo-sempio-neto/api-sentinel.git
cd api-sentinel
```

### 2. Start the backend

```powershell
cd api-sentinel-starter
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app:app --reload --host 127.0.0.1 --port 8000
```

Backend URLs:

- API health: <http://127.0.0.1:8000/health>
- OpenAPI docs: <http://127.0.0.1:8000/docs>

### 3. Start the frontend

Open another terminal:

```powershell
cd api-sentinel-starter/frontend
npm install
npm run dev
```

The Vite dev server will print the local frontend URL, usually:

```text
http://127.0.0.1:5173
```

During local development, Vite proxies `/api` requests to the FastAPI backend.

## Build Frontend

```powershell
cd api-sentinel-starter/frontend
npm run build
```

This runs TypeScript checks and creates the production frontend bundle in `dist`.

## Run Tests

From `api-sentinel-starter`:

```powershell
python -m pytest
```

The test suite uses temporary SQLite databases and blocks real outbound HTTP calls, keeping tests deterministic.

## Deployment Notes

The current public deployment uses:

- Vercel for the React/Vite frontend.
- Render for the FastAPI backend.
- CORS configured to allow the Vercel frontend origin.

For the deployed frontend, configure:

```text
VITE_API_BASE_URL=https://api-sentinel-backend-5w2w.onrender.com
```

The backend exposes `/health`, which Render uses as its health endpoint.

## Portfolio Notes

This project demonstrates:

- full-stack API integration;
- typed frontend development with React and TypeScript;
- REST API design with FastAPI;
- SQLite persistence;
- frontend loading, empty, error, and success states;
- production deployment across Vercel and Render;
- automated tests for backend behavior.

It is intentionally scoped as a portfolio/demo application. Authentication, user accounts, alert notifications, and a production-grade database are natural future improvements.
