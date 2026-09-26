// SVG rendering: projected country paths, graticule, map outline.
// Coordinates are written with y flipped (SVG y grows downward), so the whole
// map lives in the viewBox [-xMax, -yMax, width, height] with no extra groups.

import { densifyRing } from "./area.js";
import { polygonsOf } from "./geo.js";
import { project } from "./projection.js";

const D2R = Math.PI / 180;
const PRECISION = 4; // 1e-4 sphere-radii ≈ 0.002% of map width — crisp at 64× zoom

const fmt = (v) =>
  (Math.round(v * 10 ** PRECISION) / 10 ** PRECISION).toString();

function projectToSvg(lonDeg, latDeg, a) {
  const { x, y } = project(latDeg * D2R, lonDeg * D2R, a);
  return `${fmt(x)} ${fmt(-y)}`;
}

// One ring -> "M x y L x y ... Z". Rings are unwrapped (antimeridian-safe) and
// densified along great circles so edges follow their true projected curves.
// opts.coeffs selects a member of the projection family (default: published).
export function ringToPath(ringDeg, { maxDeg = 1, coeffs } = {}) {
  const dense = densifyRing(ringDeg, maxDeg);
  if (dense.length === 0) return "";
  let d = "";
  for (let i = 0; i < dense.length; i++) {
    d += (i === 0 ? "M" : "L") + projectToSvg(dense[i][0], dense[i][1], coeffs);
  }
  return d + "Z";
}

// All rings of a feature as one path string. Holes become subpaths; callers
// should set fill-rule="evenodd" so they punch through.
export function featureToPath(feature, opts) {
  const parts = [];
  for (const rings of polygonsOf(feature.geometry)) {
    for (const ring of rings) {
      const d = ringToPath(ring, opts);
      if (d) parts.push(d);
    }
  }
  return parts.join(" ");
}

// --- graticule ---------------------------------------------------------------

// Geometry as lon/lat point lists — shared by the static renderer and the
// morph (src/morph.js) so both produce byte-identical paths at t=0.
export function graticuleLines({
  lonStep = 30,
  latStep = 30,
  samples = 90,
} = {}) {
  const lines = [];

  // Parallels: straight horizontal lines (a property of the projection).
  for (let lat = -90 + latStep; lat < 90; lat += latStep) {
    lines.push({ pts: [[-180, lat], [180, lat]], closed: false });
  }

  // Meridians: curved polylines from pole to pole.
  const latStepDeg = 180 / samples;
  for (let lon = -180; lon <= 180; lon += lonStep) {
    const pts = [];
    for (let i = 0; i <= samples; i++) pts.push([lon, -90 + i * latStepDeg]);
    lines.push({ pts, closed: false });
  }
  return lines;
}

function linePath(line, coeffs) {
  let d = "";
  for (let i = 0; i < line.pts.length; i++) {
    d += (i === 0 ? "M" : "L") + projectToSvg(line.pts[i][0], line.pts[i][1], coeffs);
  }
  return d + (line.closed ? "Z" : "");
}

export function graticulePaths(opts = {}) {
  return graticuleLines(opts).map((l) => linePath(l, opts.coeffs));
}

// --- map outline (the closed oval) ------------------------------------------

export function outlineLine({ samples = 180 } = {}) {
  const latStep = 180 / samples;
  const pts = [];
  for (let i = 0; i <= samples; i++) pts.push([-180, -90 + i * latStep]); // left edge up
  pts.push([180, 90]); // top pole line
  for (let i = samples; i >= 0; i--) pts.push([180, -90 + i * latStep]); // right edge down
  return { pts, closed: true };
}

export function outlinePath(opts = {}) {
  return linePath(outlineLine(opts), opts.coeffs);
}
