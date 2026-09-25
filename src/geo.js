// GeoJSON geometry traversal — the single place that knows about
// Polygon vs MultiPolygon layouts.

// Returns an array of polygons; each polygon is an array of rings
// (first ring = exterior, the rest = holes).
export function polygonsOf(geometry) {
  return geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.coordinates;
}

export function eachRing(geometry, fn) {
  for (const rings of polygonsOf(geometry)) {
    for (const ring of rings) fn(ring);
  }
}
