/**
 * All user-facing strings live here from day one (CLAUDE.md hard rule).
 * Phase 1 ships English only; Phase 2 adds locales against these keys.
 */

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
    "neck.front": "Front of neck",
    "neck.back": "Back of neck",
    "torso.chest.left.anterior": "Left chest",
    "torso.chest.right.anterior": "Right chest",
    "torso.abdomen.anterior": "Abdomen",
    "torso.back.upper": "Upper back",
    "torso.back.lower": "Lower back",
    "shoulder.left": "Left shoulder",
    "shoulder.right": "Right shoulder",
    "arm.left": "Left arm",
    "arm.right": "Right arm",
    "hand.left": "Left hand",
    "hand.right": "Right hand",
    "hip.left": "Left hip",
    "hip.right": "Right hip",
    "leg.upper.left": "Left thigh",
    "leg.upper.right": "Right thigh",
    "leg.lower.left": "Left lower leg",
    "leg.lower.right": "Right lower leg",
    "foot.left": "Left foot",
    "foot.right": "Right foot",
  },
} as const;

export type RegionLabelKey = keyof typeof en.regions;

export function regionLabel(regionId: string): string {
  const label = (en.regions as Record<string, string>)[regionId];
  return label ?? regionId;
}
