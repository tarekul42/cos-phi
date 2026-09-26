// Entry point: fetch country data, project everything, mount one SVG, wire
// Phase 6 interactions — hover area readouts, click-to-pin, Mercator ghost.

import { bounds, TWO_OVER_SQRT3 } from './projection.js';
import { featureToPath, graticulePaths, outlinePath } from './render.js';
import { prepareMorph } from './morph.js';
import { MAX_ZOOM, clampView, screenToMap, viewBoxOf, zoomView } from './view.js';
import {
  featureMapCentroid,
  mercatorRing,
  planarCentroid,
  planarPolygonArea,
} from './area.js';
import { polygonsOf } from './geo.js';
import { countryStats, sizeComparison } from './stats.js';

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

svg.innerHTML =
  graticule + countries + outline +
  `<path class="ghost" id="ghost" d=""/>` +
  `<path class="compare" id="compare-path" d=""/>`;

const countryEls = [...svg.querySelectorAll('path.country')];
const ghostEl = document.getElementById('ghost');
const comparePathEl = document.getElementById('compare-path');

// --- info card ---------------------------------------------------------------

const card = document.getElementById('card');
const cardName = document.getElementById('card-name');
const cardArea = document.getElementById('card-area');
const cardSub = document.getElementById('card-sub');
const cardMerc = document.getElementById('card-merc');
const cardHint = document.getElementById('card-hint');
const ghostToggle = document.getElementById('ghost-toggle');
const compareWrap = document.getElementById('card-compare');
const compareSel = document.getElementById('compare-select');
const compareRatio = document.getElementById('card-ratio');

let hovered = null;
let pinned = null;
let compare = null;

