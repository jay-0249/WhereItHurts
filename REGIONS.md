# REGIONS.md — Body Region System Specification

This is the executable specification for WhereItHurts' region system. It is
written so that ANY executor — human or model, regardless of capability —
can add, adjust, or debug regions by following it mechanically. When this
document and code disagree, this document wins; fix the code.

**Architecture in one sentence:** every vertex of each body mesh is
assigned exactly one of ~111 region ids at BUILD time by declarative rules
("paint-by-numbers"); the app raycasts the mesh and reads the label off the
hit triangle, so coverage is total by construction and there are no overlap
or ordering fights at runtime.

---

## 1. The frozen coordinate frame

All rules, landmarks, manifests, and anchors live in ONE frame — the
"fitted frame" produced by `src/lib/body-fit.mjs` (shared verbatim by the
runtime and every script):

- Height normalized to **3.6** units, feet at **y = 0**, bbox-centered on
  x/z. `fitted = (p − center) × scale`.
- **+x = the patient's LEFT.  +z = anterior (front).  y = up.**
- The bbox z-center includes the forward-hanging hands, so the torso's
  skin sits slightly negative in z. NEVER hardcode "front means z > 0";
  front/back is always per-y-slice mid-z (§2).
- Landmarks (`src/data/landmarks/*.json`, from `scripts/measure-body.mjs`)
  are measured in this frame and embed the fit; the bake asserts the fit
  matches, and the runtime dev-asserts it again.

## 2. Labeling pipeline (scripts/bake-labels.mjs)

Stage 1 — **gross segmentation.** Every vertex is assigned to one segment
(`torso, head, neck, armL, armR, legL, legR`) by nearest-structure scoring:
distance to a landmark-derived polyline minus its radius profile; smallest
score wins; ties resolve by that fixed priority order. One cleanup pass
merges connected components smaller than 8 vertices into their dominant
edge-neighbor. Never label by x-gap clustering — it cannot handle armpit
webs or the hands overlapping the thighs.

Stage 2 — **rule evaluation.** Each segment has an ordered rule list in
`src/data/region-rules.mjs`. Vertices are processed in ascending index
order; for each vertex the FIRST matching rule wins; every list ends with
unconditional catch-alls, so labeling is total. A rule matches when ALL of
its present predicates hold. The predicate vocabulary is FROZEN — adding a
predicate is a spec change to this file, not an ad-hoc code edit:

| Predicate | Meaning |
|---|---|
| `y: [lo,hi]` | segment-normalized height. Anchors: torso 0=crotch line → 1=shoulder line; neck 0=shoulder line → 1=chin; head 0=chin → 1=crown. Values may exceed [0,1]. |
| `z: "front"\|"back"` | vertex z vs the segment's per-y-slice mid-z (60 bins, computed from the segment's own vertices). |
| `ax: [lo,hi]` | \|x\| normalized by the segment's per-y-slice half-width. |
| `t: [lo,hi]` | limb parameter, JOINT-ANCHORED: arm 0=shoulder joint, 0.45=elbow, 0.85=wrist, 1=hand tip; leg 0=hip joint, 0.5=knee, 0.9=ankle, 1=toe tip. |
| `face: [...]` | limb quadrant around the bone axis: `front/back/inner/outer`. θ=0 ≡ +z projected ⊥ to the bone axis; "inner" is normalized per side to always mean *toward the midline*. Chosen by the larger of \|forwardness\| vs \|innerness\|. |
| `zSeg: [lo,hi]` | foot only: z as a fraction of the foot's z-extent (0=heel end, 1=toe end). |
| `nY: [lo,hi]` | vertex-normal y component (foot only: sole vs top). |
| `variants: [...]` | rule exists only on those body variants; elsewhere the surface FALLS THROUGH to the next rule (this is the whole variant-gating mechanism — e.g. body-a simply has no breast rule, so that band lands on `chest.pec.*`). |

`{S}` in a rule id resolves to `left`/`right`: by vertex x-sign for
torso/head/neck (x ≥ 0 → left), by limb side for arm/leg.

**Pose facts the rules depend on** (re-verify after any pose change):
the rest pose has ~52° elbow flexion — hands hang FORWARD of the thighs
and the forearm pronates, so the PALM faces inward-BACKWARD and the
dorsum forward; the elbow is located by the arm samples' most-backward
point (z-curvature), never by height fractions.

Stage 3 — **outputs.**
- Labels embedded in the GLB as a `_REGION` Uint16 SCALAR vertex attribute
  (this is why mesh/label desync is impossible).
- `src/data/region-manifest/{variant}.json`: per-region vertex count,
  anchor (on-skin, most-interior-then-central vertex: ≥2 edges off the
  label boundary when possible, nearest the centroid — max-depth alone
  finds fold bottoms), anchor normal, AABB, plus the adjacency graph
  (regions sharing ≥3 mesh edges, then `ADJACENCY_OVERRIDES` from
  `region-ids.mjs` applied) and the glb content hash.
- `src/data/asset-manifest.json` content hashes (cache busting).

**Bake invariants (hard failures — never weaken them, fix rule data):**
zero unlabeled vertices; every applicable region ≥ `MIN_VERTS` (12);
variant-gated regions absent elsewhere; left/right vertex counts within
25%; adjacency symmetric. If a region comes up short, adjust its rule
fractions in `region-rules.mjs` — NEVER special-case the bake code.

## 3. THE pick rule (one rule, everywhere)

