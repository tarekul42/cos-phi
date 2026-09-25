// Equal-Earth projection — derived and implemented from scratch.
//
// Equal-area condition: det d(x,y)/d(lambda, phi) = cos(phi) on the unit sphere.
// For the pseudocylindrical family y = Y(theta), x = (2/sqrt3) * lambda * cos(theta) / Y'(theta),
// the condition integrates to sin(theta) = (sqrt3/2) * sin(phi).
// Equal-area holds for ANY y-curve Y; coefficients only tune shape distortion.
// Full derivation: docs/MATH.md
//
// Every coefficient-taking function accepts an optional coefficients object so
// multiple members of the family (published vs ours) can coexist — see
// PUBLISHED_A / OURS_A / OURS_FIXED_ASPECT_A below and compare.html.

export const PUBLISHED_A = Object.freeze({
  a1: 1.340264,
  a2: -0.081106,
  a3: 0.000893,
  a4: 0.003796,
});

// Our fitted coefficients (Phase 5). Criterion:
//   f = rms80/rms80(published) + 0.75 * max80/max80(published)  (minimized)
// area-weighted Tissot omega on an 8x10 deg grid, |phi| <= 80.
// Reproduce: node scripts/fit-coefficients.js (deterministic).
// Free aspect: rms 34.24 -> 35.10, max 109.5 -> 104.5, polar band 80.1 -> 72.6.
// Fixed aspect: rms 35.20, max 104.1, equator 17.01 (= published), aspect pinned.
export const OURS_A = Object.freeze({
  a1: 1.3440365098928302,
  a2: -0.13554437090573337,
  a3: 0.06896035588530772,
  a4: -0.019603145827565904,
});

export const OURS_FIXED_ASPECT_A = Object.freeze({
  a1: 1.340264,
  a2: -0.13232157748328888,
  a3: 0.06885816808416619,
  a4: -0.019345170473751602,
});

// The default remains the published Equal-Earth constants (that is the named
// projection this project reimplements). OURS_* are added by scripts/fit.
export const A = PUBLISHED_A;

export const SQRT3_OVER_2 = Math.sqrt(3) / 2; // 0.8660254037844386
export const TWO_OVER_SQRT3 = 2 / Math.sqrt(3); // 1.1547005383792515

export const THETA_MAX = Math.PI / 3; // theta at the poles
export const DEG = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;

// --- auxiliary latitude -----------------------------------------------------

export function thetaFromLat(phi) {
  return Math.asin(SQRT3_OVER_2 * Math.sin(phi));
}

export function latFromTheta(theta) {
  const s = TWO_OVER_SQRT3 * Math.sin(theta);
  return Math.asin(Math.min(1, Math.max(-1, s)));
}

// --- y-curve Y(theta) and its derivatives -----------------------------------
// Y  = a1 t + a2 t^3 + a5 t^5 + a3 t^7 + a4 t^9
//   (a5 optional — the published set has no t^5 term; absent means 0)
// Y' = a1 + 3a2 t^2 + 5a5 t^4 + 7a3 t^6 + 9a4 t^8

export function yCurve(theta, a = A) {
  const t2 = theta * theta;
  const a5 = a.a5 || 0;
  return theta * (a.a1 + t2 * (a.a2 + t2 * (a5 + t2 * (a.a3 + a.a4 * t2))));
}

export function yCurveDeriv(theta, a = A) {
  const t2 = theta * theta;
  const a5 = a.a5 || 0;
  return (
    a.a1 + t2 * (3 * a.a2 + t2 * (5 * a5 + t2 * (7 * a.a3 + 9 * a.a4 * t2)))
  );
}

// --- projection (radians, unit sphere) --------------------------------------

export function project(phi, lambda, a = A) {
  const theta = thetaFromLat(phi);
  const x = (TWO_OVER_SQRT3 * lambda * Math.cos(theta)) / yCurveDeriv(theta, a);
  const y = yCurve(theta, a);
  return { x, y };
}

// Solve Y(theta) = y for theta on [-pi/3, pi/3].
// Y is strictly monotonic (Y' > 0 there), so the root is unique.
// Newton from a linear seed converges in a few iterations; bisection is the
// guaranteed fallback (keeps the solver honest without a published series).
export function thetaFromY(y, a = A) {
  const yMax = yCurve(THETA_MAX, a);
  if (y >= yMax) return THETA_MAX; // exact pole: avoids asin precision loss
  if (y <= -yMax) return -THETA_MAX;
  const yc = y;

  let lo = -THETA_MAX;
  let hi = THETA_MAX;
  let theta = yc / a.a1; // linear seed: Y(t) ~ a1 * t

  for (let i = 0; i < 64; i++) {
    const f = yCurve(theta, a) - yc;
    if (Math.abs(f) < 1e-15) break;
    if (f > 0) hi = theta;
    else lo = theta;

    const deriv = yCurveDeriv(theta, a);
    let next = theta - f / deriv;
    if (!Number.isFinite(next) || next <= lo || next >= hi) {
      next = 0.5 * (lo + hi); // bisection fallback
    }
    theta = next;
  }
  return theta;
}

export function unproject(x, y, a = A) {
  const theta = thetaFromY(y, a);
  const phi = latFromTheta(theta);
  const lambda = (x * yCurveDeriv(theta, a) * SQRT3_OVER_2) / Math.cos(theta);
  return { phi, lambda };
}

// --- degree wrappers (public API) -------------------------------------------

export function projectDeg(latDeg, lonDeg, a = A) {
  return project(latDeg * DEG, lonDeg * DEG, a);
}

export function unprojectDeg(x, y, a = A) {
  const { phi, lambda } = unproject(x, y, a);
  return { latDeg: phi * RAD_TO_DEG, lonDeg: lambda * RAD_TO_DEG };
}

// --- map geometry (unit-sphere radii; renderer fits this to the viewport) ----

export function bounds(a = A) {
  const yMax = yCurve(THETA_MAX, a);
  const xEquator = (TWO_OVER_SQRT3 * Math.PI) / yCurveDeriv(0, a);
  const xPole =
    (TWO_OVER_SQRT3 * Math.PI * Math.cos(THETA_MAX)) /
    yCurveDeriv(THETA_MAX, a);
  return Object.freeze({
    xMax: xEquator,
    yMax,
    width: 2 * xEquator,
    height: 2 * yMax,
    poleWidthRatio: xPole / xEquator,
  });
}
