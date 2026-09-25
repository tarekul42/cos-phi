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
