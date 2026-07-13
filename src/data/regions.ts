/**
 * Doctor-grade region taxonomy (~111 zones) — see REGIONS.md for the full
 * specification of IDs, labeling rules, and change policy.
 *
 * IDs are stable, hierarchical, APPEND-ONLY strings; selection logic keys
 * on these, never on mesh names or indices (CLAUDE.md hard rule). Sides
 * are encoded as `.left` / `.right` suffixes (the patient's own side —
 * regionSide() depends on this convention). Labels resolve through the
 * i18n dictionary. Renames go through DEPRECATED_REGIONS, never in place.
 *
 * Region membership of each mesh vertex is baked at build time by
 * scripts/bake-labels.mjs from the rules in src/data/region-rules.mjs;
 * the neighbor graph, pin anchors, and per-region bounds are derived
 * artifacts in src/data/region-manifest/.
 */

import {
  ADJACENCY_OVERRIDES as OVERRIDES,
  REGION_IDS as IDS,
  REGION_VARIANTS as VARIANT_GATES,
} from "./region-ids.mjs";

/**
 * Canonical id list lives in region-ids.mjs (shared with the Node bake
 * scripts); the .d.mts declares the literal tuple so RegionId stays a
 * precise union here.
 */
export const REGION_IDS = IDS;
export type RegionId = (typeof IDS)[number];

/**
 * Body build variants. Internal keys only — user-facing copy never uses
 * gendered words (see DESIGN.md).
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
  "head.crown": "head",
  "head.back": "head",
  "head.forehead": "head",
  "head.temple.left": "head",
  "head.temple.right": "head",
  "head.eye.left": "head",
  "head.eye.right": "head",
  "head.ear.left": "head",
  "head.ear.right": "head",
  "head.cheek.left": "head",
  "head.cheek.right": "head",
  "head.nose": "head",
  "head.mouth": "head",
  "head.jaw.left": "head",
  "head.jaw.right": "head",
  "neck.throat": "neck",
  "neck.side.left": "neck",
  "neck.side.right": "neck",
  "neck.nape": "neck",
  "shoulder.collarbone.left": "chest",
  "shoulder.collarbone.right": "chest",
  "shoulder.trapezius.left": "back-upper",
  "shoulder.trapezius.right": "back-upper",
  "shoulder.cap.left": "joints",
  "shoulder.cap.right": "joints",
  "chest.sternum": "chest",
  "chest.pec.left": "chest",
  "chest.pec.right": "chest",
  "chest.breast.left": "chest",
  "chest.breast.right": "chest",
  "chest.ribs.lower.left": "chest",
  "chest.ribs.lower.right": "chest",
  "abdomen.upper.right": "abdomen",
  "abdomen.upper.center": "abdomen",
  "abdomen.upper.left": "abdomen",
  "abdomen.flank.right": "abdomen",
  "abdomen.navel": "abdomen",
  "abdomen.flank.left": "abdomen",
  "abdomen.lower.right": "abdomen",
  "abdomen.lower.center": "abdomen",
  "abdomen.lower.left": "abdomen",
  "pelvis.pubic": "abdomen",
  "pelvis.groin.left": "abdomen",
  "pelvis.groin.right": "abdomen",
  "back.spine.upper": "back-upper",
  "back.scapula.left": "back-upper",
  "back.scapula.right": "back-upper",
  "back.mid.left": "back-upper",
  "back.mid.right": "back-upper",
  "back.spine.mid": "back-upper",
  "back.spine.lumbar": "back-lower",
  "back.lower.left": "back-lower",
  "back.lower.right": "back-lower",
  "back.sacrum": "back-lower",
  "back.tailbone": "back-lower",
  "back.buttock.left": "back-lower",
  "back.buttock.right": "back-lower",
  "hip.side.left": "joints",
  "hip.side.right": "joints",
  "arm.armpit.left": "limbs",
  "arm.armpit.right": "limbs",
  "arm.biceps.left": "limbs",
  "arm.biceps.right": "limbs",
  "arm.triceps.left": "limbs",
  "arm.triceps.right": "limbs",
  "arm.elbow.crease.left": "joints",
  "arm.elbow.crease.right": "joints",
  "arm.elbow.point.left": "joints",
  "arm.elbow.point.right": "joints",
  "arm.forearm.inner.left": "limbs",
  "arm.forearm.inner.right": "limbs",
  "arm.forearm.outer.left": "limbs",
  "arm.forearm.outer.right": "limbs",
  "arm.wrist.left": "joints",
  "arm.wrist.right": "joints",
  "hand.palm.left": "hands-feet",
  "hand.palm.right": "hands-feet",
  "hand.back.left": "hands-feet",
  "hand.back.right": "hands-feet",
  "hand.thumb.left": "hands-feet",
  "hand.thumb.right": "hands-feet",
  "hand.fingers.left": "hands-feet",
  "hand.fingers.right": "hands-feet",
  "leg.thigh.front.left": "limbs",
  "leg.thigh.front.right": "limbs",
  "leg.thigh.back.left": "limbs",
  "leg.thigh.back.right": "limbs",
  "leg.thigh.inner.left": "limbs",
  "leg.thigh.inner.right": "limbs",
  "leg.thigh.outer.left": "limbs",
  "leg.thigh.outer.right": "limbs",
  "leg.knee.cap.left": "joints",
  "leg.knee.cap.right": "joints",
  "leg.knee.back.left": "joints",
  "leg.knee.back.right": "joints",
  "leg.shin.left": "limbs",
  "leg.shin.right": "limbs",
  "leg.calf.left": "limbs",
  "leg.calf.right": "limbs",
  "leg.ankle.inner.left": "joints",
  "leg.ankle.inner.right": "joints",
  "leg.ankle.outer.left": "joints",
  "leg.ankle.outer.right": "joints",
  "foot.heel.left": "hands-feet",
  "foot.heel.right": "hands-feet",
  "foot.sole.left": "hands-feet",
  "foot.sole.right": "hands-feet",
  "foot.top.left": "hands-feet",
  "foot.top.right": "hands-feet",
  "foot.toes.left": "hands-feet",
  "foot.toes.right": "hands-feet",
};

/** Picker sections (accessible list path, DESIGN.md §3.6). */
export type RegionArea =
  | "head"
  | "neck"
  | "shoulders"
  | "chest"
  | "belly"
  | "pelvis"
  | "back"
  | "hips"
  | "arms"
  | "legs";

