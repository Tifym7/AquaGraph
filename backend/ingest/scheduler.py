"""Long-running scheduler service (the docker-compose `ingest` service).

Cron tick -> for each configured sensor, ingest in `pass` mode everything
since the per-sensor watermark (the newest acquisition already stored), i.e.
only new satellite passes. Idempotent, so a missed/overlapping run is
harmless. Optionally rebuilds the map snapshot afterwards
(INGEST_REBUILD_SNAPSHOT).

  python -m ingest.scheduler        # blocking service (run from backend/)
"""

import logging

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

from . import config
from .gee_auth import init_ee
from .loader import ingest

log = logging.getLogger("aquagraph.ingest")


def run_once() -> None:
    init_ee()
    ingested_any = False
    for sensor in config.SCHEDULE_SENSORS:
        try:
            log.info("ingest start sensor=%s", sensor)
            result = ingest(sensor, mode="pass")
            log.info("ingest done %s", result)
            if result.get("status") == "ok" and result.get("segments"):
                ingested_any = True
        except Exception:
            log.exception("ingest FAILED sensor=%s", sensor)

    if ingested_any and config.REBUILD_SNAPSHOT:
        try:
            from .snapshot import rebuild_snapshot
            log.info("rebuilding map snapshot from latest DB values")
            log.info("snapshot %s", rebuild_snapshot(regen_tiles=False))
        except Exception:
            log.exception("snapshot rebuild FAILED")


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    log.info("scheduler starting; cron=%s sensors=%s",
             config.SCHEDULE_CRON, config.SCHEDULE_SENSORS)
    run_once()  # catch up immediately on boot
    sched = BlockingScheduler(timezone="UTC")
    sched.add_job(run_once, CronTrigger.from_crontab(config.SCHEDULE_CRON),
                  max_instances=1, coalesce=True)
    sched.start()


if __name__ == "__main__":
    main()
