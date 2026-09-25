// TEMPORARY exploration: criteria x basis x mode. Deleted after the choice.
import { omegaDeg } from "../src/distortion.js";
import {
  bounds,
  PUBLISHED_A,
  THETA_MAX,
  TWO_OVER_SQRT3,
  yCurve,
  yCurveDeriv,
} from "../src/projection.js";

const TH = THETA_MAX;
const HEIGHT = yCurve(TH, PUBLISHED_A);
const PUB_ASPECT = bounds(PUBLISHED_A).width / bounds(PUBLISHED_A).height;
const A1_FIXED = (TWO_OVER_SQRT3 * Math.PI) / (PUB_ASPECT * HEIGHT);

// packing: basis '4' -> {a1,a2,a3} free, a4 slaved (powers 1,3,7,9)
//          basis '5' -> {a1,a2,a3,a5} free, a4 slaved (powers 1,3,5,7,9)
function coeffsFrom(p, mode, basis) {
  const a1 = mode === "fixed" ? A1_FIXED : p[0];
  const off = mode === "fixed" ? 0 : 1;
  const a2 = p[off];
  const a3 = p[off + 1];
  const a5 = basis === "5" ? p[off + 2] : 0;
  const a4 =
    (HEIGHT - a1 * TH - a2 * TH ** 3 - a5 * TH ** 5 - a3 * TH ** 7) / TH ** 9;
  return { a1, a2, a3, a4, a5 };
}

function minDeriv(a) {
  let m = Infinity;
  for (let i = -400; i <= 400; i++)
    m = Math.min(m, yCurveDeriv((i / 400) * TH, a));
  return m;
}

function evaluate(a, crit) {
  const maxLat = crit === "max70" ? 70 : 80;
  const vals = [];
  let sw = 0,
    sw1 = 0,
    sw2 = 0,
    mx = 0;
  for (let lat = -maxLat; lat <= maxLat + 1e-9; lat += 5) {
    const w = Math.cos((lat * Math.PI) / 180);
    for (let lon = 0; lon <= 180 + 1e-9; lon += 5) {
      const om = omegaDeg(lat, lon, a);
      vals.push(om);
      sw += w;
      sw1 += w * om;
      sw2 += w * om * om;
      if (om > mx) mx = om;
    }
  }
  const rms = Math.sqrt(sw2 / sw);
  const mean = sw1 / sw;
  let top = 0;
  if (crit === "top10") {
    vals.sort((x, y) => y - x);
    const k = Math.max(1, Math.round(vals.length * 0.1));
    top = vals.slice(0, k).reduce((s, v) => s + v, 0) / k;
  }
  return { rms, mean, mx, top };
}

function objective(p, mode, basis, crit) {
  const a = coeffsFrom(p, mode, basis);
  const md = minDeriv(a);
  if (!(md > 0)) return 1e6 + 1e6 * Math.max(0, -md);
  const e = evaluate(a, crit);
  if (crit === "rms80") return e.rms;
  if (crit === "mean80") return e.mean;
  if (crit === "max80" || crit === "max70") return e.mx;
  if (crit === "top10") return e.top;
  if (crit.startsWith("blend")) {
    const w = Number(crit.slice(5, 8)) / 100;
    let f = e.rms / BASE.rms + (w * e.mx) / BASE.mx;
    if (crit.endsWith("e"))
      f += 1e3 * Math.max(0, omegaDeg(0, 0, a) - PUBW.w0) ** 2;
    return f;
  }
  if (crit === "mmr") return e.mx + 1e3 * Math.max(0, e.rms - BASE.rms) ** 2; // min max s.t. rms<=base
  if (crit === "mmr2") return e.mx + 1e3 * Math.max(0, e.mean - BASE.mean) ** 2; // min max s.t. mean<=base
  if (crit === "crms" || crit === "crms3") {
    const w0 = omegaDeg(0, 0, a);
    const w45e = omegaDeg(45, 180, a);
    let f = e.rms;
    f += 1e3 * Math.max(0, e.mx - BASE.mx) ** 2;
    f += 1e3 * Math.max(0, w0 - PUBW.w0) ** 2;
    if (crit === "crms3") f += 1e3 * Math.max(0, w45e - PUBW.w45e) ** 2;
    return f;
  }
}

const BASE = evaluate(PUBLISHED_A, "rms80");
const PUBW = {
  w0: omegaDeg(0, 0, PUBLISHED_A),
  w45e: omegaDeg(45, 180, PUBLISHED_A),
};

