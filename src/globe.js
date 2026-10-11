// 3D orthographic Earth on <canvas>: our own rotation math, zero dependencies.
// Same GeoJSON + same stats() numbers as the flat map; the globe is the
// ground truth the Equal-Earth projection claims to preserve.
//
// View frame: viewer looks at the sub-point (rot.lon, rot.lat) from outside.
//   X = cosφ·sin(λ−λ₀)                       (east → screen right)
//   Y = sinφ·cosφ₁ − cosφ·sinφ₁·cos(λ−λ₀)    (north → screen up)
//   Z = sinφ·sinφ₁ + cosφ·cosφ₁·cos(λ−λ₀)    (toward viewer; visible iff ≥ 0)
// Screen: sx = cx + R·X, sy = cy − R·Y.

import { densifyRing } from './area.js';
import { polygonsOf } from './geo.js';
import { countryStats } from './stats.js';
import { clipFragmentsView, rotateVertex, toScreen } from './globe-math.js';

// Densify every ring once at load (rotation-independent); per frame we only
// rotate + clip + draw.
export function prepareGlobe(features) {
  return features.map((f) => {
    const polys = [];
    for (const rings of polygonsOf(f.geometry)) {
      polys.push(rings.map((r) => densifyRing(r, 1)));
    }
    return polys;
  });
}

// Project one densified ring to screen fragments + depth stats.
function projectRing(ringDeg, rot, view) {
  const v3 = ringDeg.map(([lo, la]) => rotateVertex(lo, la, rot));
  let maxZ = -Infinity;
  let sumZ = 0;
  for (const p of v3) {
    if (p[2] > maxZ) maxZ = p[2];
    sumZ += p[2];
  }
  if (maxZ < -0.02) return { frags: [], avgZ: -1 };
  const frags = clipFragmentsView(v3, true).map((f) =>
    f.map((p) => toScreen(p, view)),
  );
  return { frags, avgZ: sumZ / v3.length };
}

function tracePath(ctx, frags) {
  for (const f of frags) {
    if (f.length === 0) continue;
    ctx.moveTo(f[0][0], f[0][1]);
    for (let i = 1; i < f.length; i++) ctx.lineTo(f[i][0], f[i][1]);
    ctx.closePath();
  }
}

