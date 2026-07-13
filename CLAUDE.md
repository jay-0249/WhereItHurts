# CLAUDE.md — Project Context & Rules

## What this project is

**Product name:** WhereItHurts (one word in code and repo; "WhereItHurts" in UI copy).
**Repo description:** Point on a 3D body, tap a few answers, and get a doctor-ready
pain summary in any language. Describe pain when words fail.
Use this name consistently in UI copy, page titles, metadata, and the PDF header.
Internal type names (e.g. the PainRecord interface) are unaffected.

**WhereItHurts** is a web application that helps a person describe physical pain
to a doctor when they cannot find the words — because of language barriers, unfamiliarity
with anatomy, or the inherent difficulty of describing pain.

The user rotates a 3D human model, taps or paints where it hurts, answers a short set of
tappable questions, and receives a clean, structured, doctor-readable summary (OLDCARTS
format) they can show, share, or read aloud — in their own language and the doctor's.

**This application is NOT a diagnostic tool. It never diagnoses, never names conditions,
never tells a user whether or not to see a doctor. It describes what the user reports and
flags what is worth mentioning to a clinician. This constraint is absolute and applies to
every LLM prompt, every UI string, and every summary output.**

## Core product principles (apply to every feature decision)

1. **Describe, don't diagnose.** The LLM reads the completed record and organizes it.
   It never guesses causes, never fills gaps with inference, never names diseases.
2. **Skippable everything.** Answering questions improves the summary; skipping never
   blocks the flow. Only location + one quality descriptor are required per pain pin.
3. **LLM reads, never leads.** All questions shown to the user come from deterministic
   UI logic (the Layer 2 rules table). The LLM is only invoked at summary time, on the
   completed structured record. No LLM-driven conversational intake in Phase 1.
4. **Universal core → conditional table → LLM interpretation.** See PLANNING.md
   "Three-layer question architecture." New question requirements go into the layer
   determined by: relevant everywhere → Layer 1 (very high bar); relevant to specific
   region-groups → Layer 2 table row; interpretive → Layer 3 (LLM summary prompt).
5. **Premium, calm, simple.** No clutter. Optional depth is revealed progressively,
   never front-loaded. See DESIGN.md for the exact visual system — follow it precisely.

## Tech stack (Phase 1)

- **Framework:** Next.js 14+ (App Router), TypeScript strict mode. Single framework,
  full-stack — the "backend" is one API route. Do NOT introduce a separate Python
  service, database, or Redis in Phase 1; the server holds zero state.
- **3D:** React Three Fiber (@react-three/fiber) + @react-three/drei (OrbitControls,
  Outlines, Html for pin labels, Bounds for zoom-to-region, Preload).
- **UI layer:** vaul for the bottom sheet (snap points: peek/half/full),
  Motion (framer-motion successor) for sheet/chip transitions.
- **State:** Zustand (single store: pins[], profile, activeFlow, uiState), persisted
  to **sessionStorage** via Zustand persist middleware — NOT localStorage. Rationale:
  pins survive an accidental refresh, but health data clears when the tab closes
  (right default for a possibly shared device).
- **Styling:** Tailwind CSS with the design tokens defined in DESIGN.md — do not invent
  new colors or fonts; consume tokens only
- **LLM:** Anthropic API (claude-sonnet-4-6), called ONLY from a server route, ONLY at
  summary generation time. System prompt must include the describe-don't-diagnose
  constraint verbatim (see PLANNING.md "LLM summary contract").
- **No database, no auth, no server-side storage in Phase 1.** The API route is
  stateless: records in → summary out → forget. No accounts, no PII stored
  server-side. Summary sharing = client-generated PDF or copy-to-clipboard text.
  Privacy story in one sentence: "your pain data never leaves your device except to
  generate your summary, and we store nothing."

## R3F performance rules (non-negotiable — smoothness is a core requirement)

