import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

import { bounds } from "../src/projection.js";
import { prepareMorph, mercXY } from "../src/morph.js";
import { featureToPath, graticulePaths, outlinePath } from "../src/render.js";

const gj = JSON.parse(
  fs.readFileSync(new URL("../data/world.geojson", import.meta.url), "utf8"),
);
const { yMax } = bounds();

test("morph at t=0 reproduces the rendered paths exactly", () => {
  const m = prepareMorph(gj.features, { yMax });
  for (let i = 0; i < gj.features.length; i++) {
    assert.equal(m.featurePath(i, 0), featureToPath(gj.features[i]), `feature ${i}`);
  }
  const grats = graticulePaths();
  for (let i = 0; i < grats.length; i++) {
    assert.equal(m.graticulePath(i, 0), grats[i], `graticule ${i}`);
  }
  assert.equal(m.outlinePath(0), outlinePath());
});

test("Mercator endpoint: unit-scale spot checks", () => {
  const [x0, y0] = mercXY(0, 0, 1);
  assert.ok(Math.abs(x0) < 1e-15 && Math.abs(y0) < 1e-15);
  const [x90] = mercXY(90, 0, 1);
  assert.ok(Math.abs(x90 - Math.PI / 2) < 1e-12);
});

test("Mercator endpoint fits the frame: ±85.05113° lands exactly on the edge", () => {
  const s = yMax / Math.PI;
  const [, yEdge] = mercXY(0, 85.0511287798066, s);
  assert.ok(Math.abs(-yEdge - yMax) < 1e-9, `${-yEdge} vs yMax ${yMax}`);
  const [, ySouth] = mercXY(0, -85.0511287798066, s);
  assert.ok(Math.abs(ySouth - yMax) < 1e-9, `${ySouth} vs yMax ${yMax}`);
});

test("Mercator endpoint stays finite at the poles (graticule) and at -89.998926 (50m Antarctica)", () => {
  for (const lat of [90, -90, -89.998926, 89.9999]) {
    const [x, y] = mercXY(137, lat, yMax / Math.PI);
    assert.ok(Number.isFinite(x) && Number.isFinite(y), `lat ${lat}: ${x}, ${y}`);
  }
});

test("area scale: exactly 1.00 on the Equal Earth map", () => {
  const m = prepareMorph([], { yMax });
  const r = m.metrics(0);
  assert.ok(Math.abs(r.median - 1) < 1e-5, `median ${r.median}`);
  assert.ok(Math.abs(r.max - 1) < 1e-5, `max ${r.max}`);
});

test("area scale: at t=1 it is Mercator's sec^2(lat)", () => {
  const m = prepareMorph([], { yMax });
  const r = m.metrics(1);
  const sec2 = (d) => 1 / Math.cos((d * Math.PI) / 180) ** 2;
  // worst sampled latitude is the grid edge, ±84°
  assert.ok(
    Math.abs(r.max / sec2(84) - 1) < 0.01,
    `max ${r.max} vs sec^2(84) = ${sec2(84)}`,
  );
  // area-weighted median: mid-latitudes, comfortably > 1 and < worst
  assert.ok(r.median > 1.05 && r.median < 10, `median ${r.median}`);
  assert.ok(r.median < r.max);
});
