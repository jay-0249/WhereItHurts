/**
 * Mesh-grounded alignment suite: tests proxies against the ACTUAL glb
 * vertices, not just the landmark JSON. This is the layer that catches
 * frame/landmark drift the pure-proxy selection suite cannot see:
 *
 * 1. The fit recorded in each landmark file matches the fit recomputed
 *    from the glb right now (shared src/lib/body-fit.mjs in both paths).
 * 2. Landmarks lie on/in the skin — nearby mesh vertices exist.
 * 3. For key probes, the same camera ray is cast against BOTH the real
 *    mesh triangles and the proxy set: the mesh hit point must lie INSIDE
 *    the volume of the region the proxy raycast returns.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  assertIdentityNodes,
  autoFit,
  parseGlb,
  readIndices,
  readPositions,
} from "../scripts/glb-utils.mjs";
import { fitsMatch, type BodyFit } from "@/lib/body-fit.mjs";
import { regionsForVariant, type BodyVariant, type RegionId } from "@/data/regions";
import { figureForVariant, resolveProxy } from "@/components/canvas/body-variants";
import type { BodyLandmarks } from "@/data/figure-from-landmarks.mjs";
import landmarksA from "@/data/landmarks/body-a.json";
import landmarksB from "@/data/landmarks/body-b.json";

const LANDMARKS: Record<BodyVariant, BodyLandmarks> = {
  "body-a": landmarksA as BodyLandmarks,
  "body-b": landmarksB as BodyLandmarks,
};

const assetsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "assets",
);

const CAMERAS = {
  front: new THREE.Vector3(0, 1.8, 4.6),
  back: new THREE.Vector3(0, 1.8, -4.6),
  left: new THREE.Vector3(4.6, 1.8, 0),
} as const;
type CameraName = keyof typeof CAMERAS;

interface LoadedBody {
  positions: Float32Array;
  fit: BodyFit;
  mesh: THREE.Mesh;
  proxies: THREE.Group;
}

function loadBody(variant: BodyVariant): LoadedBody {
  const { json, bin } = parseGlb(path.join(assetsDir, `${variant}.glb`));
  assertIdentityNodes(json, variant);
  const { positions, fit } = autoFit(readPositions(json, bin));

  const prim = json.meshes[0].primitives[0];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(readIndices(json, bin, prim), 1));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.updateMatrixWorld(true);

  const proxies = new THREE.Group();
  const figure = figureForVariant(variant);
  for (const id of regionsForVariant(variant)) {
    const spec = figure[id];
    const proxyGeometry =
      spec.kind === "capsule"
        ? new THREE.CapsuleGeometry(spec.radius, spec.length ?? 0, 8, 24)
        : new THREE.SphereGeometry(spec.radius, 32, 24);
    const proxy = new THREE.Mesh(proxyGeometry);
    const t = resolveProxy(variant, id);
    proxy.position.set(...t.position);
    proxy.scale.set(...t.scale);
    proxy.rotation.set(...t.rotation);
    proxy.userData.regionId = id;
    proxies.add(proxy);
  }
  proxies.updateMatrixWorld(true);

  return { positions, fit, mesh, proxies };
}

const raycaster = new THREE.Raycaster();

function castRay(camera: CameraName, point: [number, number, number]) {
  const origin = CAMERAS[camera];
  raycaster.set(origin, new THREE.Vector3(...point).sub(origin).normalize());
  return raycaster;
}

/** Signed-distance check: does a world point lie inside a region's volume? */
function pointInsideRegion(
  variant: BodyVariant,
  regionId: RegionId,
  point: THREE.Vector3,
  epsilon = 0.03,
): boolean {
  const spec = figureForVariant(variant)[regionId];
  const t = resolveProxy(variant, regionId);
  const local = point
    .clone()
    .sub(new THREE.Vector3(...t.position))
    .applyMatrix4(
      new THREE.Matrix4()
        .makeRotationFromEuler(new THREE.Euler(...t.rotation))
        .invert(),
    );
  local.set(local.x / t.scale[0], local.y / t.scale[1], local.z / t.scale[2]);
  let distance: number;
  if (spec.kind === "sphere") {
    distance = local.length() - spec.radius;
  } else {
    const half = (spec.length ?? 0) / 2;
    const qy = local.y - THREE.MathUtils.clamp(local.y, -half, half);
    distance = Math.hypot(local.x, qy, local.z) - spec.radius;
  }
  return distance <= epsilon;
}

