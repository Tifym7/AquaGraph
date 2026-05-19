"""Resilience layer for Earth Engine calls.

Every server-side EE call (getInfo / getDownloadURL / size / aggregate) can
fail with a *retryable* error - rate limit / quota (HTTP 429, "resource
exhausted"), transient backend (5xx, "internal error"), or a *degradable*
error - "User memory limit exceeded" / "Computation timed out".

`ee_retry()` backs off (exponential + jitter, separate longer base for rate
limits) on retryable errors, and re-raises degradable ones as typed exceptions
so the caller can shrink the work (split the chunk) instead of dying. Genuine
errors (bad asset, syntax) are raised immediately - we don't spin on those.
"""

import random
import time

import ee

try:  # HttpError is usually translated to EEException, but catch it too
    from googleapiclient.errors import HttpError as _HttpError
except Exception:  # pragma: no cover
    _HttpError = ()

from . import config


class EEMemoryError(Exception):
    """EE 'User memory limit exceeded' - caller should reduce the work."""


class EEComputeTimeout(Exception):
    """EE 'Computation timed out' - caller should reduce the work."""


_MEMORY = ("user memory limit exceeded",)
_TIMEOUT = ("computation timed out",)
_RATE = ("rate limit", "too many requests", "user rate limit", "quota",
         "resource exhausted", "429", "ratelimitexceeded")
_TRANSIENT = ("internal error", "backend error", "bad gateway",
              "service unavailable", "deadline exceeded", "unavailable",
              " 500", " 502", " 503", " 504", "try again")


def _msg(exc) -> str:
    return str(getattr(exc, "message", None) or exc).lower()


def classify(exc) -> str:
    m = _msg(exc)
    if any(k in m for k in _MEMORY):
        return "memory"
    if any(k in m for k in _TIMEOUT):
        return "timeout"
    if any(k in m for k in _RATE):
        return "rate"
    if any(k in m for k in _TRANSIENT):
        return "transient"
    return "fatal"


def ee_retry(fn, what: str = "ee call"):
    """Call fn(); retry retryable errors with backoff; raise typed errors for
    degradable ones; raise immediately on fatal ones."""
    attempts = config.EE_MAX_RETRIES
    for attempt in range(attempts):
        try:
            return fn()
        except (ee.EEException, _HttpError) as exc:
            kind = classify(exc)
            if kind == "memory":
                raise EEMemoryError(str(exc)) from exc
            if kind == "timeout":
                raise EEComputeTimeout(str(exc)) from exc
            if kind == "fatal" or attempt == attempts - 1:
                raise
            base = (config.EE_RATE_BACKOFF_BASE if kind == "rate"
                    else config.EE_BACKOFF_BASE)
            delay = min(config.EE_BACKOFF_CAP, base * (2 ** attempt))
            delay += random.uniform(0, delay * 0.3)  # full-ish jitter
            print(f"   [ee_retry] {what}: {kind} error, "
                  f"retry {attempt + 1}/{attempts - 1} in {delay:.0f}s",
                  flush=True)
            time.sleep(delay)
