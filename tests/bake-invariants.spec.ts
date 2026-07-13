/**
 * Verifies the committed bake artifacts (labeled GLBs + region manifests)
 * are internally consistent and match the taxonomy. These are the same
 * guarantees the bake enforces at build time, re-checked against what is
 * actually committed/shipped — a GLB without labels, a stale manifest, or
 * a drifted id list fails here.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { autoFit, parseGlb, readPositions } from "../scripts/glb-utils.mjs";
import { fitsMatch } from "@/lib/body-fit.mjs";
import {
  ADJACENCY_OVERRIDES,
  DEPRECATED_REGIONS,
  REGION_GROUPS,
  REGION_IDS,
  isRegionId,
  regionsForVariant,
  type BodyVariant,
} from "@/data/regions";
import { MIN_VERTS, SEGMENT_RULES } from "@/data/region-rules.mjs";
import { manifestForVariant } from "@/components/canvas/body-variants";
import assetManifest from "@/data/asset-manifest.json";

const assetsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "assets",
);

describe("taxonomy data integrity", () => {
  it("runtime id list matches the typed REGION_GROUPS map (d.mts drift guard)", () => {
    const groupKeys = Object.keys(REGION_GROUPS).sort();
    expect([...REGION_IDS].sort()).toEqual(groupKeys);
  });

  it("deprecated-id map targets valid current ids", () => {
    for (const [oldId, newId] of Object.entries(DEPRECATED_REGIONS)) {
      expect(isRegionId(oldId), `${oldId} must not also be a current id`).toBe(false);
      expect(isRegionId(newId), `${oldId} -> ${newId}`).toBe(true);
    }
  });

  it("every labeling rule resolves to a known region id", () => {
    for (const [segment, rules] of Object.entries(SEGMENT_RULES)) {
      for (const rule of rules) {
        for (const side of ["left", "right"]) {
          const id = rule.id.replace("{S}", side);
          expect(isRegionId(id), `${segment}: ${rule.id} (${side})`).toBe(true);
        }
      }
    }
  });

  it("adjacency overrides reference valid ids", () => {
    for (const [a, b] of [...ADJACENCY_OVERRIDES.add, ...ADJACENCY_OVERRIDES.remove]) {
      expect(isRegionId(a)).toBe(true);
      expect(isRegionId(b)).toBe(true);
    }
  });
});

for (const variant of ["body-a", "body-b"] as const satisfies readonly BodyVariant[]) {
  describe(`bake artifacts on ${variant}`, () => {
    const glbPath = path.join(assetsDir, `${variant}.glb`);
    const { json, bin } = parseGlb(glbPath);
    const manifest = manifestForVariant(variant);
    const prim = json.meshes[0].primitives[0];

    it("shipped glb carries _REGION labels for every vertex", () => {
      expect(prim.attributes._REGION, "a GLB without _REGION never ships").toBeDefined();
      const accessor = json.accessors[prim.attributes._REGION];
      const positionCount = json.accessors[prim.attributes.POSITION].count;
      expect(accessor.componentType).toBe(5123);
      expect(accessor.count).toBe(positionCount);
      expect(manifest.vertexCount).toBe(positionCount);
    });

    it("manifest hash matches the shipped glb (stale-artifact tripwire)", () => {
      const hash = createHash("sha256")
        .update(readFileSync(glbPath))
        .digest("hex")
        .slice(0, 12);
      expect(manifest.glbHash).toBe(hash);
      expect(
        (assetManifest as Record<string, string>)[`${variant}.glb`],
      ).toBe(hash);
    });

    it("recorded fit matches the fit recomputed from the shipped glb", () => {
      const { fit } = autoFit(readPositions(json, bin));
      expect(fitsMatch(fit, manifest.fit)).toBe(true);
    });

    it(`every applicable region is present with >= ${MIN_VERTS} vertices`, () => {
      const applicable = regionsForVariant(variant);
      const missing = applicable.filter(
        (id) => (manifest.regions[id]?.count ?? 0) < MIN_VERTS,
      );
      expect(missing).toEqual([]);
      const phantom = Object.keys(manifest.regions).filter(
        (id) => !applicable.includes(id as (typeof applicable)[number]),
      );
      expect(phantom, "variant-gated regions must not appear").toEqual([]);
    });

    it("region label values and vertex totals reconcile", () => {
      const total = Object.values(manifest.regions).reduce(
        (sum, r) => sum + r.count,
        0,
      );
      expect(total).toBe(manifest.vertexCount);
    });

    it("adjacency is symmetric and references applicable regions", () => {
      for (const [id, neighbors] of Object.entries(manifest.adjacency)) {
        expect(manifest.regions[id], id).toBeDefined();
        for (const n of neighbors) {
          expect(manifest.regions[n], `${id} -> ${n}`).toBeDefined();
          expect(
            manifest.adjacency[n],
            `${n} must list ${id} back`,
          ).toContain(id);
        }
      }
    });
  });
}
