// Per-country facts shown in the hover/pin info card.
//
// Everything here is pure math over the GeoJSON — no DOM — so the numbers the
// user sees come from the exact same code the test suite verifies.

import {
  EARTH_AREA_SR,
  featureSphericalArea,
  featureMercatorFactor,
  srToKm2,
} from './area.js';

// { name, areaKm2, worldPct, mercFactor }
//   areaKm2   — true area on the sphere (signed spherical excess)
//   worldPct  — share of Earth's total surface (510,065,621 km²)
//   mercFactor— how many times Mercator inflates it (Infinity at the poles)
export function countryStats(feature, name) {
  const sr = featureSphericalArea(feature);
  return {
    name,
    areaKm2: srToKm2(sr),
    worldPct: (sr / EARTH_AREA_SR) * 100,
    mercFactor: featureMercatorFactor(feature),
  };
}

// "Russia is 7.9× the size of Greenland" — larger country always first, so
// the line reads the same whichever way the pair is given.
export function sizeComparison(a, b) {
  const ra = a.areaKm2;
  const rb = b.areaKm2;
  if (!(ra > 0 && rb > 0)) return '';
  const r = ra / rb;
  if (Math.abs(r - 1) < 0.05) return `${a.name} and ${b.name} are about the same size`;
  const [big, small, mult] = r >= 1 ? [a, b, r] : [b, a, 1 / r];
  const m = mult >= 100 ? Math.round(mult) : mult.toFixed(1);
  return `${big.name} is ${m}× the size of ${small.name}`;
}
