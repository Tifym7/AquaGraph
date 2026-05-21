"""Sensor abstraction.

Each sensor knows how to (a) discover acquisition dates over the country and
(b) turn a date window into an Earth Engine image whose bands are the
per-segment metrics, plus a server-side risk classifier. The generic chunked
fetch + DB load (ingest/fetch.py) is sensor-agnostic. Sentinel-2 is the
reference implementation; every other sensor conforms to this same shape.
"""

from abc import ABC, abstractmethod
from typing import List

import ee

from .. import config


class Sensor(ABC):
    #: short code stored in satellite_observation.sensor
    SENSOR: str
    #: numeric metric band names produced by indices_image()
    METRIC_FIELDS: List[str]
    #: risk property names added by add_risk()
    RISK_FIELDS: List[str]

    def country(self) -> ee.Geometry:
        return (
            ee.FeatureCollection("FAO/GAUL/2015/level0")
            .filter(ee.Filter.eq("ADM0_NAME", config.GEE_COUNTRY))
            .geometry()
        )

    @abstractmethod
    def indices_image(self, start: str, end: str) -> ee.Image:
        """Composite image over [start, end) with METRIC_FIELDS as bands."""

    @abstractmethod
    def add_risk(self, fc: ee.FeatureCollection) -> ee.FeatureCollection:
        """Server-side risk scoring/classification on reduced features."""

    @abstractmethod
    def discover_dates(self, since: str, until: str) -> List[str]:
        """Distinct acquisition dates (YYYY-MM-DD) with coverage over country."""

    def window_time_ms(self, start: str, end: str):
        """Server-side ee.Number: median system:time_start (ms epoch) of the
        scenes inside [start, end). Used to stamp `acquired_at_ts` so we know
        the actual UTC scene time (sun angle, day/night, orbit). Default impl
        uses _base_collection or _collection if defined; sensors can override."""
        import ee
        col_fn = getattr(self, "_base_collection", None) or \
                 getattr(self, "_collection", None)
        if col_fn is None:
            return ee.Number(0)
        col = col_fn(start, end)
        return ee.Number(col.aggregate_array("system:time_start")
                           .reduce(ee.Reducer.median()))
