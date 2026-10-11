// Pure math for the 3D orthographic globe — no DOM, no fetch, unit-tested.
//
// View frame: viewer looks at the sub-point (rot.lon, rot.lat) from outside.
//   X = cosφ·sin(λ−λ₀)                       (east → screen right)
//   Y = sinφ·cosφ₁ − cosφ·sinφ₁·cos(λ−λ₀)    (north → screen up)
//   Z = sinφ·sinφ₁ + cosφ·cosφ₁·cos(λ−λ₀)    (toward viewer; visible iff ≥ 0)
// Screen: sx = cx + R·X, sy = cy − R·Y.

const D2R = Math.PI / 180;

// [x, y, z] in the view frame for a lon/lat vertex under rotation rot.
export function rotateVertex(lonDeg, latDeg, rot) {
  const lam = (lonDeg - rot.lon) * D2R;
  const phi = latDeg * D2R;
  const t = rot.lat * D2R;
  const c = Math.cos(phi);
  return [
    c * Math.sin(lam),
    Math.sin(phi) * Math.cos(t) - c * Math.sin(t) * Math.cos(lam),
    Math.sin(phi) * Math.sin(t) + c * Math.cos(t) * Math.cos(lam),
  ];
}

// View-frame [x, y, z] -> canvas pixels. view = {cx, cy, R}.
export function toScreen(v, view) {
  return [view.cx + view.R * v[0], view.cy - view.R * v[1]];
}

// Clip a view-frame polyline to the visible hemisphere (z >= 0).
// Closed rings wrap last->first; open polylines (graticule) don't.
// Returns an array of fragments; every emitted vertex has z >= -1e-12.
export function clipFragmentsView(pts, closed = true) {
  const n = pts.length;
  if (n === 0) return [];
  const edges = closed ? n : n - 1;
  const frags = [];
  let cur = null;
  const cross = (a, b) => {
    const t = a[2] / (a[2] - b[2]);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0];
  };
  for (let i = 0; i < edges; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const fa = a[2] >= 0;
    const fb = b[2] >= 0;
    if (fa && fb) {
      if (!cur) cur = [];
      cur.push(a);
    } else if (fa && !fb) {
      if (!cur) cur = [];
      cur.push(a, cross(a, b));
      frags.push(cur);
      cur = null;
    } else if (!fa && fb) {
      cur = [cross(a, b)];
    }
  }
  if (cur) frags.push(cur);
  return frags;
}
