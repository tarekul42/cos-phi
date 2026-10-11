# Equal Earth — a true-area world map

An interactive world map in which **every country is drawn at its true relative
area**: Greenland is ~1/14 of Africa, not "the same size". Built completely from
scratch — the projection is _derived_ here (see [`docs/MATH.md`](docs/MATH.md)),
and there are **zero libraries**: no d3, no proj4, no map SDK.

![Equal Earth world map](docs/screenshot.png)

## Run it

```bash
npm run serve      # static server via python3 (port 8000)
# open http://localhost:8000             — the main map (hover, click to pin)
# open http://localhost:8000/?pin=Greenland&vs=Russia — pinned comparison deep link
# open http://localhost:8000/?morph=0.5 — half-morphed toward Mercator (or drag the slider)
# open http://localhost:8000/?z=24&cx=1.557&cy=-0.03 — zoomed ×24 onto Singapore
# open http://localhost:8000/?q=Vatican — search deep link: pin + frame (or type in the box)
# open http://localhost:8000/compare.html — published vs our coefficients
# open http://localhost:8000/globe.html — the same countries on a rotating 3D Earth
# open http://localhost:8000/gallery.html — Equal Earth vs Winkel/Robinson/Mercator, one honesty test
```

```bash
npm test           # 78 tests: math invariants + the equal-area proof
```

## What's inside

