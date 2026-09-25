// SVG rendering: projected country paths, graticule, map outline.
// Coordinates are written with y flipped (SVG y grows downward), so the whole
// map lives in the viewBox [-xMax, -yMax, width, height] with no extra groups.

import { project } from './projection.js';
import { unwrapRing, densifyRing } from './area.js';
import { polygonsOf } from './geo.js';

const D2R = Math.PI / 180;
const PRECISION = 3; // 1e-3 sphere-radii ≈ 0.02% of map width — invisible

const fmt = (v) => (Math.round(v * 10 ** PRECISION) / 10 ** PRECISION).toString();

function projectToSvg(lonDeg, latDeg) {
  const { x, y } = project(latDeg * D2R, lonDeg * D2R);
  return `${fmt(x)} ${fmt(-y)}`;
}

// One ring -> "M x y L x y ... Z". Rings are unwrapped (antimeridian-safe) and
// densified along great circles so edges follow their true projected curves.
export function ringToPath(ringDeg, { maxDeg = 1 } = {}) {
  const dense = densifyRing(ringDeg, maxDeg);
  if (dense.length === 0) return '';
  let d = '';
  for (let i = 0; i < dense.length; i++) {
    d += (i === 0 ? 'M' : 'L') + projectToSvg(dense[i][0], dense[i][1]);
  }
  return d + 'Z';
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
  return parts.join(' ');
}

// --- graticule ---------------------------------------------------------------

export function graticulePaths({ lonStep = 30, latStep = 30, samples = 90 } = {}) {
  const paths = [];

  // Parallels: straight horizontal lines (a property of the projection).
  for (let lat = -90 + latStep; lat < 90; lat += latStep) {
    const y = project(lat * D2R, 0).y;
    const xEdge = project(lat * D2R, Math.PI).x;
    paths.push(`M${fmt(-xEdge)} ${fmt(-y)}L${fmt(xEdge)} ${fmt(-y)}`);
  }

  // Meridians: curved polylines from pole to pole.
  const latStepDeg = 180 / samples;
  for (let lon = -180; lon <= 180; lon += lonStep) {
    let d = '';
    for (let i = 0; i <= samples; i++) {
      const lat = -90 + i * latStepDeg;
      d += (i === 0 ? 'M' : 'L') + projectToSvg(lon, lat);
    }
    paths.push(d);
  }
  return paths;
}

// --- map outline (the closed oval) ------------------------------------------

export function outlinePath({ samples = 180 } = {}) {
  const latStep = 180 / samples;
  let d = '';
  let first = true;
  const push = (lonDeg, latDeg) => {
    d += (first ? 'M' : 'L') + projectToSvg(lonDeg, latDeg);
    first = false;
  };

  for (let i = 0; i <= samples; i++) push(-180, -90 + i * latStep); // left edge up
  push(180, 90); // top pole line
  for (let i = samples; i >= 0; i--) push(180, -90 + i * latStep); // right edge down
  return d + 'Z'; // bottom pole line
}
