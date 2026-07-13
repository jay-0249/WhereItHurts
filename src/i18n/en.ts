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
    // lowercase clarifier appended to sided region labels: "Left chest — your left"
    sideClarifier: (side: "left" | "right") =>
      side === "left" ? "your left" : "your right",
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
    // head & face
    "head.crown": "Top of head",
    "head.back": "Back of head",
    "head.forehead": "Forehead",
    "head.temple.left": "Left temple",
    "head.temple.right": "Right temple",
    "head.eye.left": "Around left eye",
    "head.eye.right": "Around right eye",
    "head.ear.left": "Left ear",
    "head.ear.right": "Right ear",
    "head.cheek.left": "Left cheek",
    "head.cheek.right": "Right cheek",
    "head.nose": "Nose area",
    "head.mouth": "Mouth & chin",
    "head.jaw.left": "Left jaw",
    "head.jaw.right": "Right jaw",
    // neck
    "neck.throat": "Throat (front of neck)",
    "neck.side.left": "Left side of neck",
    "neck.side.right": "Right side of neck",
    "neck.nape": "Back of neck",
    // shoulder girdle
    "shoulder.collarbone.left": "Left collarbone area",
    "shoulder.collarbone.right": "Right collarbone area",
    "shoulder.trapezius.left": "Top of left shoulder",
    "shoulder.trapezius.right": "Top of right shoulder",
    "shoulder.cap.left": "Left shoulder",
    "shoulder.cap.right": "Right shoulder",
    // chest
    "chest.sternum": "Breastbone (center of chest)",
    "chest.pec.left": "Left chest",
    "chest.pec.right": "Right chest",
    "chest.breast.left": "Left breast",
    "chest.breast.right": "Right breast",
    "chest.ribs.lower.left": "Left lower ribs (front)",
    "chest.ribs.lower.right": "Right lower ribs (front)",
    // abdomen (clinical 9-zone grid)
    "abdomen.upper.right": "Upper right belly",
    "abdomen.upper.center": "Upper middle belly (stomach pit)",
    "abdomen.upper.left": "Upper left belly",
    "abdomen.flank.right": "Right side of waist",
    "abdomen.navel": "Around the navel",
    "abdomen.flank.left": "Left side of waist",
    "abdomen.lower.right": "Lower right belly",
    "abdomen.lower.center": "Lower middle belly",
    "abdomen.lower.left": "Lower left belly",
    // pelvis & groin
    "pelvis.pubic": "Pubic area",
    "pelvis.groin.left": "Left groin crease",
    "pelvis.groin.right": "Right groin crease",
    // back
    "back.spine.upper": "Between the shoulder blades",
    "back.scapula.left": "Left shoulder blade",
    "back.scapula.right": "Right shoulder blade",
    "back.mid.left": "Left mid-back",
    "back.mid.right": "Right mid-back",
    "back.spine.mid": "Mid spine",
    "back.spine.lumbar": "Lower spine",
    "back.lower.left": "Left lower back",
    "back.lower.right": "Right lower back",
    "back.sacrum": "Base of the spine (sacrum)",
    "back.tailbone": "Tailbone",
    "back.buttock.left": "Left buttock",
    "back.buttock.right": "Right buttock",
    // hips
    "hip.side.left": "Left hip (side)",
    "hip.side.right": "Right hip (side)",
    // arms
    "arm.armpit.left": "Left armpit",
    "arm.armpit.right": "Right armpit",
    "arm.biceps.left": "Front of left upper arm",
    "arm.biceps.right": "Front of right upper arm",
    "arm.triceps.left": "Back of left upper arm",
    "arm.triceps.right": "Back of right upper arm",
    "arm.elbow.crease.left": "Left elbow crease",
    "arm.elbow.crease.right": "Right elbow crease",
    "arm.elbow.point.left": "Left elbow",
    "arm.elbow.point.right": "Right elbow",
    "arm.forearm.inner.left": "Inner left forearm",
    "arm.forearm.inner.right": "Inner right forearm",
    "arm.forearm.outer.left": "Outer left forearm",
    "arm.forearm.outer.right": "Outer right forearm",
    "arm.wrist.left": "Left wrist",
    "arm.wrist.right": "Right wrist",
    "hand.palm.left": "Left palm",
    "hand.palm.right": "Right palm",
    "hand.back.left": "Back of left hand",
    "hand.back.right": "Back of right hand",
    "hand.thumb.left": "Left thumb side",
    "hand.thumb.right": "Right thumb side",
    "hand.fingers.left": "Left fingers",
    "hand.fingers.right": "Right fingers",
    // legs
    "leg.thigh.front.left": "Front of left thigh",
    "leg.thigh.front.right": "Front of right thigh",
    "leg.thigh.back.left": "Back of left thigh (hamstring)",
    "leg.thigh.back.right": "Back of right thigh (hamstring)",
    "leg.thigh.inner.left": "Inner left thigh",
    "leg.thigh.inner.right": "Inner right thigh",
    "leg.thigh.outer.left": "Outer left thigh",
    "leg.thigh.outer.right": "Outer right thigh",
    "leg.knee.cap.left": "Left kneecap",
    "leg.knee.cap.right": "Right kneecap",
    "leg.knee.back.left": "Back of left knee",
    "leg.knee.back.right": "Back of right knee",
    "leg.shin.left": "Left shin",
    "leg.shin.right": "Right shin",
    "leg.calf.left": "Left calf",
    "leg.calf.right": "Right calf",
    "leg.ankle.inner.left": "Inner left ankle",
    "leg.ankle.inner.right": "Inner right ankle",
    "leg.ankle.outer.left": "Outer left ankle",
    "leg.ankle.outer.right": "Outer right ankle",
    "foot.heel.left": "Left heel",
    "foot.heel.right": "Right heel",
    "foot.sole.left": "Sole of left foot",
    "foot.sole.right": "Sole of right foot",
    "foot.top.left": "Top of left foot",
    "foot.top.right": "Top of right foot",
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