function pointInFrag(px, py, frag) {
  let inside = false;
  for (let i = 0, j = frag.length - 1; i < frag.length; j = i++) {
    const [xi, yi] = frag[i];
    const [xj, yj] = frag[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// --- graticule (same 30° lattice as the flat map) -----------------------------

function graticulePolylines() {
  const lines = [];
  for (let lat = -60; lat <= 60; lat += 30) {
    const pts = [];
    for (let lon = -180; lon <= 180; lon += 4) pts.push([lon, lat]);
    lines.push(pts);
  }
  for (let lon = -180; lon < 180; lon += 30) {
    const pts = [];
    for (let lat = -90; lat <= 90; lat += 2) pts.push([lon, lat]);
    lines.push(pts);
  }
  return lines;
}

// --- boot ---------------------------------------------------------------------

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const fmtInt = (v) => Math.round(v).toLocaleString('en-US');
const fmtFactor = (v) =>
  !isFinite(v) ? '∞' : v >= 10 ? v.toFixed(0) : v >= 2 ? v.toFixed(1) : v.toFixed(2);

const res = await fetch('data/world.geojson');
if (!res.ok) throw new Error(`failed to load map data: ${res.status}`);
const geojson = await res.json();
const features = geojson.features;
const nameOf = (f) => f.properties.ADMIN || f.properties.NAME || 'Unknown';
const stats = features.map((f) => countryStats(f, nameOf(f)));
const prepared = prepareGlobe(features);
const gratLines = graticulePolylines();

const canvas = document.getElementById('globe');
const ctx = canvas.getContext('2d');
const wrap = document.getElementById('globewrap');
const card = document.getElementById('gcard');
const cardName = document.getElementById('gcard-name');
const cardArea = document.getElementById('gcard-area');
const cardSub = document.getElementById('gcard-sub');
const cardMerc = document.getElementById('gcard-merc');
const cardHint = document.getElementById('gcard-hint');
const spinToggle = document.getElementById('spin-toggle');

const DEFAULT_ROT = { lon: 10, lat: 25 };
let rot = { ...DEFAULT_ROT };
let view = { cx: 0, cy: 0, R: 100 };
let hovered = null;
let pinned = null;
let dirty = true;
// screen-space fragments of the last frame, for hit-testing: [{i, frags, avgZ}]
let drawn = [];

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = wrap.clientWidth;
  const h = Math.min(Math.round(w), Math.round(window.innerHeight * 0.72));
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  view = { cx: w / 2, cy: h / 2, R: 0.44 * Math.min(w, h) };
  dirty = true;
}

function drawFrame() {
  const { cx, cy, R } = view;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // ocean disc + limb
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, 2 * Math.PI);
  ctx.fillStyle = '#0b1a2e';
  ctx.fill();

  // graticule under the countries
  ctx.strokeStyle = 'rgba(255,255,255,0.09)';
  ctx.lineWidth = 1;
  for (const line of gratLines) {
    const v3 = line.map(([lo, la]) => rotateVertex(lo, la, rot));
    for (const frag of clipFragmentsView(v3, false)) {
      ctx.beginPath();
      const [sx, sy] = toScreen(frag[0], view);
      ctx.moveTo(sx, sy);
      for (let i = 1; i < frag.length; i++) {
        const [px, py] = toScreen(frag[i], view);
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }

  // countries, far side first
  const order = [];
  drawn = [];
  for (let i = 0; i < features.length; i++) {
    const polys = [];
    let depth = -Infinity;
    let first = true;
    for (const rings of prepared[i]) {
      const ext = projectRing(rings[0], rot, view);
      if (ext.frags.length === 0) continue;
      const holes = [];
      for (let k = 1; k < rings.length; k++) {
        const h = projectRing(rings[k], rot, view);
        if (h.frags.length) holes.push(h.frags);
      }
      polys.push({ ext: ext.frags, holes });
      if (first) {
        depth = ext.avgZ;
        first = false;
      }
    }
    if (polys.length === 0) continue;
    order.push({ i, polys, depth });
    drawn.push({ i, polys, depth });
  }
  order.sort((a, b) => a.depth - b.depth);
  drawn.sort((a, b) => b.depth - a.depth); // front first for hit-testing
  for (const { i, polys } of order) {
    const isPinned = i === pinned;
    const isHovered = i === hovered && hovered !== pinned;
    ctx.beginPath();
    for (const p of polys) {
      tracePath(ctx, p.ext);
      for (const h of p.holes) tracePath(ctx, h);
    }
    ctx.fillStyle = isPinned ? '#ffb703' : isHovered ? '#ffd166' : '#8fbf9f';
    ctx.fill('evenodd');
    ctx.strokeStyle = isPinned ? '#ffffff' : '#10233c';
    ctx.lineWidth = isPinned ? 2 : 1;
    ctx.stroke();
  }

  // limb on top
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  dirty = false;
}

// --- card (floats near the cursor) --------------------------------------------

function placeCard(x, y, w, h) {
  const pad = 10;
  const wrapW = wrap.clientWidth;
  const wrapH = wrap.clientHeight;
  card.style.left = `${Math.max(pad, Math.min(x + 16, wrapW - w - pad))}px`;
  card.style.top = `${Math.max(pad, Math.min(y + 18, wrapH - h - pad))}px`;
}

let cardKey = '';
let cardW = 0;
let cardH = 0;
function updateCard(idx, x, y) {
  if (idx === null) {
    card.hidden = true;
    cardKey = '';
    return;
  }
  const s = stats[idx];
  card.hidden = false;
  const key = `${idx}:${pinned === null ? '' : pinned}`;
  if (key !== cardKey) {
    cardKey = key;
    cardName.textContent = s.name;
    cardArea.textContent = `${fmtInt(s.areaKm2)} km²`;
    cardSub.textContent = `${s.worldPct.toFixed(2)}% of Earth's surface · true size`;
    cardMerc.innerHTML = isFinite(s.mercFactor)
      ? `On Mercator, it would look <b>${fmtFactor(s.mercFactor)}×</b> bigger`
      : `On Mercator, its area would be <b>unbounded</b> (touches the pole)`;
    cardHint.textContent =
      pinned === null
        ? 'click to pin · Esc to clear'
        : idx === pinned
          ? 'pinned — click to unpin'
          : 'click to pin instead';
    cardW = card.offsetWidth;
    cardH = card.offsetHeight;
  }
  if (x !== undefined) placeCard(x, y, cardW, cardH);
}

function hitCountry(px, py) {
  for (const { i, polys } of drawn) {
    for (const p of polys) {
      let inside = false;
      for (const frag of p.ext) {
        if (frag.length > 2 && pointInFrag(px, py, frag)) inside = !inside;
      }
      if (!inside) continue;
      let inHole = false;
      for (const h of p.holes) {
        for (const frag of h) {
          if (frag.length > 2 && pointInFrag(px, py, frag)) inHole = !inHole;
        }
      }
      if (!inHole) return i;
    }
  }
  return null;
}

// --- rotation loop ------------------------------------------------------------

let raf = 0;
let lastT = 0;
function loop(t) {
  raf = requestAnimationFrame(loop);
  if (spinToggle.checked) {
    const dt = Math.min(0.1, (t - lastT) / 1000 || 0);
    rot.lon = (rot.lon + 6 * dt) % 360;
    if (rot.lon > 180) rot.lon -= 360;
    dirty = true;
  }
  lastT = t;
  if (dirty) drawFrame();
}

// --- events -------------------------------------------------------------------

let dragging = false;
let lastX = 0;
let lastY = 0;
let downX = 0;
let downY = 0;

function canvasPos(e) {
  const r = canvas.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  downX = e.clientX;
  downY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('grabbing');
  if (spinToggle.checked) spinToggle.checked = false; // drag pauses auto-rotate
});

canvas.addEventListener('pointermove', (e) => {
  const [px, py] = canvasPos(e);
  if (dragging) {
    const k = 180 / Math.min(canvas.clientWidth, canvas.clientHeight);
    rot.lon -= (e.clientX - lastX) * k;
    if (rot.lon > 180) rot.lon -= 360;
    if (rot.lon < -180) rot.lon += 360;
    rot.lat = Math.max(-85, Math.min(85, rot.lat + (e.clientY - lastY) * k));
    lastX = e.clientX;
    lastY = e.clientY;
    dirty = true;
    return;
  }
  const idx = hitCountry(px, py);
  if (idx !== hovered) {
    hovered = idx;
    dirty = true;
  }
  updateCard(idx ?? pinned, e.clientX - canvas.getBoundingClientRect().left, py);
});

function endDrag() {
  if (!dragging) return;
  dragging = false;
  canvas.classList.remove('grabbing');
}
canvas.addEventListener('pointerup', (e) => {
  const wasDragging = dragging;
  endDrag();
  if (!wasDragging) return;
  // a click (no real movement) pins; a drag does not
  if (Math.abs(e.clientX - downX) < 4 && Math.abs(e.clientY - downY) < 4) {
    const [px, py] = canvasPos(e);
    const idx = hitCountry(px, py);
    setPinned(idx === pinned ? null : idx, px, py);
  }
});
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('pointerleave', () => {
  if (!dragging) {
    hovered = null;
    updateCard(pinned);
    dirty = true;
  }
});

function setPinned(idx, x, y) {
  pinned = idx;
  if (x === undefined && idx !== null) {
    // no cursor (deep link): anchor to the country's screen centroid if
    // visible, else the panel corner
    const entry = drawn.find((d) => d.i === idx);
    const frag = entry?.polys[0]?.ext[0];
    if (frag && frag.length) {
      let sx = 0;
      let sy = 0;
      for (const p of frag) {
        sx += p[0];
        sy += p[1];
      }
      x = sx / frag.length;
      y = sy / frag.length;
    } else {
      x = 14;
      y = 14;
    }
  }
  updateCard(idx, x, y);
  syncUrl();
  dirty = true;
}

function syncUrl() {
  const u = new URL(location.href);
  if (pinned !== null) u.searchParams.set('pin', stats[pinned].name);
  else u.searchParams.delete('pin');
  history.replaceState(null, '', u);
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && pinned !== null) setPinned(null);
});

