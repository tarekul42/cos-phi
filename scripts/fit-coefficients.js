// Fit our own y-curve coefficients for the projection family.
//
// Equal-area holds for ANY coefficients, so this optimizes shape only.
//
// Criterion: normalized blend of overall and worst-case Tissot omega
//
//     f = rms80 / rms80(published)  +  0.75 * max80 / max80(published)
//
// where rms80/max80 are area-weighted RMS and maximum angular distortion on a
// (phi, lambda) grid, |phi| <= 80 (poles excluded: omega -> 180 deg there for
// every pole-line projection). The two terms are normalized by the published
// map's own values, so f < 2 beats the published coefficients; the 0.75 weight
// is the knee of the trade-off frontier explored in Phase 5 — pushing max
// harder wrecks rms, relaxing it buys nothing.
//
// Two variants:
//   free  : A1, A2, A3 free (aspect ratio follows A1), A4 slaved to height
//   fixed : A1 pinned to reproduce the published aspect, A2, A3 free, A4 slaved
//
// Height Y(pi/3) is pinned to the published value so all maps share a scale;
// Y' > 0 is enforced (hard penalty) so the projection stays one-to-one.
//
// Run: node scripts/fit-coefficients.js   (deterministic — fixed seed)

import {
  PUBLISHED_A,
  yCurve,
  yCurveDeriv,
  bounds,
  THETA_MAX,
  TWO_OVER_SQRT3,
} from '../src/projection.js';
import { distortionMetrics, omegaDeg } from '../src/distortion.js';

const TH = THETA_MAX;
const HEIGHT = yCurve(TH, PUBLISHED_A);
const PUB_ASPECT = bounds(PUBLISHED_A).width / bounds(PUBLISHED_A).height;
// A1 that reproduces the published aspect at the pinned height
const A1_FIXED = (TWO_OVER_SQRT3 * Math.PI) / (PUB_ASPECT * HEIGHT);

const COARSE = { latStep: 8, lonStep: 10 };
const W_MAX = 0.75; // weight of the worst-case term

// --- parameter packing -------------------------------------------------------

function coeffsFrom(p, mode) {
  const a1 = mode === 'free' ? p[0] : A1_FIXED;
  const a2 = p[mode === 'free' ? 1 : 0];
  const a3 = p[mode === 'free' ? 2 : 1];
  const a4 = (HEIGHT - a1 * TH - a2 * TH ** 3 - a3 * TH ** 7) / TH ** 9;
  return { a1, a2, a3, a4 };
}

function minDeriv(a) {
  let m = Infinity;
  for (let i = -400; i <= 400; i++) {
    m = Math.min(m, yCurveDeriv((i / 400) * TH, a));
  }
  return m;
}

const BASE_COARSE = distortionMetrics(PUBLISHED_A, COARSE);

function objective(p, mode) {
  const a = coeffsFrom(p, mode);
  const md = minDeriv(a);
  if (!(md > 0)) return 1e6 + 1e6 * Math.max(0, -md); // monotonicity penalty
  const m = distortionMetrics(a, COARSE);
  return m.rmsOmegaDeg / BASE_COARSE.rmsOmegaDeg
    + (W_MAX * m.maxOmegaDeg) / BASE_COARSE.maxOmegaDeg;
}

// --- hand-written Nelder-Mead ------------------------------------------------

function nelderMead(f, x0, scales, { maxIter = 3000, ftol = 1e-12, xtol = 1e-10 } = {}) {
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

    const spread = Math.max(...fx) - Math.min(...fx);
    if (spread < ftol) break;
    let xSpread = 0;
    for (let i = 1; i <= n; i++) {
      for (let j = 0; j < n; j++) xSpread = Math.max(xSpread, Math.abs(simplex[i][j] - simplex[0][j]));
    }
    if (xSpread < xtol) break;

    const centroid = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) centroid[j] += simplex[i][j] / n;

    const reflect = centroid.map((c, j) => c + 1 * (c - simplex[n][j]));
    const fr = f(reflect);

    if (fr < fx[0]) {
      const expand = centroid.map((c, j) => c + 2 * (c - simplex[n][j]));
      const fe = f(expand);
      if (fe < fr) { simplex[n] = expand; fx[n] = fe; }
      else { simplex[n] = reflect; fx[n] = fr; }
    } else if (fr < fx[n - 1]) {
      simplex[n] = reflect; fx[n] = fr;
    } else {
      const contract = centroid.map((c, j) => c + 0.5 * (simplex[n][j] - c));
      const fc = f(contract);
      if (fc < Math.min(fr, fx[n])) { simplex[n] = contract; fx[n] = fc; }
      else {
        for (let i = 1; i <= n; i++) {
          simplex[i] = simplex[i].map((v, j) => simplex[0][j] + 0.5 * (v - simplex[0][j]));
          fx[i] = f(simplex[i]);
        }
      }
    }
  }
  let best = 0;
  for (let i = 1; i <= n; i++) if (fx[i] < fx[best]) best = i;
  return { x: simplex[best], f: fx[best] };
}

