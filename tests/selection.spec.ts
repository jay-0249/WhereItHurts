/**
 * Selection regression suite — the verification path for every
 * geometry/proxy/mesh change (replaces manual tap-testing).
 *
 * No browser, no WebGL: proxy volumes are instantiated exactly as
 * BodyModel builds them (same geometry constructors, same resolveProxy
 * transforms) and probed with three.js Raycaster math from the app's
 * camera positions. Probe coordinates derive from each variant's landmark
 * JSON, so the suite survives mesh swaps without hand-edited coordinates.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  regionsForVariant,
  REGION_VARIANTS,
  type BodyVariant,
  type RegionId,
} from "@/data/regions";
import { figureForVariant, resolveProxy } from "@/components/canvas/body-variants";
import type { BodyLandmarks } from "@/data/figure-from-landmarks.mjs";
import landmarksA from "@/data/landmarks/body-a.json";
import landmarksB from "@/data/landmarks/body-b.json";

const LANDMARKS: Record<BodyVariant, BodyLandmarks> = {
  "body-a": landmarksA as BodyLandmarks,
  "body-b": landmarksB as BodyLandmarks,
};

const H = 3.6;
const CAMERAS = {
  front: new THREE.Vector3(0, 1.8, 4.6),
  back: new THREE.Vector3(0, 1.8, -4.6),
  left: new THREE.Vector3(4.6, 1.8, 0), // anatomical left = +x
  right: new THREE.Vector3(-4.6, 1.8, 0),
} as const;
type CameraName = keyof typeof CAMERAS;

/** Build the raycastable proxy scene exactly as BodyModel does. */
function buildScene(variant: BodyVariant) {
  const group = new THREE.Group();
  const figure = figureForVariant(variant);
  for (const id of regionsForVariant(variant)) {
    const spec = figure[id];
    const geometry =
      spec.kind === "capsule"
        ? new THREE.CapsuleGeometry(spec.radius, spec.length ?? 0, 8, 24)
        : new THREE.SphereGeometry(spec.radius, 32, 24);
    const mesh = new THREE.Mesh(geometry);
    const t = resolveProxy(variant, id);
    mesh.position.set(...t.position);
    mesh.scale.set(...t.scale);
    mesh.rotation.set(...t.rotation);
    mesh.userData.regionId = id;
    group.add(mesh);
  }
  group.updateMatrixWorld(true);
  return group;
}

const raycaster = new THREE.Raycaster();

function firstHit(group: THREE.Group, camera: CameraName, point: [number, number, number]): RegionId | null {
  const origin = CAMERAS[camera];
  const direction = new THREE.Vector3(...point).sub(origin).normalize();
  raycaster.set(origin, direction);
  const hits = raycaster.intersectObjects(group.children, false);
  return hits.length ? (hits[0].object.userData.regionId as RegionId) : null;
}

interface Probe {
  name: string;
  camera: CameraName;
  point: [number, number, number];
  expect: RegionId | RegionId[];
}

/** Mirror a left-side probe to the right side. */
function mirrored(probe: Probe): Probe {
  // side tokens can be infix (torso.chest.left.anterior), not just suffix
  const swapSide = (id: string) =>
    id.includes(".left") ? id.replace(".left", ".right") : id.replace(".right", ".left");
  return {
    name: probe.name.replace("left", "right"),
    camera: probe.camera === "left" ? "right" : probe.camera === "right" ? "left" : probe.camera,
    point: [-probe.point[0], probe.point[1], probe.point[2]],
    expect: Array.isArray(probe.expect)
      ? (probe.expect.map(swapSide) as RegionId[])
      : (swapSide(probe.expect) as RegionId),
  };
}

