# PLANNING.md — Architecture, Data Model, Phases & Roadmap

## 1. Product thesis

Millions of people can point to their pain but cannot describe it — because of language
barriers, unfamiliar anatomy vocabulary, or the inherent difficulty of putting pain into
words. WhereItHurts converts a point-and-tap interaction into a structured, doctor-readable
pain history (OLDCARTS format), bridging the patient–clinician expression gap.

We are explicitly NOT a symptom checker or diagnostic tool. Body-map symptom checkers
exist (WebMD, Ada, K Health). Our wedge is the **expression bridge**: multilingual,
structured, clinician-shaped output the patient can hand over.

## 2. Phases

### Phase 1 — Expression MVP (build now)
- 3D segmented body, tap + paint selection, confirm loop, pins
- Descriptor flow: depth, quality, trigger, intensity (4-bucket faces), duration
- Layer 2 conditional questions (rules table, starts with ~8 rows)
- Free-text "anything else" per pin
- LLM summary at the end: doctor-facing (OLDCARTS) + plain-language + neutral flags;
  stateless regeneration from the full record set whenever records change
- Output: PDF download, copy-to-clipboard text (screenshots work by default)
- **No authentication, no server-side storage, no database.** Client state in Zustand
  persisted to sessionStorage (survives refresh, clears on tab close). The user's
  "record" is the PDF they download. English only.

### Phase 2 — Language bridge + Explore mode
- Full i18n UI (the dictionary exists from day one; this phase adds locales)
- Voice input on free text; input language auto-detected
- Dual-language summary output (user's language + doctor's language side by side)
- Session persistence via shareable link (still no accounts)
- **Explore mode:** separate screen outside the capture flow — whole-body layer
  opacity "peel" (skin/muscle/bone) and a clip-plane sectional slider. Never merged
  into the capture flow.

### Phase 3 — Context & history
- **Optional accounts introduced here, and only here** — the moment identifiable
  health data is stored server-side, the product changes legal categories
  (HIPAA-adjacent perception, GDPR reality for EU users). Accounts are justified only
  when longitudinal tracking genuinely needs history; until then the compliance cost
  buys nothing.
- Optional chatbot for medical history intake (migraine history etc.) — bounded,
  form-filling style, not open conversation; same describe-don't-diagnose contract.
  The chatbot fills structured fields; summaries are generated from those fields,
  never from the chat transcript.
- Built-in PII redaction on all free text before any LLM call (regex + NER pass for
  names, phone numbers, IDs, addresses)
- Longitudinal tracking: "is this the same pain as last time, better or worse?"

### Phase 4 — Clinical integration (long shot, plan-for not build)
- FHIR export: each PainRecord maps to a FHIR `Observation` resource; the summary
  maps to a `DocumentReference`. This is why the schema below stays strict.
- Clinic-side view: doctor scans a QR from the patient's phone, sees the summary +
  interactive body map. Regulatory review required before anything in this phase.

## 3. Data model

The atomic unit is a `PainRecord` (one pin). Capture stays normalized and atomic;
all interpretation happens downstream (LLM at summary time). Never bake
interpretation into stored records.

```ts
interface PainRecord {
  id: string;                    // uuid
  createdAt: string;             // ISO 8601
  location: {
    regionId: string;            // stable ID, e.g. "torso.ribs.lower.left.posterior"
    regionLabel: string;         // resolved from i18n at render time, not stored logic
    mode: "tap" | "paint";
    paintedRegionIds?: string[]; // paint mode: all regions touched, dominant first
  };
  depth?: "skin" | "muscle" | "deep" | "unsure";
  quality?: PainQuality[];       // max 2: sharp | dull | burning | throbbing |
                                 //        needle | pressure | cramping
  trigger?: Trigger;             // constant | movement | position | breathing |
                                 //   touch | intermittent
  intensity?: 1 | 2 | 3 | 4;     // mild | moderate | severe | very severe (buckets)
  duration?: Duration;           // new | days | weeks | months | episodic
  conditional?: {                // answers to Layer 2 questions, keyed by rule id
    [ruleId: string]: string | { travelsToRegionId: string };
  };
  freeText?: string;             // raw user words; PII-redacted before LLM (Phase 3+)
}

interface SessionProfile {       // all optional, collected once
  ageBand?: string;              // "18-29" | "30-44" | "45-59" | "60+"
  sex?: string;
  heightCm?: number;
  weightKg?: number;
}
```

