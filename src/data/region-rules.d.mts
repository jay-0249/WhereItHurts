/** Type declarations for region-rules.mjs (consumed by the bake + tests). */

export interface RegionRule {
  /** region id, `{S}` resolves to left/right per REGIONS.md */
  id: string;
  variants?: readonly string[];
  y?: readonly [number, number];
  z?: "front" | "back";
  ax?: readonly [number, number];
  t?: readonly [number, number];
  face?: readonly ("front" | "back" | "inner" | "outer")[];
  zSeg?: readonly [number, number];
  nY?: readonly [number, number];
}

export declare const MIN_VERTS: number;

export declare const SEGMENT_RULES: {
  head: RegionRule[];
  neck: RegionRule[];
  torso: RegionRule[];
  arm: RegionRule[];
  leg: RegionRule[];
};