| Path                 | Purpose                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| `src/projection.js` | The projection itself: forward `(φ,λ)→(x,y)`, inverse (own Newton solver), y-curve, coefficient sets (`PUBLISHED_A`, `OURS_A`, `OURS_FIXED_ASPECT_A`) |
| `src/area.js` | Verification math: signed spherical excess, shoelace, great-circle densification, longitude unwrapping |
| `src/geo.js` | GeoJSON traversal (Polygon / MultiPolygon) |
| `src/render.js` | Projected SVG paths, graticule, map outline (coefficients pluggable) |
| `src/distortion.js` | Tissot indicatrix + ω metrics used to fit/verify our coefficients |
| `src/main.js` | Fetches data, mounts the SVG, wires hover/pin/ghost + morph-slider interactions |
| `src/morph.js` | Equal Earth ⇄ Mercator morph: per-vertex endpoint lerp + live area-scale metrics |
| `src/view.js` | Zoom/pan viewport math: viewBox from `{cx, cy, w}`, cursor-anchored zoom, clamping |
| `src/stats.js` | Per-country facts for the info card: true area, world share, Mercator inflation |
| `src/compare.js` + `compare.html` | Side-by-side: published vs our coefficients with Tissot circles + metrics |
| `src/globe.js` + `globe.html` + `src/globe-math.js` | Rotating 3D orthographic Earth on canvas: own rotation math, limb clipping, hover/pin card |
| `src/tissot.js` | Tissot indicatrices as true 5° globe circles, morph-aware (equal-area blobs become Mercator's polar sausages) |
| `src/export.js` | Standalone SVG export: pure string builder (inlined styles, ocean rect, state-carrying title/filename) + Blob download wired in `main.js` |
| `src/contrast-projections.js` + `gallery.html` | Mercator/Robinson/Winkel tripel (published formulas, measured not derived) + the 4-panel honesty gallery |
| `scripts/fit-coefficients.js` | Deterministic Nelder–Mead refit of the y-curve (`node scripts/fit-coefficients.js`) |
| `docs/MATH.md` | Full derivation from the equal-area condition down to the code (§8: our coefficients) |
| `data/world.geojson` | Natural Earth 50m countries (public domain), `data/download.sh` refetches it |
| `test/` | 78 tests across 12 files |

## The math in one paragraph

A map is equal-area iff its Jacobian satisfies `det ∂(x,y)/∂(λ,φ) = cos φ`.
For the pseudocylindrical family `y = Y(θ)`, `x = (2/√3)·λ·cos θ / Y′(θ)` this
collapses to `k·cos θ·dθ/dφ = cos φ`, which integrates to
`sin θ = (√3/2)·sin φ`. Notably, the y-curve `Y` vanishes from the condition —
**any** monotonic y-curve is exactly equal-area; the published Equal-Earth
coefficients only tune *shape* distortion, never area — which is why we were
able to refit them ourselves against our own Tissot-ω criterion
([`docs/MATH.md`](docs/MATH.md) §8, compare at `/compare.html`).
Full derivation with all steps: [`docs/MATH.md`](docs/MATH.md).

## How "equal-area" is proven (not asserted)

1. **Local proof** — finite-difference Jacobian over a lat/lon grid:
   `det / cos φ = 1` to within `1.8e-10`.
2. **Global proof** — for each of the 242 countries, spherical area (signed
   spherical excess, van Oosterom–Strackee) vs projected planar area (shoelace
   over great-circle-densified rings): ratio within **0.025%** worst-case.
3. **Independent cross-checks** — Antarctica computed three ways (spherical fan,
   Green's theorem in `(λ, sin φ)`, projected shoelace) agrees to 5 significant
   digits; 8 countries' absolute areas match published values within 4.0%.
4. **External oracle** — PROJ's published `+proj=eqearth` output validates our
   independent implementation (tests only, never used in code).

## Design decisions

- **JavaScript, zero deps** — the map is an interactive web page; SVG gives
  per-country `<path>` elements with native hover/click for free.
- **Own Newton solver for the inverse** — the y-curve is strictly monotonic, so
  a bracketed Newton with bisection fallback converges exactly; no published
  regression series needed.
- **Own antimeridian handling** — longitudes are unwrapped before projection;
  pole-to-pole legs keep their raw Δλ because on this projection _the pole is a
  line_ (folding it away silently changes the region being measured).
- **Mercator ghost, aligned by map width** — the size-comparison overlay
  renders each country's Mercator outline at the same world width as this map
  (`x` scaled by `2/√3`, so both match at the equator), centered on the
  country's map centroid: a shape that visibly dwarfs the truth as |φ| grows.

## Status

- [x] Projection math derived, implemented, tested
- [x] Equal-area verified end-to-end (34 tests green)
- [x] Interactive SVG map with hover
- [x] Phase 5: our own coefficients (`OURS_A`, `OURS_FIXED_ASPECT_A`) — worst-case
      ω 109.5° → 104.1°, polar band 80.1° → 72.1°, equator held, RMS +2.8% (the
      honest trade); `compare.html` shows all three maps with Tissot indicatrices
- [x] Phase 6: interactions — hover area readouts (true km² + % of Earth),
      click-to-pin (Esc / ocean click clears, `?pin=` deep links), Mercator
      size-comparison ghost overlay with toggle, two-country overlay
      (true size, translated never scaled — `?pin=A&vs=B`, ratio line)
- [x] Phase 7: morph slider — smoothly bends the whole map into a
      frame-fitted Mercator and back (`?morph=` deep link), with a live
      equator-normalized area-scale readout (median ×1.00 · worst ×1.00 on
      Equal Earth; ×1.33 · ×92 on Mercator); fixed-projection overlays hide
      mid-morph
- [x] Phase 8: zoom & pan — wheel zoom to cursor (×64 max), drag to pan,
      double-click / +−⟲ buttons, live zoom badge, `?z=&cx=&cy=` deep links;
      strokes are non-scaling so borders stay hairline-crisp at any zoom
- [x] Phase 9: country search — type to filter (diacritic-insensitive),
      arrow-key navigation, Enter/clicks fly the view to the country's
      bounding box and pin it (`?q=`, normalized to `?pin=` on sync); frames
      the largest ring so antimeridian-crossers (Fiji, Russia) land on their
      main mass, and Vatican clamps cleanly at ×64
- [x] Phase 10: 3D globe — orthographic Earth on canvas with our own rotation
      math (no libraries), drag to rotate, optional auto-rotate (default off),
      painter's-algorithm countries with limb clipping, hover/pin with the
      same true-area card floating near the cursor (`?pin=`, `?rot=` init-only)
- [x] Phase 11: Tissot indicatrices — toggleable overlay of true 5° globe
      circles (`?tissot=1`); equal-area blobs on Equal Earth, morph slider
      inflates the polar rows into Mercator's sausages live. Also fixed the
      duplicated search box and added its missing CSS from Phase 9
- [x] Phase 12: four-map gallery — Mercator, Robinson, and Winkel tripel
      (published formulas, coded only so our harness can measure them) beside
      Equal Earth; each panel runs the same countries and the same 5° globe
      circles through its projector and reports the measured area spread:
      Equal Earth ×1.00–×1.00, Robinson ×1.00–×2.03, Winkel ×1.00–×2.35,
      Mercator ×1.00–×15.78. `render.js` gained a pluggable `projector` opt
      so any (lonDeg, latDeg)→{x,y} renders through the same pipeline
- [x] Phase 13: SVG export — ⬇ button beside the zoom controls snapshots the
      live view (zoom/pan/morph/pin/ghost/compare/Tissot state) into one
      standalone SVG: styles inlined, ocean baked in as a full-viewBox rect,
      hairline strokes kept via non-scaling-stroke, metadata title + filename
      that encodes pin and morph state (`equal-earth-greenland-morph42.svg`)

Data: Natural Earth 50m Admin 0 countries (public domain).