Selected region = label of the hit triangle's corner with the **largest
barycentric coordinate** at the hit point; ties break to the **lowest
vertex index**. `BodyVisual.pickRegion`, `tests/selection.spec.ts`, and any
future consumer MUST implement exactly this. If render-side flat shading
is ever adopted, the pick rule must change in lockstep to `label[face.c]`
(WebGL2's provoking vertex) — never let render and pick disagree.

## 4. Tint rendering — the interpolation trap

The highlight is a per-vertex **mask attribute** (`aTint`: x=selected,
y=hovered; rewritten on selection change, ~35k writes, trivial) mixed with
ember in the fragment shader, giving a free one-triangle feathered edge.

**PROHIBITED:** comparing an interpolated region INDEX in the shader
(`varying float vRegion; if (vRegion == uSelected)`). Interpolation
between labels 7 and 63 on a boundary triangle sweeps through every index
in between and paints phantom stripes across the whole body. Do not
"simplify" the mask into that.

The `?atlas=1` dev view bakes a per-vertex color attribute (hue =
`(labelIndex × 0.618034) mod 1`, HSL s=0.7 l=0.5) — unlabeled skin would
render grey, so the atlas is the visual proof of coverage.

## 5. Determinism clauses

First-match-wins, top to bottom. Mandatory catch-alls per segment.
Vertices iterate in ascending index order. Cleanup pass: components
discovered in ascending vertex order, threshold 8, dominant-neighbor by
edge count with ties to the lower segment priority index. No implicit
tolerances: every numeric threshold lives in this file, the rules file, or
a named constant in the bake.

## 6. Region ids and naming policy

- Ids are hierarchical dotted strings; **append-only**. Renames = add the
  new id + map the old one in `DEPRECATED_REGIONS` (regions.ts); the store
  migration and summary flows depend on that table.
- Sides are `.left`/`.right` SUFFIXES, meaning the **patient's** side
  (`regionSide()` parses the suffix; the confirm sheet renders "— your
  left").
- The canonical id list lives in `src/data/region-ids.mjs` (runtime,
  shared with scripts); its `.d.mts` mirrors the list as a literal tuple
  for typing. `tests/bake-invariants.spec.ts` guards the two against
  drift. Labels are i18n entries (`en.regions`); groups (Layer-2) and
  picker areas live in `regions.ts`.

## 7. Taxonomy (~111 zones)

Head & face 15 · neck 4 · shoulder girdle 6 · chest 7 (breasts body-b
only) · abdomen 9 (the clinical 3×3 grid) · pelvis & groin 3 · back 13
(incl. scapula L/R, between-blades, spine segments, sacrum, tailbone,
buttocks) · hips 2 · arms 24 (12/side: armpit, biceps, triceps, elbow
crease/point, forearm inner/outer, wrist, palm, hand back, thumb side,
fingers) · legs 28 (14/side: thigh front/back/inner/outer, kneecap, back
of knee, shin, calf, ankle inner/outer, heel, sole, foot top, toes).
The authoritative list is `region-ids.mjs`; splitting a zone further is
adding a rule row plus a taxonomy row — no architecture change.

## 8. Regeneration workflow

```
# 1. meshes (Blender + MPFB2, ~35k tris; needs scripts/setup-mpfb.py once)
blender --background --python scripts/generate-bodies.py -- body-a
blender --background --python scripts/generate-bodies.py -- body-b
# 2. landmarks (fitted-frame measurements)
node scripts/measure-body.mjs
# 3. verify raw meshes + install (variant difference hard-checks)
node scripts/verify-bodies.mjs
# 4. labels + manifests (LAST — overwrites public/assets with labeled glbs)
npm run bake
```

Rules-only iteration = step 4 alone (it reads the pristine exports in
`scripts/out/`). **A GLB without `_REGION` never ships** — the runtime
throws, and `tests/bake-invariants.spec.ts` fails on missing labels or on
manifest/glb hash mismatch (which also catches running step 3 after step
4 by mistake). `npm test` runs in the build.

## 9. How to add or adjust a zone (the recipe)

1. Add the id to `src/data/region-ids.mjs` AND its `.d.mts` tuple.
2. Add group + (if new area) picker area in `src/data/regions.ts`; label
   in `src/i18n/en.ts`; variant gating in `REGION_VARIANTS` if needed.
3. Add/adjust the rule row(s) in `src/data/region-rules.mjs` using ONLY
   the §2 vocabulary. Order matters: put the more specific rule above the
   band it carves from.
4. `npm run bake` — fix any invariant failure by adjusting fractions.
5. `npm test` — bake-invariants, label-sanity (add a semantic predicate
   for the new zone), selection parity.
6. Visual QA: `node scripts/visual-check.mjs body-a out "your.new.zone"`
   and the `?atlas=1` view (VISUAL_CHECK_QUERY/VISUAL_CHECK_SPIN env vars
   control query and camera spin). Screenshots are the final arbiter.

## 10. Verification layers (all must pass)

1. **Bake invariants** — §2 hard failures, re-checked against committed
   artifacts by `tests/bake-invariants.spec.ts`.
2. **Label sanity** (`tests/label-sanity.spec.ts`) — independent anatomy
   predicates (left ids on +x; scapula posterior & between shoulder line
   and waist; palm behind dorsum; toes forward of heel; vertical ordering
   by AABB mid-heights; …). Keeps selection tests from being circular.
3. **Selection parity** (`tests/selection.spec.ts`) — real orbit-camera
   rays (polar clamp ±30°) against the shipped labeled mesh with THE §3
   pick rule; every region must be tappable at some sampled point, and
   the motivating zones (scapula, between-blades, trapezius, hamstring,
   the 9-zone belly, …) must always resolve.
4. **Eyes** — atlas + per-zone tint screenshots via Playwright. This
   project's history says: green math without pixels is not done.
