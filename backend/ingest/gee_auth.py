"""Earth Engine initialization for unattended runs.

Order of preference:
  1. Service-account key file  (GEE_SERVICE_ACCOUNT_KEY)  -- recommended
  2. Persisted `earthengine authenticate` credentials      -- fallback
Both are free; neither needs a billing account.
"""

import json
import os

import ee

from . import config

_initialized = False


def init_ee() -> str:
    """Initialize Earth Engine once. Returns a human-readable identity string."""
    global _initialized
    if _initialized:
        return _identity()

    key_path = config.GEE_SERVICE_ACCOUNT_KEY
    if key_path and os.path.exists(key_path):
        with open(key_path) as fh:
            sa_email = json.load(fh).get("client_email", "service-account")
        creds = ee.ServiceAccountCredentials(sa_email, key_path)
        ee.Initialize(creds, project=config.GEE_PROJECT)
        _initialized = True
        return f"{sa_email} (service account)"

    if config.GEE_USE_PERSISTED_CREDENTIALS or not key_path:
        # Uses ~/.config/earthengine/credentials from `earthengine authenticate`.
        ee.Initialize(project=config.GEE_PROJECT)
        _initialized = True
        return "persisted user credentials"

    raise RuntimeError(
        f"GEE_SERVICE_ACCOUNT_KEY={key_path!r} not found and persisted "
        f"credentials disabled. See docs/GEE_SERVICE_ACCOUNT_SETUP.md."
    )


def _identity() -> str:
    try:
        return ee.data.getAssetRoots() and "earth-engine (initialized)"
    except Exception:
        return "earth-engine (initialized)"