function updateCard() {
  const idx = hovered ?? pinned;
  if (idx === null) {
    card.hidden = true;
    return;
  }
  const s = stats[idx];
  card.hidden = false;
  // the compare controls describe the PINNED pair — hide them while previewing
  // a different (hovered) country
  compareWrap.hidden = pinned === null || idx !== pinned;
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

// --- two-country comparison --------------------------------------------------
// The other country is TRANSLATED (never scaled) so its outline sits on the
// pinned one at identical map scale — true relative size, honestly drawn.

// featureToPath emits "M x y L x y ... Z"; shift every coordinate pair.
function offsetPath(d, dx, dy) {
  return d.replace(/([ML])(-?[\d.]+) (-?[\d.]+)/g, (_, cmd, x, y) => {
    const nx = Math.round((Number(x) + dx) * 1e4) / 1e4;
    const ny = Math.round((Number(y) + dy) * 1e4) / 1e4;
    return cmd + (nx === 0 ? 0 : nx) + ' ' + (ny === 0 ? 0 : ny);
  });
}

function rebuildCompareOptions() {
  const items = features
    .map((f, i) => ({ i, name: nameOf(f) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  compareSel.innerHTML =
    `<option value="">overlay another country…</option>` +
    items
      .filter((o) => o.i !== pinned)
      .map((o) => `<option value="${o.i}">${esc(o.name)}</option>`)
      .join('');
  compareSel.value = compare !== null && compare !== pinned ? String(compare) : '';
}

function updateCompareOverlay() {
  if (pinned === null || compare === null || compare === pinned) {
    comparePathEl.setAttribute('d', '');
    compareRatio.textContent = '';
    return;
  }
  const [ax, ay] = featureMapCentroid(features[pinned]);
  const [bx, by] = featureMapCentroid(features[compare]);
  comparePathEl.setAttribute(
    'd',
    offsetPath(featureToPath(features[compare]), ax - bx, by - ay),
  );
  compareRatio.textContent = sizeComparison(stats[pinned], stats[compare]);
}

function updateCompareUI() {
  if (pinned !== null) rebuildCompareOptions();
  updateCompareOverlay();
}

// --- morph slider (Equal Earth <-> frame-fitted Mercator) --------------------
// Dragging lerps every vertex between the two endpoint projections. The
// ghost/compare overlays are fixed-projection, so they hide mid-morph.

const morphSlider = document.getElementById('morph');
const morphMetric = document.getElementById('morph-metric');
const morphBar = document.querySelector('.morphbar');
const morph = prepareMorph(features, { yMax: b.yMax });
const graticuleEls = [...svg.querySelectorAll('path.graticule')];
const outlineEl = svg.querySelector('path.outline');
const baseCountryPaths = countryEls.map((el) => el.getAttribute('d'));
const baseGraticulePaths = graticuleEls.map((el) => el.getAttribute('d'));
const baseOutlinePath = outlineEl.getAttribute('d');

function applyMorph(t) {
  if (t <= 0) {
    countryEls.forEach((el, i) => el.setAttribute('d', baseCountryPaths[i]));
    graticuleEls.forEach((el, i) => el.setAttribute('d', baseGraticulePaths[i]));
    outlineEl.setAttribute('d', baseOutlinePath);
  } else {
    countryEls.forEach((el, i) => el.setAttribute('d', morph.featurePath(i, t)));
    graticuleEls.forEach((el, i) => el.setAttribute('d', morph.graticulePath(i, t)));
    outlineEl.setAttribute('d', morph.outlinePath(t));
  }
  const on = t > 0.001;
  svg.classList.toggle('morphing', on);
  morphBar.classList.toggle('on', on);
  const m = on ? morph.metrics(t) : { median: 1, max: 1 };
  morphMetric.textContent =
    `area scale · median ×${fmtFactor(m.median)} · worst ×${fmtFactor(m.max)}`;
}

let morphRaf = 0;
let morphT = 0;
function queueMorph(t) {
  morphT = t;
  if (morphRaf) return;
  morphRaf = requestAnimationFrame(() => {
    morphRaf = 0;
    applyMorph(morphT);
  });
}

morphSlider.addEventListener('input', () => queueMorph(morphSlider.value / 100));
morphSlider.addEventListener('change', syncUrl);

// --- zoom & pan --------------------------------------------------------------
// Wheel zooms to the cursor, drag pans, double-click zooms; the viewBox
// always keeps the map's aspect so the frame never jumps. Strokes are
// non-scaling (CSS), so hairlines stay crisp at any zoom.

const aspect = b.width / b.height;
const world = { xMax: b.xMax, yMax: b.yMax, width: b.width };
let view = { cx: 0, cy: 0, w: b.width };
const zoomLevel = document.getElementById('zoom-level');
let zoomRaf = 0;
let urlTimer = 0;

function applyView() {
  svg.setAttribute('viewBox', viewBoxOf(view, aspect));
  const z = b.width / view.w;
  zoomLevel.textContent = `×${z >= 10 ? Math.round(z) : Math.round(z * 10) / 10}`;
}
applyView();

function scheduleUrlSync() {
  clearTimeout(urlTimer);
  urlTimer = setTimeout(syncUrl, 400);
}

function cancelZoomAnim() {
  if (zoomRaf) {
    cancelAnimationFrame(zoomRaf);
    zoomRaf = 0;
  }
}

function animateTo(to, dur = 170) {
  cancelZoomAnim();
  const from = { ...view };
  const t0 = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    const e = 1 - (1 - t) ** 3;
    view = {
      cx: from.cx + (to.cx - from.cx) * e,
      cy: from.cy + (to.cy - from.cy) * e,
      w: from.w + (to.w - from.w) * e,
    };
    applyView();
    if (t >= 1) {
      zoomRaf = 0;
      scheduleUrlSync();
    } else {
      zoomRaf = requestAnimationFrame(step);
    }
  };
  zoomRaf = requestAnimationFrame(step);
}

function zoomBy(factor) {
  animateTo(zoomView(view, view.cx, view.cy, factor, world, aspect));
}

document.getElementById('zoom-in').addEventListener('click', () => zoomBy(1.8));
document.getElementById('zoom-out').addEventListener('click', () => zoomBy(1 / 1.8));
document.getElementById('zoom-reset').addEventListener('click', () =>
  animateTo({ cx: 0, cy: 0, w: b.width }),
);

svg.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    cancelZoomAnim();
    const rect = svg.getBoundingClientRect();
    const [fx, fy] = screenToMap(e.clientX, e.clientY, rect, view, aspect);
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    const factor = Math.min(2, Math.max(0.5, Math.exp(-dy * 0.0016)));
    view = zoomView(view, fx, fy, factor, world, aspect);
    applyView();
    scheduleUrlSync();
  },
  { passive: false },
);

let dragging = false;
let dragMoved = 0;
let suppressClick = false;
let lastX = 0;
let lastY = 0;

svg.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  cancelZoomAnim();
  dragging = true;
  dragMoved = 0;
  lastX = e.clientX;
  lastY = e.clientY;
  svg.setPointerCapture(e.pointerId);
  svg.classList.add('panning');
});

