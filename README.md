# WhereItHurts

Point on a 3D body, tap a few answers, and get a doctor-ready pain summary in any language. Describe pain when words fail.

**Your pain data never leaves your device except to generate your summary, and we store nothing.**

<!-- Demo GIF goes here: tap region -> confirm -> pin -> summary. Record once the placeholder flow works. -->

## Why this exists

Millions of people can point to their pain but cannot describe it. Language barriers, unfamiliar anatomy vocabulary, or simply the difficulty of putting pain into words leave patients struggling in front of doctors. A person might know exactly where it hurts in their mother tongue and have no words for it in the doctor's language.

WhereItHurts is an expression bridge. You rotate a 3D human figure, tap or paint where it hurts, answer a short set of tappable questions, and get a clean, structured pain summary in the format doctors are trained to read (OLDCARTS: Onset, Location, Duration, Character, Aggravating factors, Radiation, Timing, Severity). Show it, share it, or read it aloud.

## What it is not

This is not a symptom checker and not a diagnostic tool. It never names conditions, never guesses causes, and never tells you whether to see a doctor. It describes what you report and flags what is worth mentioning to a clinician. That constraint is enforced in the LLM contract, the UI copy, and the code review checklist.

## How it works

1. **Point.** Rotate the 3D figure, tap a region (or paint a spread area for diffuse pain). The app confirms in plain words: "Lower left ribs, back side. Is this right?"
2. **Describe.** A few tappable questions: how deep it feels, what it feels like, when it hurts, how much it limits you (face-based scale, no 1 to 10), and how long it has been going on. Everything is skippable. A small rules table adds at most two extra questions when the location warrants it (for example, "does the pain travel anywhere?" for lower back pain).
3. **Repeat.** Add as many pain points as you have. Each becomes a numbered pin.
4. **Summarize.** One LLM call converts your structured records into two versions: a clinical OLDCARTS summary for your doctor and a plain first-person version in your own words. Download as PDF or copy the text.

## Design principles

- **Describe, don't diagnose.** The LLM reads the completed record and organizes it. It never fills skipped answers with guesses and never names conditions.
- **LLM reads, never leads.** Every question shown during capture comes from deterministic UI logic. The LLM is invoked exactly once, at summary time.
- **Skippable everything.** Answering improves the summary. Skipping never blocks the flow.
- **Regenerate, never merge.** Summaries are always re-derived from the full set of atomic pain records. Derived output is never used as input.
- **Privacy by architecture.** No accounts, no database, no server-side storage. State lives in your browser session and clears when the tab closes. The only network call with your data is the summary generation.

## Tech stack

- **Next.js 14+ (App Router), TypeScript strict.** Single framework. The backend is one stateless API route.
- **React Three Fiber + drei** for the 3D figure, raycast region selection, and camera controls.
- **Zustand** with sessionStorage persistence for client state.
- **vaul** (bottom sheet) and **Motion** for the interaction layer. **Tailwind CSS** with a fixed token set.
- **Anthropic API (Claude)** called server-side only, once per summary, with a strict JSON contract and a deterministic fallback template so a summary can never fail to generate.

## Architecture notes

- The body mesh is segmented into ~50 named regions with stable string IDs (for example `torso.ribs.lower.left.posterior`). Selection logic keys on IDs, never mesh indices.
- Questions live in three layers: a universal core asked for every pin, a conditional rules table keyed on region groups (pure data, one file), and LLM interpretation at summary time. Adding a new conditional question is adding one object to an array.
- The pain record schema is designed to map to FHIR Observation resources later without storing any clinical codes today.

## Getting started

```bash
git clone https://github.com/<you>/WhereItHurts.git
cd WhereItHurts
npm install
cp .env.example .env.local   # add your ANTHROPIC_API_KEY (server-side only)
npm run dev
```

The API key is read only in the server route. It is never exposed to the client and never committed.

## Roadmap

- **Phase 1 (current):** the expression MVP described above. English UI, PDF and copy-text output.
- **Phase 2:** full multilingual UI, voice input, dual-language summaries (yours and your doctor's side by side), shareable summary links, and an Explore mode with anatomical layer peeling and sectional views.
- **Phase 3:** optional bounded history intake (structured fields, not open chat), built-in PII redaction before any LLM call, and longitudinal tracking. Accounts arrive only here, when history genuinely needs them.

## Licensing and attribution

Code is MIT licensed. The 3D body meshes are planned to be exported from MakeHuman (CC0 — no attribution required); if open anatomy sources (BodyParts3D and related projects, CC BY-SA) are used as a fallback, the derived asset ships under CC BY-SA with attribution. See ASSETS-LICENSE for details.

## Disclaimer

WhereItHurts helps you describe pain. It does not diagnose, does not provide medical advice, and does not replace medical care. If you are in severe pain or your symptoms worry you, seek medical attention.