export function regionArea(id: RegionId): RegionArea {
  if (id.startsWith("head.")) return "head";
  if (id.startsWith("neck.")) return "neck";
  if (id.startsWith("shoulder.")) return "shoulders";
  if (id.startsWith("chest.")) return "chest";
  if (id.startsWith("abdomen.")) return "belly";
  if (id.startsWith("pelvis.")) return "pelvis";
  if (id.startsWith("back.")) return "back";
  if (id.startsWith("hip.")) return "hips";
  if (id.startsWith("arm.") || id.startsWith("hand.")) return "arms";
  return "legs";
}

/**
 * Regions available only on specific body variants. Absent = available on
 * all variants. On variants without a region, its labeling rule is absent
 * and the surface falls through to the next rule (see REGIONS.md §9).
 */
export const REGION_VARIANTS: Partial<
  Record<RegionId, readonly BodyVariant[]>
> = VARIANT_GATES;

export function regionAvailableFor(id: RegionId, variant: BodyVariant): boolean {
  const restriction = REGION_VARIANTS[id];
  return !restriction || restriction.includes(variant);
}

export function regionsForVariant(variant: BodyVariant): RegionId[] {
  return REGION_IDS.filter((id) => regionAvailableFor(id, variant));
}

/**
 * Adjacency is auto-derived at bake time (regions sharing >= 3 mesh edges).
 * These overrides add clinically useful non-touching neighbor chips and
 * remove mesh-artifact adjacencies. Pairs are symmetric.
 */
export const ADJACENCY_OVERRIDES = OVERRIDES as {
  add: ReadonlyArray<readonly [RegionId, RegionId]>;
  remove: ReadonlyArray<readonly [RegionId, RegionId]>;
};

/**
 * Old (pre-taxonomy) region ids -> nearest current id. Used by the store
 * migration for pins persisted in an in-flight session, and kept as the
 * historical record of renames (REGIONS.md §7: ids are append-only).
 */
export const DEPRECATED_REGIONS: Record<string, RegionId> = {
  head: "head.crown",
  "head.eyes": "head.nose",
  "head.jaw": "head.mouth",
  "neck.front": "neck.throat",
  "neck.back": "neck.nape",
  "torso.chest.left.anterior": "chest.pec.left",
  "torso.chest.right.anterior": "chest.pec.right",
  "torso.chest.breast.left": "chest.breast.left",
  "torso.chest.breast.right": "chest.breast.right",
  "torso.abdomen.anterior": "abdomen.navel",
  "torso.abdomen.upper.anterior": "abdomen.upper.center",
  "torso.abdomen.lower.anterior": "abdomen.lower.center",
  "torso.pelvis.anterior": "pelvis.pubic",
  "torso.groin": "pelvis.pubic",
  "torso.back.upper": "back.spine.upper",
  "torso.back.lower": "back.spine.lumbar",
  "shoulder.left": "shoulder.cap.left",
  "shoulder.right": "shoulder.cap.right",
  "arm.left": "arm.biceps.left",
  "arm.right": "arm.biceps.right",
  "arm.upper.left": "arm.biceps.left",
  "arm.upper.right": "arm.biceps.right",
  "arm.elbow.left": "arm.elbow.point.left",
  "arm.elbow.right": "arm.elbow.point.right",
  "arm.fore.left": "arm.forearm.outer.left",
  "arm.fore.right": "arm.forearm.outer.right",
  "hand.left": "hand.palm.left",
  "hand.right": "hand.palm.right",
  "hip.left": "hip.side.left",
  "hip.right": "hip.side.right",
  "leg.upper.left": "leg.thigh.front.left",
  "leg.upper.right": "leg.thigh.front.right",
  "leg.lower.left": "leg.shin.left",
  "leg.lower.right": "leg.shin.right",
  "leg.knee.left": "leg.knee.cap.left",
  "leg.knee.right": "leg.knee.cap.right",
  "leg.ankle.left": "leg.ankle.outer.left",
  "leg.ankle.right": "leg.ankle.outer.right",
  "foot.left": "foot.top.left",
  "foot.right": "foot.top.right",
};

export function isRegionId(id: string): id is RegionId {
  return (REGION_IDS as readonly string[]).includes(id);
}

/**
 * Anatomical side of a region, derived from the ID suffix. Labels use the
 * patient's side; the confirm sheet appends a clarifier for sided regions.
 */
export function regionSide(id: RegionId): "left" | "right" | null {
  if (id.endsWith(".left")) return "left";
  if (id.endsWith(".right")) return "right";
  return null;
}
