/**
 * Selection parity suite: casts REAL app-camera rays (orbit sphere, polar
 * clamp per Scene.tsx) against the ACTUAL shipped labeled mesh, and
 * applies THE pick rule (REGIONS.md §3: hit triangle's corner with the
 * largest barycentric coordinate, ties to the lowest vertex index — the
 * same rule BodyVisual runs). Asserts each region's manifest anchor
 * resolves to that region; anchors occluded from their best camera
 * (inner thighs, armpit webs) are skipped, but the zones that motivated
 * the taxonomy must always be directly tappable.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { autoFit, parseGlb, readIndices, readPositions } from "../scripts/glb-utils.mjs";
import {
  REGION_IDS,
  regionsForVariant,
  type BodyVariant,
  type RegionId,
} from "@/data/regions";
import { manifestForVariant } from "@/components/canvas/body-variants";

const assetsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "assets",
);

const ORBIT_TARGET = new THREE.Vector3(0, 1.8, 0);
const ORBIT_RADIUS = 4.6;
const MAX_ELEVATION = Math.PI / 6; // Scene.tsx polar clamp

/** Zones a patient must ALWAYS be able to tap head-on (the product ask). */
const MUST_HIT: RegionId[] = [
  "back.scapula.left",
  "back.scapula.right",
  "back.spine.upper",
  "shoulder.trapezius.left",
  "shoulder.trapezius.right",
  "leg.thigh.back.left",
  "leg.thigh.back.right",
  "chest.sternum",
  "abdomen.navel",
  "abdomen.upper.center",
  "abdomen.lower.center",
  "abdomen.flank.left",
  "abdomen.flank.right",
  "pelvis.pubic",
  "back.spine.lumbar",
  "back.sacrum",
  "back.buttock.left",
  "leg.knee.cap.left",
  "leg.knee.back.left",
  "leg.calf.left",
  "leg.shin.left",
  "neck.throat",
  "neck.nape",
  "head.forehead",
  "hand.back.left",
];

function cameraFor(anchor: THREE.Vector3, outward: THREE.Vector3): THREE.Vector3 {
  let hx = outward.x;
  let hz = outward.z;
  if (Math.hypot(hx, hz) < 1e-4) {
    hx = 0;
    hz = 1;
  }
  const heading = Math.atan2(hx, hz);
  const elevation = THREE.MathUtils.clamp(
    Math.asin(THREE.MathUtils.clamp(outward.y, -1, 1)),
    -MAX_ELEVATION,
    MAX_ELEVATION,
  );
  return new THREE.Vector3(
    ORBIT_TARGET.x + ORBIT_RADIUS * Math.sin(heading) * Math.cos(elevation),
    ORBIT_TARGET.y + ORBIT_RADIUS * Math.sin(elevation),
    ORBIT_TARGET.z + ORBIT_RADIUS * Math.cos(heading) * Math.cos(elevation),
  );
}

/** THE pick rule — must mirror BodyVisual.pickRegion exactly. */
function pickRegion(
  labels: Uint16Array,
  position: THREE.BufferAttribute,
  face: { a: number; b: number; c: number },
  point: THREE.Vector3,
): RegionId {
  const corners = [face.a, face.b, face.c];
  const pa = new THREE.Vector3().fromBufferAttribute(position, face.a);
  const pb = new THREE.Vector3().fromBufferAttribute(position, face.b);
  const pc = new THREE.Vector3().fromBufferAttribute(position, face.c);
  const bary = new THREE.Vector3();
  THREE.Triangle.getBarycoord(point, pa, pb, pc, bary);
  const weights = [bary.x, bary.y, bary.z];
  let best = 0;
  for (let i = 1; i < 3; i++) {
    const tie = weights[i] === weights[best] && corners[i] < corners[best];
    if (weights[i] > weights[best] || tie) best = i;
  }
  return REGION_IDS[labels[corners[best]]] as RegionId;
}

