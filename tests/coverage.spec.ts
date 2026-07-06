/**
 * Mesh-surface coverage regression: EVERY point on the visible mesh
 * surface must resolve to a region whose volume contains it (i.e. a tap
 * there selects something AND the tint appears at the tapped spot).
 *
 * Probe suites can't detect holes (absence of probes); this scans the
 * actual skin. For ~4k sampled vertices per variant, a ray is cast from
 * outside along the axis best aligned with the vertex normal. Vertices
 * occluded from that axis (armpit folds, inner thighs) are skipped —
 * their occluders carry their own vertices. Uncovered vertices are
 * clustered and named so holes are actionable.
 *
 * Gate: >= 99% coverage per variant.
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
import { regionsForVariant, type BodyVariant, type RegionId } from "@/data/regions";
import { figureForVariant, resolveProxy } from "@/components/canvas/body-variants";

const SAMPLE_TARGET = 4000;
const COVERAGE_GATE = 0.99;
const CONTAIN_EPS = 0.04;

/**
 * Exemptions — surfaces a user genuinely cannot tap in the app:
 * - soles of the feet: downward-facing skin at ground level; the camera's
 *   polar clamp (±30° from horizontal) makes them unviewable.
 */
function isExempt(v: THREE.Vector3, n: THREE.Vector3): boolean {
  return n.y < -0.8 && v.y < 0.06;
}

const assetsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "assets",
);

// Rays are REAL app-camera rays: origin on the orbit sphere (radius 4.6
// around the target, polar clamped to ±30° of horizontal, per Scene.tsx),
// heading/elevation chosen from the vertex normal. Anything else produces
// approach angles no user can create and phantom claims along them.
const ORBIT_TARGET = new THREE.Vector3(0, 1.8, 0);
const ORBIT_RADIUS = 4.6;
const MAX_ELEVATION = Math.PI / 6;

function cameraFor(normal: THREE.Vector3): THREE.Vector3 {
  let hx = normal.x;
  let hz = normal.z;
  if (Math.hypot(hx, hz) < 1e-4) {
    hx = 0;
    hz = 1; // top/bottom-facing skin: approach from the front
  }
  const heading = Math.atan2(hx, hz);
  const elevation = THREE.MathUtils.clamp(
    Math.asin(THREE.MathUtils.clamp(normal.y, -1, 1)),
    -MAX_ELEVATION,
    MAX_ELEVATION,
  );
  return new THREE.Vector3(
    ORBIT_TARGET.x + ORBIT_RADIUS * Math.sin(heading) * Math.cos(elevation),
    ORBIT_TARGET.y + ORBIT_RADIUS * Math.sin(elevation),
    ORBIT_TARGET.z + ORBIT_RADIUS * Math.cos(heading) * Math.cos(elevation),
  );
}

interface RegionVolume {
  id: RegionId;
  radius: number;
  halfLen: number;
  kind: "sphere" | "capsule";
  position: THREE.Vector3;
  scale: [number, number, number];
  rotInv: THREE.Matrix4;
}

function buildVolumes(variant: BodyVariant): RegionVolume[] {
  const figure = figureForVariant(variant);
  return regionsForVariant(variant).map((id) => {
    const spec = figure[id];
    const t = resolveProxy(variant, id);
    return {
      id,
      radius: spec.radius,
      halfLen: (spec.length ?? 0) / 2,
      kind: spec.kind,
      position: new THREE.Vector3(...t.position),
      scale: t.scale,
      rotInv: new THREE.Matrix4()
        .makeRotationFromEuler(new THREE.Euler(...t.rotation))
        .invert(),
    };
  });
}

const scratch = new THREE.Vector3();

function signedDistance(volume: RegionVolume, point: THREE.Vector3): number {
  scratch.copy(point).sub(volume.position).applyMatrix4(volume.rotInv);
  scratch.set(
    scratch.x / volume.scale[0],
    scratch.y / volume.scale[1],
    scratch.z / volume.scale[2],
  );
  if (volume.kind === "sphere") return scratch.length() - volume.radius;
  const qy = scratch.y - THREE.MathUtils.clamp(scratch.y, -volume.halfLen, volume.halfLen);
  return Math.hypot(scratch.x, qy, scratch.z) - volume.radius;
}

interface Uncovered {
  point: THREE.Vector3;
  nearest: RegionId;
  reason: string;
}

interface Cluster {
  centroid: THREE.Vector3;
  count: number;
  nearest: RegionId;
  reasons: Set<string>;
}

function clusterize(uncovered: Uncovered[]): Cluster[] {
  const clusters: Cluster[] = [];
  for (const u of uncovered) {
    let target = clusters.find((c) => c.centroid.distanceTo(u.point) < 0.2);
    if (!target) {
      target = { centroid: u.point.clone(), count: 0, nearest: u.nearest, reasons: new Set() };
      clusters.push(target);
    }
    // running centroid
    target.centroid.multiplyScalar(target.count).add(u.point).divideScalar(target.count + 1);
    target.count++;
    target.reasons.add(u.reason);
  }
  return clusters.sort((a, b) => b.count - a.count);
}

