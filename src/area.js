// Area utilities for verifying the equal-area promise.
//
// Two independent implementations of "the area of a country":
//   - on the sphere  : signed spherical excess via fan triangulation
//                      (van Oosterom–Strackee solid-angle formula, unit sphere)
//   - on the map     : shoelace over projected, great-circle-densified rings
// Their ratio must be 1 everywhere — that is the project's core claim.

import { polygonsOf } from "./geo.js";
import { project } from "./projection.js";

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export const EARTH_RADIUS_KM = 6371.0088; // IUGG mean radius
export const EARTH_AREA_SR = 4 * Math.PI;

export function srToKm2(sr) {
  return sr * EARTH_RADIUS_KM * EARTH_RADIUS_KM;
}

// --- vector helpers ---------------------------------------------------------

function toVec(lonDeg, latDeg) {
  const lam = lonDeg * D2R;
  const phi = latDeg * D2R;
  const c = Math.cos(phi);
  return [c * Math.cos(lam), c * Math.sin(lam), Math.sin(phi)];
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

const clamp1 = (v) => Math.min(1, Math.max(-1, v));

// --- spherical area ---------------------------------------------------------

// Signed solid angle of a spherical triangle on the unit sphere.
function triangleSolidAngle(a, b, c) {
  const num = dot(a, cross(b, c));
  const den = 1 + dot(a, b) + dot(b, c) + dot(c, a);
  return 2 * Math.atan2(num, den);
}

// Drop a duplicated closing vertex so edges are traversed cyclically exactly once.
function normalizeRing(ring) {
  const n = ring.length;
  if (n > 1 && ring[0][0] === ring[n - 1][0] && ring[0][1] === ring[n - 1][1]) {
    return ring.slice(0, -1);
  }
  return ring;
}

// Signed area of a spherical polygon (unit sphere, steradians).
// Positive when vertices run counter-clockwise as seen from outside the sphere.
// Longitude wrapping is irrelevant: vertices are converted through trig functions.
export function sphericalPolygonArea(ring) {
  const pts = normalizeRing(ring);
  const n = pts.length;
  if (n < 3) return 0;
  const v = pts.map(([lon, lat]) => toVec(lon, lat));
  const a = v[0];
  let sum = 0;
  for (let i = 1; i < n - 1; i++) {
    sum += triangleSolidAngle(a, v[i], v[i + 1]);
  }
  return sum;
}

// --- longitude unwrapping & great-circle densification ----------------------

// Make longitudes continuous along the ring (each step folded into (-180, 180]).
// Needed before projection: x depends on lambda linearly, so a +/-180 jump would
// otherwise smear the polygon across the whole map. Spherical math never needs it.
export function unwrapRing(ring) {
  const src = normalizeRing(ring);
  if (src.length === 0) return [];
  const out = [[src[0][0], src[0][1]]];
  let prev = src[0][0];
  for (let i = 1; i < src.length; i++) {
    const d = src[i][0] - prev;
    // A leg between two points AT THE POLE keeps its raw delta: on the map that
    // leg is the pole *line* (the pole spans the full edge width). Folding it
    // would close the ring at the wrong latitude and silently change the region.
    const bothPoles =
      Math.abs(src[i][1]) === 90 && Math.abs(src[i - 1][1]) === 90;
    const lon = bothPoles ? prev + d : prev + (d - 360 * Math.round(d / 360));
    out.push([lon, src[i][1]]);
    prev = lon;
  }
  return out;
}

function slerpPoint(a, b, t, lonTargetDeg) {
  const omega = Math.acos(clamp1(dot(a, b)));
  let p;
  if (omega < 1e-12) {
    p = a;
  } else {
    const s = Math.sin(omega);
    const w1 = Math.sin((1 - t) * omega) / s;
    const w2 = Math.sin(t * omega) / s;
    p = [w1 * a[0] + w2 * b[0], w1 * a[1] + w2 * b[1], w1 * a[2] + w2 * b[2]];
    const len = Math.hypot(p[0], p[1], p[2]);
    p = [p[0] / len, p[1] / len, p[2] / len];
  }
  let lon = Math.atan2(p[1], p[0]) * R2D;
  lon += 360 * Math.round((lonTargetDeg - lon) / 360); // keep the continuous branch
  const lat = Math.asin(clamp1(p[2])) * R2D;
  return [lon, lat];
}

// Insert vertices along great-circle edges so planar (straight-in-projection)
// chords approximate the projected geodesic curve. `maxDeg` = max edge length.
// Spherical area does not change under this (geodesic edges stay geodesics).
export function densifyRing(ring, maxDeg = 1) {
  const src = unwrapRing(ring);
  const n = src.length;
  if (n < 3) return src;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p1 = src[i];
    const p2 = src[(i + 1) % n];
    out.push(p1);

    const a = toVec(p1[0], p1[1]);
    const b = toVec(p2[0], p2[1]);
    const omegaDeg = Math.acos(clamp1(dot(a, b))) * R2D;
    const steps = Math.max(1, Math.ceil(omegaDeg / maxDeg));
    if (steps === 1) continue;
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      const lonTarget = p1[0] + t * (p2[0] - p1[0]);
      out.push(slerpPoint(a, b, t, lonTarget));
    }
  }
  return out;
}

// --- planar area ------------------------------------------------------------

// Signed polygon area via the shoelace formula. pts: [[x, y], ...], cyclic.
export function planarPolygonArea(pts) {
  const n = pts.length;
  if (n < 3) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    s += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
  }
  return s / 2;
}

// Project a lon/lat ring: unwrap, densify along great circles, then project.
export function projectRing(ringDeg, maxDeg = 1) {
  const dense = densifyRing(ringDeg, maxDeg);
  return dense.map(([lon, lat]) => {
    const { x, y } = project(lat * D2R, lon * D2R);
    return [x, y];
  });
}

// --- GeoJSON feature helpers ------------------------------------------------

// |exterior| - sum|holes| per polygon, summed over a MultiPolygon. Positive, sr.
export function featureSphericalArea(feature) {
  let total = 0;
  for (const rings of polygonsOf(feature.geometry)) {
    total += Math.abs(sphericalPolygonArea(rings[0]));
    for (let i = 1; i < rings.length; i++) {
      total -= Math.abs(sphericalPolygonArea(rings[i]));
    }
  }
  return total;
}

// Same convention, measured on the projected map (square sphere-radii).
export function featurePlanarArea(feature, maxDeg = 1) {
  let total = 0;
  for (const rings of polygonsOf(feature.geometry)) {
    total += Math.abs(planarPolygonArea(projectRing(rings[0], maxDeg)));
    for (let i = 1; i < rings.length; i++) {
      total -= Math.abs(planarPolygonArea(projectRing(rings[i], maxDeg)));
    }
  }
  return total;
}
