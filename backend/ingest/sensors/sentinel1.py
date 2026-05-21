"""Sentinel-1 oil-slick detection.

Port of research/Cassini2026_S1.ipynb, adapted to the same Sentinel-2-style
interface (indices_image + add_risk + discover_dates) so the generic chunked
fetch path handles it unchanged. The notebook's buffer+join step (used only to
reattach stats to line geometry for styling/export) is dropped: we reduce the
oil-detection band stack directly over the river-line geometry, exactly like
Sentinel-2, since we only need per-segment numeric values keyed by OBJECT_ID.

The baseline is a long historical composite filtered to the event window's
calendar months (notebook behaviour); the event window is the run window.
"""

from datetime import datetime
from typing import List

import ee

from .base import Sensor
from .. import config


def _event_month_filter(start_date: str, end_date: str) -> ee.Filter:
    sm = datetime.strptime(start_date, "%Y-%m-%d").month
    em = datetime.strptime(end_date, "%Y-%m-%d").month
    months = (list(range(sm, em + 1)) if sm <= em
              else list(range(sm, 13)) + list(range(1, em + 1)))
    filters = [ee.Filter.calendarRange(m, m, "month") for m in months]
    return filters[0] if len(filters) == 1 else ee.Filter.Or(*filters)


def _mask_s1_edges(img: ee.Image) -> ee.Image:
    angle = img.select("angle")
    mask = angle.gt(30).And(angle.lt(45))
    return (img.updateMask(mask).select(["VV", "VH"])
            .copyProperties(img, img.propertyNames()))


def _unit_scale_clamped(img: ee.Image, low, high) -> ee.Image:
    return img.subtract(low).divide(high - low).clamp(0, 1)


def _safe(feature: ee.Feature, name: str) -> ee.Number:
    val = feature.get(name)
    return ee.Number(ee.Algorithms.If(ee.Algorithms.IsEqual(val, None), 0, val))


class Sentinel1(Sensor):
    SENSOR = "S1"
    METRIC_FIELDS = [
        "VV_EVENT", "VH_EVENT", "VV_BASELINE", "VH_BASELINE",
        "VV_DARKENING_DB", "VH_DARKENING_DB", "VV_TEXTURE",
        "OIL_PROBABILITY", "DARK_PIXEL", "WATER_PIXEL",
    ]
    RISK_FIELDS = [
        "risk_score", "risk_level", "oil_probability",
        "dark_fraction", "vv_darkening_mean", "water_fraction",
    ]

    def _collection(self, start: str, end: str) -> ee.ImageCollection:
        return (
            ee.ImageCollection("COPERNICUS/S1_GRD")
            .filterBounds(self.country())
            .filterDate(start, end)
            .filter(ee.Filter.eq("instrumentMode", "IW"))
            .filter(ee.Filter.eq("resolution_meters", 10))
            .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
            .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VH"))
            .map(_mask_s1_edges)
        )

    def _composite(self, collection: ee.ImageCollection) -> ee.Image:
        return collection.median().focal_median(
            radius=config.S1_SMOOTHING_M, units="meters"
        )

    def indices_image(self, start: str, end: str) -> ee.Image:
        country = self.country()
        event = self._composite(self._collection(start, end)).clip(country)
        baseline = self._composite(
            self._collection(config.S1_BASELINE_START, config.S1_BASELINE_END)
            .filter(_event_month_filter(start, end))
        ).clip(country)

        water_mask = (
            ee.Image("JRC/GSW1_4/GlobalSurfaceWater")
            .select("occurrence")
            .gte(config.S1_WATER_OCCURRENCE_MIN)
            .clip(country)
        )

        vv_event = event.select("VV").rename("VV_EVENT")
        vh_event = event.select("VH").rename("VH_EVENT")
        vv_baseline = baseline.select("VV").rename("VV_BASELINE")
        vh_baseline = baseline.select("VH").rename("VH_BASELINE")
        vv_darkening = vv_baseline.subtract(vv_event).rename("VV_DARKENING_DB")
        vh_darkening = vh_baseline.subtract(vh_event).rename("VH_DARKENING_DB")
        vv_texture = (
            event.select("VV")
            .reduceNeighborhood(
                reducer=ee.Reducer.stdDev(),
                kernel=ee.Kernel.circle(
                    radius=config.S1_SMOOTHING_M, units="meters"),
            )
            .rename("VV_TEXTURE")
        )

        vv_drop = _unit_scale_clamped(vv_darkening, 1.5, 5.5)
        vh_drop = _unit_scale_clamped(vh_darkening, 1.0, 4.5)
        absolute_dark = _unit_scale_clamped(
            ee.Image.constant(-16).subtract(vv_event), 0, 8)
        texture_score = _unit_scale_clamped(
            ee.Image.constant(1.8).subtract(vv_texture), 0, 1.8)

        oil_probability = (
            vv_drop.multiply(0.45)
            .add(vh_drop.multiply(0.25))
            .add(absolute_dark.multiply(0.20))
            .add(texture_score.multiply(0.10))
            .rename("OIL_PROBABILITY")
            .updateMask(water_mask)
        )
        dark_pixel = (
            oil_probability.gte(config.S1_OIL_THRESHOLD)
            .rename("DARK_PIXEL")
            .updateMask(water_mask)
        )
        water_pixel = water_mask.rename("WATER_PIXEL")

        return ee.Image.cat([
            vv_event, vh_event, vv_baseline, vh_baseline,
            vv_darkening, vh_darkening, vv_texture,
            oil_probability, dark_pixel, water_pixel,
        ]).select(self.METRIC_FIELDS)

    def add_risk(self, fc: ee.FeatureCollection) -> ee.FeatureCollection:
        def compute_risk(feature: ee.Feature) -> ee.Feature:
            oil_p = _safe(feature, "OIL_PROBABILITY")
            dark = _safe(feature, "DARK_PIXEL")
            vv_dark = _safe(feature, "VV_DARKENING_DB")
            water = _safe(feature, "WATER_PIXEL")

            risk_score = oil_p.multiply(70).add(dark.multiply(30)).min(100).max(0)
            high = risk_score.gte(45).Or(dark.gte(0.25).And(vv_dark.gte(3)))
            medium = risk_score.gte(20).Or(dark.gte(0.10).And(vv_dark.gte(2)))
            level = ee.Algorithms.If(
                water.lt(0.02), "LOW",
                ee.Algorithms.If(high, "HIGH",
                                 ee.Algorithms.If(medium, "MEDIUM", "LOW")),
            )
            return feature.set({
                "oil_probability": oil_p,
                "dark_fraction": dark,
                "vv_darkening_mean": vv_dark,
                "water_fraction": water,
                "risk_score": risk_score,
                "risk_level": level,
            })

        return fc.map(compute_risk)

    def discover_dates(self, since: str, until: str) -> List[str]:
        col = self._collection(since, until)
        dates = col.aggregate_array("system:time_start").map(
            lambda t: ee.Date(t).format("YYYY-MM-dd")
        )
        from ..eeutil import ee_retry
        return sorted(set(ee_retry(
            lambda: ee.List(dates).distinct().getInfo(),
            what="S1 discover_dates")))
