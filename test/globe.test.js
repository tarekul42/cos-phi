import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clipFragmentsView,
  rotateVertex,
  toScreen,
} from "../src/globe-math.js";

const view = { cx: 400, cy: 300, R: 250 };

test("sub-point projects to canvas center, facing the viewer", () => {
  const [x, y, z] = rotateVertex(10, 25, { lon: 10, lat: 25 });
  assert.ok(Math.abs(x) < 1e-15, `x ${x}`);
  assert.ok(Math.abs(y) < 1e-15, `y ${y}`);
  assert.ok(Math.abs(z - 1) < 1e-15, `z ${z}`);
  const [sx, sy] = toScreen([x, y, z], view);
  assert.ok(Math.abs(sx - 400) < 1e-9 && Math.abs(sy - 300) < 1e-9);
});

test("antipode faces directly away (culled)", () => {
  const [, , z] = rotateVertex(10 + 180, -25, { lon: 10, lat: 25 });
  assert.ok(Math.abs(z + 1) < 1e-12, `z ${z}`);
});

test("limb point sits on the radius-R circle", () => {
  const v = rotateVertex(10 + 90, 0, { lon: 10, lat: 0 });
  assert.ok(Math.abs(v[2]) < 1e-12, `z ${v[2]}`);
  const [sx, sy] = toScreen(v, view);
  const r = Math.hypot(sx - 400, sy - 300);
  assert.ok(Math.abs(r - 250) < 1e-6, `radius ${r}`);
});

test("longitude shift equals vertex shift (rotation composes)", () => {
  const a = rotateVertex(30, 20, { lon: 10, lat: 0 });
  const b = rotateVertex(20, 20, { lon: 0, lat: 0 });
  for (let k = 0; k < 3; k++) {
    assert.ok(Math.abs(a[k] - b[k]) < 1e-12, `axis ${k}: ${a[k]} vs ${b[k]}`);
  }
});

test("limb clipping: crossing ring fragments, backface ring vanishes", () => {
  const crossing = [
    [1, 0, 1],
    [-1, 0, 1],
    [-1, 0, -1],
    [1, 0, -1],
  ];
  const frags = clipFragmentsView(crossing, true);
  assert.ok(frags.length === 2, `expected 2 fragments, got ${frags.length}`);
  assert.ok(frags[0].length === 3, `first fragment has ${frags[0].length} points`);
  for (const f of frags) {
    for (const p of f) assert.ok(p[2] >= -1e-9, `leaked z ${p[2]}`);
  }
  const behind = [
    [0.2, 0.1, -1],
    [-0.2, 0.1, -1],
    [0, -0.2, -2],
  ];
  assert.deepEqual(clipFragmentsView(behind, true), []);
  assert.deepEqual(clipFragmentsView([], true), []);
});
