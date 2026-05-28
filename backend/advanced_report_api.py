"""HTTP surface for the advanced per-segment report.

Two endpoints:
  POST /api/segment/<object_id>/advanced-report  → enqueue, return 202
  GET  /api/jobs/<job_id>                        → status snapshot

Both require an authenticated user. The job runs async; the user is
notified by email when the PDF is ready.
"""

from datetime import date, timedelta
import re

from flask import Blueprint, request, jsonify, g

from auth import auth_required
import jobs
# Importing this registers the 'advanced_segment_report' handler with
# the jobs module. Side-effect import, but mirrors how the existing
# blueprints are wired (see app.py).
import advanced_report  # noqa: F401


advreport_bp = Blueprint("advreport", __name__, url_prefix="/api")


_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_VALID_METRICS = {
    "POLLUTION", "NDTI", "NDCI", "NDVI", "BSI", "MNDWI", "NDWI", "TURBIDITY",
}
_DEFAULT_METRICS = ["POLLUTION", "NDTI", "NDCI", "NDVI", "BSI", "MNDWI"]


def _resolve_recipient(body_email: str) -> str | None:
    """Pick the recipient email. Body wins for self-service; otherwise we
    look up the authenticated user's email so the trigger UI doesn't
    have to ask for it. Returns None if we can't find a valid one."""
    if body_email and _EMAIL_RE.match(body_email):
        return body_email.strip()
    # Fall back to the user record
    try:
        from auth import _repo  # the shared UserDBRepo instance
    except Exception:
        return None
    u = _repo.get_user_by_username(getattr(g, "current_user", None))
    em = u.get_email() if u else None
    return em if em and _EMAIL_RE.match(em) else None


@advreport_bp.route("/segment/<object_id>/advanced-report", methods=["POST"])
@auth_required
def enqueue_advanced(object_id: str):
    body = request.get_json(silent=True) or {}

    # Don't trust the path blindly - reject anything that doesn't look
    # like a valid object_id (helps with logging, prevents trivial probes).
    if not re.fullmatch(r"[A-Z0-9_-]{3,40}", object_id or ""):
        return jsonify({"error": "invalid segment id"}), 400

    email = _resolve_recipient(body.get("email", ""))
    if not email:
        return jsonify({
            "error": "no valid recipient email - please set one on your "
                     "account or pass `email` in the request body"
        }), 400

    # Sensor + metrics + window all have sensible defaults; the user
    # only has to confirm the recipient.
    sensor = (body.get("sensor") or "S2").upper()
    metrics = body.get("metrics") or _DEFAULT_METRICS
    metrics = [m.upper() for m in metrics if isinstance(m, str)]
    metrics = [m for m in metrics if m in _VALID_METRICS] or _DEFAULT_METRICS

    date_to   = body.get("to")   or date.today().isoformat()
    date_from = body.get("from") or (date.today() - timedelta(days=180)).isoformat()

    job_id = jobs.enqueue(
        kind="advanced_segment_report",
        params={
            "object_id": object_id,
            "sensor": sensor,
            "metrics": metrics,
            "from": date_from,
            "to":   date_to,
        },
        email=email,
        username=getattr(g, "current_user", None),
    )
    return jsonify({
        "job_id": job_id,
        "status": "pending",
        "email":  email,
        "message": (
            "We're generating the advanced report - it takes a few "
            "minutes. We'll email it to "
            f"{email} when it's ready."
        ),
    }), 202


@advreport_bp.route("/jobs/<int:job_id>", methods=["GET"])
@auth_required
def job_status(job_id: int):
    j = jobs.get_job(job_id)
    if not j:
        return jsonify({"error": "job not found"}), 404
    # Don't leak other users' jobs in case the id is enumerated.
    if j.get("username") and j["username"] != getattr(g, "current_user", None):
        return jsonify({"error": "forbidden"}), 403
    # Stringify timestamps so JSON serialises cleanly.
    for k in ("created_at", "started_at", "finished_at"):
        if j.get(k):
            j[k] = j[k].isoformat()
    return jsonify(j), 200
