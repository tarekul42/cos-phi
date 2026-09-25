import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  project,
  projectDeg,
  yCurve,
  yCurveDeriv,
  thetaFromLat,
  bounds,
  A,
  THETA_MAX,
} from '../src/projection.js';

// The mathematical heart of the project: the Jacobian of the transformation
// must equal cos(phi) everywhere. That IS the statement "area is preserved".
test('Jacobian equals cos(phi) everywhere (equal-area proof)', () => {
  const h = 1e-5;
  let worst = 0;
  let worstAt = null;

  for (let latDeg = -85; latDeg <= 85; latDeg += 5) {
    for (let lonDeg = -180; lonDeg <= 180; lonDeg += 15) {
      const phi = latDeg * Math.PI / 180;
      const lambda = lonDeg * Math.PI / 180;

      const dxdL = (project(phi, lambda + h).x - project(phi, lambda - h).x) / (2 * h);
      const dxdP = (project(phi + h, lambda).x - project(phi - h, lambda).x) / (2 * h);
      const dydL = (project(phi, lambda + h).y - project(phi, lambda - h).y) / (2 * h);
      const dydP = (project(phi + h, lambda).y - project(phi - h, lambda).y) / (2 * h);

      const det = dxdL * dydP - dxdP * dydL;
      const relErr = Math.abs(det / Math.cos(phi) - 1);
      if (relErr > worst) {
        worst = relErr;
        worstAt = { latDeg, lonDeg };
      }
    }
  }
  assert.ok(worst < 1e-7, `worst relative Jacobian error ${worst} at ${JSON.stringify(worstAt)}`);
});

test('pole width is 0.59247 times equator width', () => {
  const b = bounds();
  assert.ok(
    Math.abs(b.poleWidthRatio - 0.59247) < 1e-4,
    `got ${b.poleWidthRatio}`
  );
});

test('aspect ratio is close to 2:1', () => {
  const b = bounds();
  const aspect = b.width / b.height;
  assert.ok(aspect > 2.0 && aspect < 2.1, `aspect ${aspect}`);
});

// Oracle values from PROJ docs (+proj=eqearth +R=1: "122 47 -> 1.55 0.89").
// Used only to validate our independent implementation — never in shipped code.
test('matches PROJ reference point (122, 47) -> (1.55, 0.89)', () => {
  const { x, y } = projectDeg(47, 122);
  assert.ok(Math.abs(x - 1.55) < 0.005, `x = ${x}`);
  assert.ok(Math.abs(y - 0.89) < 0.005, `y = ${y}`);
});

test('y is odd in latitude, x is even in latitude', () => {
  for (const latDeg of [10, 30, 47, 66, 89]) {
    const north = projectDeg(latDeg, 77);
    const south = projectDeg(-latDeg, 77);
    assert.ok(Math.abs(north.y + south.y) < 1e-15, `lat ${latDeg}`);
    assert.ok(Math.abs(north.x - south.x) < 1e-15, `lat ${latDeg}`);
  }
});

test('x is linear in longitude', () => {
  const a = projectDeg(40, 30);
  const b = projectDeg(40, 60);
  assert.ok(Math.abs(b.x - 2 * a.x) < 1e-14);
});

test('y-curve is strictly increasing (Y\' > 0 on [-pi/3, pi/3])', () => {
  for (let i = -60; i <= 60; i++) {
    const t = (i / 60) * THETA_MAX;
    assert.ok(yCurveDeriv(t) > 0, `Y' <= 0 at theta = ${t}`);
  }
  // odd symmetry of Y
  assert.ok(Math.abs(yCurve(0.5) + yCurve(-0.5)) < 1e-16);
});

test('poles and equator land where expected', () => {
  const north = projectDeg(90, 0);
  const south = projectDeg(-90, 0);
  const equator = projectDeg(0, 0);

  assert.ok(Math.abs(equator.x) < 1e-16 && Math.abs(equator.y) < 1e-16);
  assert.ok(Math.abs(north.y + south.y) < 1e-15);
  assert.ok(Math.abs(north.y - bounds().yMax) < 1e-14);
  assert.ok(north.x === south.x, 'poles map to a line, same x for both hemispheres');
});

test('thetaFromLat reaches exactly pi/3 at the poles', () => {
  assert.ok(Math.abs(thetaFromLat(Math.PI / 2) - THETA_MAX) < 1e-15);
  assert.ok(Math.abs(thetaFromLat(0)) < 1e-16);
});

test('coefficients are the published Equal-Earth values', () => {
  assert.deepEqual(A, { a1: 1.340264, a2: -0.081106, a3: 0.000893, a4: 0.003796 });
});
