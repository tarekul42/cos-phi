// Shape-distortion analysis for the projection family.
//
// Equal-area means every map made with these coefficients has h·k = 1 area-wise;
// what still varies is SHAPE, measured by Tissot's indicatrix:
// the image of a unit circle on the globe at each point. For our projection
// the differential in the local orthonormal frame (east, north) is
//
//     C = [[ h      ,  x_phi ],
//          [ 0      ,  y_phi ]]
//
// (east always maps horizontally — parallels are straight; north tilts away
// from vertical because x depends on phi too). The singular values a >= b of C
// are the indicatrix semi-axes (with a*b = 1 for equal-area maps), and the
// maximum angular distortion is
//
//     omega = 2 * asin( (a - b) / (a + b) ).
//
// omega depends on latitude AND longitude (via x_phi ∝ lambda), so metrics
// are computed on a (phi, lambda) grid weighted by cos(phi) — sphere area.

import {
  A as DEFAULT_A,
  SQRT3_OVER_2,
  thetaFromLat,
  TWO_OVER_SQRT3,
  yCurveDeriv,
} from "./projection.js";

const D2R = Math.PI / 180;

// Y''(theta) = 6 A2 t + 20 A5 t^3 + 42 A3 t^5 + 72 A4 t^7
export function yCurveSecond(theta, a = DEFAULT_A) {
  const t2 = theta * theta;
  const t4 = t2 * t2;
  const t5 = t4 * theta;
  const t7 = t5 * t2;
  return (
    6 * a.a2 * theta +
    20 * (a.a5 || 0) * t2 * theta +
    42 * a.a3 * t5 +
    72 * a.a4 * t7
  );
}

// Local frame differential: h (east scale), x_phi, y_phi (north vector).
export function partials(phi, lambda, a = DEFAULT_A) {
  const theta = thetaFromLat(phi);
  const cosPhi = Math.cos(phi);
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  const yp = yCurveDeriv(theta, a);
  const ypp = yCurveSecond(theta, a);
  const dTheta = (SQRT3_OVER_2 * cosPhi) / cosTheta; // dtheta/dphi

  const h = (TWO_OVER_SQRT3 * cosTheta) / (yp * cosPhi);
  const yPhi = yp * dTheta;
  const xPhi =
    ((TWO_OVER_SQRT3 * lambda * (-sinTheta * yp - cosTheta * ypp)) /
      (yp * yp)) *
    dTheta;
  return { h, xPhi, yPhi };
}

// Tissot indicatrix at a point: semi-axes + maximum angular distortion (radians).
export function indicatrix(phi, lambda, a = DEFAULT_A) {
  const { h, xPhi, yPhi } = partials(phi, lambda, a);
  // singular values of C = [[h, xPhi], [0, yPhi]] via eigenvalues of C^T C
  const p = h * h;
  const q = h * xPhi;
  const r = xPhi * xPhi + yPhi * yPhi;
  const disc = Math.sqrt((p - r) * (p - r) + 4 * q * q);
  const aMaj = Math.sqrt((p + r + disc) / 2);
  const bMin = Math.sqrt((p + r - disc) / 2);
  const omega = 2 * Math.asin(Math.min(1, (aMaj - bMin) / (aMaj + bMin)));
  return { h, yPhi, xPhi, aMaj, bMin, omegaRad: omega };
}

export function omegaDeg(phiDeg, lambdaDeg, a = DEFAULT_A) {
  return (
    (indicatrix(phiDeg * D2R, lambdaDeg * D2R, a).omegaRad * 180) / Math.PI
  );
}

// Area-weighted distortion metrics on a (phi, lambda) grid.
//   rmsOmegaDeg : sqrt(area-weighted mean of omega^2), |phi| <= maxLatDeg
//   maxOmegaDeg : worst omega on that grid
//   samples     : omega at key latitudes, at the central meridian (lambda=0)
//                 and at the map edge (lambda=180)
// Poles are excluded from the grid: every pole-line projection degenerates
// there (omega -> 180 deg), so including them would swamp any comparison.
export function distortionMetrics(
  a = DEFAULT_A,
  {
    maxLatDeg = 80,
    latStep = 5,
    lonStep = 5,
    sampleLats = [0, 30, 45, 60, 75, 80],
  } = {},
) {
  let sumW = 0;
  let sumW2 = 0;
  let maxOmega = 0;

  for (let lat = -maxLatDeg; lat <= maxLatDeg + 1e-9; lat += latStep) {
    const w = Math.cos(lat * D2R);
    for (let lon = 0; lon <= 180 + 1e-9; lon += lonStep) {
      const om = omegaDeg(lat, lon, a);
      sumW += w;
      sumW2 += w * om * om;
      if (om > maxOmega) maxOmega = om;
    }
  }

  const samples = sampleLats.map((lat) => ({
    lat,
    center: omegaDeg(lat, 0, a),
    edge: omegaDeg(lat, 180, a),
  }));

  return {
    rmsOmegaDeg: Math.sqrt(sumW2 / sumW),
    maxOmegaDeg: maxOmega,
    samples,
  };
}
