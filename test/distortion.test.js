// Phase 5: distortion analysis and our own fitted coefficients.
//
// Equal-area must hold for every member of the family (published and ours);
// our coefficients must be monotonic, share the pinned height, and beat the
// published map on the stated fit criterion (worst-case omega down, polar
// band down, overall rms within 3%, equator not degraded).

import assert from "node:assert/strict";
import test from "node:test";

import { distortionMetrics, omegaDeg, partials } from "../src/distortion.js";
import {
  A,
  bounds,
  DEG,
  OURS_A,
  OURS_FIXED_ASPECT_A,
  project,
  PUBLISHED_A,
  THETA_MAX,
  unproject,
  yCurve,
  yCurveDeriv,
} from "../src/projection.js";

const FAMILIES = [
  ["published", PUBLISHED_A],
  ["ours-free", OURS_A],
  ["ours-fixed", OURS_FIXED_ASPECT_A],
];

const SAMPLE_LATS = [-80, -60, -45, -30, -15, 0, 15, 30, 45, 60, 80];
const SAMPLE_LONS = [0, 45, 90, 135, 180];

test("equal-area: det(d(x,y)/d(lambda,phi)) = cos(phi) for every family member", () => {
  const eps = 1e-6;
  for (const [, a] of FAMILIES) {
    for (const latDeg of SAMPLE_LATS) {
      for (const lonDeg of SAMPLE_LONS) {
        const phi = latDeg * DEG;
        const lam = lonDeg * DEG;
        const xp = project(phi, lam + eps, a).x;
        const xm = project(phi, lam - eps, a).x;
        const xpp = project(phi + eps, lam, a).x;
        const xpm = project(phi - eps, lam, a).x;
        const yp = project(phi, lam + eps, a).y;
        const ym = project(phi, lam - eps, a).y;
        const ypp = project(phi + eps, lam, a).y;
        const ypm = project(phi - eps, lam, a).y;
        const det =
          ((xp - xm) / (2 * eps)) * ((ypp - ypm) / (2 * eps)) -
          ((xpp - xpm) / (2 * eps)) * ((yp - ym) / (2 * eps));
        assert.ok(
          Math.abs(det - Math.cos(phi)) < 1e-8,
          `Jacobian at lat=${latDeg} lon=${lonDeg}: ${det} vs ${Math.cos(phi)}`,
        );
      }
    }
  }
});

test("equal-area: det of the local frame differential h*yPhi = 1", () => {
  for (const [, a] of FAMILIES) {
    for (const latDeg of SAMPLE_LATS) {
      for (const lonDeg of SAMPLE_LONS) {
        const { h, yPhi } = partials(latDeg * DEG, lonDeg * DEG, a);
        assert.ok(
          Math.abs(h * yPhi - 1) < 1e-12,
          `h*yPhi at lat=${latDeg} lon=${lonDeg}: ${h * yPhi}`,
        );
      }
    }
  }
});

test("monotonic: Y'(theta) > 0 on [-pi/3, pi/3] for every family member", () => {
  for (const [, a] of FAMILIES) {
    for (let i = -600; i <= 600; i++) {
      const theta = (i / 600) * THETA_MAX;
      assert.ok(
        yCurveDeriv(theta, a) > 0,
        `Y'(${theta}) = ${yCurveDeriv(theta, a)}`,
      );
    }
  }
});

test("height pinned: ours share the published map height Y(pi/3)", () => {
  const h0 = yCurve(THETA_MAX, PUBLISHED_A);
  for (const [, a] of FAMILIES) {
    assert.ok(Math.abs(yCurve(THETA_MAX, a) - h0) < 1e-12);
  }
  // the default (A) is the published set
  assert.equal(A, PUBLISHED_A);
  assert.deepEqual(PUBLISHED_A, {
    a1: 1.340264,
    a2: -0.081106,
    a3: 0.000893,
    a4: 0.003796,
  });
});

test("criterion: ours reduce worst-case omega and the polar band", () => {
  const pub = distortionMetrics(PUBLISHED_A);
  for (const [name, a] of FAMILIES.slice(1)) {
    const m = distortionMetrics(a);
    assert.ok(
      m.maxOmegaDeg < pub.maxOmegaDeg - 3,
      `${name}: max ${m.maxOmegaDeg} should beat published ${pub.maxOmegaDeg} by >3 deg`,
    );
    const w75 = omegaDeg(75, 0, a);
    const pubW75 = omegaDeg(75, 0, PUBLISHED_A);
    assert.ok(w75 < pubW75 - 3, `${name}: polar band ${w75} vs ${pubW75}`);
    assert.ok(
      m.rmsOmegaDeg < pub.rmsOmegaDeg * 1.03,
      `${name}: rms ${m.rmsOmegaDeg} within 3% of published ${pub.rmsOmegaDeg}`,
    );
  }
});

test("criterion: equator not degraded, aspects as expected", () => {
  const pubW0 = omegaDeg(0, 0, PUBLISHED_A);
  const pubAspect = bounds(PUBLISHED_A).width / bounds(PUBLISHED_A).height;

  assert.ok(omegaDeg(0, 0, OURS_A) <= pubW0 + 0.5);
  assert.ok(omegaDeg(0, 0, OURS_FIXED_ASPECT_A) <= pubW0 + 0.5);

  const freeAspect = bounds(OURS_A).width / bounds(OURS_A).height;
  const fixedAspect =
    bounds(OURS_FIXED_ASPECT_A).width / bounds(OURS_FIXED_ASPECT_A).height;
  assert.ok(freeAspect > 1.9 && freeAspect < 2.2, `free aspect ${freeAspect}`);
  assert.ok(
    Math.abs(fixedAspect - pubAspect) < 1e-9,
    `fixed aspect ${fixedAspect} vs ${pubAspect}`,
  );
});

test("inverse roundtrip with our coefficients", () => {
  for (const lat of [-73.5, -45, -0.5, 0, 12.3, 48.9, 82]) {
    for (const lon of [-179.9, -60, 0, 60, 179.9]) {
      const { x, y } = project(lat * DEG, lon * DEG, OURS_A);
      const back = unproject(x, y, OURS_A);
      assert.ok(
        Math.abs(back.phi * (180 / Math.PI) - lat) < 1e-9,
        `lat ${lat}`,
      );
      assert.ok(
        Math.abs(back.lambda * (180 / Math.PI) - lon) < 1e-9,
        `lon ${lon}`,
      );
    }
  }
});
