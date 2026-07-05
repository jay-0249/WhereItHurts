# DESIGN.md — Visual System & Interaction Specification

The product must feel **calm, precise, and premium** — closer to a well-made medical
instrument than a consumer app. A person opening this app may be in pain and possibly
anxious. Every design decision should lower cognitive load. One primary action per
screen. Optional depth is offered quietly, never demanded.

The **signature element** of this product is the 3D body itself: a softly lit, stylized
human figure on a quiet stage, with pain pins that glow like embers. Everything around
it stays disciplined and recedes. Do not add decorative illustration, gradients, or
marketing flourish anywhere else — the body is the hero and the only bold element.

---

## 1. Design tokens

### Color

| Token | Hex | Usage |
|---|---|---|
| `--porcelain` | `#F6F8F7` | App background. Cool, clinical-calm neutral. |
| `--ink` | `#182430` | Primary text, icons. Deep blue-black, never pure black. |
| `--slate` | `#5C6F7B` | Secondary text, captions, inactive states. |
| `--teal` | `#0F6B6E` | Primary actions, links, selected chips, focus rings. |
| `--teal-soft` | `#DCEDEC` | Selected chip fill, subtle highlights, hover washes. |
| `--ember` | `#E4572E` | Pain highlight ONLY. Pins, painted regions, intensity. Never used for buttons or errors. |
| `--ember-soft` | `#FBE3DA` | Low-intensity pain wash on the model. |
| `--line` | `#E3E8E6` | Hairline borders, dividers. |
| `--card` | `#FFFFFF` | Cards, sheets, panels. |

Pain intensity on the model is communicated by ember opacity/emissive strength, not by
different hues: mild = `--ember` at 35% emissive, moderate = 55%, severe = 75%,
very severe = 95% with a slow 2.5s glow pulse (disabled under reduced motion).

Semantic separation rule: **teal = the app talking, ember = the body talking.** A user
should be able to glance at any screen and know that everything orange-red relates to
their pain, everything teal relates to actions they can take.

### 3D scene & anatomy colors

- Stage: `--porcelain` background, soft radial floor shadow under the figure
  (`#182430` at 8% opacity), no grid, no horizon line.
- Lighting: one key light upper-left (soft white, intensity 1.1), one fill light right
  (intensity 0.4), gentle hemisphere ambient. No harsh specular highlights.
- **Skin layer:** neutral matte clay — `#C9B8A8`, roughness 0.85. Deliberately
  stylized/neutral, not photoreal skin.
- **Muscle layer:** anatomical muscle red — `#A9453D`, with subtle fiber-direction
  normal map if available; otherwise flat matte.
- **Bone layer:** ivory — `#E8E2D2`, roughness 0.6.
- **Organs (Phase 2+):** standard anatomical convention — lungs `#C8827A`,
  heart `#8E3B3B`, liver `#7A4A38`, stomach/intestines `#D9A05B`, kidneys `#94514B`.
- Layer transitions: when the user answers the depth question, the outer layer fades
  to 20% opacity over 400ms revealing the layer beneath AT THE SELECTED REGION ONLY
  (a spherical fade mask ~1.5x the region size), not the whole body. The rest of the
  body keeps its skin. This keeps orientation and avoids a jarring full-body X-ray.
- **Layer exploration is NOT part of the capture flow.** A separate "Explore" mode
  (Phase 2) will offer a whole-body layer opacity slider (skin → muscle → bone "peel")
  and a clip-plane slider for a true sectional cut (Three.js clipping planes).
  Side-by-side multi-figure comparison views are explicitly rejected — triple render
  load for marginal value. Rail: capture flow stays minimal; anatomy exploration is a
  separate, optional room. Do not add layer toggles or section controls to the
  capture canvas.
- Selected region: translucent ember overlay + a thin 1.5px outline pass (`--ember`).
- Hovered region (desktop): outline only, no fill, cursor pointer.

### Visual & interaction layer split, and body variants

- **Two decoupled layers.** The tappable regions are invisible proxy volumes
  (capsules/spheres, one per region ID) on a dedicated raycast layer; taps only
  ever test proxies. The realistic body is a single continuous glTF mesh in the
  clay material, purely decorative, excluded from raycasting entirely. Region
  segmentation lives in the proxy layer, so the visual asset needs no
  per-region material groups.
- **Selection highlight** = fragment tinting in the visual mesh's material:
  the shader receives the active proxy volume as uniforms, computes each
  fragment's signed distance to it, and tints inside fragments with
  `--ember` at 35% (soft ~0.01-unit falloff at the boundary, 200ms fade-in
  via a uniform). Hover (desktop) = the same tint at 15%. Because the wash
  is literally part of the skin surface, it cannot spill past the
  silhouette, show through from the far side, or detach from the body.
  One volume is active at a time; selection takes precedence over hover.