document.getElementById('spin-toggle').addEventListener('change', () => {
  dirty = true;
});
document.getElementById('reset-view').addEventListener('click', () => {
  rot = { ...DEFAULT_ROT };
  dirty = true;
});

function findByName(q) {
  const s = q.trim().toLowerCase();
  if (!s) return null;
  let i = features.findIndex((f) => nameOf(f).toLowerCase() === s);
  if (i < 0) i = features.findIndex((f) => nameOf(f).toLowerCase().startsWith(s));
  if (i < 0) i = features.findIndex((f) => nameOf(f).toLowerCase().includes(s));
  return i >= 0 ? i : null;
}

// --- init ---------------------------------------------------------------------

resize();
window.addEventListener('resize', resize);
// init-only rotation (?rot=lon,lat) for testing/sharing a view; never synced
const query = new URLSearchParams(location.search);
const rotParam = (query.get('rot') || '').split(',');
if (rotParam.length === 2) {
  const lo = parseFloat(rotParam[0]);
  const la = parseFloat(rotParam[1]);
  if (Number.isFinite(lo) && Number.isFinite(la)) {
    rot = {
      lon: ((((lo + 180) % 360) + 360) % 360) - 180,
      lat: Math.max(-85, Math.min(85, la)),
    };
  }
}
const initial = findByName(query.get('pin') || '');
if (initial !== null) pinned = initial;
drawFrame();
if (initial !== null) setPinned(initial);
else updateCard(null);
raf = requestAnimationFrame(loop);