// deterministic pseudo-random (LCG) for extra restarts
function makeRng(seed = 42) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

// --- fit ---------------------------------------------------------------------

function fit(mode) {
  const seeds =
    mode === 'free'
      ? [
          [PUBLISHED_A.a1, PUBLISHED_A.a2, PUBLISHED_A.a3],
          [1.30, -0.07, 0.0006],
          [1.40, -0.11, 0.0016],
          [1.20, -0.05, 0.0004],
          [1.50, -0.14, 0.0022],
        ]
      : [
          [PUBLISHED_A.a2, PUBLISHED_A.a3],
          [-0.07, 0.0006],
          [-0.11, 0.0016],
          [-0.05, 0.0003],
        ];
  const scales = mode === 'free' ? [0.08, 0.03, 0.0008] : [0.03, 0.0008];
  const rng = makeRng(mode === 'free' ? 42 : 43);
  const nDim = seeds[0].length;
  for (let r = 0; r < 5; r++) {
    seeds.push(
      Array.from({ length: nDim }, (_, j) =>
        seeds[0][j] * (1 + (rng() - 0.5) * 0.4)
      )
    );
  }

  let best = null;
  for (const s of seeds) {
    const res = nelderMead((p) => objective(p, mode), s, scales);
    if (!best || res.f < best.f) best = res;
  }
  return { coeffs: coeffsFrom(best.x, mode), f: best.f };
}

// --- reporting ---------------------------------------------------------------

function stats(a) {
  const m = distortionMetrics(a);
  const b = bounds(a);
  return {
    rms: m.rmsOmegaDeg,
    max: m.maxOmegaDeg,
    w0: omegaDeg(0, 0, a),
    w45e: omegaDeg(45, 180, a),
    w75c: omegaDeg(75, 0, a),
    aspect: b.width / b.height,
    minD: minDeriv(a),
  };
}

const fmtS = (s) =>
  `rms80=${s.rms.toFixed(3)}  max80=${s.max.toFixed(2)}  w(equator)=${s.w0.toFixed(2)}` +
  `  w(45,edge)=${s.w45e.toFixed(2)}  w(75,center)=${s.w75c.toFixed(2)}` +
  `  aspect=${s.aspect.toFixed(4)}  min Y'=${s.minD.toFixed(6)}`;

function report(label, a) {
  const s = stats(a);
  console.log(`\n${label}`);
  console.log(`  ${fmtS(s)}`);
  return s;
}

console.log(`criterion: f = rms/rms_pub + ${W_MAX} * max/max_pub  (grid 8x10 deg, |lat|<=80)`);
console.log(`pinned height Y(pi/3) = ${HEIGHT.toFixed(9)}, published aspect = ${PUB_ASPECT.toFixed(6)}, A1(fixed) = ${A1_FIXED.toFixed(9)}`);

const pub = report('PUBLISHED (baseline)', PUBLISHED_A);
const free = fit('free');
report('OURS — free aspect', free.coeffs);
const fixed = fit('fixed');
report('OURS — published aspect', fixed.coeffs);

const blendF = (s) => s.rms / pub.rms + (W_MAX * s.max) / pub.max;

const cmp = (label, s) =>
  console.log(
    `  ${label.padEnd(6)}: rms ${pub.rms.toFixed(3)} -> ${s.rms.toFixed(3)}` +
      `   max ${pub.max.toFixed(2)} -> ${s.max.toFixed(2)}` +
      `   w0 ${pub.w0.toFixed(2)} -> ${s.w0.toFixed(2)}` +
      `   f ${blendF(s).toFixed(4)} (pub ${blendF(pub).toFixed(4)})`
  );

console.log('\nvs published:');
cmp('free', stats(free.coeffs));
cmp('fixed', stats(fixed.coeffs));

console.log('\ncode constants (paste into src/projection.js):');
console.log(`OURS_A: ${JSON.stringify(free.coeffs)}`);
console.log(`OURS_FIXED_ASPECT_A: ${JSON.stringify(fixed.coeffs)}`);
