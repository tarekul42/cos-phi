// Tissot indicatrices as TRUE spherical small circles — the image, on the map,
// of identical circles drawn on the globe. Equal-area projections preserve
// their AREA (every blob the same size) but not their SHAPE (ellipses, sheared
// near the edges); Mercator inflates them toward the poles. Drawn through the
// live morph, the overlay becomes the project's whole argument, animated.
//
// A point at initial bearing theta and angular distance alpha from the center
// is composed from the center's local frame on the unit sphere:
//
//     p = c·cos α + (e·sin θ + n·cos θ)·sin α
//
// with c (up), e (east), n (north) in ECEF — the same rotation composition the
// 3D globe uses. Recover lon/lat with atan2/asin. No libraries, no copied
// destination formulas: one frame, one dot product, done.

import { project, DEG } from './projection.js';
import { mercXY } from './morph.js';

const PRECISION = 4; // must match render.js / morph.js

const fmt = (v) =>
  (Math.round(v * 10 ** PRECISION) / 10 ** PRECISION).toString();

// Open ring of n [lonDeg, latDeg] points: the small circle of angular radius
// alphaDeg centered at (latDeg, lonDeg).
export function smallCircleRing(latDeg, lonDeg, alphaDeg, n = 48) {
  const phi0 = latDeg * DEG;
  const lam0 = lonDeg * DEG;
  const alpha = alphaDeg * DEG;
  const cosPhi0 = Math.cos(phi0);
  const sinPhi0 = Math.sin(phi0);
  const cosLam0 = Math.cos(lam0);
  const sinLam0 = Math.sin(lam0);
  // local frame at the center, ECEF
  const c = [cosPhi0 * cosLam0, cosPhi0 * sinLam0, sinPhi0];
  const e = [-sinLam0, cosLam0, 0];
  const nn = [-sinPhi0 * cosLam0, -sinPhi0 * sinLam0, cosPhi0];
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const theta = (i / n) * 2 * Math.PI;
    const st = Math.sin(theta) * sa;
    const ct = Math.cos(theta) * sa;
    const px = c[0] * ca + e[0] * st + nn[0] * ct;
    const py = c[1] * ca + e[1] * st + nn[1] * ct;
    const pz = c[2] * ca + e[2] * st + nn[2] * ct;
    let lon = Math.atan2(py, px) / DEG;
    // keep the ring continuous across the antimeridian: shift each lon into
    // the +/-180 neighborhood of the CENTER's lon (may exceed 180 — the map
    // viewport clips it, exactly like the coastline data)
    lon += 360 * Math.round((lonDeg - lon) / 360);
    pts.push([lon, Math.asin(Math.max(-1, Math.min(1, pz))) / DEG]);
  }
  return pts;
}

// Indicator grid: centers every latStep/lonStep degrees, |lat| <= 75 by
// default so a 5-degree circle never reaches the pole-line degeneracy.
export function tissotCenters({ latStep = 15, lonStep = 15, maxLat = 75 } = {}) {
  const centers = [];
  for (let lat = -maxLat; lat <= maxLat; lat += latStep) {
    for (let lon = -180; lon < 180; lon += lonStep) {
      centers.push([lat, lon]);
    }
  }
  return centers;
}

// Same endpoint pair as morph.js: Equal Earth vs the frame-fitted Mercator,
// lerped per vertex at morph position t (0 = Equal Earth, 1 = Mercator).
export function prepareTissot({
  latStep = 15,
  lonStep = 15,
  maxLat = 75,
  alphaDeg = 5,
  n = 48,
  yMax,
  coeffs,
} = {}) {
  const s = yMax / Math.PI;
  const centers = tissotCenters({ latStep, lonStep, maxLat });
  const targets = centers.map(([lat, lon]) => {
    const ring = smallCircleRing(lat, lon, alphaDeg, n);
    const eq = new Float64Array(2 * n);
    const mc = new Float64Array(2 * n);
    for (let i = 0; i < n; i++) {
      const [rlon, rlat] = ring[i];
      const p = project(rlat * DEG, rlon * DEG, coeffs);
      eq[2 * i] = p.x;
      eq[2 * i + 1] = -p.y;
      const [mx, my] = mercXY(rlon, rlat, s);
      mc[2 * i] = mx;
      mc[2 * i + 1] = my;
    }
    return { eq, mc, n };
  });

  function ringPoints(i, t) {
    const { eq, mc, n } = targets[i];
    const pts = [];
    for (let k = 0; k < n; k++) {
      const j = 2 * k;
      pts.push([
        eq[j] + (mc[j] - eq[j]) * t,
        eq[j + 1] + (mc[j + 1] - eq[j + 1]) * t,
      ]);
    }
    return pts;
  }

  function ringPath(i, t) {
    const { eq, mc, n } = targets[i];
    let d =
      'M' + fmt(eq[0] + (mc[0] - eq[0]) * t) + ' ' + fmt(eq[1] + (mc[1] - eq[1]) * t);
    for (let k = 1; k < n; k++) {
      const j = 2 * k;
      d +=
        'L' + fmt(eq[j] + (mc[j] - eq[j]) * t) + ' ' + fmt(eq[j + 1] + (mc[j + 1] - eq[j + 1]) * t);
    }
    return d + 'Z';
  }

  return {
    count: targets.length,
    centers,
    ringPoints,
    ringPath,
    // one <path> holds every subpath — a single attribute update per frame
    paths(t) {
      let d = '';
      for (let i = 0; i < targets.length; i++) d += ringPath(i, t);
      return d;
    },
  };
}
