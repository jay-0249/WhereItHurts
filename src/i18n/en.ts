/**
 * All user-facing strings live here from day one (CLAUDE.md hard rule).
 * Phase 1 ships English only; Phase 2 adds locales against these keys.
 */

import type { BodyVariant } from "@/data/regions";

export const en = {
  app: {
    name: "WhereItHurts",
    description:
      "Point on a 3D body, tap a few answers, and get a doctor-ready pain summary in any language. Describe pain when words fail.",
    disclaimer:
      "WhereItHurts helps you describe pain. It does not diagnose or replace medical care.",
  },
  canvas: {
    selected: (label: string) => `Selected: ${label}`,
    pinCount: (n: number) => (n === 1 ? "1 pain added" : `${n} pains added`),
    canvasLabel: "3D body. Rotate with drag, tap where it hurts.",
    changeBody: "Change body",
  },
  bodyChooser: {
    title: "Choose the body that looks most like yours",
    caption: "You can change this anytime.",
    // No gendered words anywhere in user-facing copy (DESIGN.md)
    optionA: "First body option",
    optionB: "Second body option",
  },
  confirm: {
    question: "Is this where it hurts?",
    yes: "Yes, that's it",
    adjust: "Adjust",
    adjustHint: "Tap a nearby area, or tap the body again.",
  },
  pin: {
    title: (n: number) => `Pin ${n}`,
    ariaLabel: (n: number, label: string) => `Pin ${n}: ${label}. Tap to review.`,
    remove: "Remove this pin",
    keep: "Keep",
  },
  direction: {
    higher: "Higher",
    lower: "Lower",
    front: "Toward the front",
    back: "Toward the back",
    left: "More to the left",
    right: "More to the right",
  },
  regions: {
    head: "Head",
    "head.ear.left": "Left ear",
    "head.ear.right": "Right ear",
    "head.eyes": "Around the eyes",
    "head.jaw": "Jaw",
    "neck.front": "Front of neck",
    "neck.back": "Back of neck",
    "torso.chest.left.anterior": "Left chest",
    "torso.chest.right.anterior": "Right chest",
    "torso.chest.breast.left": "Left breast",
    "torso.chest.breast.right": "Right breast",
    "torso.abdomen.upper.anterior": "Upper abdomen",
    "torso.abdomen.lower.anterior": "Lower abdomen",
    "torso.pelvis.anterior": "Pelvic area",
    "torso.groin": "Groin",
    "torso.back.upper": "Upper back",
    "torso.back.lower": "Lower back",
    "shoulder.left": "Left shoulder",
    "shoulder.right": "Right shoulder",
    "arm.upper.left": "Left upper arm",
    "arm.upper.right": "Right upper arm",
    "arm.elbow.left": "Left elbow",
    "arm.elbow.right": "Right elbow",
    "arm.fore.left": "Left forearm",
    "arm.fore.right": "Right forearm",
    "arm.wrist.left": "Left wrist",
    "arm.wrist.right": "Right wrist",
    "hand.left": "Left hand",
    "hand.right": "Right hand",
    "hand.fingers.left": "Left fingers",
    "hand.fingers.right": "Right fingers",
    "hip.left": "Left hip",
    "hip.right": "Right hip",
    "leg.upper.left": "Left thigh",
    "leg.upper.right": "Right thigh",
    "leg.knee.left": "Left knee",
    "leg.knee.right": "Right knee",
    "leg.calf.left": "Left calf",
    "leg.calf.right": "Right calf",
    "leg.shin.left": "Left shin",
    "leg.shin.right": "Right shin",
    "leg.ankle.left": "Left ankle",
    "leg.ankle.right": "Right ankle",
    "foot.left": "Left foot",
    "foot.right": "Right foot",
    "foot.toes.left": "Left toes",
    "foot.toes.right": "Right toes",
  },
} as const;

/**
 * Per-variant region label overrides, checked before the base `regions`
 * table. Pelvic (and future) region labels can resolve differently per
 * body variant here.
 *
 * SPEC-QUESTION: the milestone brief says pelvic region labels resolve per
 * variant, but does not provide the variant-specific label copy. The
 * mechanism is wired; both variants currently fall through to the neutral
 * base label "Pelvic area". What should each variant's label read?
 */
const regionLabelsByVariant: Partial<
  Record<BodyVariant, Partial<Record<string, string>>>
> = {
  "body-a": {},
  "body-b": {},
};

export type RegionLabelKey = keyof typeof en.regions;

export function regionLabel(
  regionId: string,
  variant?: BodyVariant | null,
): string {
  if (variant) {
    const override = regionLabelsByVariant[variant]?.[regionId];
    if (override) return override;
  }
  const label = (en.regions as Record<string, string>)[regionId];
  return label ?? regionId;
}
