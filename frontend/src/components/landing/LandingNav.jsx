import EmailIcon from '@mui/icons-material/Email'
import CampaignIcon from '@mui/icons-material/Campaign'
import MapIcon from '@mui/icons-material/Map'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import AppNavBar from '../AppNavBar'

/* No `leading` prop: AppNavBar renders the shared LogoBadge by default, so
   the landing nav stays in lock-step with every other page. */

export default function LandingNav({ onGoToMap, onGoToLogin, onGoToRegister, onGoToNewsletter, onGoToCampaigns, onGoToPipeline, onGoToAbout, user, onLogout }) {
  return (
    <AppNavBar
      links={[
        { label: 'Map', icon: <MapIcon />, onClick: onGoToMap },
        { label: 'Pipeline', icon: <AccountTreeIcon />, onClick: onGoToPipeline },
        { label: 'Campaigns', icon: <CampaignIcon />, onClick: onGoToCampaigns },
        { label: 'Newsletter', icon: <EmailIcon />, onClick: onGoToNewsletter },
        { label: 'About', icon: <InfoOutlinedIcon />, onClick: onGoToAbout },
      ]}
      user={user}
      onLogout={onLogout}
      showAuth
      onLogin={onGoToLogin}
      onRegister={onGoToRegister}
    />
  )
}

AquaGraph turns free European satellite imagery into evidence the environmental compliance manager at a Romanian water
  utility or industrial operator (RAJA, Apavital, Azomureș, OMV Petrom) can use to prove where a pollution event came from,
  against fines of around 80,000 RON per incident and CSRD reporting duties. Today we use only Sentinel-1 and Sentinel-2, but
  the ingestion is built so a new sensor (EnMAP, for hyperspectral chemical fingerprints, is the natural next one) plugs in as
  a small adapter, with no rewrite of the rest of the pipeline. The seven stages, in order. (1) Discovery: Google Earth Engine
  filters every new Sentinel-1 and Sentinel-2 pass over Romania with low enough cloud cover. (2) Access: the heavy work runs on
   Google's servers, not ours, so only a few kilobytes of numbers come back per run. (3) Pre-processing: we use Sentinel-2
  atmospherically-corrected products as they come, mask clouds with the SCL band, terrain-correct Sentinel-1, and average each
  scene over the around 5,100 river segments from EU-Hydro. (4) Feature extraction: per-segment, per-date numbers, water
  indices (NDWI/MNDWI), chlorophyll (NDCI), turbidity, and a radar-based oil/contamination probability compared to a multi-year
   seasonal normal, saved into a Postgres time-series. (5) Modeling: a simple normalisation of each metric to a 0-1 risk score
  and colour gradient; a clear threshold a regulator can defend, not a black-box score. (6) Validation: today only input-side
  quality filtering (cloud thresholds, SCL masking, NaN guards, safe re-runs that overwrite bad data) so only useful
  observations enter the database, plus an informal eyeball check that anomalies spread downstream along plausible river paths.
   A real check against trusted reference data (Apele Române or ICPDR in-situ measurements) is the next step, covered
  separately. (7) Delivery: three outputs from the same data, a web app with a 3-year time slider the compliance manager uses
  to walk the colour gradient upstream to the source segment, a REST API for other systems, and an executive PDF (dated charts,
   basemap, risk tables) that drops into the regulatory file and the CSRD pack. Reproducibility comes from a log of every
  ingestion run and safe re-runs keyed by (object_id, sensor, date); cost per query is effectively zero (free Copernicus, free
  Earth Engine, sub-cent storage); latency is 12 to 24 hours from satellite pass to PDF, well inside the typical audit-prep and
   incident-response window.