function buildProbes(lm: BodyLandmarks, variant: BodyVariant): Probe[] {
  const pelvisTop = lm.crotchY + 0.55 * (lm.waist.y - lm.crotchY);
  const chestY = (lm.shoulder.y + lm.chestBotY) / 2;
  const abdTop = lm.chestBotY;
  const abdBot = pelvisTop;
  const abdMid = (abdTop + abdBot) / 2;
  const headH = H - lm.chinY;
  const headCY = (H + lm.chinY) / 2;
  const headCZ = (lm.head.zMin + lm.head.zMax) / 2;
  const chestHW = lm.torsoSlices.chest.halfWidth;
  const arm = lm.arm;
  const leg = lm.leg;
  const mid = (a: number[], b: number[]): [number, number, number] => [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
    (a[2] + b[2]) / 2,
  ];

  // upper arm spans acromion -> elbow (matches the builder's anchor)
  const shoulderJoint = [
    lm.shoulder.halfWidth * 0.85,
    lm.shoulder.y - 0.04,
    arm.top[2],
  ];

  const sided: Probe[] = [
    { name: "mid-bicep left", camera: "left", point: mid(shoulderJoint, arm.elbow), expect: "arm.upper.left" },
    { name: "elbow left", camera: "left", point: arm.elbow as [number, number, number], expect: "arm.elbow.left" },
    { name: "mid-forearm left", camera: "left", point: mid(arm.elbow, arm.wrist), expect: "arm.fore.left" },
    { name: "wrist left", camera: "left", point: arm.wrist as [number, number, number], expect: "arm.wrist.left" },
    {
      // mid-palm, clear of the wrist sphere above it
      name: "palm left", camera: "front",
      point: [arm.wrist[0], (arm.wristY - 0.02 + arm.handBottomY) / 2, arm.hand.cz],
      expect: "hand.left",
    },
    {
      name: "fingers left", camera: "front",
      point: [arm.wrist[0], arm.handBottomY - 0.01, arm.hand.cz],
      expect: "hand.fingers.left",
    },
    {
      // upper chest at clavicle level, above the breast zone — mid-chest
      // points legitimately belong to the breast region on body-b
      name: "chest left", camera: "front",
      point: [
        chestHW * 0.7,
        lm.shoulder.y - 0.15 * (lm.shoulder.y - lm.chestBotY),
        lm.torsoSlices.chest.zMax,
      ],
      expect: "torso.chest.left.anterior",
    },
    {
      name: "shoulder cap left", camera: "front",
      point: [lm.shoulder.halfWidth * 0.88, lm.shoulder.y - 0.02, 0.3],
      expect: "shoulder.left",
    },
    {
      // z at the measured flank depth: z=0 sits in front of the actual hip
      // skin (this frame's z-center is skewed by the forward hands) and the
      // hanging forearm intercepts rays aimed there
      name: "hip crest left", camera: "left",
      point: [
        lm.hip.halfWidth * 0.72,
        (pelvisTop + lm.crotchY) / 2,
        (lm.torsoSlices.hip.zMin + lm.torsoSlices.hip.zMax) / 2,
      ],
      expect: "hip.left",
    },
    {
      // z targets aim at the actual body axis/surface: steep rays through
      // far-forward targets overshoot thin volumes entirely
      name: "mid-thigh left", camera: "front",
      point: [(leg.topX + leg.knee.x) / 2, leg.thigh.y, leg.thigh.z],
      expect: "leg.upper.left",
    },
    { name: "kneecap left", camera: "front", point: [leg.knee.x, leg.knee.y, leg.knee.z], expect: "leg.knee.left" },
    {
      name: "shin left", camera: "front",
      point: [(leg.knee.x + leg.ankle.x) / 2, leg.calf.y, leg.calf.zMax],
      expect: "leg.shin.left",
    },
    {
      name: "rear calf left", camera: "back",
      point: [(leg.knee.x + leg.ankle.x) / 2, leg.calf.y, leg.calf.zMin],
      expect: "leg.calf.left",
    },
    { name: "ankle left", camera: "front", point: [leg.ankle.x, leg.ankle.y, leg.ankle.z], expect: "leg.ankle.left" },
    {
      // low enough to clear the ankle sphere's bottom edge
      name: "heel left", camera: "back",
      point: [lm.foot.centerX, 0.07, (lm.foot.zMin + lm.foot.zMax) / 2],
      expect: "foot.left",
    },
    {
      name: "toes left", camera: "front",
      point: [lm.foot.centerX, 0.06, lm.foot.zMax],
      expect: "foot.toes.left",
    },
    { name: "ear left", camera: "left", point: [lm.head.halfWidth + 0.02, headCY, headCZ], expect: "head.ear.left" },
    {
      name: variant === "body-b" ? "breast left" : "breast-point left (chest on body-a)",
      camera: "front",
      point: [chestHW * 0.42, lm.bust.y, lm.torsoSlices.chest.zMax],
      expect: variant === "body-b" ? "torso.chest.breast.left" : "torso.chest.left.anterior",
    },
  ];

  const central: Probe[] = [
    {
      name: "sternum (any front region)", camera: "front",
      point: [0, chestY, lm.torsoSlices.chest.zMax],
      expect: [
        "torso.chest.left.anterior", "torso.chest.right.anterior",
        "torso.chest.breast.left", "torso.chest.breast.right",
      ],
    },
    {
      name: "navel", camera: "front",
      point: [0, (abdMid + abdBot) / 2, lm.torsoSlices.waist.zMax],
      expect: "torso.abdomen.lower.anterior",
    },
    {
      name: "upper abdomen", camera: "front",
      point: [0, (abdTop + abdMid) / 2, lm.torsoSlices.waist.zMax],
      expect: "torso.abdomen.upper.anterior",
    },
    {
      name: "pelvis", camera: "front",
      point: [0, pelvisTop - 0.25 * (pelvisTop - lm.crotchY), lm.torsoSlices.pelvis.zMax],
      expect: "torso.pelvis.anterior",
    },
    {
      name: "groin", camera: "front",
      point: [0, lm.crotchY + 0.02, lm.torsoSlices.pelvis.zMax * 0.3],
      expect: "torso.groin",
    },
    {
      name: "upper back", camera: "back",
      point: [0, (lm.shoulder.y + (lm.armpitY + lm.waist.y) / 2) / 2, -1],
      expect: "torso.back.upper",
    },
    {
      name: "lower back", camera: "back",
      point: [0, ((lm.armpitY + lm.waist.y) / 2 + lm.crotchY + 0.08) / 2, -1],
      expect: "torso.back.lower",
    },
    { name: "jaw", camera: "front", point: [0, lm.chinY + 0.16 * headH, lm.head.zMax], expect: "head.jaw" },
    { name: "eyes", camera: "front", point: [0, lm.chinY + 0.6 * headH, lm.head.zMax], expect: "head.eyes" },
    // back of head: from front or side, face/ear volumes legitimately
    // intercept steep rays aimed at the crown
    { name: "back of head", camera: "back", point: [0, headCY + 0.1, lm.head.zMin], expect: "head" },
    { name: "neck front", camera: "front", point: [0, (lm.chinY + lm.shoulder.y) / 2, 0.3], expect: "neck.front" },
    { name: "neck back", camera: "back", point: [0, (lm.chinY + lm.shoulder.y) / 2, -0.3], expect: "neck.back" },
  ];

  return [...sided, ...sided.map(mirrored), ...central];
}

