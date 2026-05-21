"""Command-line entry point.

  python -m backend.ingest.cli check-auth
  python -m backend.ingest.cli ingest S2 --mode pass
  python -m backend.ingest.cli ingest S2 --mode composite --since 2019-01-01 --until 2024-12-31
  python -m backend.ingest.cli runs
"""

import argparse
import sys

from . import config, db
from .gee_auth import init_ee


def _check_auth() -> int:
    try:
        ident = init_ee()
    except Exception as exc:
        print(f"EE auth FAILED: {exc}", file=sys.stderr)
        return 2
    try:
        import ee
        n = ee.FeatureCollection(config.GEE_ASSET_RIVERS).size().getInfo()
        asset_ok = f"asset {config.GEE_ASSET_RIVERS} reachable ({n} features)"
    except Exception as exc:
        print(f"EE init OK as {ident}, but asset check FAILED: {exc}",
              file=sys.stderr)
        return 3
    try:
        db_ok = "DB reachable" if db.ping() else "DB ping returned unexpected"
    except Exception as exc:
        print(f"EE OK as {ident}; {asset_ok}; DB FAILED: {exc}", file=sys.stderr)
        return 4
    print(f"EE initialized as {ident} | {asset_ok} | {db_ok}")
    return 0


def _ingest(args) -> int:
    init_ee()
    from .loader import ingest
    result = ingest(args.sensor, mode=args.mode,
                     since=args.since, until=args.until)
    print(result)
    return 0 if result.get("status") in ("ok", "skip") else 1


def _backfill(args) -> int:
    init_ee()
    from .backfill import run_backfill
    sensors = [s.strip().upper() for s in args.sensors.split(",") if s.strip()]
    run_backfill(years=args.years, sensors=sensors, months=args.months,
                 mode=args.mode, newest_first=args.newest_first)
    return 0


def _snapshot(args) -> int:
    from .snapshot import rebuild_snapshot
    print(rebuild_snapshot(regen_tiles=args.tiles))
    return 0


def _runs(_args) -> int:
    with db.connect() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id, sensor, mode, status, acquired_from, acquired_to, "
            "segments, started_at FROM ingestion_run "
            "ORDER BY started_at DESC LIMIT 20"
        )
        for r in cur.fetchall():
            print(r)
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="backend.ingest.cli")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("check-auth", help="verify EE + asset + DB connectivity")
    sub.add_parser("runs", help="show recent ingestion runs")

    pi = sub.add_parser("ingest", help="run ingestion for a sensor")
    pi.add_argument("sensor", help="sensor code, e.g. S2")
    pi.add_argument("--mode", choices=["pass", "composite"], default="pass")
    pi.add_argument("--since", help="YYYY-MM-DD (default: watermark+1)")
    pi.add_argument("--until", help="YYYY-MM-DD (default: today)")

    pb = sub.add_parser("backfill",
                        help="resumable N-year monthly-composite backfill")
    pb.add_argument("--years", type=int, default=3)
    pb.add_argument("--months", type=int, default=None,
                    help="override --years with an exact month count")
    pb.add_argument("--sensors", default="S2,S1")
    pb.add_argument("--mode", choices=["composite", "pass"],
                    default="composite",
                    help="composite=1 monthly median/month (default); "
                         "pass=every satellite acquisition (finer, heavier)")
    pb.add_argument("--newest-first", action="store_true",
                    help="process months latest->oldest (recent/demo data "
                         "lands first on a long run)")

    ps = sub.add_parser("snapshot",
                        help="project latest DB values onto the map snapshot")
    ps.add_argument("--tiles", action="store_true",
                    help="also regenerate the tile pyramid (heavy)")

    args = p.parse_args(argv)
    if args.cmd == "check-auth":
        return _check_auth()
    if args.cmd == "runs":
        return _runs(args)
    if args.cmd == "ingest":
        return _ingest(args)
    if args.cmd == "backfill":
        return _backfill(args)
    if args.cmd == "snapshot":
        return _snapshot(args)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
