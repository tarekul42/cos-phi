import test from 'node:test';
import assert from 'node:assert/strict';

import { DEG, bounds } from '../src/projection.js';
import { planarPolygonArea } from '../src/area.js';
import { prepareTissot, smallCircleRing, tissotCenters } from '../src/tissot.js';

const R = 1; // unit sphere — angular distance == chordless arc length

function angularDistance(lat1Deg, lon1Deg, lat2Deg, lon2Deg) {
  const [x1, y1, z1] = [
    Math.cos(lat1Deg * DEG) * Math.cos(lon1Deg * DEG),
    Math.cos(lat1Deg * DEG) * Math.sin(lon1Deg * DEG),
    Math.sin(lat1Deg * DEG),
  ];
  const [x2, y2, z2] = [
    Math.cos(lat2Deg * DEG) * Math.cos(lon2Deg * DEG),
    Math.cos(lat2Deg * DEG) * Math.sin(lon2Deg * DEG),
    Math.sin(lat2Deg * DEG),
  ];
  const dot = x1 * x2 + y1 * y2 + z1 * z2;
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}

test('every ring vertex sits at exactly alpha from the center', () => {
  for (const [lat, lon, alpha] of [
    [0, 0, 5],
    [45, 30, 5],
    [-60, -120, 3],
    [75, 170, 5],
  ]) {
    const ring = smallCircleRing(lat, lon, alpha, 64);
    assert.equal(ring.length, 64);
    for (const [rlon, rlat] of ring) {
      const d = angularDistance(lat, lon, rlat, rlon);
      assert.ok(
        Math.abs(d - alpha * DEG) < 1e-12,
        `vertex (${rlat}, ${rlon}) is ${d / DEG}° from center (${lat}, ${lon}), expected ${alpha}°`,
      );
    }
  }
});

test('ring is open, finite, and near the antimeridian stays continuous', () => {
  const ring = smallCircleRing(10, 179, 5, 48);
  assert.equal(ring.length, 48);
  for (const [lon, lat] of ring) {
    assert.ok(isFinite(lon) && isFinite(lat));
    assert.ok(Math.abs(lon) <= 185, `lon ${lon} escaped the neighborhood`);
    assert.ok(Math.abs(lat) <= 90);
  }
  // consecutive steps must be small (no wrap-around spikes through the ring)
  for (let i = 0; i < ring.length; i++) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[(i + 1) % ring.length];
    assert.ok(Math.abs(lon2 - lon1) < 6, 'adjacent vertices jumped in lon');
    assert.ok(Math.abs(lat2 - lat1) < 6, 'adjacent vertices jumped in lat');
  }
});

test('grid is a regular lat/lon lattice capped away from the poles', () => {
  const centers = tissotCenters();
  assert.equal(centers.length, 11 * 24); // lats -75..75 step 15, lons -180..165
  for (const [lat, lon] of centers) {
    assert.ok(Math.abs(lat) <= 75);
    assert.ok(lat % 15 === 0 && lon % 15 === 0);
  }
});

test('Equal Earth keeps EVERY indicatrix area equal (the whole point)', () => {
  const b = bounds();
  const tis = prepareTissot({ yMax: b.yMax, alphaDeg: 5, n: 64 });
  const areas = [];
  for (let i = 0; i < tis.count; i++) {
    const pts = tis.ringPoints(i, 0);
    areas.push(Math.abs(planarPolygonArea(pts)));
  }
  const min = Math.min(...areas);
  const max = Math.max(...areas);
  // equal-area projection: identical globe circles -> identical map areas.
  // residual is polygon-approximation only; keep it honest and tight.
  assert.ok(
    max / min < 1.005,
    `area spread ${(max / min - 1) * 100}% (min ${min}, max ${max})`,
  );
});

test('Mercator end of the morph inflates the polar circles (the lie, measured)', () => {
  const b = bounds();
  const tis = prepareTissot({ yMax: b.yMax, alphaDeg: 5, n: 64 });
  const idxAt = (lat, lon) =>
    tis.centers.findIndex(([la, lo]) => la === lat && lo === lon);
  const areaAt = (i, t) => Math.abs(planarPolygonArea(tis.ringPoints(i, t)));
  const eq = idxAt(0, 0);
  const polar = idxAt(60, 0);
  const aEq = areaAt(eq, 1);
  const aPolar = areaAt(polar, 1);
  // Mercator local scale is sec^2(phi): at 60° that's 4x the equator area
  const ratio = aPolar / aEq;
  assert.ok(ratio > 3.4 && ratio < 4.6, `60°/0° area ratio ${ratio.toFixed(2)}, expected ~4`);
  // and at t=0 the same two are equal
  assert.ok(
    Math.abs(areaAt(polar, 0) / areaAt(eq, 0) - 1) < 0.005,
    'Equal Earth end must keep them equal',
  );
});

test('paths() emits one closed subpath per circle at the requested t', () => {
  const b = bounds();
  const tis = prepareTissot({ yMax: b.yMax, alphaDeg: 5, n: 16 });
  for (const t of [0, 0.5, 1]) {
    const d = tis.paths(t);
    const subpaths = d.split('M').length - 1;
    assert.equal(subpaths, tis.count);
    assert.equal((d.match(/Z/g) || []).length, tis.count);
    assert.ok(/^M-?[\d.]+ -?[\d.]+L/.test(d));
  }
});
