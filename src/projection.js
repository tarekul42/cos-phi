// Equal-Earth projection — derived and implemented from scratch.
//
// Equal-area condition: det d(x,y)/d(lambda, phi) = cos(phi) on the unit sphere.
// For the pseudocylindrical family y = Y(theta), x = (2/sqrt3) * lambda * cos(theta) / Y'(theta),
// the condition integrates to sin(theta) = (sqrt3/2) * sin(phi).
// Equal-area holds for ANY y-curve Y; the coefficients below only tune shape distortion.
// Full derivation: docs/MATH.md

export const A = Object.freeze({
  a1: 1.340264,
  a2: -0.081106,
  a3: 0.000893,
  a4: 0.003796,
});

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

// --- y-curve Y(theta) and its derivative Y'(theta) --------------------------
// Y  = t * (a1 + t^2 * (a2 + t^4 * (a3 + a4 * t^2)))
// Y' = a1 + t^2 * (3a2 + t^4 * (7a3 + 9a4 * t^2))

export function yCurve(theta) {
  const t2 = theta * theta;
  const t4 = t2 * t2;
  return theta * (A.a1 + t2 * (A.a2 + t4 * (A.a3 + A.a4 * t2)));
}

export function yCurveDeriv(theta) {
  const t2 = theta * theta;
  const t4 = t2 * t2;
  return A.a1 + t2 * (3 * A.a2 + t4 * (7 * A.a3 + 9 * A.a4 * t2));
}

// --- projection (radians, unit sphere) --------------------------------------

export function project(phi, lambda) {
  const theta = thetaFromLat(phi);
  const x = (TWO_OVER_SQRT3 * lambda * Math.cos(theta)) / yCurveDeriv(theta);
  const y = yCurve(theta);
  return { x, y };
}

// Solve Y(theta) = y for theta on [-pi/3, pi/3].
// Y is strictly monotonic (Y' > 0 there), so the root is unique.
// Newton from a linear seed converges in a few iterations; bisection is the
// guaranteed fallback (keeps the solver honest without a published series).
export function thetaFromY(y) {
  const yMax = yCurve(THETA_MAX);
  if (y >= yMax) return THETA_MAX; // exact pole: avoids asin precision loss
  if (y <= -yMax) return -THETA_MAX;
  const yc = y;

  let lo = -THETA_MAX;
  let hi = THETA_MAX;
  let theta = yc / A.a1; // linear seed: Y(t) ~ a1 * t

  for (let i = 0; i < 64; i++) {
    const f = yCurve(theta) - yc;
    if (Math.abs(f) < 1e-15) break;
    if (f > 0) hi = theta;
    else lo = theta;

    const deriv = yCurveDeriv(theta);
    let next = theta - f / deriv;
    if (!Number.isFinite(next) || next <= lo || next >= hi) {
      next = 0.5 * (lo + hi); // bisection fallback
    }
    theta = next;
  }
  return theta;
}

export function unproject(x, y) {
  const theta = thetaFromY(y);
  const phi = latFromTheta(theta);
  const lambda = (x * yCurveDeriv(theta) * SQRT3_OVER_2) / Math.cos(theta);
  return { phi, lambda };
}

// --- degree wrappers (public API) -------------------------------------------

export function projectDeg(latDeg, lonDeg) {
  return project(latDeg * DEG, lonDeg * DEG);
}

export function unprojectDeg(x, y) {
  const { phi, lambda } = unproject(x, y);
  return { latDeg: phi * RAD_TO_DEG, lonDeg: lambda * RAD_TO_DEG };
}

// --- map geometry (unit-sphere radii; renderer fits this to the viewport) ----

export function bounds() {
  const yMax = yCurve(THETA_MAX);
  const xEquator = (TWO_OVER_SQRT3 * Math.PI) / yCurveDeriv(0);
  const xPole =
    (TWO_OVER_SQRT3 * Math.PI * Math.cos(THETA_MAX)) / yCurveDeriv(THETA_MAX);
  return Object.freeze({
    xMax: xEquator,
    yMax,
    width: 2 * xEquator,
    height: 2 * yMax,
    poleWidthRatio: xPole / xEquator,
  });
}
