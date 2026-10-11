// Gallery page: four world maps, one honesty test. Each panel is the same
// countries + graticule + 5° Tissot circles run through a different projector;
// the metric under each panel is the measured area spread of those circles
// (1.00 = every circle true size — only Equal Earth can say that).

import { bounds, project, DEG } from './projection.js';
import { featureToPath, graticulePaths, outlineLine, outlinePath } from './render.js';
import { smallCircleRing, tissotCenters } from './tissot.js';
import {
  areaScaleSpread,
  mercatorProjection,
  robinsonProjection,
  winkelTripelProjection,
} from './contrast-projections.js';

const eeProjector = (lonDeg, latDeg) => project(latDeg * DEG, lonDeg * DEG);

const PANELS = [
  { key: 'ee', label: 'Equal Earth (ours)', projector: eeProjector, ours: true },
  { key: 'winkel', label: 'Winkel tripel (NatGeo)', projector: winkelTripelProjection },
  { key: 'robinson', label: 'Robinson (CIA factbook)', projector: robinsonProjection },
  { key: 'mercator', label: 'Mercator (web maps)', projector: mercatorProjection },
];

const fmt = (v) => (Math.round(v * 1e4) / 1e4).toString();
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const res = await fetch('data/world.geojson');
if (!res.ok) throw new Error(`failed to load map data: ${res.status}`);
const geojson = await res.json();

// viewBox from the projected outline — works for every projector, no
// per-projection hardcoding (Mercator's square, the ovals, all fall out).
function viewBoxOf(projector) {
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const [lon, lat] of outlineLine({ samples: 360 }).pts) {
    const { x, y } = projector(lon, lat);
    if (x < xMin) xMin = x;
    if (x > xMax) xMax = x;
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
  }
  // small symmetric pad so hairlines don't kiss the frame
  const pad = 0.02 * Math.max(xMax - xMin, yMax - yMin);
  return `${fmt(xMin - pad)} ${fmt(-yMax - pad)} ${fmt(xMax - xMin + 2 * pad)} ${fmt(yMax - yMin + 2 * pad)}`;
}

function tissotPaths(projector, { alphaDeg = 5, n = 48 } = {}) {
  let d = '';
  for (const [lat, lon] of tissotCenters()) {
    const ring = smallCircleRing(lat, lon, alphaDeg, n);
    for (let i = 0; i < ring.length; i++) {
      const p = projector(ring[i][0], ring[i][1]);
      d += (i === 0 ? 'M' : 'L') + fmt(p.x) + ' ' + fmt(-p.y);
    }
    d += 'Z';
  }
  return d;
}

const countriesFor = (projector) =>
  geojson.features
    .map((f) => {
      const name = f.properties.ADMIN || f.properties.NAME || 'Unknown';
      return `<path class="country" fill-rule="evenodd" d="${featureToPath(f, { projector })}"><title>${esc(name)}</title></path>`;
    })
    .join('');

document.getElementById('panels').innerHTML = PANELS.map((p) => {
  const svg =
    `<svg viewBox="${viewBoxOf(p.projector)}" role="img" aria-label="${esc(p.label)}">` +
    graticulePaths({ projector: p.projector }).map((d) => `<path class="graticule" d="${d}"/>`).join('') +
    countriesFor(p.projector) +
    `<path class="outline" d="${outlinePath({ projector: p.projector })}"/>` +
    `<path class="tissot" d="${tissotPaths(p.projector)}"/>` +
    `</svg>`;
  const m = areaScaleSpread(p.projector);
  const spread = m.max / m.min;
  const equal = spread < 1.005;
  return (
    `<section class="panel${p.ours ? ' ours' : ''}">` +
    `<h2>${esc(p.label)}</h2>` +
    svg +
    `<div class="stats">` +
    `<span>circle areas <b>${m.min.toFixed(2)}× – ${m.max.toFixed(2)}×</b></span>` +
    `<span class="${equal ? 'good' : 'bad'}">${equal ? 'equal-area ✓' : `worst ${((m.max - 1) * 100).toFixed(0)}% too big`}</span>` +
    `</div></section>`
  );
}).join('');
