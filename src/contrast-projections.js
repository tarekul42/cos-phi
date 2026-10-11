// The CONTRAST projections — three famous world maps that are NOT equal-area,
// implemented so the gallery can measure what each one does to identical
// globe circles. Mercator is the conformal villain (area ~ sec^2 phi);
// Robinson and Winkel tripel are compromises that inflate the poles gently.
// Formulas are the published ones (Snyder, USGS PP 1453 / Wikipedia), coded
// here so OUR verification harness can judge them — we derive nothing of
// theirs, we only measure. Every projector: (lonDeg, latDeg) -> {x, y} in
// sphere-radii, y north-positive (renderers flip for SVG).

import { smallCircleRing } from './tissot.js';
import { planarPolygonArea } from './area.js';

const D2R = Math.PI / 180;

// Mercator clipped to the classic Web square: |lat| <= 85.05113 makes
// y in [-pi, pi] and the world a 2pi x 2pi square. Points below the clip
// collapse onto the edge (Antarctica's bottom flattens, as on every web map).
export const MERCATOR_LAT_MAX = 85.05113;

export function mercatorProjection(lonDeg, latDeg) {
  const lat = Math.max(-MERCATOR_LAT_MAX, Math.min(MERCATOR_LAT_MAX, latDeg)) * D2R;
  return { x: lonDeg * D2R, y: Math.log(Math.tan(Math.PI / 4 + lat / 2)) };
}

// Robinson (1974): tabulated X (parallel length vs equator) and Y (distance
// from equator), linearly interpolated between the 5-degree rows — Robinson
// specified no interpolation; linear is the standard simple choice.
const ROBINSON = [
  [1.0, 0.0], [0.9986, 0.062], [0.9954, 0.124], [0.99, 0.186],
  [0.9822, 0.248], [0.973, 0.31], [0.96, 0.372], [0.9427, 0.434],
  [0.9216, 0.4958], [0.8962, 0.5571], [0.8679, 0.6176], [0.835, 0.6769],
  [0.7986, 0.7346], [0.7597, 0.7903], [0.7186, 0.8435], [0.6732, 0.8936],
  [0.6213, 0.9394], [0.5722, 0.9761], [0.5322, 1.0],
];

export function robinsonProjection(lonDeg, latDeg) {
  const a = Math.abs(latDeg);
  const i = Math.min(Math.floor(a / 5), ROBINSON.length - 2);
  const f = (a - i * 5) / 5;
  const X = ROBINSON[i][0] + (ROBINSON[i + 1][0] - ROBINSON[i][0]) * f;
  const Y = ROBINSON[i][1] + (ROBINSON[i + 1][1] - ROBINSON[i][1]) * f;
  return { x: 0.8487 * lonDeg * D2R * X, y: 1.3523 * Y * Math.sign(latDeg || 1) };
}

// Winkel tripel (1921): the mean of equirectangular and Aitoff.
//   x = 1/2 (lambda cos phi1 + 2 cos phi sin(lambda/2) / sinc alpha)
//   y = 1/2 (phi + sin phi / sinc alpha)
//   alpha = arccos(cos phi cos(lambda/2)), phi1 = arccos(2/pi)
// with the UNnormalized sinc (sin a / a), so "/ sinc" = "* a / sin a".
export const WINKEL_PHI1 = Math.acos(2 / Math.PI);

export function winkelTripelProjection(lonDeg, latDeg) {
  const lam = lonDeg * D2R;
  const phi = latDeg * D2R;
  const cosPhi = Math.cos(phi);
  const alpha = Math.acos(Math.max(-1, Math.min(1, cosPhi * Math.cos(lam / 2))));
  const sinc = alpha < 1e-12 ? 1 : Math.sin(alpha) / alpha;
  return {
    x: 0.5 * (lam * Math.cos(WINKEL_PHI1) + (2 * cosPhi * Math.sin(lam / 2)) / sinc),
    y: 0.5 * (phi + Math.sin(phi) / sinc),
  };
}

// --- the gallery's honesty metric --------------------------------------------
// Project identical 5-degree globe circles and measure each map's area scale
// relative to the equator (1.00 = true). Equal-area projections read a flat
// 1.00 everywhere; everyone else shows their worst at the poles. Shared by
// gallery.html and test/contrast-projections.test.js — the page shows exactly
// what the tests assert.
export function areaScaleSpread(
  projector,
  { alphaDeg = 5, maxLat = 75, latStep = 15, lonStep = 30, n = 64 } = {},
) {
  const areaAt = (lat, lon) => {
    const ring = smallCircleRing(lat, lon, alphaDeg, n).map(([rlon, rlat]) => {
      const p = projector(rlon, rlat);
      return [p.x, p.y];
    });
    return Math.abs(planarPolygonArea(ring));
  };
  const ref = areaAt(0, 0);
  let min = Infinity;
  let max = 0;
  for (let lat = -maxLat; lat <= maxLat; lat += latStep) {
    for (let lon = -180; lon < 180; lon += lonStep) {
      const r = areaAt(lat, lon) / ref;
      if (r < min) min = r;
      if (r > max) max = r;
    }
  }
  return { min, max };
}
