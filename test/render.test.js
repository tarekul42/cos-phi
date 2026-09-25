import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { ringToPath, featureToPath, graticulePaths, outlinePath } from '../src/render.js';
import { bounds } from '../src/projection.js';

const gj = JSON.parse(
  fs.readFileSync(new URL('../data/world.geojson', import.meta.url), 'utf8')
);

const NUM = /-?\d+(\.\d+)?([eE][+-]?\d+)?/g;

function coordsOf(path) {
  return (path.match(NUM) ?? []).map(Number);
}

test('ringToPath emits a well-formed closed subpath', () => {
  const d = ringToPath([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]);
  assert.match(d, /^M-?\d/);
  assert.match(d, /Z$/);
  const nums = coordsOf(d);
  assert.ok(nums.every(Number.isFinite));
  assert.ok(nums.length >= 4 * 2);
});

test('no country path contains NaN or Infinity', () => {
  for (const f of gj.features) {
    const d = featureToPath(f);
    assert.ok(d.length > 0, f.properties.ADMIN);
    assert.ok(!/NaN|Infinity/.test(d), f.properties.ADMIN);
  }
});

test('every projected coordinate stays inside the map bounds', () => {
  const b = bounds();
  const margin = 0.05; // antimeridian-unwrapped rings may poke out slightly
  for (const f of gj.features) {
    const nums = coordsOf(featureToPath(f));
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    assert.ok(minX >= -b.xMax - margin && maxX <= b.xMax + margin,
      `${f.properties.ADMIN}: x in [${minX}, ${maxX}]`);
    assert.ok(minY >= -b.yMax - margin && maxY <= b.yMax + margin,
      `${f.properties.ADMIN}: y in [${minY}, ${maxY}]`);
  }
});

test('graticule: 5 parallels + 13 meridians, all finite', () => {
  const paths = graticulePaths();
  assert.equal(paths.length, 5 + 13);
  for (const p of paths) {
    assert.ok(coordsOf(p).every(Number.isFinite));
    assert.match(p, /^M/);
  }
});

test('outline is a closed path spanning the full map', () => {
  const d = outlinePath();
  assert.match(d, /^M/);
  assert.match(d, /Z$/);
  const b = bounds();
  const nums = coordsOf(d);
  assert.ok(nums.every(Number.isFinite));
  const xs = nums.filter((_, i) => i % 2 === 0);
  const ys = nums.filter((_, i) => i % 2 === 1);
  assert.ok(Math.abs(Math.min(...xs) + b.xMax) < 0.01);
  assert.ok(Math.abs(Math.max(...xs) - b.xMax) < 0.01);
  assert.ok(Math.abs(Math.max(...ys) - b.yMax) < 0.01); // y flipped: top = +yMax
  assert.ok(Math.abs(Math.min(...ys) + b.yMax) < 0.01);
});