FHIR forward-compatibility notes: `regionId` will map to SNOMED CT body-site codes via
a lookup table (do not embed SNOMED codes in Phase 1; keep the mapping external).
`intensity` buckets map to FHIR severity codings. This is documentation only for now.

## 4. Three-layer question architecture

**Layer 1 — Universal core.** Depth, quality, trigger, intensity, duration. Asked for
every pin. The bar for adding anything here is extremely high: it must carry signal
for EVERY body location. Friction here is paid by 100% of users.

**Layer 2 — Conditional rules table.** `src/data/conditional-questions.ts`. Pure data.
Each rule: `{ id, match: { regionGroups[], qualities?[], triggers?[] }, question,
options[], maxPerPin: 2 }`. Region-groups (not individual regions): head, neck, chest,
abdomen, back-lower, back-upper, joints, limbs, hands-feet, skin-surface.

Seed rules (Phase 1):
1. back-lower | buttock → "Does the pain stay in one spot, or travel anywhere?"
   [Stays put] [It travels → tap where it goes]
2. chest → "Is it worse with deep breaths, or with physical effort?"
   [Deep breaths] [Effort] [Neither]
3. head → "One side or both?" [One side] [Both] + "Does light or sound bother you
   when it hurts?" [Yes] [No]
4. joints (any) → "Any swelling, or stiffness in the morning?" [Swelling]
   [Morning stiffness] [Both] [Neither]
5. abdomen → "Does it change with eating?" [Worse after eating] [Better after eating]
   [No connection]
6. limbs | hands-feet | neck | back-* → "Any numbness or tingling in this area or
   nearby?" [Yes] [No]
7. limbs + quality:needle|burning → travel question (same as rule 1)
8. skin-surface → "Any visible change — redness, rash, swelling?" [Yes] [No]

Cap: max 2 conditional questions per pin, priority = table order. All skippable.

**Layer 3 — LLM interpretation.** Runs once, at summary time, on the full set of
completed PainRecords + optional profile. Responsibilities: group related pins,
render OLDCARTS clinical summary + plain-language version, emit neutral
"worth mentioning" flags. It describes what was captured and flags what is worth
raising with a clinician. It NEVER fills skipped fields with guesses and NEVER names
conditions.

## 5. LLM summary contract

Single server-side call. Input: JSON of PainRecords + profile. Output: strict JSON
`{ groups: [{ recordIds[], clinicalSummary, plainSummary }], flags: string[] }`.
Parse defensively; on malformed output, retry once, then fall back to a deterministic
template rendering of the raw records (the app must never fail to produce a summary).

System prompt requirements (verbatim constraints to include):
- "You convert structured pain records into summaries. You describe; you never
  diagnose. Never name a possible condition, disease, or cause. Never state or imply
  whether the person should or should not seek care, except: if records include
  red-flag combinations (e.g. chest pain worse with exertion; severe headache with
  light sensitivity described as worst-ever; numbness with back pain affecting both
  legs), append the fixed sentence: 'Some of what you marked is the kind of thing
  doctors prefer to hear about promptly.' Do not elaborate beyond that sentence."
- "Group records only when the captured data supports it (adjacent regions, travel
  answers, matching onset). State groupings as 'possibly related — mention together.'"
- "Clinical summary follows OLDCARTS order: Onset, Location, Duration, Character,
  Aggravating/relieving, Radiation, Timing, Severity. Omit skipped fields silently."
