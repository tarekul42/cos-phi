// Compare page: published vs our fitted coefficients, side by side.
// Each panel is a full map (countries, graticule, outline) plus Tissot
// indicatrices drawn from the local frame differential; metrics below are
// computed live from the same code the tests use.

import {
  PUBLISHED_A,
  OURS_A,
  OURS_FIXED_ASPECT_A,
  bounds,
  project,
  DEG,
} from './projection.js';
import { featureToPath, graticulePaths, outlinePath } from './render.js';
import { partials, distortionMetrics, omegaDeg } from './distortion.js';

const FAMILIES = [
  { key: 'pub', label: 'Equal Earth (published)', a: PUBLISHED_A, ours: false },
  { key: 'free', label: 'Ours — free aspect', a: OURS_A, ours: true },
  { key: 'fixed', label: 'Ours — published aspect', a: OURS_FIXED_ASPECT_A, ours: true },
];

// Tissot anchors: spread over equator, mid-latitudes, map edge, polar band,
// both hemispheres. Radius 0.05 sphere-radii (~3 deg, ~330 km).
const ANCHORS = [
  [0, 0], [0, 90], [30, -45], [45, 180],
  [60, 60], [75, 0], [-45, -100], [-30, 140],
];
const R = 0.05;

const fmt = (v) => (Math.round(v * 1e4) / 1e4).toString();

function indicatrixPath(latDeg, lonDeg, a) {
  const { h, xPhi, yPhi } = partials(latDeg * DEG, lonDeg * DEG, a);
  const p = project(latDeg * DEG, lonDeg * DEG, a);
  const N = 48;
  let d = '';
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * 2 * Math.PI;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const ex = p.x + R * (h * c + xPhi * s);
    const ey = -(p.y + R * (yPhi * s));
    d += (i === 0 ? 'M' : 'L') + fmt(ex) + ' ' + fmt(ey);
  }
  return d + 'Z';
}

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const res = await fetch('data/world.geojson');
if (!res.ok) throw new Error(`failed to load map data: ${res.status}`);
const geojson = await res.json();

const countriesFor = (a) =>
  geojson.features
    .map((f) => {
      const name = f.properties.ADMIN || f.properties.NAME || 'Unknown';
      return `<path class="country" fill-rule="evenodd" d="${featureToPath(f, { coeffs: a })}"><title>${esc(name)}</title></path>`;
    })
    .join('');

const panels = document.getElementById('panels');
panels.innerHTML = FAMILIES.map((fam) => {
  const b = bounds(fam.a);
  const svg =
    `<svg viewBox="${fmt(-b.xMax)} ${fmt(-b.yMax)} ${fmt(b.width)} ${fmt(b.height)}" role="img" aria-label="${fam.label}">` +
    graticulePaths({ coeffs: fam.a }).map((d) => `<path class="graticule" d="${d}"/>`).join('') +
    countriesFor(fam.a) +
    `<path class="outline" d="${outlinePath({ coeffs: fam.a })}"/>` +
    ANCHORS.map(([lat, lon]) => `<path class="tissot" d="${indicatrixPath(lat, lon, fam.a)}"/>`).join('') +
    `</svg>`;
  const m = distortionMetrics(fam.a);
  const aspect = b.width / b.height;
  return (
    `<section class="panel${fam.ours ? ' ours' : ''}">` +
    `<h2>${fam.label}</h2>` +
    svg +
    `<div class="stats">` +
    `<span>rms <b>${m.rmsOmegaDeg.toFixed(1)}°</b></span>` +
    `<span>max <b>${m.maxOmegaDeg.toFixed(1)}°</b></span>` +
    `<span>aspect <b>${aspect.toFixed(3)}</b></span>` +
    `</div></section>`
  );
}).join('');

// --- metrics table ------------------------------------------------------------

const stats = FAMILIES.map((fam) => {
  const b = bounds(fam.a);
  const m = distortionMetrics(fam.a);
  return {
    fam,
    rms: m.rmsOmegaDeg,
    max: m.maxOmegaDeg,
    w0: omegaDeg(0, 0, fam.a),
    w45e: omegaDeg(45, 180, fam.a),
    w75c: omegaDeg(75, 0, fam.a),
    aspect: b.width / b.height,
  };
});
const pub = stats[0];
const blendF = (s) => s.rms / pub.rms + (0.75 * s.max) / pub.max;

const ROWS = [
  ['rms ω (°) lower better', (s) => s.rms.toFixed(2), (s) => s.rms, true],
  ['max ω (°) lower better', (s) => s.max.toFixed(2), (s) => s.max, true],
  ['ω at equator (°)', (s) => s.w0.toFixed(2), (s) => s.w0, true],
  ['ω at (45°, edge) (°)', (s) => s.w45e.toFixed(2), (s) => s.w45e, true],
  ['ω at (75°, center) (°)', (s) => s.w75c.toFixed(2), (s) => s.w75c, true],
  ['aspect ratio', (s) => s.aspect.toFixed(4), null, false],
  ['criterion f', (s) => blendF(s).toFixed(4), (s) => blendF(s), true],
];

const head =
  `<tr><th>metric</th>` +
  stats.map((s) => `<th class="${s.fam.ours ? 'ours' : ''}">${s.fam.label}</th>`).join('') +
  `</tr>`;

const body = ROWS.map(([label, fmtCell, better, mark]) => {
  const best = better ? Math.min(...stats.map(better)) : null;
  const cells = stats.map((s) => {
    const isBest = better && Math.abs(better(s) - best) < 1e-12;
    return `<td class="${isBest ? 'best' : ''}">${fmtCell(s)}</td>`;
  }).join('');
  return `<tr><td>${label}</td>${cells}</tr>`;
}).join('');

document.getElementById('metrics').innerHTML = `<thead>${head}</thead><tbody>${body}</tbody>`;
