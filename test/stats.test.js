// Phase 6: info-card statistics — true areas, Mercator inflation, centroids.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  mercatorProject,
  ringTouchesPole,
  planarCentroid,
  featureMapCentroid,
  featureMercatorFactor,
  featureSphericalArea,
  srToKm2,
} from '../src/area.js';
import { countryStats, sizeComparison } from '../src/stats.js';
import { bounds } from '../src/projection.js';
import { polygonsOf } from '../src/geo.js';

const allRings = (f) => polygonsOf(f.geometry).flat();

const gj = JSON.parse(
  fs.readFileSync(new URL('../data/world.geojson', import.meta.url), 'utf8'),
);

const byName = new Map(
  gj.features.map((f) => [f.properties.ADMIN || f.properties.NAME, f]),
);

test('mercator: projection of the origin and of 45N', () => {
  const [x0, y0] = mercatorProject(0, 0);
  assert.ok(Math.abs(x0) < 1e-15 && Math.abs(y0) < 1e-15);
  const [, y45] = mercatorProject(0, 45);
  assert.ok(Math.abs(y45 - Math.log(Math.tan(Math.PI / 4 + Math.PI / 8))) < 1e-12);
  const [x10] = mercatorProject(10, 0);
  assert.ok(Math.abs(x10 - (10 * Math.PI) / 180) < 1e-15);
});

test('pole detection', () => {
  assert.ok(allRings(byName.get('Antarctica')).some((ring) => ringTouchesPole(ring)));
  assert.ok(!allRings(byName.get('Greenland')).some((ring) => ringTouchesPole(ring)));
});

test('mercator: equatorial country is barely inflated', () => {
  const f = featureMercatorFactor(byName.get('Gabon'));
  assert.ok(f > 0.95 && f < 1.3, `Gabon factor ${f}`);
});

test('mercator: high-latitude country is strongly inflated', () => {
  const greenland = featureMercatorFactor(byName.get('Greenland'));
  assert.ok(greenland > 4, `Greenland factor ${greenland}`);
  const gabon = featureMercatorFactor(byName.get('Gabon'));
  assert.ok(greenland > gabon * 3, 'Greenland far exceeds Gabon');
  const russia = featureMercatorFactor(byName.get('Russia'));
  assert.ok(russia > 1.5, `Russia factor ${russia}`);
});

test('mercator: pole-touching feature is unbounded', () => {
  assert.equal(featureMercatorFactor(byName.get('Antarctica')), Infinity);
});

test('countryStats: true area, world share, consistent with area math', () => {
  const f = byName.get('Gabon');
  const s = countryStats(f, 'Gabon');
  assert.ok(Math.abs(s.areaKm2 - srToKm2(featureSphericalArea(f))) < 1e-6);
  const knownKm2 = 257670; // published area of Gabon
  assert.ok(
    Math.abs(s.areaKm2 - knownKm2) / knownKm2 < 0.15,
    `Gabon ${s.areaKm2} vs ${knownKm2}`,
  );
  assert.ok(s.worldPct > 0.04 && s.worldPct < 0.07, `share ${s.worldPct}`);
  assert.equal(s.name, 'Gabon');
});

test('countryStats: all land sums to roughly Earth land fraction', () => {
  let pct = 0;
  for (const f of gj.features) pct += countryStats(f, '').worldPct;
  assert.ok(pct > 25 && pct < 33, `land share ${pct}%`);
});

test('planarCentroid: unit square and a translated square', () => {
  const sq = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const [cx, cy] = planarCentroid(sq);
  assert.ok(Math.abs(cx - 0.5) < 1e-12 && Math.abs(cy - 0.5) < 1e-12);
  const [dx, dy] = planarCentroid(sq.map(([x, y]) => [x + 10, y - 3]));
  assert.ok(Math.abs(dx - 10.5) < 1e-12 && Math.abs(dy + 2.5) < 1e-12);
});

test('sizeComparison: larger first, honest ratio, symmetric', () => {
  const g = countryStats(byName.get('Greenland'), 'Greenland');
  const r = countryStats(byName.get('Russia'), 'Russia');
  const line = sizeComparison(g, r);
  assert.match(line, /^Russia is [0-9.]+× the size of Greenland$/);
  const mult = r.areaKm2 / g.areaKm2;
  assert.ok(mult > 6 && mult < 10, `Russia/Greenland ${mult}`);
  assert.equal(line, sizeComparison(r, g), 'same line either order');
});

test('sizeComparison: near-equal areas say so', () => {
  const line = sizeComparison(
    { name: 'A', areaKm2: 100 },
    { name: 'B', areaKm2: 102 },
  );
  assert.equal(line, 'A and B are about the same size');
});

test('featureMapCentroid: finite and inside the map bounds for every country', () => {
  const b = bounds();
  for (const f of gj.features) {
    const [x, y] = featureMapCentroid(f);
    assert.ok(Number.isFinite(x) && Number.isFinite(y));
    assert.ok(Math.abs(y) <= b.yMax + 1e-9, `y ${y}`);
    assert.ok(Math.abs(x) <= b.xMax + 1e-9, `x ${x}`);
  }
});