function nelderMead(
  f,
  x0,
  scales,
  { maxIter = 2500, ftol = 1e-9, xtol = 1e-9 } = {},
) {
  const n = x0.length;
  let simplex = [x0.slice()];
  for (let i = 0; i < n; i++) {
    const p = x0.slice();
    p[i] += scales[i];
    simplex.push(p);
  }
  let fx = simplex.map((p) => f(p));
  for (let iter = 0; iter < maxIter; iter++) {
    const idx = fx.map((v, i) => i).sort((a, b) => fx[a] - fx[b]);
    simplex = idx.map((i) => simplex[i]);
    fx = idx.map((i) => fx[i]);
    if (Math.max(...fx) - Math.min(...fx) < ftol) break;
    let xsp = 0;
    for (let i = 1; i <= n; i++)
      for (let j = 0; j < n; j++)
        xsp = Math.max(xsp, Math.abs(simplex[i][j] - simplex[0][j]));
    if (xsp < xtol) break;
    const c = new Array(n).fill(0);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) c[j] += simplex[i][j] / n;
    const refl = c.map((v, j) => v + (v - simplex[n][j]));
    const fr = f(refl);
    if (fr < fx[0]) {
      const exp = c.map((v, j) => v + 2 * (v - simplex[n][j]));
      const fe = f(exp);
      if (fe < fr) {
        simplex[n] = exp;
        fx[n] = fe;
      } else {
        simplex[n] = refl;
        fx[n] = fr;
      }
    } else if (fr < fx[n - 1]) {
      simplex[n] = refl;
      fx[n] = fr;
    } else {
      const con = c.map((v, j) => v + 0.5 * (simplex[n][j] - v));
      const fc = f(con);
      if (fc < Math.min(fr, fx[n])) {
        simplex[n] = con;
        fx[n] = fc;
      } else
        for (let i = 1; i <= n; i++) {
          simplex[i] = simplex[i].map(
            (v, j) => simplex[0][j] + 0.5 * (v - simplex[0][j]),
          );
          fx[i] = f(simplex[i]);
        }
    }
  }
  let b = 0;
  for (let i = 1; i <= n; i++) if (fx[i] < fx[b]) b = i;
  return { x: simplex[b], f: fx[b] };
}

function fit(mode, basis, crit) {
  const seeds = [];
  if (mode === "free")
    seeds.push([PUBLISHED_A.a1, PUBLISHED_A.a2, PUBLISHED_A.a3, 0]);
  else seeds.push([PUBLISHED_A.a2, PUBLISHED_A.a3, 0]);
  seeds.push(mode === "free" ? [1.3, -0.07, 0.0006, 0] : [-0.07, 0.0006, 0]);
  seeds.push(
    mode === "free" ? [1.45, -0.12, 0.0018, 0.001] : [-0.12, 0.0018, 0.001],
  );
  const dims =
    mode === "free" ? 3 + (basis === "5" ? 1 : 0) : 2 + (basis === "5" ? 1 : 0);
  const used = seeds.map((s) => s.slice(0, dims));
  const scales = (
    mode === "free" ? [0.08, 0.03, 0.0008, 0.0005] : [0.03, 0.0008, 0.0005]
  ).slice(0, dims);
  let best = null;
  for (const s of used) {
    const r = nelderMead((p) => objective(p, mode, basis, crit), s, scales);
    if (!best || r.f < best.f) best = r;
  }
  return coeffsFrom(best.x, mode, basis);
}

function fullMetrics(a) {
  const e = evaluate(a, "rms80"); // computes all
  // samples
  const s = (lat, lon) => omegaDeg(lat, lon, a);
  return {
    ...e,
    aspect: bounds(a).width / bounds(a).height,
    minD: minDeriv(a),
    w0: s(0, 0),
    w45e: s(45, 180),
    w75c: s(75, 0),
    w75e: s(75, 180),
  };
}

const fmt = (m) =>
  `rms80=${m.rms.toFixed(2)} max80=${m.mx.toFixed(1)} mean80=${m.mean.toFixed(2)} w0=${m.w0.toFixed(1)} w45e=${m.w45e.toFixed(1)} w75c=${m.w75c.toFixed(1)} asp=${m.aspect.toFixed(3)}`;

console.log("BASELINE published :", fmt(fullMetrics(PUBLISHED_A)));

const crits = ["blend050", "blend050e", "blend075", "blend075e"];
for (const basis of ["4"]) {
  for (const mode of ["free", "fixed"]) {
    for (const crit of crits) {
      const t0 = Date.now();
      const a = fit(mode, basis, crit);
      const m = fullMetrics(a);
      console.log(
        `b${basis} ${mode.padEnd(5)} ${crit.padEnd(7)} ${fmt(m)}  [${Date.now() - t0}ms]`,
      );
    }
  }
}
