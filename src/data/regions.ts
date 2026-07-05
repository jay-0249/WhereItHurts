/**
 * Region tree for the segmented body (PLANNING.md §7).
 *
 * IDs are stable, hierarchical strings — selection logic keys on these,
 * never on mesh names or indices (CLAUDE.md hard rule). Labels resolve
 * through the i18n dictionary. Front and back are distinct regions for
 * the torso. ~20 starter regions; the real mesh grows this to ~50.
 */

export const REGION_IDS = [
  "head",
  "neck.front",
  "neck.back",
  "torso.chest.left.anterior",
  "torso.chest.right.anterior",
  "torso.abdomen.anterior",
  "torso.back.upper",
  "torso.back.lower",
  "shoulder.left",
  "shoulder.right",
  "arm.left",
  "arm.right",
  "hand.left",
  "hand.right",
  "hip.left",
  "hip.right",
  "leg.upper.left",
  "leg.upper.right",
  "leg.lower.left",
  "leg.lower.right",
  "foot.left",
  "foot.right",
] as const;

export type RegionId = (typeof REGION_IDS)[number];

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
  "neck.front": "neck",
  "neck.back": "neck",
  "torso.chest.left.anterior": "chest",
  "torso.chest.right.anterior": "chest",
  "torso.abdomen.anterior": "abdomen",
  "torso.back.upper": "back-upper",
  "torso.back.lower": "back-lower",
  "shoulder.left": "joints",
  "shoulder.right": "joints",
  "arm.left": "limbs",
  "arm.right": "limbs",
  "hand.left": "hands-feet",
  "hand.right": "hands-feet",
  "hip.left": "joints",
  "hip.right": "joints",
  "leg.upper.left": "limbs",
  "leg.upper.right": "limbs",
  "leg.lower.left": "limbs",
  "leg.lower.right": "limbs",
  "foot.left": "hands-feet",
  "foot.right": "hands-feet",
};

/**
 * Adjacency, declared once per pair; the exported NEIGHBORS map is built
 * symmetrically so the graph can never drift one-sided.
 */
const EDGES: ReadonlyArray<readonly [RegionId, RegionId]> = [
  ["head", "neck.front"],
  ["head", "neck.back"],
  ["neck.front", "neck.back"],
  ["neck.front", "torso.chest.left.anterior"],
  ["neck.front", "torso.chest.right.anterior"],
  ["neck.back", "torso.back.upper"],
  ["torso.chest.left.anterior", "torso.chest.right.anterior"],
  ["torso.chest.left.anterior", "torso.abdomen.anterior"],
  ["torso.chest.right.anterior", "torso.abdomen.anterior"],
  ["torso.chest.left.anterior", "shoulder.left"],
  ["torso.chest.right.anterior", "shoulder.right"],
  ["torso.back.upper", "shoulder.left"],
  ["torso.back.upper", "shoulder.right"],
  ["torso.back.upper", "torso.back.lower"],
  ["torso.back.lower", "torso.abdomen.anterior"],
  ["torso.back.lower", "hip.left"],
  ["torso.back.lower", "hip.right"],
  ["torso.abdomen.anterior", "hip.left"],
  ["torso.abdomen.anterior", "hip.right"],
  ["shoulder.left", "arm.left"],
  ["shoulder.right", "arm.right"],
  ["arm.left", "hand.left"],
  ["arm.right", "hand.right"],
  ["hip.left", "hip.right"],
  ["hip.left", "leg.upper.left"],
  ["hip.right", "leg.upper.right"],
  ["leg.upper.left", "leg.lower.left"],
  ["leg.upper.right", "leg.lower.right"],
  ["leg.lower.left", "foot.left"],
  ["leg.lower.right", "foot.right"],
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

export function isRegionId(id: string): id is RegionId {
  return (REGION_IDS as readonly string[]).includes(id);
}
