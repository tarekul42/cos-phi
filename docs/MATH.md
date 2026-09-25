# The Mathematics of Our Equal-Earth Projection

*Everything here is derived from first principles. The only borrowed objects are
four decimal constants (the y-curve coefficients), which are a shape-tuning
choice — not a mathematical requirement; in Phase 5 we refit them ourselves
against a stated distortion criterion. See §7 and §8.*

---

## 1. What "equal-area" means, precisely

A map projection is a smooth map from the globe to the plane:

```
T : (φ, λ)  ↦  (x, y)        φ = latitude, λ = longitude, in radians
```

The sphere's infinitesimal area element (unit radius) is `cos φ · dφ · dλ`.
The plane's is `|det J| · dφ · dλ`, where `J = ∂(x, y)/∂(λ, φ)` is the Jacobian
matrix of the transformation.

> **A projection preserves area everywhere ⟺**
>
> ```
> det ∂(x, y)/∂(λ, φ)  =  cos φ      for every (φ, λ)
> ```

If that identity holds, every infinitesimal patch keeps its area, so by
integration **every finite region keeps its area** — every country, exactly.
This is the property we set out to build, and it is what our test suite checks
numerically (see §9).

---

## 2. The family we work in: pseudocylindrical

Properties we want (they define "world map" visually):

- parallels are straight horizontal lines → `y` depends only on latitude;
- all meridians are equally spaced along any parallel → `x` is **linear in λ**;
- symmetry about the equator and the central meridian.

So the most general shape satisfying these is

```
y = h(φ)          x = g(φ) · λ
```

The Jacobian is then (note `y_λ = 0`):

```
det = x_λ · y_φ − x_φ · y_λ = g(φ) · h′(φ)
```

so the equal-area condition becomes a single ODE:

```
g(φ) · h′(φ) = cos φ                    (1)
```

Equation (1) has **one equation and two unknown functions** — a whole family of
equal-area maps. The free function is the design choice: it decides *shape*,
never *area*. Gall–Peters, Mollweide, Eckert IV and Equal-Earth are all
different points in this family.

---

## 3. Reparametrization: why we introduce θ

Direct choices of `h(φ)` give clumsy `g(φ)` (from (1): `g = cos φ / h′`). We
instead introduce an auxiliary parameter **θ** and write

```
y = Y(θ)                                    (our y-curve)
x = k · λ · cos θ / Y′(θ)                   (k = aspect constant)
```

where `θ = θ(φ)` is to be determined. The `cos θ / Y′(θ)` form is chosen so the
chain rule cancels:

```
x_λ = k · cos θ / Y′(θ)
y_φ = Y′(θ) · dθ/dφ

det = x_λ · y_φ = k · cos θ · dθ/dφ
```

**The y-curve derivative disappears from the Jacobian.** Set equal to `cos φ`:

```
k · cos θ · dθ/dφ  =  cos φ               (2)
```

---

## 4. Solving the ODE

Separate variables in (2) and integrate from the equator (`φ = 0 ↦ θ = 0`,
which fixes the constant of integration to zero):

```
k · sin θ = sin φ
```

**Choosing k.** `k` sets the map's width. The convention (and the value that
reproduces the published Equal-Earth aspect ratio) is

```
k = 2√3 / 3 = 2/√3 ≈ 1.154700538…
```

giving the closed form

```
┌─────────────────────────────────────────────┐
│  sin θ = (√3 / 2) · sin φ                  │
│  θ = arcsin( (√3/2) · sin φ )              │
└─────────────────────────────────────────────┘                        (3)
```

Since `|sin φ| ≤ 1` and `√3/2 < 1`, the argument never leaves `[-1, 1]`;
at the poles `sin θ = √3/2` → **`θ = ±π/3` exactly**.

> **Key structural result:** substituting (3) back, `det ≡ cos φ` **for every
> possible Y**. The y-curve `Y(θ)` has vanished from the condition. *Any*
> monotonic y-curve yields an exactly equal-area map — the coefficients below
> only trade shape distortion, never area.

---

## 5. The forward projection

Given `(φ, λ)` in radians:

```
θ    = arcsin( (√3/2) · sin φ )                          (3)

y    = A₁θ + A₂θ³ + A₃θ⁷ + A₄θ⁹                         (4)

       2√3 · λ · cos θ
x  =  ─────────────────────────────────────────────        (5)
       3 · ( A₁ + 3A₂θ² + 7A₃θ⁶ + 9A₄θ⁸ )

A₁ = 1.340264   A₂ = −0.081106   A₃ = 0.000893   A₄ = 0.003796
```

Observe that the denominator in (5) is exactly `Y′(θ)`, the derivative of (4) —
as required by the construction in §3. The polynomial (4) is the *only* piece we
did not choose ourselves (see §7); it defines the spacing of the parallels.