function describeLocation(p: THREE.Vector3): string {
  const yPct = ((p.y / 3.6) * 100).toFixed(0);
  const side = p.x > 0.05 ? "left" : p.x < -0.05 ? "right" : "center";
  const depth = p.z > 0.03 ? "front" : p.z < -0.03 ? "back" : "lateral";
  return `${yPct}%H ${side} ${depth}`;
}

for (const variant of ["body-a", "body-b"] as const) {
  describe(`surface coverage on ${variant}`, () => {
    it(
      `>= ${COVERAGE_GATE * 100}% of visible skin resolves to a containing region`,
      { timeout: 180_000 },
      () => {
        const { json, bin } = parseGlb(path.join(assetsDir, `${variant}.glb`));
        assertIdentityNodes(json, variant);
        const { positions } = autoFit(readPositions(json, bin));
        const prim = json.meshes[0].primitives[0];
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometry.setIndex(new THREE.BufferAttribute(readIndices(json, bin, prim), 1));
        geometry.computeVertexNormals();
        const normals = geometry.getAttribute("normal") as THREE.BufferAttribute;
        const mesh = new THREE.Mesh(
          geometry,
          new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
        );
        mesh.updateMatrixWorld(true);

        const proxyGroup = new THREE.Group();
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
          proxyGroup.add(proxy);
        }
        proxyGroup.updateMatrixWorld(true);
        const volumes = buildVolumes(variant);
        const volumeById = new Map(volumes.map((v) => [v.id, v]));

        const vertexCount = positions.length / 3;
        const stride = Math.max(1, Math.floor(vertexCount / SAMPLE_TARGET));
        const raycaster = new THREE.Raycaster();
        const vertex = new THREE.Vector3();
        const normal = new THREE.Vector3();

        let tested = 0;
        let covered = 0;
        let exempt = 0;
        let occluded = 0;
        const uncovered: Uncovered[] = [];

        for (let i = 0; i < vertexCount; i += stride) {
          vertex.fromArray(positions, i * 3);
          normal.set(normals.getX(i), normals.getY(i), normals.getZ(i));
          if (isExempt(vertex, normal)) {
            exempt++;
            continue;
          }
          const origin = cameraFor(normal);
          raycaster.set(origin, vertex.clone().sub(origin).normalize());

          const meshHits = raycaster.intersectObject(mesh, false);
          if (!meshHits.length || meshHits[0].point.distanceTo(vertex) > 0.04) {
            occluded++; // not visible from this axis; its occluder is sampled too
            continue;
          }
          tested++;
          const skinPoint = meshHits[0].point;

          const proxyHits = raycaster.intersectObjects(proxyGroup.children, false);
          // Proxy-occluded viewpoint: another region's volume intercepts far
          // in front of the target (proxies are fatter than limbs, so e.g.
          // a cross-body ray to the inner forearm hits the OTHER forearm's
          // volume first). In-app the tap would select that nearer region;
          // the target spot itself is cleanly reachable from a slightly
          // different camera. Selection ordering is the probe suites' job —
          // coverage only cares that the skin is paintable.
          if (
            proxyHits.length &&
            meshHits[0].distance - proxyHits[0].distance > 0.25 &&
            proxyHits[0].point.distanceTo(skinPoint) > 0.25
          ) {
            tested--;
            occluded++;
            continue;
          }
          if (!proxyHits.length) {
            uncovered.push({
              point: skinPoint.clone(),
              nearest: nearestRegion(volumes, skinPoint),
              reason: "no region hit",
            });
            continue;
          }
          const claimed = proxyHits[0].object.userData.regionId as RegionId;
          if (signedDistance(volumeById.get(claimed)!, skinPoint) > CONTAIN_EPS) {
            uncovered.push({
              point: skinPoint.clone(),
              nearest: nearestRegion(volumes, skinPoint),
              reason: `outside claimed ${claimed}`,
            });
            continue;
          }
          covered++;
        }

        const coverage = covered / tested;
        console.log(
          `${variant}: coverage ${(coverage * 100).toFixed(2)}% ` +
            `(${covered}/${tested} tested, ${occluded} occluded, ${exempt} exempt)`,
        );
        if (coverage < COVERAGE_GATE) {
          for (const c of clusterize(uncovered).slice(0, 12)) {
            console.log(
              `  HOLE x${c.count} @ ${describeLocation(c.centroid)} ` +
                `[${c.centroid.toArray().map((v) => v.toFixed(2)).join(", ")}] ` +
                `near ${c.nearest} (${[...c.reasons].join("; ")})`,
            );
          }
        }
        expect(coverage).toBeGreaterThanOrEqual(COVERAGE_GATE);
      },
    );
  });
}

function nearestRegion(volumes: RegionVolume[], point: THREE.Vector3): RegionId {
  let bestId = volumes[0].id;
  let bestD = Infinity;
  for (const v of volumes) {
    const d = signedDistance(v, point);
    if (d < bestD) {
      bestD = d;
      bestId = v.id;
    }
  }
  return bestId;
}
