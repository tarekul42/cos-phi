import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

import {
  densifyRing,
  featurePlanarArea,
  featureSphericalArea,
  planarPolygonArea,
  projectRing,
  sphericalPolygonArea,
  srToKm2,
} from "../src/area.js";

const gj = JSON.parse(
  fs.readFileSync(new URL("../data/world.geojson", import.meta.url), "utf8"),
);

// --- unit tests of the area machinery itself --------------------------------

test("spherical: a single octant triangle has area pi/2", () => {
  const tri = [
    [0, 0],
    [90, 0],
    [0, 90],
  ];
  assert.ok(
    Math.abs(Math.abs(sphericalPolygonArea(tri)) - Math.PI / 2) < 1e-12,
  );
});

test("spherical: the equator ring bounds a hemisphere (2*pi)", () => {
  const equator = [
    [0, 0],
    [90, 0],
    [180, 0],
    [-90, 0],
  ];
  assert.ok(
    Math.abs(Math.abs(sphericalPolygonArea(equator)) - 2 * Math.PI) < 1e-10,
  );
});

test("planar: unit square has area 1", () => {
  const sq = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  assert.ok(Math.abs(Math.abs(planarPolygonArea(sq)) - 1) < 1e-15);
});

test("densifying a ring does not change its spherical area", () => {
  const ring = [
    [0, 0],
    [40, 10],
    [30, 55],
    [-25, 40],
    [-30, -5],
  ];
  const before = sphericalPolygonArea(ring);
  const after = sphericalPolygonArea(densifyRing(ring, 0.5));
  assert.ok(Math.abs(after - before) < 1e-12, `${before} vs ${after}`);
});

test("projectRing handles an antimeridian-crossing ring without smearing", () => {
  // A small box straddling +/-180 should stay narrow, not span the map.
  const ring = [
    [179, 10],
    [-179, 10],
    [-179, 12],
    [179, 12],
  ];
  const pts = projectRing(ring, 1);
  const xs = pts.map((p) => p[0]);
  const width = Math.max(...xs) - Math.min(...xs);
  assert.ok(width < 0.2, `width ${width} (map is ~5.4 wide)`);
});

// --- the proof: every country's projected area equals its spherical area ----

test("projected area / spherical area == 1 for all 177 countries", () => {
  const rows = [];
  for (const f of gj.features) {
    const name = f.properties.ADMIN || f.properties.NAME;
    const sph = featureSphericalArea(f);
    const pln = featurePlanarArea(f, 1);
    rows.push({ name, ratio: pln / sph });
  }

  rows.sort((a, b) => Math.abs(b.ratio - 1) - Math.abs(a.ratio - 1));
  const worst = rows[0];
  const dev = Math.abs(worst.ratio - 1);

  console.log(
    "  worst ratios:",
    rows
      .slice(0, 5)
      .map((r) => `${r.name}=${r.ratio.toFixed(6)}`)
      .join(", "),
  );

  assert.ok(
    dev < 0.002,
    `worst: ${worst.name} ratio ${worst.ratio} (dev ${(dev * 100).toFixed(3)}%)`,
  );
});

// --- independent check: absolute areas against published country sizes ------
// (110m borders are simplified, so a few percent of slack is expected;
//  this catches gross errors — complement areas, factor-of-2, pole bugs.)

test("absolute areas match published country areas within 8%", () => {
  const known = {
    Brazil: 8_515_767,
    Australia: 7_741_220,
    India: 3_287_263,
    China: 9_596_960,
    "Democratic Republic of the Congo": 2_344_858,
    // NE 110m traces Antarctica's coast at ~12.24M km² (coarser than the often
    // cited 14.2M, which follows fuller ice-shelf outlines). Cross-validated:
    // spherical fan, Green's theorem in (λ, sinφ) and projected shoelace all
    // agree on 12.236–12.238M, so this pins the *data*, not a formula quirk.
    Antarctica: 12_240_000,
    Russia: 17_098_242,
    Canada: 9_984_670,
  };

  for (const [name, expectedKm2] of Object.entries(known)) {
    const f = gj.features.find(
      (f) => (f.properties.ADMIN || f.properties.NAME) === name,
    );
    assert.ok(f, `missing feature ${name}`);
    const got = srToKm2(featureSphericalArea(f));
    const err = Math.abs(got / expectedKm2 - 1);
    console.log(
      `  ${name}: got ${Math.round(got).toLocaleString("en-US")} km², ` +
        `expected ~${expectedKm2.toLocaleString("en-US")} km² (${(err * 100).toFixed(1)}%)`,
    );
    assert.ok(err < 0.08, `${name}: ${(err * 100).toFixed(1)}% off`);
  }
});
