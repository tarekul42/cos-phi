import assert from "node:assert/strict";
import { test } from "node:test";

import { bounds } from "../src/projection.js";
import {
  MAX_ZOOM,
  clampView,
  screenToMap,
  viewBoxOf,
  zoomView,
} from "../src/view.js";

const b = bounds();
const world = { xMax: b.xMax, yMax: b.yMax, width: b.width };
const aspect = b.width / b.height;
const fit = { cx: 0, cy: 0, w: b.width };

test("viewBox at fit equals the map's initial frame", () => {
  const [x, y, w, h] = viewBoxOf(fit, aspect).split(" ").map(Number);
  assert.ok(Math.abs(x + b.xMax) < 1e-12, `x ${x} vs ${-b.xMax}`);
  assert.ok(Math.abs(y + b.yMax) < 1e-12, `y ${y} vs ${-b.yMax}`);
  assert.ok(Math.abs(w - b.width) < 1e-12);
  assert.ok(Math.abs(h - b.height) < 1e-12);
});

test("zooming keeps the map point under a fixed screen point", () => {
  const rect = { left: 100, top: 50, width: 1180, height: 1180 / aspect };
  let v = { cx: 0.4, cy: -0.2, w: b.width };
  const [sx, sy] = [800, 400];
  const [fx, fy] = screenToMap(sx, sy, rect, v, aspect);
  v = zoomView(v, fx, fy, 2.5, world, aspect);
  v = zoomView(v, fx, fy, 1.7, world, aspect);
  const [fx2, fy2] = screenToMap(sx, sy, rect, v, aspect);
  assert.ok(Math.abs(fx2 - fx) < 1e-9, `x drifted ${fx2} vs ${fx}`);
  assert.ok(Math.abs(fy2 - fy) < 1e-9, `y drifted ${fy2} vs ${fy}`);
});

test("viewBox keeps the map's aspect at every zoom level", () => {
  for (const f of [1, 4, MAX_ZOOM]) {
    const v = zoomView(fit, 0.3, -0.1, f, world, aspect);
    const [, , w, h] = viewBoxOf(v, aspect).split(" ").map(Number);
    assert.ok(Math.abs(h * aspect - w) < 1e-9, `zoom ×${f}: ${h}·${aspect} ≠ ${w}`);
  }
});

test("clamp keeps the view inside the world; zoom is bounded", () => {
  let v = clampView({ cx: 1e6, cy: -1e6, w: b.width / MAX_ZOOM }, world, aspect);
  const h = v.w / aspect;
  const hx = b.xMax - v.w / 2;
  const hy = b.yMax - h / 2;
  assert.ok(v.cx <= hx + 1e-12 && v.cx >= -hx - 1e-12, `cx ${v.cx} vs ±${hx}`);
  assert.ok(v.cy <= hy + 1e-12 && v.cy >= -hy - 1e-12, `cy ${v.cy} vs ±${hy}`);
  assert.ok(v.w <= b.width && v.w >= b.width / MAX_ZOOM - 1e-12, `w ${v.w}`);
  // fully zoomed out: center is pinned to 0, extra zoom-out refused
  const z = clampView({ cx: 5, cy: 5, w: b.width * 10 }, world, aspect);
  assert.equal(z.cx, 0);
  assert.equal(z.cy, 0);
  assert.equal(z.w, b.width);
});
