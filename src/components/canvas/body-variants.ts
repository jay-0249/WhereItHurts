import { REGION_IDS, type BodyVariant, type RegionId } from "@/data/regions";
import {
  buildFigureFromLandmarks,
  type BodyLandmarks,
} from "@/data/figure-from-landmarks.mjs";
import landmarksA from "@/data/landmarks/body-a.json";
import landmarksB from "@/data/landmarks/body-b.json";
import assetManifest from "@/data/asset-manifest.json";
import { FIGURE, type RegionMeshSpec } from "./placeholder-figure";

/** Content-hashed GLB URL so regenerated meshes bypass browser caches. */
function glbUrl(file: keyof typeof assetManifest): string {
  return `/assets/${file}?v=${assetManifest[file]}`;
}

export function landmarksForVariant(variant: BodyVariant): BodyLandmarks {
  return (variant === "body-a" ? landmarksA : landmarksB) as BodyLandmarks;
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
    glbPath: glbUrl("body-a.glb"),
    proxyTransforms: {},
  },
  "body-b": {
    glbPath: glbUrl("body-b.glb"),
    proxyTransforms: {},
  },
};

/**
 * Per-variant proxy layouts, derived from that variant's measured landmark
 * file (src/data/landmarks/, produced by scripts/measure-body.mjs). The
 * hand-tuned FIGURE constants remain only as a fallback should the builder
 * ever miss a region.
 */
function buildVariantFigure(
  landmarks: BodyLandmarks,
): Record<RegionId, RegionMeshSpec> {
  const built = buildFigureFromLandmarks(landmarks);
  const out = {} as Record<RegionId, RegionMeshSpec>;
  for (const id of REGION_IDS) {
    out[id] = (built[id] as RegionMeshSpec | undefined) ?? FIGURE[id];
  }
  return out;
}

const FIGURES: Record<BodyVariant, Record<RegionId, RegionMeshSpec>> = {
  "body-a": buildVariantFigure(landmarksA),
  "body-b": buildVariantFigure(landmarksB),
};

export function figureForVariant(
  variant: BodyVariant,
): Record<RegionId, RegionMeshSpec> {
  return FIGURES[variant];
}

export interface ResolvedProxy {
  position: [number, number, number];
  scale: [number, number, number];
  rotation: [number, number, number];
}

export function resolveProxy(variant: BodyVariant, id: RegionId): ResolvedProxy {
  const base = figureForVariant(variant)[id];
  const t = BODY_VARIANTS[variant].proxyTransforms[id];
  const [px, py, pz] = base.position;
  const [sx, sy, sz] = base.scale ?? [1, 1, 1];
  const [rx, ry, rz] = base.rotation ?? [0, 0, 0];
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
    rotation: [
      rx + (t?.rotation?.[0] ?? 0),
      ry + (t?.rotation?.[1] ?? 0),
      rz + (t?.rotation?.[2] ?? 0),
    ],
  };
}

/** Pin anchor / centroid for a region on the given variant. */
export function regionAnchor(
  variant: BodyVariant,
  id: RegionId,
): [number, number, number] {
  return resolveProxy(variant, id).position;
}
