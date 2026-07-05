/**
 * Region tree for the segmented body (PLANNING.md §7).
 *
 * IDs are stable, hierarchical strings — selection logic keys on these,
 * never on mesh names or indices (CLAUDE.md hard rule). Labels resolve
 * through the i18n dictionary. Front and back are distinct regions for
 * the torso; calf (back) and shin (front) are distinct for the lower leg.
 * Fingers and toes are single regions per side, not per digit.
 */

export const REGION_IDS = [
  // head & neck
  "head",
  "head.ear.left",
  "head.ear.right",
  "head.eyes",
  "head.jaw",
  "neck.front",
  "neck.back",
  // torso, front
  "torso.chest.left.anterior",
  "torso.chest.right.anterior",
  "torso.chest.breast.left",
  "torso.chest.breast.right",
  "torso.abdomen.upper.anterior",
  "torso.abdomen.lower.anterior",
  "torso.pelvis.anterior",
  "torso.groin",
  // torso, back
  "torso.back.upper",
  "torso.back.lower",
  // arms
  "shoulder.left",
  "shoulder.right",
  "arm.upper.left",
  "arm.upper.right",
  "arm.elbow.left",
  "arm.elbow.right",
  "arm.fore.left",
  "arm.fore.right",
  "arm.wrist.left",
  "arm.wrist.right",
  "hand.left",
  "hand.right",
  "hand.fingers.left",
  "hand.fingers.right",
  // hips & legs
  "hip.left",
  "hip.right",
  "leg.upper.left",
  "leg.upper.right",
  "leg.knee.left",
  "leg.knee.right",
  "leg.calf.left",
  "leg.calf.right",
  "leg.shin.left",
  "leg.shin.right",
  "leg.ankle.left",
  "leg.ankle.right",
  "foot.left",
  "foot.right",
  "foot.toes.left",
  "foot.toes.right",
] as const;

export type RegionId = (typeof REGION_IDS)[number];

/**
 * Body build variants. Internal keys only — user-facing copy never uses
 * gendered words (see DESIGN.md). body-a = broader-shouldered build,
 * body-b = wider-hipped build with breast regions.
 */
export const BODY_VARIANT_IDS = ["body-a", "body-b"] as const;
export type BodyVariant = (typeof BODY_VARIANT_IDS)[number];

/** Region groups exactly as named by the Layer 2 rules table (PLANNING.md §4). */
export type RegionGroup =
  | "head"
  | "neck"
  | "chest"
  | "abdomen"
  | "back-lower"
  | "back-upper"
  | "joints"
  | "limbs"
  | "hands-feet"
  | "skin-surface";

export const REGION_GROUPS: Record<RegionId, RegionGroup> = {
  head: "head",
  "head.ear.left": "head",
  "head.ear.right": "head",
  "head.eyes": "head",
  "head.jaw": "head",
  "neck.front": "neck",
  "neck.back": "neck",
  "torso.chest.left.anterior": "chest",
  "torso.chest.right.anterior": "chest",
  "torso.chest.breast.left": "chest",
  "torso.chest.breast.right": "chest",
  "torso.abdomen.upper.anterior": "abdomen",
  "torso.abdomen.lower.anterior": "abdomen",
  "torso.pelvis.anterior": "abdomen",
  "torso.groin": "abdomen",
  "torso.back.upper": "back-upper",
  "torso.back.lower": "back-lower",
  "shoulder.left": "joints",
  "shoulder.right": "joints",
  "arm.upper.left": "limbs",
  "arm.upper.right": "limbs",
  "arm.elbow.left": "joints",
  "arm.elbow.right": "joints",
  "arm.fore.left": "limbs",
  "arm.fore.right": "limbs",
  "arm.wrist.left": "joints",
  "arm.wrist.right": "joints",
  "hand.left": "hands-feet",
  "hand.right": "hands-feet",
  "hand.fingers.left": "hands-feet",
  "hand.fingers.right": "hands-feet",
  "hip.left": "joints",
  "hip.right": "joints",
  "leg.upper.left": "limbs",
  "leg.upper.right": "limbs",
  "leg.knee.left": "joints",
  "leg.knee.right": "joints",
  "leg.calf.left": "limbs",
  "leg.calf.right": "limbs",
  "leg.shin.left": "limbs",
  "leg.shin.right": "limbs",
  "leg.ankle.left": "joints",
  "leg.ankle.right": "joints",
  "foot.left": "hands-feet",
  "foot.right": "hands-feet",
  "foot.toes.left": "hands-feet",
  "foot.toes.right": "hands-feet",
};

/**
 * Regions available only on specific body variants. Absent = available on
 * all variants.
 */
export const REGION_VARIANTS: Partial<
  Record<RegionId, readonly BodyVariant[]>
> = {
  "torso.chest.breast.left": ["body-b"],
  "torso.chest.breast.right": ["body-b"],
};

export function regionAvailableFor(id: RegionId, variant: BodyVariant): boolean {
  const restriction = REGION_VARIANTS[id];
  return !restriction || restriction.includes(variant);
}

export function regionsForVariant(variant: BodyVariant): RegionId[] {
  return REGION_IDS.filter((id) => regionAvailableFor(id, variant));
}