function nearestVertexDistance(positions: Float32Array, point: [number, number, number]): number {
  let best = Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const dx = positions[i] - point[0];
    const dy = positions[i + 1] - point[1];
    const dz = positions[i + 2] - point[2];
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < best) best = d2;
  }
  return Math.sqrt(best);
}

interface SkinCheck {
  name: string;
  point: [number, number, number];
  tolerance: number;
}

function skinChecks(lm: BodyLandmarks): SkinCheck[] {
  const armTolerance = lm.arm.radius + 0.06;
  return [
    { name: "chest front", point: [0, lm.torsoSlices.chest.y, lm.torsoSlices.chest.zMax], tolerance: 0.06 },
    { name: "waist front", point: [0, lm.torsoSlices.waist.y, lm.torsoSlices.waist.zMax], tolerance: 0.06 },
    { name: "waist back", point: [0, lm.torsoSlices.waist.y, lm.torsoSlices.waist.zMin], tolerance: 0.06 },
    { name: "pelvis front", point: [0, lm.torsoSlices.pelvis.y, lm.torsoSlices.pelvis.zMax], tolerance: 0.06 },
    { name: "shoulder line", point: [lm.shoulder.halfWidth, lm.shoulder.y, lm.arm.top[2]], tolerance: 0.1 },
    { name: "arm top centroid", point: lm.arm.top as [number, number, number], tolerance: armTolerance },
    { name: "elbow centroid", point: lm.arm.elbow as [number, number, number], tolerance: armTolerance },
    { name: "wrist centroid", point: lm.arm.wrist as [number, number, number], tolerance: armTolerance },
    { name: "knee", point: [lm.leg.knee.x, lm.leg.knee.y, lm.leg.knee.z], tolerance: lm.leg.knee.radius + 0.05 },
    { name: "ankle", point: [lm.leg.ankle.x, lm.leg.ankle.y, lm.leg.ankle.z], tolerance: lm.leg.ankle.radius + 0.05 },
    { name: "head front", point: [0, lm.chinY + 0.6 * (3.6 - lm.chinY), lm.head.zMax], tolerance: 0.08 },
    { name: "toe tip", point: [lm.foot.centerX, 0.05, lm.foot.zMax], tolerance: 0.06 },
  ];
}

interface DualProbe {
  name: string;
  camera: CameraName;
  point: [number, number, number];
}

