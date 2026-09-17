# API Sentinel

API Sentinel is an HTTP endpoint monitoring service built as my final project for CS50x.

The project will allow users to register web services and APIs, check whether they are available, measure response time, and store a history of each verification.

## Current features

- `GET /health` endpoint to confirm that API Sentinel is running
- Interactive API documentation provided by FastAPI

## Planned CS50 version

- Register an endpoint to monitor
- List registered endpoints
- Run a manual availability check
- Store status codes, response times, timestamps, and errors in SQLite
- View the check history for each endpoint
- Add automated checks while the application is running
- Add tests and complete documentation

## Technology

- Python
- FastAPI
- SQLite
- HTTPX
- Pytest

## Installation

Create a virtual environment:

```powershell
py -3 -m venv .venv