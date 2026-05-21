"""Sensor registry."""

from .sentinel1 import Sentinel1
from .sentinel2 import Sentinel2

# EnMAP is deferred (sparse/tasked, not a standard GEE collection - see
# docs/PIPELINE.md §9).
REGISTRY = {
    Sentinel2.SENSOR: Sentinel2,
    Sentinel1.SENSOR: Sentinel1,
}


def get_sensor(code: str):
    code = code.strip().upper()
    if code not in REGISTRY:
        raise KeyError(
            f"Unknown sensor {code!r}. Available: {sorted(REGISTRY)}"
        )
    return REGISTRY[code]()