svg.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const pdx = e.clientX - lastX;
  const pdy = e.clientY - lastY;
  dragMoved += Math.abs(pdx) + Math.abs(pdy);
  lastX = e.clientX;
  lastY = e.clientY;
  const rect = svg.getBoundingClientRect();
  const h = view.w / aspect;
  view = clampView(
    {
      cx: view.cx + (pdx * view.w) / rect.width,
      cy: view.cy + (pdy * h) / rect.height,
      w: view.w,
    },
    world,
    aspect,
  );
  applyView();
});

function endDrag() {
  if (!dragging) return;
  dragging = false;
  svg.classList.remove('panning');
  if (dragMoved > 4) suppressClick = true;
  scheduleUrlSync();
}
svg.addEventListener('pointerup', endDrag);
svg.addEventListener('pointercancel', endDrag);

svg.addEventListener('dblclick', (e) => {
  e.preventDefault();
  cancelZoomAnim();
  const rect = svg.getBoundingClientRect();
  const [fx, fy] = screenToMap(e.clientX, e.clientY, rect, view, aspect);
  view = zoomView(view, fx, fy, 2, world, aspect);
  applyView();
  scheduleUrlSync();
});

// --- state plumbing ----------------------------------------------------------

function syncUrl() {
  const u = new URL(location.href);
  if (pinned !== null) u.searchParams.set('pin', stats[pinned].name);
  else u.searchParams.delete('pin');
  if (pinned !== null && compare !== null && compare !== pinned) {
    u.searchParams.set('vs', stats[compare].name);
  } else {
    u.searchParams.delete('vs');
  }
  const morphPct = Number(morphSlider.value);
  if (morphPct > 0) u.searchParams.set('morph', String(morphPct / 100));
  else u.searchParams.delete('morph');
  const z = b.width / view.w;
  if (z > 1.001) {
    u.searchParams.set('z', z.toFixed(3));
    if (Math.abs(view.cx) > 1e-9) u.searchParams.set('cx', view.cx.toFixed(3));
    else u.searchParams.delete('cx');
    if (Math.abs(view.cy) > 1e-9) u.searchParams.set('cy', view.cy.toFixed(3));
    else u.searchParams.delete('cy');
  } else {
    u.searchParams.delete('z');
    u.searchParams.delete('cx');
    u.searchParams.delete('cy');
  }
  history.replaceState(null, '', u);
}

function setPinned(idx) {
  pinned = idx;
  if (idx === null) {
    compare = null;
    compareSel.value = '';
  }
  updateClasses();
  updateCard();
  updateGhost();
  updateCompareUI();
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
  if (dragging) return;
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
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  const p = e.target.closest?.('path.country');
  const idx = p ? Number(p.dataset.i) : null;
  setPinned(idx === pinned ? null : idx);
});

ghostToggle.addEventListener('change', updateGhost);

compareSel.addEventListener('change', () => {
  compare = compareSel.value === '' ? null : Number(compareSel.value);
  updateCompareOverlay();
  syncUrl();
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && pinned !== null) setPinned(null);
});

// deep links: ?pin=Greenland&vs=Russia, ?morph=0.5, ?z=8&cx=1.2&cy=-0.4
const query = new URLSearchParams(location.search);
const zInit = parseFloat(query.get('z'));
if (Number.isFinite(zInit) && zInit >= 1) {
  const cx = parseFloat(query.get('cx'));
  const cy = parseFloat(query.get('cy'));
  view = clampView(
    {
      cx: Number.isFinite(cx) ? cx : 0,
      cy: Number.isFinite(cy) ? cy : 0,
      w: b.width / Math.min(zInit, MAX_ZOOM),
    },
    world,
    aspect,
  );
  applyView();
}
const morphInit = parseFloat(query.get('morph'));
if (Number.isFinite(morphInit)) {
  const pct = morphInit > 1 ? Math.round(morphInit) : Math.round(morphInit * 100);
  morphSlider.value = String(Math.max(0, Math.min(100, pct)));
  applyMorph(Number(morphSlider.value) / 100);
}
const initial = findByName(query.get('pin') || '');
const vsInit = findByName(query.get('vs') || '');
if (initial !== null) {
  setPinned(initial);
  if (vsInit !== null && vsInit !== initial) {
    compare = vsInit;
    rebuildCompareOptions();
    updateCompareOverlay();
    syncUrl();
  }
} else {
  updateCard();
}