- **Body variants.** Two body builds, internal keys `body-a` / `body-b`. UI
  copy NEVER uses gendered words ("male"/"female" are banned in user-facing
  strings). First visit shows a chooser — "Choose the body that looks most
  like yours" with the caption "You can change this anytime." — with two
  abstract figure thumbnails; a small chip on the canvas reopens it. Region
  availability (e.g. breast regions) and pelvic region labels can vary per
  variant via the region tree's `variants` field and the i18n dictionary.

### Typography

| Role | Face | Notes |
|---|---|---|
| Display | **Bricolage Grotesque** (Google Fonts) | Headings, screen titles. Weight 600. Slightly warm and characterful without being playful. Use sparingly — one display element per screen. |
| Body / UI | **Public Sans** (Google Fonts) | All body text, chips, buttons, labels. Weights 400/500. Chosen for its civic/health credibility and excellent legibility at small sizes. |
| Data / Summary | **JetBrains Mono** (Google Fonts) | The generated summary block ONLY. Monospace signals "this is a precise record," visually separating the clinical output from the conversational UI. Weight 400, 14px, 1.6 line height. |

Type scale (rem): 2.0 display / 1.25 section / 1.0 body / 0.875 chip & caption.
Sentence case everywhere. No all-caps except 2–3 letter eyebrow labels in `--slate`.

### Spacing, shape, elevation

- 8px spacing grid. Screen padding 20px mobile, 32px desktop.
- Border radius: 16px cards/sheets, 12px buttons, 999px chips.
- Elevation: cards use `0 1px 3px rgba(24,36,48,0.06)` — one shadow level only.
  The bottom sheet over the 3D canvas uses `0 -4px 24px rgba(24,36,48,0.10)`.
- Buttons: primary = `--teal` fill, white text, 48px height. Secondary = white fill,
  `--line` border, `--ink` text. Tertiary/skip = text-only `--slate`.
  "Skip" is ALWAYS rendered as tertiary — visible but never competing.

---

## 2. Layout architecture

Single-page app, mobile-first. Desktop is the same layout centered at max-width 480px
for the flow, with the 3D canvas allowed to expand to 640px.

```
┌──────────────────────────────┐
│  ← back      WhereItHurts     │   top bar: 56px, transparent over canvas
│                               │
│                               │
│         [ 3D FIGURE ]         │   canvas: fills available height
│            ● pin              │   (min 55vh on mobile)
│                               │
│   ◦ Front ◦ Back ◦ L ◦ R      │   view presets: floating chip row
│                               │
├──────────────────────────────┤
│  ▲ bottom sheet               │   sheet: slides up over canvas,
│  "Lower left ribs, back —     │   3 snap points: peek (96px),
│   is this right?"             │   half (50vh), full (90vh)
│  [ Yes, that's it ] [Adjust]  │
└──────────────────────────────┘
```

The bottom sheet is where ALL questions live. The canvas never gets overlaid modals.
The user can always drag the sheet down to peek height to see the full body again.

---

## 3. Screen-by-screen interaction spec

### 3.1 Landing / start
- One display headline: "Show us where it hurts."
- One sub-line (body, `--slate`): "Point on the body, answer a few taps, and get a
  clear summary you can share with a doctor."
- One primary button: "Start". Below it, tertiary: "Prefer a list? Choose from body
  parts instead." (opens the accessible picker, §3.6).
- Small persistent footer line on every screen, caption size, `--slate`:
  "WhereItHurts helps you describe pain. It does not diagnose or replace medical care."

### 3.2 The 3D canvas (core screen)
- Figure: stylized, androgynous, low-detail human mesh, segmented into ~50 named
  regions. Loads facing front, slowly settling from a 12° rotation to 0° over 800ms
  (skipped under reduced motion).
