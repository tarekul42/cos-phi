import assert from "node:assert/strict";
import { test } from "node:test";

import {
  project,
  projectDeg,
  THETA_MAX,
  thetaFromY,
  unproject,
  unprojectDeg,
  yCurve,
} from "../src/projection.js";

test("round-trip unproject(project(p)) == p on a lat/lon grid", () => {
  let worst = 0;
  let worstAt = null;

  for (let latDeg = -89; latDeg <= 89; latDeg += 4) {
    for (let lonDeg = -180; lonDeg <= 180; lonDeg += 10) {
      const p = projectDeg(latDeg, lonDeg);
      const back = unprojectDeg(p.x, p.y);
      const err = Math.max(
        Math.abs(back.latDeg - latDeg),
        Math.abs(((back.lonDeg - lonDeg + 540) % 360) - 180),
      );
      if (err > worst) {
        worst = err;
        worstAt = { latDeg, lonDeg };
      }
    }
  }
  assert.ok(
    worst < 1e-9,
    `worst round-trip error ${worst}° at ${JSON.stringify(worstAt)}`,
  );
});

test("thetaFromY inverts yCurve to machine precision", () => {
  let worst = 0;
  for (let i = -40; i <= 40; i++) {
    const t = (i / 40) * THETA_MAX;
    const err = Math.abs(thetaFromY(yCurve(t)) - t);
    worst = Math.max(worst, err);
  }
  assert.ok(worst < 1e-14, `worst theta error ${worst}`);
});

test("solver clamps out-of-range y to the poles", () => {
  const top = unproject(0, 10);
  const bottom = unproject(0, -10);
  assert.ok(Math.abs(top.phi - Math.PI / 2) < 1e-12);
  assert.ok(Math.abs(bottom.phi + Math.PI / 2) < 1e-12);
});

test("inverse of PROJ reference point lands near (47, 122)", () => {
  // PROJ publishes only 2 decimals, so allow ~1 degree of slack.
  const { latDeg, lonDeg } = unprojectDeg(1.55, 0.89);
  assert.ok(Math.abs(latDeg - 47) < 1.0, `lat ${latDeg}`);
  assert.ok(Math.abs(lonDeg - 122) < 1.0, `lon ${lonDeg}`);
});

test("inverse of a high-latitude point round-trips", () => {
  const p = project((80 * Math.PI) / 180, (-30 * Math.PI) / 180);
  const back = unproject(p.x, p.y);
  assert.ok(Math.abs(back.phi - (80 * Math.PI) / 180) < 1e-12);
  assert.ok(Math.abs(back.lambda + (30 * Math.PI) / 180) < 1e-12);
});
