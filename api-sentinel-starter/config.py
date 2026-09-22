"""Static configuration for the local API Sentinel application."""

from pathlib import Path

CHECK_TIMEOUT_SECONDS = 10.0
MONITOR_INTERVAL_SECONDS = 60.0
MONITORING_ENABLED = True
UI_HISTORY_LIMIT = 25
PROJECT_DIRECTORY = Path(__file__).resolve().parent