- Use `useFrame` for animation, never `useEffect` + requestAnimationFrame.
- Per-frame updates (camera tweens, glow intensity) mutate Three objects via refs;
  never call setState per frame.
- Memoize geometries and materials with `useMemo`; share materials across regions.
- `<Preload all />` so the figure never pops in half-loaded.
- Keep a perf monitor mounted in dev builds; watch draw calls as regions are added.
  (`r3f-perf` was the original choice but currently breaks Turbopack dev in Next 16 —
  its bundled `.woff.mjs` asset fails chunk generation. Using drei's `StatsGl` until
  r3f-perf supports the stack; revisit when it does.)
- Clamp devicePixelRatio to max 2. Target 60fps on a mid-range phone; every visual
  feature must justify its frame cost.

## Security & repo hygiene (this is a PUBLIC GitHub repo)

- The Anthropic API key exists ONLY as a server env var (Vercel env settings). It must
  never appear in client code, committed files, or NEXT_PUBLIC_ variables.
  `.env*` in `.gitignore` from the first commit.
- No third-party scripts or analytics SDKs in Phase 1 (browser-side data safety).
- Never render free text with `dangerouslySetInnerHTML`; rely on React's default
  escaping.
- 3D asset licensing: if the body mesh derives from BodyParts3D / Z-Anatomy /
  Open3DModel, those are CC BY-SA (share-alike) — the derived asset ships under the
  same license with attribution in the README and an ASSETS-LICENSE file.

## Summary generation rule: regenerate, never merge

Every summary call sends the FULL current PainRecords array. There is no
"summarize the previous summaries" path — derived output is never input. If records
change after a generation, the UI shows "Regenerate summary" and the next call
re-derives from the atomic records. This prevents compounding drift and keeps every
summary as accurate as the first.

## Hard rules for code generation

- Every 3D region must have a stable string ID (e.g. `torso.ribs.lower.left.posterior`)
  and a human-readable label in the i18n dictionary. Selection logic keys on IDs, never
  on mesh names or indices.
- The Layer 2 rules table lives in one file: `src/data/conditional-questions.ts`.
  It is data (array of rule objects), not code. Adding a rule = adding an object.
- Pain records conform to the `PainRecord` schema in PLANNING.md exactly. Do not add
  fields ad hoc; extend the schema first.
- All user-facing strings go through the i18n dictionary from day one, even though
  Phase 1 ships English-only. Multilingual is Phase 2 and retrofitting i18n is expensive.
- Accessibility floor: the dropdown/body-list picker must be fully keyboard navigable
  and screen-reader labeled. The 3D canvas is enhancement, not the only path.
- Respect `prefers-reduced-motion`: disable camera auto-orbit and glow pulse animations.
- No medical advice strings anywhere. Banned phrasings in UI copy and LLM output:
  "you may have," "this could be [condition]," "you don't need a doctor,"
  "this is probably." Allowed: "worth mentioning to your doctor," "commonly asked
  about by clinicians."

## What to do when the spec is ambiguous

Do not assume. Check DESIGN.md and PLANNING.md first. If still ambiguous, choose the
option that (a) keeps the flow skippable, (b) adds no LLM involvement during capture,
and (c) reduces on-screen elements — then leave a `// SPEC-QUESTION:` comment.

## File map

- `CLAUDE.md` — this file. Context and rules.
- `DESIGN.md` — visual system, 3D interaction spec, screen-by-screen UX. Exact tokens.
- `PLANNING.md` — phases, architecture, data model, question layers, LLM contract,
  future roadmap (multilingual, FHIR, history chatbot).
- `REGIONS.md` — the body-region system specification: taxonomy (~111 zones),
  the baked per-vertex labeling pipeline, the frozen rule vocabulary, the
  pick rule, and the add-a-zone recipe. Region work follows this document
  mechanically; when code and REGIONS.md disagree, REGIONS.md wins.
