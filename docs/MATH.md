# The Mathematics of Our Equal-Earth Projection

*Everything here is derived from first principles. The only borrowed objects are
four decimal constants (the y-curve coefficients), which are a shape-tuning
choice — not a mathematical requirement. See §7.*

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
numerically (see §8).

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
| Coefficients `A₁…A₄` (y-curve shape) | Borrowed constants — they tune *shape only*; equal-area holds regardless (§4). Refitting them ourselves is the planned Phase 5. |

No projection library (d3, PROJ, proj4) is used anywhere in the implementation.
PROJ's published output appears **only as a test oracle** (§8).

---

## 8. Verification (all values produced by running our code)

| Check | Expected | Measured |
|---|---|---|
| Jacobian `det / cos φ` | 1 ± 1e-7 | worst deviation **1.79 × 10⁻¹⁰** over a 3,381-point diagnostic grid (test asserts over 875 points) |
| Pole width ÷ equator width | 0.59247 (ArcGIS spec) | **0.59246688980** |
| Aspect ratio `width / height` | ≈ 2 : 1 | **2.054582** (5.41326 × 2.63473) |
| PROJ oracle `+proj=eqearth +R=1` at `λ=122, φ=47` | (1.55, 0.89) | **(1.549254, 0.893308)** |
| Round-trip `unproject(project(p))` | error < 1e-9° | max error **< 1e-9°** over 1,665 grid points |
| `Y′(θ) > 0` on `[−π/3, π/3]` | always | confirmed at 121 samples |
| `θ(±90°)` | ±π/3 | exact to 1e-15 |
| **Projected ÷ spherical area, all 177 countries** | 1 ± 0.2% | worst **0.18%** (Cyprus); median ≈ 0.02% |
| Absolute area cross-check (9 countries vs published) | ± 8% | worst **4.2%** (India; coarse 110m borders) |
| Antarctica, three independent methods | agree | fan **12,236,252** / Green **12,238,054** / projected **12,238,000** km² |

Reproduce with:

```bash
npm test
```

The Jacobian test is the proof of the project's central promise: if
`det = cos φ` everywhere, then **every country's area on our map is exactly its
real area** (up to floating-point and polygon-approximation error).
`test/areas.test.js` then demonstrates it end-to-end: each of the 177 countries'
spherical area (signed spherical excess) is compared with its projected planar
area (shoelace over great-circle-densified, projected rings) — all land within
0.2%, worst-case 0.18%.

---

## 9. References

- Šavrič, B., Patterson, T., Jenny, B. (2018). *The Equal Earth map projection.*
  Int. J. Geographical Information Science, 33(3), 454–465.
- PROJ documentation, `+proj=eqearth` — oracle values only.
- ArcGIS Pro documentation, "Equal Earth" — pole-width spec (0.59247).