const FRONT_ONLY: RegionId[] = [
  "torso.chest.left.anterior", "torso.chest.right.anterior",
  "torso.chest.breast.left", "torso.chest.breast.right",
  "torso.abdomen.upper.anterior", "torso.abdomen.lower.anterior",
  "torso.pelvis.anterior", "torso.groin", "neck.front",
  "head.eyes", "leg.shin.left", "leg.shin.right",
  "foot.toes.left", "foot.toes.right",
];
const BACK_ONLY: RegionId[] = [
  "torso.back.upper", "torso.back.lower", "neck.back",
  "leg.calf.left", "leg.calf.right",
];

for (const variant of ["body-a", "body-b"] as const) {
  describe(`selection on ${variant}`, () => {
    const lm = LANDMARKS[variant];
    const scene = buildScene(variant);
    const probes = buildProbes(lm, variant);

    for (const probe of probes) {
      it(`${probe.name} -> ${Array.isArray(probe.expect) ? probe.expect.join("|") : probe.expect}`, () => {
        const hit = firstHit(scene, probe.camera, probe.point);
        if (Array.isArray(probe.expect)) {
          expect(hit).toBeTruthy();
          expect(probe.expect).toContain(hit);
        } else {
          expect(hit).toBe(probe.expect);
        }
      });
    }

    it("no front-camera ray first-hits a back-only region (and vice versa)", () => {
      const offenders: string[] = [];
      for (let y = 0.15; y <= 3.45; y += 0.15) {
        for (let x = -0.6; x <= 0.6; x += 0.1) {
          const front = firstHit(scene, "front", [x, y, 0]);
          if (front && BACK_ONLY.includes(front)) {
            offenders.push(`front (${x.toFixed(2)},${y.toFixed(2)}) -> ${front}`);
          }
          const back = firstHit(scene, "back", [x, y, 0]);
          if (back && FRONT_ONLY.includes(back)) {
            offenders.push(`back (${x.toFixed(2)},${y.toFixed(2)}) -> ${back}`);
          }
        }
      }
      expect(offenders).toEqual([]);
    });

    it("every region is reachable by at least one probe", () => {
      const reached = new Set<RegionId>();
      for (const probe of probes) {
        const hit = firstHit(scene, probe.camera, probe.point);
        if (hit) reached.add(hit);
      }
      const unreachable = regionsForVariant(variant).filter((id) => !reached.has(id));
      expect(unreachable).toEqual([]);
    });

    it("variant-only regions are gated correctly", () => {
      const ids = regionsForVariant(variant);
      for (const [id, allowed] of Object.entries(REGION_VARIANTS)) {
        if (allowed!.includes(variant)) {
          expect(ids).toContain(id as RegionId);
        } else {
          expect(ids).not.toContain(id as RegionId);
        }
      }
    });
  });
}
