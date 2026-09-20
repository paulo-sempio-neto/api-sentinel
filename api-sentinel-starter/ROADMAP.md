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

- [x] Add persistent check storage with endpoint foreign keys
- [x] Add internal functions to save results and retrieve newest-first history
- [x] Test persistence, isolation, startup compatibility, and cascading deletion
- [x] Perform manual endpoint checks (GET, 2xx success, finite timeout, no redirects/retries)
- [x] Record HTTP status codes
- [x] Measure response time
- [x] Record connection errors
- [x] Connect real HTTP checks to the persistence functions
- [x] Test manual checks offline with mocked HTTP responses and network errors
- [x] Expose read-only endpoint history through the API (newest first)
- [x] Validate history limits (default 50, range 1-100) and apply them in SQLite
- [x] Test history API isolation, limits, validation, and manual-check compatibility

## Phase 4 — Final CS50 delivery

- [x] Add in-process automated checks while the program is running
- [x] Reuse the manual-check path without blocking the async event loop
- [x] Isolate endpoint failures and reload endpoints on every monitoring cycle
- [x] Stop the monitoring task through the FastAPI lifespan
- [x] Extend tests to cover monitoring, history, and scheduling
- [x] Document current features and local setup in the README
- [ ] Complete the README with UI and final delivery instructions
- [ ] Record the demonstration video
- [ ] Submit the final project

## Phase 5 — Portfolio improvements

- [ ] Build a visual dashboard
- [ ] Add user authentication
- [ ] Add email or Discord alerts
- [ ] Deploy the application online
