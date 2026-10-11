import test from 'node:test';
import assert from 'node:assert/strict';

import { DEG, project } from '../src/projection.js';
import {
  MERCATOR_LAT_MAX,
  WINKEL_PHI1,
  areaScaleSpread,
  mercatorProjection,
  robinsonProjection,
  winkelTripelProjection,
} from '../src/contrast-projections.js';

test('Mercator: known values and the pole clamp', () => {
  const p45 = mercatorProjection(0, 45);
  assert.ok(Math.abs(p45.y - Math.log(Math.tan(Math.PI / 4 + Math.PI / 8))) < 1e-12);
  const p90lon = mercatorProjection(90, 0);
  assert.ok(Math.abs(p90lon.x - Math.PI / 2) < 1e-12);
  assert.ok(Math.abs(p90lon.y) < 1e-12);
  // the clip makes the poles finite: y(+-90) = y(+-clip) = +-pi
  const pole = mercatorProjection(0, 90);
  assert.ok(Math.abs(Math.abs(pole.y) - Math.PI) < 1e-4);
  const beyond = mercatorProjection(0, 89);
  assert.equal(beyond.y, mercatorProjection(0, MERCATOR_LAT_MAX).y);
});

test('Robinson: table endpoints, linear interpolation, straight equator', () => {
  assert.deepEqual(robinsonProjection(0, 0), { x: 0, y: 0 });
  const pole = robinsonProjection(0, 90);
  assert.ok(Math.abs(pole.x) < 1e-12);
  assert.ok(Math.abs(pole.y - 1.3523) < 1e-12);
  const eq180 = robinsonProjection(180, 0);
  assert.ok(Math.abs(eq180.x - 0.8487 * Math.PI) < 1e-12);
  assert.ok(Math.abs(eq180.y) < 1e-12);
  // midpoint between 0 and 5 deg rows is the mean of the two entries
  const mid = robinsonProjection(0, 2.5);
  assert.ok(Math.abs(mid.y - 1.3523 * (0 + 0.062) / 2) < 1e-12);
  // south hemisphere mirrors
  const s = robinsonProjection(0, -45);
  const n = robinsonProjection(0, 45);
  assert.ok(Math.abs(s.y + n.y) < 1e-12);
  // equator: x linear in lon
  const a = robinsonProjection(30, 0);
  const b = robinsonProjection(60, 0);
  assert.ok(Math.abs(b.x - 2 * a.x) < 1e-12);
});

test('Winkel tripel: origin, closed form at 180, undistorted central meridian', () => {
  assert.deepEqual(winkelTripelProjection(0, 0), { x: 0, y: 0 });
  // (lat=0, lon=180): x = (2 + pi)/2 in closed form, y = 0
  const e = winkelTripelProjection(180, 0);
  assert.ok(Math.abs(e.x - (2 + Math.PI) / 2) < 1e-12, `x ${e.x}`);
  assert.ok(Math.abs(e.y) < 1e-12);
  // central meridian is undistorted: y = phi (the Aitoff mean cancels)
  for (const lat of [10, 45, 70, -60]) {
    const p = winkelTripelProjection(0, lat);
    assert.ok(Math.abs(p.x) < 1e-12);
    assert.ok(Math.abs(p.y - lat * DEG) < 1e-12, `y ${p.y} at ${lat}`);
  }
  // equator is straight and x is linear in lon: x = (1 + 2/pi)/2 * lam
  const k = (1 + 2 / Math.PI) / 2;
  for (const lon of [45, 90, 180]) {
    const p = winkelTripelProjection(lon, 0);
    assert.ok(Math.abs(p.x - k * lon * DEG) < 1e-12, `x ${p.x} at ${lon}`);
  }
  // Winkel's chosen standard parallel
  assert.ok(Math.abs(Math.cos(WINKEL_PHI1) - 2 / Math.PI) < 1e-12);
  // symmetry
  const ne = winkelTripelProjection(80, 40);
  const sw = winkelTripelProjection(-80, -40);
  assert.ok(Math.abs(ne.x + sw.x) < 1e-12);
  assert.ok(Math.abs(ne.y + sw.y) < 1e-12);
});

// Relative area scale of projected Tissot circles vs the equator's — the
// gallery's punchline metric, imported from the same module the page shows.

test('Equal Earth holds every circle area equal through the projector', () => {
  const ee = (lon, lat) => project(lat * DEG, lon * DEG);
  const { min, max } = areaScaleSpread(ee);
  assert.ok(max / min < 1.005, `spread ${max / min}`);
  assert.ok(Math.abs(max - 1) < 0.01 && Math.abs(min - 1) < 0.01);
});

test('Mercator inflates by sec^2; Robinson and Winkel sit in between', () => {
  const m = areaScaleSpread(mercatorProjection);
  const r = areaScaleSpread(robinsonProjection);
  const w = areaScaleSpread(winkelTripelProjection);
  // Mercator at 75 deg: sec^2(75) = 14.93; the 5-deg circle spans 70..80 so
  // the measured max is slightly lower but must be enormous.
  assert.ok(m.max > 10 && m.max < 20, `mercator max ${m.max}`);
  assert.ok(Math.abs(m.min - 1) < 0.01);
  // nobody in this gallery is equal-area except Equal Earth
  assert.ok(r.max > 1.2 && w.max > 1.1, `r ${r.max} w ${w.max}`);
  // and the compromises are FAR gentler than Mercator
  assert.ok(r.max < 4 && w.max < 4, `r ${r.max} w ${w.max}`);
  console.log(`  area spread — Winkel ${w.max.toFixed(3)}, Robinson ${r.max.toFixed(3)}, Mercator ${m.max.toFixed(3)}`);
});
