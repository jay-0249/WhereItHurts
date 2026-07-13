import type { BodyVariant, RegionId } from "@/data/regions";
import assetManifest from "@/data/asset-manifest.json";
import manifestA from "@/data/region-manifest/body-a.json";
import manifestB from "@/data/region-manifest/body-b.json";

/** Content-hashed GLB URL so regenerated meshes bypass browser caches. */
function glbUrl(file: keyof typeof assetManifest): string {
  return `/assets/${file}?v=${assetManifest[file]}`;
}

export const BODY_VARIANTS: Record<BodyVariant, { glbPath: string }> = {
  "body-a": { glbPath: glbUrl("body-a.glb") },
  "body-b": { glbPath: glbUrl("body-b.glb") },
};

/**
 * Region manifest: bake-time derived artifacts (see scripts/bake-labels.mjs
 * and REGIONS.md). Anchors/AABBs are in the fitted app frame.
 */
export interface RegionManifest {
  variant: string;
  glbHash: string;
  vertexCount: number;
  fit: { scale: number; center: number[] };
  regions: Record<
    string,
    {
      count: number;
      anchor: number[];
      anchorNormal: number[];
      aabb: { min: number[]; max: number[] };
    }
  >;
  adjacency: Record<string, string[]>;
}

const MANIFESTS: Record<BodyVariant, RegionManifest> = {
  "body-a": manifestA as RegionManifest,
  "body-b": manifestB as RegionManifest,
};

export function manifestForVariant(variant: BodyVariant): RegionManifest {
  return MANIFESTS[variant];
}

/** On-skin pin anchor for a region (region vertex nearest its centroid). */
export function regionAnchor(
  variant: BodyVariant,
  id: RegionId,
): [number, number, number] {
  const entry = MANIFESTS[variant].regions[id];
  return entry
    ? (entry.anchor as [number, number, number])
    : [0, 1.8, 0];
}

/** Neighboring regions (bake-derived mesh adjacency + curated overrides). */
export function regionNeighbors(variant: BodyVariant, id: RegionId): RegionId[] {
  return (MANIFESTS[variant].adjacency[id] ?? []) as RegionId[];
}