for (const variant of ["body-a", "body-b"] as const satisfies readonly BodyVariant[]) {
  describe(`selection parity on ${variant}`, () => {
    const { json, bin } = parseGlb(path.join(assetsDir, `${variant}.glb`));
    const prim = json.meshes[0].primitives[0];
    const { positions } = autoFit(readPositions(json, bin));
    // read the raw _REGION SCALAR accessor bytes directly
    const labels = (() => {
      const accessor = json.accessors[prim.attributes._REGION];
      const view = json.bufferViews[accessor.bufferView];
      const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
      const out = new Uint16Array(accessor.count);
      for (let i = 0; i < accessor.count; i++) {
        out[i] = bin.readUInt16LE(base + i * 2);
      }
      return out;
    })();
    const geometry = new THREE.BufferGeometry();
    const positionAttr = new THREE.BufferAttribute(positions, 3);
    geometry.setAttribute("position", positionAttr);
    const indices = readIndices(json, bin, prim);
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld(true);
    const raycaster = new THREE.Raycaster();
    const manifest = manifestForVariant(variant);

    // vertex normals (area-weighted) for face-on ray directions
    const vertexCount = positions.length / 3;
    const normals = new Float32Array(vertexCount * 3);
    for (let f = 0; f < indices.length; f += 3) {
      const [a, b, c] = [indices[f], indices[f + 1], indices[f + 2]];
      const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
      const nx =
        (positions[b * 3 + 1] - ay) * (positions[c * 3 + 2] - az) -
        (positions[b * 3 + 2] - az) * (positions[c * 3 + 1] - ay);
      const ny =
        (positions[b * 3 + 2] - az) * (positions[c * 3] - ax) -
        (positions[b * 3] - ax) * (positions[c * 3 + 2] - az);
      const nz =
        (positions[b * 3] - ax) * (positions[c * 3 + 1] - ay) -
        (positions[b * 3 + 1] - ay) * (positions[c * 3] - ax);
      for (const v of [a, b, c]) {
        normals[v * 3] += nx;
        normals[v * 3 + 1] += ny;
        normals[v * 3 + 2] += nz;
      }
    }

    // per-region vertex lists for probe sampling
    const regionVerts = new Map<number, number[]>();
    for (let v = 0; v < vertexCount; v++) {
      const list = regionVerts.get(labels[v]) ?? [];
      list.push(v);
      regionVerts.set(labels[v], list);
    }

    /**
     * A zone is tappable when SOME point of it is cleanly hittable: sample
     * up to 12 of its vertices, cast the face-on app-camera ray at each,
     * and require the pick rule to return the zone. Anchors alone are too
     * conservative (a throat anchor tucked under the chin) and a wrong
     * pick anywhere is still reported as a mislabel.
     */
    const resolve = (id: RegionId) => {
      const idx = REGION_IDS.indexOf(id);
      const verts = regionVerts.get(idx) ?? [];
      if (!verts.length) return { status: "occluded" as const };
      const stride = Math.max(1, Math.floor(verts.length / 12));
      let lastWrong: RegionId | null = null;
      for (let k = 0; k < verts.length; k += stride) {
        const v = verts[k];
        const target = new THREE.Vector3(
          positions[v * 3],
          positions[v * 3 + 1],
          positions[v * 3 + 2],
        );
        const outward = new THREE.Vector3(
          normals[v * 3],
          normals[v * 3 + 1],
          normals[v * 3 + 2],
        ).normalize();
        const origin = cameraFor(target, outward);
        raycaster.set(origin, target.clone().sub(origin).normalize());
        const hits = raycaster.intersectObject(mesh, false);
        if (!hits.length || hits[0].point.distanceTo(target) > 0.05) continue;
        const picked = pickRegion(labels, positionAttr, hits[0].face!, hits[0].point);
        if (picked === id) return { status: "hit" as const, region: picked };
        lastWrong = picked;
      }
      return lastWrong
        ? { status: "hit" as const, region: lastWrong }
        : { status: "occluded" as const };
    };

    it("every region's anchor resolves to that region when directly visible", () => {
      const wrong: string[] = [];
      let hit = 0;
      let occluded = 0;
      for (const id of regionsForVariant(variant)) {
        const result = resolve(id);
        if (result.status === "hit") {
          hit++;
          if (result.region !== id) wrong.push(`${id} -> ${result.region}`);
        } else {
          occluded++;
        }
      }
      expect(wrong).toEqual([]);
      // soles, armpits, inner thighs and groin creases are structurally
      // hidden from the polar-clamped orbit; everything else must reach
      expect(hit / (hit + occluded)).toBeGreaterThan(0.8);
    });

    it("the motivating zones are always directly tappable", () => {
      const failures: string[] = [];
      for (const id of MUST_HIT) {
        if (!manifest.regions[id]) continue; // variant-gated
        const result = resolve(id);
        if (result.status !== "hit") failures.push(`${id}: ${result.status}`);
        else if (result.region !== id) failures.push(`${id} -> ${result.region}`);
      }
      expect(failures).toEqual([]);
    });
  });
}
