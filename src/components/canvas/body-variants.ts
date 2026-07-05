import type { BodyVariant, RegionId } from "@/data/regions";
import { FIGURE } from "./placeholder-figure";

/**
 * The visual mesh is auto-fitted to this height (feet at y=0, centered on
 * x/z) at load, so any glTF export drops in without code changes. Matches
 * the proxy figure: head top = 3.28 + 0.32.
 */
export const VISUAL_TARGET_HEIGHT = 3.6;

/**
 * Selection-overlay inflation along vertex normals, world units. Must be
 * large enough that the inflated overlay clears the visual body surface on
 * every region (the proxies sit inside the body), small enough not to
 * balloon. Per-region overrides for thin proxies where the default reads
 * too fat.
 */
export const OVERLAY_INFLATE_DEFAULT = 0.025;

export const OVERLAY_INFLATE_OVERRIDES: Partial<Record<RegionId, number>> = {
  // deeper-buried proxies need more displacement to clear the skin
  "torso.pelvis.anterior": 0.04,
  "torso.groin": 0.04,
};

export function overlayInflateFor(id: RegionId): number {
  return OVERLAY_INFLATE_OVERRIDES[id] ?? OVERLAY_INFLATE_DEFAULT;
}

export interface ProxyTransform {
  /** world-unit offset added to the default proxy position */
  position?: readonly [number, number, number];
  /** multiplier applied to the default proxy scale */
  scale?: readonly [number, number, number];
  /** euler radians, e.g. to angle arm capsules to an A-pose */
  rotation?: readonly [number, number, number];
}

export interface BodyVariantConfig {
  glbPath: string;
  /**
   * Per-region alignment of the proxy capsules to this variant's body.
   * FIGURE holds the shared defaults; entries here are offsets/multipliers
   * on top. Pure data — aligning proxies to a new export is config editing,
   * not code.
   */
  proxyTransforms: Partial<Record<RegionId, ProxyTransform>>;
}

export const BODY_VARIANTS: Record<BodyVariant, BodyVariantConfig> = {
  "body-a": {
    glbPath: "/assets/body-a.glb",
    proxyTransforms: {},
  },
  "body-b": {
    glbPath: "/assets/body-b.glb",
    proxyTransforms: {},
  },
};

export interface ResolvedProxy {
  position: [number, number, number];
  scale: [number, number, number];
  rotation: [number, number, number];
}

export function resolveProxy(variant: BodyVariant, id: RegionId): ResolvedProxy {
  const base = FIGURE[id];
  const t = BODY_VARIANTS[variant].proxyTransforms[id];
  const [px, py, pz] = base.position;
  const [sx, sy, sz] = base.scale ?? [1, 1, 1];
  return {
    position: [
      px + (t?.position?.[0] ?? 0),
      py + (t?.position?.[1] ?? 0),
      pz + (t?.position?.[2] ?? 0),
    ],
    scale: [
      sx * (t?.scale?.[0] ?? 1),
      sy * (t?.scale?.[1] ?? 1),
      sz * (t?.scale?.[2] ?? 1),
    ],
    rotation: t?.rotation ? [...t.rotation] : [0, 0, 0],
  };
}

/** Pin anchor / centroid for a region on the given variant. */
export function regionAnchor(
  variant: BodyVariant,
  id: RegionId,
): [number, number, number] {
  return resolveProxy(variant, id).position;
}
