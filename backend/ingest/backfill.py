"""Resumable historical backfill (monthly composites).

Pulls N years of monthly-composite history for the given sensors. Designed to
be run **separately** and to survive interruption: each (sensor, month) is
skipped if it already has rows, so you can Ctrl-C and re-run anytime. S1 is
much slower than S2 on the free synchronous tier (multi-chunk per month) - a
3-year S1 backfill is hours of wall-clock; that's expected.

  python -m backend.ingest.cli backfill --years 3 --sensors S2,S1

Tuning via env (see config.py / .env.example):
  INGEST_FETCH_CHUNK         lower for S1 (e.g. 800) if chunks time out
  INGEST_S1_BASELINE_*       keep ~1 season on the free tier
"""

from datetime import date, timedelta
from typing import List

from . import db
from .loader import ingest


def _recent_months(n: int) -> List[date]:
    """First-of-month dates for the last `n` months, oldest first
    (n includes the current month)."""
    today = date.today()
    out: List[date] = []
    y, m = today.year, today.month
    for _ in range(n):
        out.append(date(y, m, 1))
        y, m = (y - (m == 1), m - 1 if m > 1 else 12)
    return sorted(out)


def _already_done(sensor: str, month: date, min_rows: int = 1000) -> bool:
    """A month counts as done if it already has a meaningful row count
    (idempotent upsert makes a re-run harmless either way)."""
    nxt = date(month.year + (month.month == 12), (month.month % 12) + 1, 1)
    with db.connect() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT count(*) FROM satellite_observation "
            "WHERE sensor = %s AND acquired_at >= %s AND acquired_at < %s",
            (sensor, month, nxt),
        )
        return cur.fetchone()[0] >= min_rows


def run_backfill(years: int = 3, sensors: List[str] = None,
                 months: int = None) -> dict:
    sensors = sensors or ["S2", "S1"]
    n = months if months else years * 12
    months = _recent_months(n)
    summary = {s: {"done": 0, "skipped": 0, "rows": 0, "errors": 0}
               for s in sensors}

    for sensor in sensors:
        for month in months:
            nxt = date(month.year + (month.month == 12),
                       (month.month % 12) + 1, 1)
            last_day = nxt - timedelta(days=1)
            mlabel = month.strftime("%Y-%m")
            if _already_done(sensor, month):
                print(f"[{sensor} {mlabel}] already present - skip", flush=True)
                summary[sensor]["skipped"] += 1
                continue
            print(f"[{sensor} {mlabel}] ingesting composite "
                  f"{month}..{last_day} ...", flush=True)
            try:
                res = ingest(sensor, mode="composite",
                             since=month.isoformat(),
                             until=last_day.isoformat())
                n = res.get("segments", 0)
                summary[sensor]["done"] += 1
                summary[sensor]["rows"] += n
                print(f"[{sensor} {mlabel}] done: {n} rows", flush=True)
            except Exception as exc:  # keep going; the month stays un-done
                summary[sensor]["errors"] += 1
                print(f"[{sensor} {mlabel}] ERROR: {exc!r} - continuing",
                      flush=True)

    print("\n=== backfill summary ===")
    for s, v in summary.items():
        print(f"  {s}: {v}")
    return summary
