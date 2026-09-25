// Entry point: fetch country data, project everything, mount one SVG, wire
// Phase 6 interactions — hover area readouts, click-to-pin, Mercator ghost.

import { bounds, TWO_OVER_SQRT3 } from './projection.js';
import { featureToPath, graticulePaths, outlinePath } from './render.js';
import {
  featureMapCentroid,
  mercatorRing,
  planarCentroid,
  planarPolygonArea,
} from './area.js';
import { polygonsOf } from './geo.js';
import { countryStats } from './stats.js';

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const fmt = (v) => (Math.round(v * 1e4) / 1e4).toString();
const fmtInt = (v) => Math.round(v).toLocaleString('en-US');
const fmtFactor = (v) =>
  !isFinite(v) ? '∞' : v >= 10 ? v.toFixed(0) : v >= 2 ? v.toFixed(1) : v.toFixed(2);

const res = await fetch('data/world.geojson');
if (!res.ok) throw new Error(`failed to load map data: ${res.status}`);
const geojson = await res.json();
const features = geojson.features;
const nameOf = (f) => f.properties.ADMIN || f.properties.NAME || 'Unknown';
const stats = features.map((f) => countryStats(f, nameOf(f)));

// --- render ------------------------------------------------------------------

const b = bounds();
const svg = document.getElementById('map');
svg.setAttribute(
  'viewBox',
  `${fmt(-b.xMax)} ${fmt(-b.yMax)} ${fmt(b.width)} ${fmt(b.height)}`,
);

const graticule = graticulePaths()
  .map((d) => `<path class="graticule" d="${d}"/>`)
  .join('');

const countries = features
  .map((f, i) => {
    const d = featureToPath(f);
    return `<path class="country" data-i="${i}" data-name="${esc(nameOf(f))}" fill-rule="evenodd" d="${d}"/>`;
  })
  .join('');

const outline = `<path class="outline" d="${outlinePath()}"/>`;

svg.innerHTML = graticule + countries + outline + `<path class="ghost" id="ghost" d=""/>`;

const countryEls = [...svg.querySelectorAll('path.country')];
const ghostEl = document.getElementById('ghost');

// --- info card ---------------------------------------------------------------

const card = document.getElementById('card');
const cardName = document.getElementById('card-name');
const cardArea = document.getElementById('card-area');
const cardSub = document.getElementById('card-sub');
const cardMerc = document.getElementById('card-merc');
const cardHint = document.getElementById('card-hint');
const ghostToggle = document.getElementById('ghost-toggle');

let hovered = null;
let pinned = null;

function updateCard() {
  const idx = hovered ?? pinned;
  if (idx === null) {
    card.hidden = true;
    return;
  }
  const s = stats[idx];
  card.hidden = false;
  cardName.textContent = s.name;
  cardArea.textContent = `${fmtInt(s.areaKm2)} km²`;
  cardSub.textContent = `${s.worldPct.toFixed(2)}% of Earth's surface · true size on this map`;
  cardMerc.innerHTML = isFinite(s.mercFactor)
    ? `On Mercator, it would look <b>${fmtFactor(s.mercFactor)}×</b> bigger`
    : `On Mercator, its area would be <b>unbounded</b> (touches the pole)`;
  cardHint.textContent =
    pinned === null
      ? 'click to pin · Esc to clear'
      : idx === pinned
        ? 'pinned — click to unpin'
        : 'click to pin instead';
}

function updateClasses() {
  countryEls.forEach((el, i) => el.classList.toggle('pinned', i === pinned));
}

// --- Mercator ghost ----------------------------------------------------------
// Mercator at the same world width as this map (both stretched so the equator
// matches), translated so its centroid sits on the country's map centroid.

const K = TWO_OVER_SQRT3;
const ghostCache = new Map();

function buildGhost(idx) {
  if (ghostCache.has(idx)) return ghostCache.get(idx);
  const f = features[idx];
  const [cx, cy] = featureMapCentroid(f);

  const polys = [];
  let largest = null;
  let largestArea = 0;
  for (const rings of polygonsOf(f.geometry)) {
    const ext = mercatorRing(rings[0]).map(([x, y]) => [x * K, y * K]);
    const holes = rings
      .slice(1)
      .map((r) => mercatorRing(r).map(([x, y]) => [x * K, y * K]));
    polys.push({ ext, holes });
    const a = Math.abs(planarPolygonArea(ext));
    if (a > largestArea) {
      largestArea = a;
      largest = ext;
    }
  }
  const [gx, gy] = planarCentroid(largest || [[0, 0]]);
  const ox = cx - gx;
  const oy = cy - gy;

  let d = '';
  for (const poly of polys) {
    for (const ring of [poly.ext, ...poly.holes]) {
      for (let i = 0; i < ring.length; i++) {
        d += (i === 0 ? 'M' : 'L') + fmt(ring[i][0] + ox) + ' ' + fmt(-(ring[i][1] + oy));
      }
      d += 'Z';
    }
  }
  ghostCache.set(idx, d);
  return d;
}

function updateGhost() {
  const show = pinned !== null && ghostToggle.checked && isFinite(stats[pinned].mercFactor);
  ghostEl.setAttribute('d', show ? buildGhost(pinned) : '');
}

// --- state plumbing ----------------------------------------------------------

function syncUrl() {
  const u = new URL(location.href);
  if (pinned !== null) u.searchParams.set('pin', stats[pinned].name);
  else u.searchParams.delete('pin');
  history.replaceState(null, '', u);
}

function setPinned(idx) {
  pinned = idx;
  updateClasses();
  updateCard();
  updateGhost();
  syncUrl();
}

function findByName(q) {
  const s = q.trim().toLowerCase();
  if (!s) return null;
  let i = features.findIndex((f) => nameOf(f).toLowerCase() === s);
  if (i < 0) i = features.findIndex((f) => nameOf(f).toLowerCase().startsWith(s));
  if (i < 0) i = features.findIndex((f) => nameOf(f).toLowerCase().includes(s));
  return i >= 0 ? i : null;
}

// --- events ------------------------------------------------------------------

svg.addEventListener('mouseover', (e) => {
  const p = e.target.closest?.('path.country');
  if (p) {
    hovered = Number(p.dataset.i);
    updateCard();
  }
});

svg.addEventListener('mouseout', (e) => {
  if (e.target.closest?.('path.country')) {
    hovered = null;
    updateCard();
  }
});

svg.addEventListener('click', (e) => {
  const p = e.target.closest?.('path.country');
  const idx = p ? Number(p.dataset.i) : null;
  setPinned(idx === pinned ? null : idx);
});

ghostToggle.addEventListener('change', updateGhost);

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && pinned !== null) setPinned(null);
});

// deep link: ?pin=Greenland
const initial = findByName(new URLSearchParams(location.search).get('pin') || '');
if (initial !== null) setPinned(initial);
else updateCard();