- **Rotate:** one-finger drag (OrbitControls, horizontal free, vertical clamped
  -30°…+30° polar so the figure can't be flipped upside down).
- **Zoom:** pinch / scroll, clamped 0.8x–3x. Double-tap a region: camera animates to
  center and zoom that region (600ms ease-out).
- **View presets:** Front / Back / Left / Right chips — camera tweens 500ms.
- **Tap mode (default):** tap fires a raycast; hit region glows ember + outline; sheet
  rises to half with: region label + "Is this where it hurts?" → [Yes] [Adjust].
  "Adjust" shows the region's immediate neighbors as tappable chips ("Higher — mid
  ribs", "Lower — hip", "More toward spine") AND keeps the canvas live for re-tapping.
- **Paint mode:** toggle chip on canvas ("Spread area"). Finger-drag paints an ember
  wash across surface triangles under a 24px radius brush. Release → sheet asks the
  same confirm question with the painted patch named by its dominant regions
  ("Across your lower back and right hip — is this right?").
- **Pins:** each confirmed pain becomes a numbered ember pin (①②③) anchored to the
  region centroid. Pins are tappable to review/edit/delete. A pin count chip
  ("2 pains added") sits top-right; tapping it opens the pin list in the sheet.

### 3.3 Descriptor flow (in the bottom sheet, after location confirm)
One question per sheet step. Progress shown as small dots, not a numbered stepper.
Every step has tertiary "Skip". Chips are single-select unless noted.

1. **Depth:** "Where does it feel like it is?" — chips: On the skin / In the muscle /
   Deep, near the bone / Not sure. Answering triggers the localized layer fade (§1).
2. **Quality:** "What does it feel like?" — chips (multi-select, max 2): Sharp /
   Dull ache / Burning / Throbbing / Needle-like / Pressure / Cramping.
3. **Trigger:** "When does it hurt?" — chips: All the time / When I move a certain
   way / In certain positions / When breathing deeply / When touched / Comes and goes.
4. **Intensity:** four large face buttons (Wong-Baker style), each face + functional
   anchor caption:
   - 🙂 Mild — "I notice it, but it doesn't stop me"
   - 😐 Moderate — "Hard to ignore"
   - 😣 Severe — "It limits what I can do"
   - 😫 Very severe — "I can't do normal activities"
   Render faces as simple line-drawn SVGs in `--ink`, selected state fills `--ember-soft`.
   NO 1–10 slider anywhere in the product.
5. **Duration:** "How long has this been going on?" — chips: Just started / A few
   days / Weeks / Months or longer / It comes and goes.
6. **Conditional question(s):** 0–2 extra steps injected here from the Layer 2 rules
   table (PLANNING.md §4) based on region + answers. Same chip pattern. Example:
   travel question renders [Stays in one spot] [It travels] — choosing "travels"
   returns the user to the canvas with the prompt "Tap where it goes", then draws a
   1.5px ember path between origin pin and travel point.
7. **Anything else?** — free text area + (Phase 2) mic button. Placeholder: "Anything
   else about this pain, in your own words — any language is fine."
8. **Loop:** "Add another pain?" [Add another] [I'm done] — "I'm done" goes to §3.4.

### 3.4 Optional profile step (before summary, once per session)
"A few optional details can make your summary more useful." Age band chips, sex chips
(Female / Male / Prefer to self-describe / Skip), and two optional inputs (height,
weight) collapsed behind a tertiary "Add height & weight". Primary: "Create my
summary". Tertiary: "Skip all". Never gates the flow.

### 3.5 Summary screen
- Title (display): "Your pain summary".
- Card 1 — **For your doctor** (JetBrains Mono block): OLDCARTS-ordered structured
  summary per symptom group, in clinical register. Copy button.
- Card 2 — **In your words** (Public Sans): the same content in plain first-person
  language the user can read aloud.
- Card 3 — **Worth mentioning** (only if the LLM flags anything): neutral pointers
  only, e.g. "You marked lower-back pain that travels down the leg — mention the
  traveling to your doctor." Never conditions, never advice.
- Actions: [Share as PDF] [Copy text] — tertiary: "Start over".
- If the user edits, adds, or deletes any pin after a summary was generated, the
  summary screen shows a "Regenerate summary" primary button with the caption
  "Your pains changed since this summary." Regeneration always re-derives from the
  full current record set (see CLAUDE.md: regenerate, never merge).
- A small body thumbnail with the pins renders at the top of the PDF.

### 3.6 Accessible picker (parallel path, always available)
A searchable, hierarchical list (Head & neck → Neck → Front/Back…). Selecting an item
highlights the region on the model behind the sheet — the confirmation loop in reverse.
Fully keyboard navigable, ARIA-labeled. This path must reach every region the 3D path
can reach.

---

## 4. Motion & feel

- Sheet transitions: 300ms ease-out. Camera tweens: 500–600ms ease-in-out.
- Region select: glow fades in over 200ms. Confirmed pin: a single soft 1.2x→1x
  scale settle, no bounce.
- Only the severe/very-severe pins pulse (2.5s cycle, subtle).
- Under `prefers-reduced-motion`: no auto-settle rotation, no pulse, sheet and camera
  transitions become 120ms fades/cuts.
- Haptics (mobile web where supported): light tap on region select, medium on confirm.

## 5. Quality floor

Responsive to 360px width. Visible `--teal` focus rings on all interactive elements.
Touch targets ≥ 44px. Canvas has an aria-live region announcing selections ("Selected:
lower left ribs, back side"). Contrast: all text pairs pass WCAG AA on their
backgrounds (`--slate` on `--porcelain` passes at 14px+).