- "Write the plain summary in first person, simple sentences, no medical jargon."

Field mapping: duration→Onset/Duration, regionId→Location, quality→Character,
trigger→Aggravating, travel answer→Radiation, trigger 'intermittent'→Timing,
intensity bucket→Severity.

## 6. 3D asset plan

Phase 1 figure: stylized low-poly androgynous human, ~50 named regions, front/back
distinct for torso regions. Options in order of preference:
1. Simplify an open-licensed segmented source: **BodyParts3D** (382 segmented
   anatomical models, CC BY-SA, attribution required to the Database Center for Life
   Science), **Z-Anatomy**, or the university-consortium **Open3DModel** derived from
   both (CC BY-SA). Decimate heavily in Blender into ~50 named material groups,
   export as glTF with per-region mesh nodes.
2. Build from a base humanoid mesh segmented in Blender the same way.
**License obligation (public repo):** CC BY-SA is share-alike — the derived mesh ships
under the same license, with attribution in README and an ASSETS-LICENSE file.
Region segmentation is the critical asset requirement — visual fidelity is secondary.
Muscle/bone layers in Phase 1 are simplified shells (same silhouette, different
material), NOT anatomically individual muscles/bones. Real anatomy layers are Phase 2+
(Explore mode).
**Build order rule:** validate raycast selection, confirm loop, and pins against a
placeholder segmented capsule figure BEFORE investing in the real mesh.

## 6b. Stack & infrastructure decisions (settled)

- **Single framework: Next.js full-stack.** The product is ~95% frontend; the backend
  is one stateless API route. A separate Python/FastAPI service is rejected for
  Phase 1 (second deployment, CORS, duplicated types across a language boundary — all
  to serve one endpoint). Revisit only if Phase 3 adds persistent DB / background
  jobs / heavy processing.
- **Libraries:** @react-three/fiber + @react-three/drei (3D), vaul (bottom sheet),
  Motion (transitions), Zustand + sessionStorage persist (state), Tailwind (tokens).
- **Hosting:** Vercel free/hobby tier — $0 infra for Phase 1. Only variable cost is
  the Anthropic API: one Sonnet call per summary on a small JSON payload (roughly a
  cent or less per summary).
- **Public GitHub repo:** intended from day one. Consequences: API key server-side
  only (Vercel env vars, `.env*` gitignored), CC BY-SA asset attribution, no secrets
  or PII anywhere in the repo. README should include a GIF of the tap → confirm → pin
  interaction.

## 7. Architecture (Phase 1)

```
Next.js app
├── app/                      # routes: / (flow), /summary, api/summary (LLM call)
├── components/
│   ├── canvas/               # R3F scene, BodyModel, Pins, PaintBrush, ViewPresets
│   ├── sheet/                # BottomSheet, question step components
│   └── picker/               # accessible list picker
├── data/
│   ├── regions.ts            # region tree: ids, labels, groups, neighbor graph
│   └── conditional-questions.ts  # Layer 2 rules table
├── store/session.ts          # Zustand: pins, profile, flow state
├── i18n/en.ts                # all strings from day one
└── lib/summary.ts            # LLM call, JSON validation, deterministic fallback
```

Neighbor graph in `regions.ts` powers the "Adjust" chips (each region lists its
adjacent regions for the higher/lower/toward-spine suggestions).

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Scope creep toward diagnosis | Describe-don't-diagnose contract in CLAUDE.md; banned phrasings list; red-flag handling limited to one fixed sentence |
| 3D asset segmentation is hard | It's the first build task; validate region raycasting with a placeholder segmented capsule figure before investing in the real mesh |
| LLM hallucination in summaries | LLM only sees structured records; strict JSON output; deterministic fallback template |
| Users find 3D confusing/slow devices | Accessible list picker is a full parallel path, not a fallback afterthought |
| PII in free text | Phase 1: free text stays client-side except the summary call; Phase 3 adds redaction before any LLM call; no server storage in any early phase |