function dualProbes(lm: BodyLandmarks): DualProbe[] {
  const pelvisTop = lm.crotchY + 0.55 * (lm.waist.y - lm.crotchY);
  const abdTop = lm.chestBotY;
  const abdBot = pelvisTop;
  const abdMid = (abdTop + abdBot) / 2;
  const headH = 3.6 - lm.chinY;
  const headCY = (3.6 + lm.chinY) / 2;
  const headCZ = (lm.head.zMin + lm.head.zMax) / 2;
  const mid = (a: number[], b: number[]): [number, number, number] => [
    (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2,
  ];
  return [
    { name: "neck front", camera: "front", point: [0, (lm.chinY + lm.shoulder.y) / 2, 0.3] },
    {
      // z target at the chest's front plane: 0.3 overshoots the actual
      // shoulder skin (~chest.zMax in this z-skewed frame) and the ray
      // misses the mesh entirely
      name: "shoulder cap", camera: "front",
      point: [lm.shoulder.halfWidth * 0.88, lm.shoulder.y - 0.02, lm.torsoSlices.chest.zMax],
    },
    { name: "elbow", camera: "left", point: lm.arm.elbow as [number, number, number] },
    { name: "mid-forearm", camera: "left", point: mid(lm.arm.elbow, lm.arm.wrist) },
    {
      name: "chest left", camera: "front",
      point: [
        lm.torsoSlices.chest.halfWidth * 0.7,
        lm.shoulder.y - 0.15 * (lm.shoulder.y - lm.chestBotY),
        lm.torsoSlices.chest.zMax,
      ],
    },
    { name: "navel", camera: "front", point: [0, (abdMid + abdBot) / 2, lm.torsoSlices.waist.zMax] },
    {
      name: "pelvis", camera: "front",
      point: [0, pelvisTop - 0.25 * (pelvisTop - lm.crotchY), lm.torsoSlices.pelvis.zMax],
    },
    { name: "mid-thigh", camera: "front", point: [(lm.leg.topX + lm.leg.knee.x) / 2, lm.leg.thigh.y, lm.leg.thigh.z] },
    { name: "kneecap", camera: "front", point: [lm.leg.knee.x, lm.leg.knee.y, lm.leg.knee.z] },
    { name: "shin", camera: "front", point: [(lm.leg.knee.x + lm.leg.ankle.x) / 2, lm.leg.calf.y, lm.leg.calf.zMax] },
    { name: "rear calf", camera: "back", point: [(lm.leg.knee.x + lm.leg.ankle.x) / 2, lm.leg.calf.y, lm.leg.calf.zMin] },
    { name: "upper back", camera: "back", point: [0, (lm.shoulder.y + (lm.armpitY + lm.waist.y) / 2) / 2, -1] },
    { name: "lower back", camera: "back", point: [0, ((lm.armpitY + lm.waist.y) / 2 + lm.crotchY + 0.08) / 2, -1] },
    { name: "ear", camera: "left", point: [lm.head.halfWidth + 0.02, headCY, headCZ] },
    { name: "jaw", camera: "front", point: [0, lm.chinY + 0.16 * headH, lm.head.zMax] },
  ];
}

for (const variant of ["body-a", "body-b"] as const) {
  describe(`mesh alignment on ${variant}`, () => {
    const lm = LANDMARKS[variant];
    const body = loadBody(variant);

    it("runtime auto-fit matches the fit recorded at measurement time", () => {
      expect(
        fitsMatch(body.fit, lm.fit as BodyFit),
        `recomputed ${JSON.stringify(body.fit)} vs recorded ${JSON.stringify(lm.fit)}`,
      ).toBe(true);
    });

    for (const check of skinChecks(lm)) {
      it(`landmark on skin: ${check.name}`, () => {
        const distance = nearestVertexDistance(body.positions, check.point);
        expect(
          distance,
          `nearest mesh vertex ${distance.toFixed(3)} away (tolerance ${check.tolerance})`,
        ).toBeLessThanOrEqual(check.tolerance);
      });
    }

    for (const probe of dualProbes(lm)) {
      it(`mesh hit inside claimed region: ${probe.name}`, () => {
        const proxyHits = castRay(probe.camera, probe.point).intersectObjects(
          body.proxies.children,
          false,
        );
        expect(proxyHits.length, "proxy raycast hits something").toBeGreaterThan(0);
        const claimed = proxyHits[0].object.userData.regionId as RegionId;

        const meshHits = castRay(probe.camera, probe.point).intersectObject(body.mesh, false);
        expect(meshHits.length, "mesh raycast hits the body").toBeGreaterThan(0);
        const skinPoint = meshHits[0].point;

        expect(
          pointInsideRegion(variant, claimed, skinPoint),
          `skin point ${JSON.stringify(skinPoint.toArray().map((v) => +v.toFixed(3)))} ` +
            `lies outside claimed region "${claimed}"`,
        ).toBe(true);
      });
    }
  });
}
