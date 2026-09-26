// Interactive morph between the Equal-Earth map and a frame-fitted Mercator.
//
// Endpoint B: Mercator scaled uniformly so its ±85.05113° square is exactly
// as tall as the viewBox (s = yMax/π), centered horizontally. Latitudes beyond
// 85.05 fall outside the frame and are clipped by the SVG viewport, so every
// country that matters (Greenland to 83.6°) stays fully visible. Each path is
// stored as two parallel vertex arrays and a frame lerps them per vertex —
// the map is equal-area only at t=0, and areaScaleMetrics() quantifies the
// lie at every t (equator-normalized: 1.00 = true area).

import { densifyRing } from "./area.js";
import { polygonsOf } from "./geo.js";
import { project } from "./projection.js";
import { graticuleLines, outlineLine } from "./render.js";

const D2R = Math.PI / 180;
const PRECISION = 4; // must match render.js — the t=0 string-identity test
const LAT_HARD = 89.9999; // keep Mercator y finite at the poles

const fmt = (v) =>
  (Math.round(v * 10 ** PRECISION) / 10 ** PRECISION).toString();

function mercY(latDeg) {
  const lat = Math.max(-LAT_HARD, Math.min(LAT_HARD, latDeg)) * D2R;
  return Math.log(Math.tan(Math.PI / 4 + lat / 2));
}

// Mercator endpoint in SVG units (y flipped), uniform scale s.
export function mercXY(lonDeg, latDeg, s) {
  return [s * lonDeg * D2R, -s * mercY(latDeg)];
}

function makeTarget(pts, closed, s, coeffs) {
  const n = pts.length;
  const eq = new Float64Array(2 * n);
  const mc = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {
    const [lon, lat] = pts[i];
    const p = project(lat * D2R, lon * D2R, coeffs);
    eq[2 * i] = p.x;
    eq[2 * i + 1] = -p.y;
    const [mx, my] = mercXY(lon, lat, s);
    mc[2 * i] = mx;
    mc[2 * i + 1] = my;
  }
  return { eq, mc, n, closed };
}

function segPath({ eq, mc, n, closed }, t) {
  let d =
    "M" + fmt(eq[0] + (mc[0] - eq[0]) * t) + " " + fmt(eq[1] + (mc[1] - eq[1]) * t);
  for (let i = 1; i < n; i++) {
    const j = 2 * i;
    d +=
      "L" +
      fmt(eq[j] + (mc[j] - eq[j]) * t) +
      " " +
      fmt(eq[j + 1] + (mc[j + 1] - eq[j + 1]) * t);
  }
  return closed ? d + "Z" : d;
}

// Local area scale of the morphed map relative to true spherical area,
// normalized so the equator reads exactly 1.00 at every t:
//   scale(t, φ) = |det J(t, φ)| / cos φ  ÷  |det J(t, 0°)|
// t=0 → 1 everywhere (equal-area); t=1 → Mercator's sec²φ.
function areaScaleMetrics(t, s, coeffs) {
  const map = (lonDeg, latDeg) => {
    const p = project(latDeg * D2R, lonDeg * D2R, coeffs);
    const eqx = p.x;
    const eqy = -p.y;
    const mcy = -s * mercY(latDeg);
    return [eqx + (s * lonDeg * D2R - eqx) * t, eqy + (mcy - eqy) * t];
  };

  const hd = 0.01; // finite-difference step, degrees (shared by both axes)
  const detAt = (lon, lat) => {
    const [ax0, ay0] = map(lon - hd, lat);
    const [ax1, ay1] = map(lon + hd, lat);
    const [bx0, by0] = map(lon, lat - hd);
    const [bx1, by1] = map(lon, lat + hd);
    const xl = (ax1 - ax0) / (2 * hd);
    const yl = (ay1 - ay0) / (2 * hd);
    const xp = (bx1 - bx0) / (2 * hd);
    const yp = (by1 - by0) / (2 * hd);
    return Math.abs(xl * yp - xp * yl);
  };

  const norm = detAt(0, 0);
  const samples = [];
  let max = 0;
  for (let lat = -84; lat <= 84; lat += 6) {
    const w = Math.cos(lat * D2R);
    for (let lon = -180; lon < 180; lon += 10) {
      const v = detAt(lon, lat) / w / norm;
      samples.push([v, w]);
      if (v > max) max = v;
    }
  }
  samples.sort((a, b) => a[0] - b[0]);
  const total = samples.reduce((acc, [v, w]) => acc + w, 0);
  let acc = 0;
  let median = samples[0][0];
  for (const [v, w] of samples) {
    acc += w;
    if (acc >= total / 2) {
      median = v;
      break;
    }
  }
  return { median, max };
}

export function prepareMorph(features, { yMax, coeffs, maxDeg = 1 } = {}) {
  const s = yMax / Math.PI;

  const countries = features.map((f) => {
    const parts = [];
    for (const rings of polygonsOf(f.geometry)) {
      for (const ring of rings) {
        const dense = densifyRing(ring, maxDeg);
        if (dense.length) parts.push(makeTarget(dense, true, s, coeffs));
      }
    }
    return parts;
  });

  const graticule = graticuleLines().map((l) =>
    makeTarget(l.pts, l.closed, s, coeffs),
  );
  const outline = makeTarget(outlineLine().pts, true, s, coeffs);

  return {
    featurePath(i, t) {
      const parts = countries[i];
      if (!parts || parts.length === 0) return "";
      return parts.map((tg) => segPath(tg, t)).join(" ");
    },
    graticulePath(i, t) {
      return segPath(graticule[i], t);
    },
    outlinePath(t) {
      return segPath(outline, t);
    },
    metrics(t) {
      if (t <= 0) return { median: 1, max: 1 };
      return areaScaleMetrics(t, s, coeffs);
    },
  };
}
