"""Sentinel-2 spectral indices + risk.

Faithful port of research/Cassini2026_Sentinel2.ipynb (cells 4-9). The notebook
remains the algorithm reference; this is the single reusable implementation the
pipeline and snapshot rebuild share. Keep the two in sync if the science changes.
"""

from typing import List

import ee

from .base import Sensor


def _mask_s2_clouds(img: ee.Image) -> ee.Image:
    scl = img.select("SCL")
    mask = scl.neq(3).And(scl.neq(9)).And(scl.neq(8)).And(scl.neq(10))
    return img.updateMask(mask)


def _compute_indices(img: ee.Image) -> ee.Image:
    ndwi = img.normalizedDifference(["B3", "B8"]).rename("NDWI")
    mndwi = img.normalizedDifference(["B3", "B11"]).rename("MNDWI")
    ndvi = img.normalizedDifference(["B8", "B4"]).rename("NDVI")
    ndti = img.normalizedDifference(["B4", "B3"]).rename("NDTI")
    ndci = img.normalizedDifference(["B5", "B4"]).rename("NDCI")
    bsi = img.expression(
        "((SWIR + RED) - (NIR + BLUE)) / ((SWIR + RED) + (NIR + BLUE))",
        {
            "SWIR": img.select("B11"),
            "RED": img.select("B4"),
            "NIR": img.select("B8"),
            "BLUE": img.select("B2"),
        },
    ).rename("BSI")
    turbidity = img.select("B4").rename("TURBIDITY")
    return ee.Image.cat([ndwi, mndwi, ndvi, ndti, ndci, bsi, turbidity])


def _safe(feature: ee.Feature, name: str) -> ee.Number:
    val = feature.get(name)
    return ee.Number(ee.Algorithms.If(ee.Algorithms.IsEqual(val, None), 0, val))


class Sentinel2(Sensor):
    SENSOR = "S2"
    METRIC_FIELDS = ["NDWI", "MNDWI", "NDVI", "NDTI", "NDCI", "BSI", "TURBIDITY"]
    RISK_FIELDS = ["risk_score", "water_risk", "land_risk", "is_water", "risk_level"]

    COLLECTION = "COPERNICUS/S2_SR_HARMONIZED"

    def _base_collection(self, start: str, end: str) -> ee.ImageCollection:
        return (
            ee.ImageCollection(self.COLLECTION)
            .filterBounds(self.country())
            .filterDate(start, end)
            .map(_mask_s2_clouds)
        )

    def indices_image(self, start: str, end: str) -> ee.Image:
        composite = self._base_collection(start, end).median().clip(self.country())
        return _compute_indices(composite).select(self.METRIC_FIELDS)

    def pollution_image(self, start: str, end: str) -> ee.Image:
        """Per-pixel POLLUTION composite (integer 0-7) over [start, end).
        Same formula as add_risk(), but applied pixel-wise rather than
        per-segment - used by the offline thumbnail generator so the
        Pipeline page can show a real EE-computed POLLUTION raster.

        The production ingest path is unchanged: it still reduces to
        per-segment means first, then runs add_risk() on the feature
        collection. This method is a separate visualization-only route."""
        img = self.indices_image(start, end)
        mndwi = img.select("MNDWI")
        ndti = img.select("NDTI")
        turbidity = img.select("TURBIDITY")
        ndvi = img.select("NDVI")
        ndci = img.select("NDCI")
        bsi = img.select("BSI")

        is_water = mndwi.gt(0.2)
        water_risk = (
            ndti.gt(0.1).multiply(2)
            .add(turbidity.gt(0.15))
            .add(ndci.gt(0.1))
            .add(ndti.gt(0.1).And(ndci.gt(0.1)))
        ).multiply(is_water)
        land_risk = ndvi.lt(0.3).add(bsi.gt(0.3))
        return water_risk.add(land_risk).rename("POLLUTION").toInt()

    def add_risk(self, fc: ee.FeatureCollection) -> ee.FeatureCollection:
        def compute_risk(feature: ee.Feature) -> ee.Feature:
            mndwi = _safe(feature, "MNDWI")
            ndti = _safe(feature, "NDTI")
            turbidity = _safe(feature, "TURBIDITY")
            ndvi = _safe(feature, "NDVI")
            ndci = _safe(feature, "NDCI")
            bsi = _safe(feature, "BSI")

            is_water = mndwi.gt(0.2)
            water_risk = (
                ndti.gt(0.1).multiply(2)
                .add(turbidity.gt(0.15))
                .add(ndci.gt(0.1))
                .add(ndti.gt(0.1).And(ndci.gt(0.1)))
            ).multiply(is_water)
            land_risk = ndvi.lt(0.3).add(bsi.gt(0.3))
            risk_score = water_risk.add(land_risk)
            return feature.set({
                "risk_score": risk_score,
                "water_risk": water_risk,
                "land_risk": land_risk,
                "is_water": is_water,
            })

        def classify_risk(feature: ee.Feature) -> ee.Feature:
            score = ee.Number(feature.get("risk_score"))
            level = ee.Algorithms.If(
                score.gte(5), "HIGH",
                ee.Algorithms.If(score.gte(3), "MEDIUM", "LOW"),
            )
            return feature.set({"risk_level": level})

        return fc.map(compute_risk).map(classify_risk)

    def discover_dates(self, since: str, until: str) -> List[str]:
        """Distinct S2 acquisition dates over the country in [since, until)."""
        col = self._base_collection(since, until)
        dates = col.aggregate_array("system:time_start").map(
            lambda t: ee.Date(t).format("YYYY-MM-dd")
        )
        from ..eeutil import ee_retry
        return sorted(set(ee_retry(
            lambda: ee.List(dates).distinct().getInfo(),
            what="S2 discover_dates")))
