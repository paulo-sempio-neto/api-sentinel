# API Sentinel Roadmap

## Phase 1 — Project setup

- [x] Create the project structure
- [x] Create the FastAPI application
- [x] Add the health check endpoint
- [x] Choose the project-local virtual environment (`api-sentinel-starter/.venv`)
- [x] Declare and install all direct dependencies
- [x] Use a database path relative to the project files
- [x] Initialize the database through the FastAPI lifespan
- [x] Document Windows setup, activation, installation, and execution
- [x] Run the API locally and verify `/health`

## Phase 2 — Endpoint management

- [x] Create an SQLite database
- [x] Add an endpoint to monitor
- [x] Validate HTTP/HTTPS URLs and reject duplicate URLs
- [x] Trim endpoint names and reject empty or whitespace-only names
- [x] List registered endpoints
- [x] Update an endpoint's name and URL
- [x] Delete an endpoint
- [x] Return 409 for duplicate URLs and 404 for missing endpoints on update/delete
- [x] Add endpoint management tests using an isolated temporary SQLite database

## Phase 3 — Monitoring

- [ ] Perform manual endpoint checks
- [ ] Record HTTP status codes
- [ ] Measure response time
- [ ] Record connection errors
- [ ] Save check results in SQLite
- [ ] Show endpoint history

## Phase 4 — Final CS50 delivery

- [ ] Add automated checks while the program is running
- [ ] Extend tests to cover monitoring, history, and scheduling
- [x] Document current features and local setup in the README
- [ ] Complete the README with monitoring, history, UI, and test instructions
- [ ] Record the demonstration video
- [ ] Submit the final project

## Phase 5 — Portfolio improvements

- [ ] Build a visual dashboard
- [ ] Add user authentication
- [ ] Add email or Discord alerts
- [ ] Deploy the application online
