/**
 * Color generation for metric-based river visualization
 * Each metric has a specific color scale optimized for the data range
 */

// Metric display options for the dropdown
export const METRICS = [
  { key: 'pollution',    label: 'Pollution Risk (synthetic)',     gradient: 'green-yellow-red' },
  { key: 'risk',         label: 'Risk Score (satellite)',         gradient: 'green-yellow-orange-red-purple' },
  { key: 'NDVI',         label: 'NDVI (vegetation)',              gradient: 'blue-cyan-green-yellow-red' },
  { key: 'MNDWI',        label: 'MNDWI (water presence)',         gradient: 'red-yellow-green-cyan-blue' },
  { key: 'NDCI',         label: 'NDCI (chlorophyll/a)',           gradient: 'green-yellow-red' },
  { key: 'BSI',          label: 'BSI (bare soil)',                gradient: 'white-yellow-orange-brown' },
  { key: 'TURBIDITY',    label: 'Turbidity (sediment)',           gradient: 'cyan-yellow-orange-red' },
  { key: 'water',        label: 'Water Index',                    gradient: 'blue-lightblue-darkblue' },
  { key: 'land',         label: 'Land Index',                     gradient: 'orange-brown-green' },
];

// Default metrics key (pollution)
export const DEFAULT_METRIC = 'pollution';

/**
 * Generate a color from a linear gradient based on a 0-1 value
 */
export function getMetricColor(value, metricKey) {
  const t = Math.max(0, Math.min(1, value));
  const metric = METRICS.find(m => m.key === metricKey) || METRICS[0];

  switch (metric.gradient) {
    // Standard pollution: green → yellow → orange → red
    case 'green-yellow-red': {
      if (t < 0.7) {
        // Green (0.7) → Yellow (0.9)
        const localT = t / 0.7;
        const r = Math.round(26 + localT * 220);
        const g = Math.round(255 - localT * 55);
        const b = Math.round(89 - localT * 89);
        return `rgb(${r}, ${g}, ${b})`;
      } else {
        // Yellow (0.9) → Red (1.0)
        const localT = (t - 0.7) / 0.3;
        const r = 246;
        const g = Math.round(164 - localT * 164);
        const b = Math.round(0);
        return `rgb(${r}, ${g}, ${b})`;
      }
    }

    case 'green-yellow-orange-red-purple': {
      if (t < 0.5) {
        // Green → Red
        const localT = t * 2;
        return `rgb(${Math.round(localT * 239)}, ${Math.round(185 - localT * 55)}, ${Math.round(129 - localT * 129)})`;
      } else if (t < 0.75) {
        // Red → Purple
        const localT = (t - 0.5) * 4;
        const r = Math.round(239 - localT * 85);
        const g = Math.round(130 - localT * 90);
        const b = Math.round(0 + localT * 170);
        return `rgb(${r}, ${g}, ${b})`;
      } else {
        // Purple
        const r = 156;
        const g = Math.round(60 + (t - 0.75) * 4 * 80);
        const b = Math.round(170 + (t - 0.75) * 4 * 50);
        return `rgb(${r}, ${g}, ${b})`;
      }
    }

    // NDVI: blue (low) → cyan → green (high) → red (very high - stressed vegetation)
    case 'blue-cyan-green-yellow-red': {
      if (t < 0.25) {
        const localT = t / 0.25;
        return `rgb(${Math.round(30 + localT * 0)}, ${Math.round(90 + localT * 150)}, ${Math.round(180 - localT * 80)})`;
      } else if (t < 0.5) {
        const localT = (t - 0.25) / 0.25;
        return `rgb(${Math.round(30 + localT * 15)}, ${Math.round(240 - localT * 20)}, ${80 - localT * 80})`;
      } else if (t < 0.75) {
        const localT = (t - 0.5) / 0.25;
        return `rgb(${30 + localT * 200}, ${220 - localT * 100}, ${0 + localT * 100})`;
      } else {
        const localT = (t - 0.75) / 0.25;
        return `rgb(${230 + localT * 9}, ${120 - localT * 120}, ${100 - localT * 100})`;
      }
    }

    // MNDWI: red (negative, no water) → blue-green (positive, more water)
    case 'red-yellow-green-cyan-blue': {
      if (t < 0.3) {
        const localT = t / 0.3;
        return `rgb(${235}, ${Math.round(70 + localT * 140)}, ${Math.round(localT * 30)})`;
      } else if (t < 0.7) {
        const localT = (t - 0.3) / 0.4;
        return `rgb(${Math.round(235 - localT * 190)}, ${210 + localT * 0}, ${30 + localT * 30})`;
      } else {
        const localT = (t - 0.7) / 0.3;
        return `rgb(${45 + localT * 0}, ${210 - localT * 80}, ${60 + localT * 70})`;
      }
    }

    // Default: standard 3-stop gradient (green → red)
    default: {
      if (t < 0.5) {
        const localT = t / 0.5;
        return `rgb(${Math.round(26 + localT * 213)}, ${Math.round(255 - localT * 90)}, ${Math.round(89 - localT * 89)})`;
      } else {
        const localT = (t - 0.5) / 0.5;
        return `rgb(${239}, ${Math.round(165 - localT * 165)}, ${Math.round(0)});`;
      }
    }
  }
}

/**
 * Format a metric value for display with appropriate units
 */
export function formatMetricValue(value, metricKey) {
  if (value === null || value === undefined) return 'N/A';
  const fixed = Number(Math.round(value * 100) / 100);
  
  switch(metricKey) {
    case 'risk':
      return `${fixed} / 5`;
    case 'NDVI':
    case 'MNDWI':
    case 'NDCI':
    case 'BSI':
      return `${fixed <= 0 ? '−' : ''}${Math.abs(fixed).toFixed(2)}`;
    case 'TURBIDITY':
    case 'water':
    case 'land':
      return fixed.toFixed(3);
    case 'pollution':
      return `${Math.round(fixed * 100)}%`;
    default:
      return fixed.toString();
  }
}