/**
 * Adjacency, declared once per pair; the exported NEIGHBORS map is built
 * symmetrically so the graph can never drift one-sided.
 */
const EDGES: ReadonlyArray<readonly [RegionId, RegionId]> = [
  // head
  ["head", "neck.front"],
  ["head", "neck.back"],
  ["head", "head.ear.left"],
  ["head", "head.ear.right"],
  ["head", "head.eyes"],
  ["head", "head.jaw"],
  ["head.eyes", "head.jaw"],
  ["head.jaw", "head.ear.left"],
  ["head.jaw", "head.ear.right"],
  ["head.jaw", "neck.front"],
  // neck
  ["neck.front", "neck.back"],
  ["neck.front", "torso.chest.left.anterior"],
  ["neck.front", "torso.chest.right.anterior"],
  ["neck.back", "torso.back.upper"],
  // chest
  ["torso.chest.left.anterior", "torso.chest.right.anterior"],
  ["torso.chest.left.anterior", "torso.abdomen.upper.anterior"],
  ["torso.chest.right.anterior", "torso.abdomen.upper.anterior"],
  ["torso.chest.left.anterior", "shoulder.left"],
  ["torso.chest.right.anterior", "shoulder.right"],
  ["torso.chest.breast.left", "torso.chest.left.anterior"],
  ["torso.chest.breast.right", "torso.chest.right.anterior"],
  ["torso.chest.breast.left", "torso.chest.breast.right"],
  ["torso.chest.breast.left", "torso.abdomen.upper.anterior"],
  ["torso.chest.breast.right", "torso.abdomen.upper.anterior"],
  // abdomen & pelvis
  ["torso.abdomen.upper.anterior", "torso.abdomen.lower.anterior"],
  ["torso.abdomen.lower.anterior", "torso.pelvis.anterior"],
  ["torso.abdomen.lower.anterior", "hip.left"],
  ["torso.abdomen.lower.anterior", "hip.right"],
  ["torso.pelvis.anterior", "torso.groin"],
  ["torso.pelvis.anterior", "hip.left"],
  ["torso.pelvis.anterior", "hip.right"],
  ["torso.groin", "hip.left"],
  ["torso.groin", "hip.right"],
  ["torso.groin", "leg.upper.left"],
  ["torso.groin", "leg.upper.right"],
  // back
  ["torso.back.upper", "shoulder.left"],
  ["torso.back.upper", "shoulder.right"],
  ["torso.back.upper", "torso.back.lower"],
  ["torso.back.lower", "torso.abdomen.upper.anterior"],
  ["torso.back.lower", "torso.abdomen.lower.anterior"],
  ["torso.back.lower", "hip.left"],
  ["torso.back.lower", "hip.right"],
  // arm chains
  ["shoulder.left", "arm.upper.left"],
  ["shoulder.right", "arm.upper.right"],
  ["arm.upper.left", "arm.elbow.left"],
  ["arm.upper.right", "arm.elbow.right"],
  ["arm.elbow.left", "arm.fore.left"],
  ["arm.elbow.right", "arm.fore.right"],
  ["arm.fore.left", "arm.wrist.left"],
  ["arm.fore.right", "arm.wrist.right"],
  ["arm.wrist.left", "hand.left"],
  ["arm.wrist.right", "hand.right"],
  ["hand.left", "hand.fingers.left"],
  ["hand.right", "hand.fingers.right"],
  // hips & leg chains
  ["hip.left", "hip.right"],
  ["hip.left", "leg.upper.left"],
  ["hip.right", "leg.upper.right"],
  ["leg.upper.left", "leg.knee.left"],
  ["leg.upper.right", "leg.knee.right"],
  ["leg.knee.left", "leg.calf.left"],
  ["leg.knee.right", "leg.calf.right"],
  ["leg.knee.left", "leg.shin.left"],
  ["leg.knee.right", "leg.shin.right"],
  ["leg.calf.left", "leg.shin.left"],
  ["leg.calf.right", "leg.shin.right"],
  ["leg.calf.left", "leg.ankle.left"],
  ["leg.calf.right", "leg.ankle.right"],
  ["leg.shin.left", "leg.ankle.left"],
  ["leg.shin.right", "leg.ankle.right"],
  ["leg.ankle.left", "foot.left"],
  ["leg.ankle.right", "foot.right"],
  ["foot.left", "foot.toes.left"],
  ["foot.right", "foot.toes.right"],
];

export const NEIGHBORS: Record<RegionId, RegionId[]> = (() => {
  const map = Object.fromEntries(
    REGION_IDS.map((id) => [id, [] as RegionId[]]),
  ) as Record<RegionId, RegionId[]>;
  for (const [a, b] of EDGES) {
    map[a].push(b);
    map[b].push(a);
  }
  return map;
})();

/** Neighbors filtered to regions that exist on the given variant. */
export function neighborsForVariant(
  id: RegionId,
  variant: BodyVariant,
): RegionId[] {
  return NEIGHBORS[id].filter((n) => regionAvailableFor(n, variant));
}

export function isRegionId(id: string): id is RegionId {
  return (REGION_IDS as readonly string[]).includes(id);
}