Sanity of the shape: `Y′ > 0` on `[−π/3, π/3]` (checked numerically in tests),
so `Y` is strictly increasing — the map is one-to-one in latitude.

---

## 6. The inverse projection

Given `(x, y)`:

**Step 1 — recover θ.** Solve `Y(θ) = y` for `θ ∈ [−π/3, π/3]`. `Y` is strictly
monotonic there, so the root is unique. We use **Newton–Raphson with an
analytic derivative**, seeded linearly (`θ₀ = y / A₁`, since `Y ≈ A₁θ` near the
equator), with a **bisection fallback** whenever the Newton step leaves the
bracket `[−π/3, π/3]`. No published regression series is needed. Inputs with
`|y| ≥ Y(π/3)` clamp to the poles exactly (avoids `asin` precision loss near 1).

**Step 2 — latitude** from (3) inverted:

```
φ = arcsin( (2/√3) · sin θ )
```

**Step 3 — longitude** from (5) inverted:

```
3 · x · Y′(θ)                       √3
λ = ───────────────────  =  x · Y′(θ) · ─── · ──────────
      2√3 · cos θ                      2     cos θ
```

(defined everywhere except `cos θ = 0`, which cannot occur since
`|θ| ≤ π/3 < π/2`).

---

## 7. What we derived vs. what we borrowed

| Piece | Status |
|---|---|
| Equal-area condition `det = cos φ` | **Ours** (§1) |
| Family choice + ODE `g·h′ = cos φ` | **Ours** (§2) |
| Parametrization with `cos θ / Y′(θ)` | **Ours** (§3) |
| Solution `sin θ = (√3/2) sin φ`, `k = 2/√3` | **Ours** (§4) |
| Forward/inverse formulas, Newton solver | **Ours** (§5–6) |
| Coefficients `A₁…A₄` (y-curve shape) | Borrowed **and refitted**: equal-area holds regardless (§4), so in Phase 5 we refit them ourselves against our own criterion (§8). The published set remains the default (`PUBLISHED_A`); ours are `OURS_A` / `OURS_FIXED_ASPECT_A`. |

No projection library (d3, PROJ, proj4) is used anywhere in the implementation.
PROJ's published output appears **only as a test oracle** (§9).

---

## 8. Phase 5: fitting our own coefficients

### 8.1 What is free to move

§4 proved equal-area holds for **any** monotonic y-curve, so coefficients trade
*shape only*. We search the published basis (terms `θ¹, θ³, θ⁷, θ⁹`):

```
Y(θ) = a₁θ + a₂θ³ + a₃θ⁷ + a₄θ⁹
```

with two constraints built into the parameterization:

- **height pinned**: `Y(π/3)` fixed to the published value `1.317362759` — all
  variants share one map height (and, in the fixed-aspect variant, one `a₁`
  chosen so the full aspect ratio matches published);
- **monotonicity**: `Y′ > 0` on `[−π/3, π/3]` enforced by a hard penalty, so
  the map stays one-to-one.

### 8.2 The distortion metric: Tissot's indicatrix

Equal-area means `h·k = 1` — areas are exact; what varies is **shape**. The
local frame differential of the projection (columns = images of the unit east
and north vectors on the globe) is

```
C = [[ h    ,  x_φ ],
     [ 0    ,  y_φ ]]
```

(`h = (2/√3)·cos θ / (Y′·cos φ)` is the east scale; the north column tilts
because `x` also depends on `φ` through `θ`). Its singular values `a ≥ b` are
the semi-axes of the image of a small circle on the globe, with `ab = 1`, and
the **maximum angular distortion** is

```
ω = 2 · asin( (a − b) / (a + b) )              (Tissot, in degrees reported)
```

Note `x_φ ∝ λ`: ω depends on latitude **and** longitude — a point at 45° N
looks different near the central meridian than at the map edge. Metrics are
area-weighted over a `(φ, λ)` grid with weight `cos φ` (sphere area), on
`|φ| ≤ 80°`. The poles are excluded: every pole-line projection degenerates
there (`ω → 180°`), which would swamp any comparison.

### 8.3 The criterion, and why it is a blend

```
f  =  rms80 / rms80(published)  +  0.75 · max80 / max80(published)
```

Both terms are normalized by the published map's own values, so `f < 1.75`
beats the published coefficients. The exploration that fixed the 0.75 weight
(20+ fits across criteria) found:

- under the joint constraints *max ω ≤ published* **and** *equator ω ≤
  published*, the best achievable RMS gain is **0.03°** — the published 2018
  coefficients are essentially **Pareto-optimal** in this family: any real gain
  on one axis costs another;
- pure minimax (minimize `max80`) lowers the worst case to ≈ 89° but inflates
  RMS by 40% and wrecks the mid-latitude edges;
- `w = 0.75` is the knee: it buys a genuine worst-case and polar-band
  improvement while keeping RMS within ~3% and the equator intact. Pure-RMS
  fits, for reference, only reach 34.24 → 33.50°.

### 8.4 The fit

Hand-written Nelder–Mead (3–4 parameters, multi-start, deterministic LCG
restarts), coarse 8°×10° grid inside the optimizer, fine 5° grid for reported
numbers. Two variants:

- `OURS_A` — `a₁, a₂, a₃` free (aspect follows `a₁`),
- `OURS_FIXED_ASPECT_A` — `a₁` pinned to reproduce the published aspect.

Reproduce (deterministic, identical output every run):

```bash
node scripts/fit-coefficients.js
```

### 8.5 Results (fine grid, `|φ| ≤ 80°`, computed by our code)

| metric | published | ours — free | ours — fixed |
|---|---|---|---|
| rms ω (°) ↓ | **34.24** | 35.10 | 35.20 |
| max ω (°) ↓ | 109.50 | 104.50 | **104.13** |
| ω at equator (°) | 17.01 | 17.33 | 17.01 |
| ω at (45°, edge) (°) | **51.18** | 55.61 | 56.49 |
| ω at (75°, center) (°) | 80.07 | 72.58 | **72.05** |
| aspect | 2.0546 | 2.0488 | 2.0546 |
| criterion `f` ↓ | 1.7500 | **1.7408** | 1.7411 |

Coefficients (full precision in `src/projection.js`):

```
OURS_A                 a₁ = 1.3440365099   a₂ = −0.1355443709
                       a₃ =  0.0689603559   a₄ = −0.0196031458
OURS_FIXED_ASPECT_A    a₁ = 1.3402640000   a₂ = −0.1323215775
                       a₃ =  0.0688581681   a₄ = −0.0193451705
```

**The trade, honestly stated:** worst-case distortion drops by ≈ 5° and the
polar band (Greenland, Siberia, northern Canada) by ≈ 8°; the equator —
Africa, Indonesia, Brazil — is held at published quality (fixed variant
exactly, free variant +0.3°); the price is +2.5–2.8% RMS and ≈ +5° at the
mid-latitude map edge. Equal-area is untouched: §9's tests re-verify
`det = cos φ` for *all three* coefficient sets.

### 8.6 Verification added in Phase 5

| Check | Result |
|---|---|
| `det ∂(x,y)/∂(λ,φ) = cos φ` for published + ours (875 points each) | worst deviation **< 1e-8** |
| Local frame `h · y_φ = 1` for all family members | **1 ± 1e-12** |
| `Y′ > 0` for all family members (1,201 samples each) | confirmed |
| Height pinned `Y(π/3)` equal across members | within **1e-12** |
| Criterion: max ω improved by > 3°, polar band by > 3°, RMS within 3% | confirmed for both variants |
| Round-trip inverse with `OURS_A` | **< 1e-9°** |

---

## 9. Verification (all values produced by running our code)

| Check | Expected | Measured |
|---|---|---|
| Jacobian `det / cos φ` | 1 ± 1e-7 | worst deviation **1.79 × 10⁻¹⁰** over a 3,381-point diagnostic grid (test asserts over 875 points) |
| Pole width ÷ equator width | 0.59247 (ArcGIS spec) | **0.59246688980** |
| Aspect ratio `width / height` | ≈ 2 : 1 | **2.054582** (5.41326 × 2.63473) |
| PROJ oracle `+proj=eqearth +R=1` at `λ=122, φ=47` | (1.55, 0.89) | **(1.549254, 0.893308)** |
| Round-trip `unproject(project(p))` | error < 1e-9° | max error **< 1e-9°** over 1,665 grid points |
| `Y′(θ) > 0` on `[−π/3, π/3]` | always | confirmed at 121 samples |
| `θ(±90°)` | ±π/3 | exact to 1e-15 |
| **Projected ÷ spherical area, all 242 countries** | 1 ± 0.1% | worst **0.025%** (Faroe Islands); median ≈ 0.0008% |
| Absolute area cross-check (8 countries vs published) | ± 8% | worst **4.0%** (India) |
| Antarctica, three independent methods | agree | fan **12,256,413** / Green **12,256,671** / projected **12,256,751** km² (spread 0.003%) |

Reproduce with:

```bash
npm test
```

The Jacobian test is the proof of the project's central promise: if
`det = cos φ` everywhere, then **every country's area on our map is exactly its
real area** (up to floating-point and polygon-approximation error).
`test/areas.test.js` then demonstrates it end-to-end: each of the 242 countries'
spherical area (signed spherical excess) is compared with its projected planar
area (shoelace over great-circle-densified, projected rings) — all land within
0.1%, worst-case 0.025%.

---

## 10. References

- Šavrič, B., Patterson, T., Jenny, B. (2018). *The Equal Earth map projection.*
  Int. J. Geographical Information Science, 33(3), 454–465.
- PROJ documentation, `+proj=eqearth` — oracle values only.
- ArcGIS Pro documentation, "Equal Earth" — pole-width spec (0.59247).
