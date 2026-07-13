/**
 * Independent SEMANTIC checks on the baked labeling — the layer that keeps
 * "tap == nearest label" tests from being circular. Predicates are stated
 * in anatomy terms against manifest anchors/AABBs (fitted frame: +x =
 * patient's LEFT, +z = anterior, y up) and landmark lines.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { regionSide, regionsForVariant, type BodyVariant, type RegionId } from "@/data/regions";
import { manifestForVariant } from "@/components/canvas/body-variants";

const landmarksDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "data",
  "landmarks",
);

for (const variant of ["body-a", "body-b"] as const satisfies readonly BodyVariant[]) {
  describe(`label sanity on ${variant}`, () => {
    const manifest = manifestForVariant(variant);
    const lm = JSON.parse(
      readFileSync(path.join(landmarksDir, `${variant}.json`), "utf8"),
    );
    const anchor = (id: RegionId) => {
      const entry = manifest.regions[id];
      expect(entry, id).toBeDefined();
      return entry.anchor as [number, number, number];
    };

    it("sided regions sit on the patient's correct side", () => {
      for (const id of regionsForVariant(variant)) {
        const side = regionSide(id);
        if (!side) continue;
        const [x] = anchor(id);
        if (side === "left") expect(x, id).toBeGreaterThan(0);
        else expect(x, id).toBeLessThan(0);
      }
    });

    it("midline regions hug the midline", () => {
      for (const id of [
        "chest.sternum",
        "abdomen.navel",
        "back.spine.upper",
        "back.spine.mid",
        "back.spine.lumbar",
        "back.sacrum",
        "back.tailbone",
        "pelvis.pubic",
      ] as const) {
        expect(Math.abs(anchor(id)[0]), id).toBeLessThan(0.14);
      }
    });

    it("front regions face forward of their back counterparts", () => {
      const pairs: Array<[RegionId, RegionId]> = [
        ["chest.pec.left", "back.scapula.left"],
        ["chest.pec.right", "back.scapula.right"],
        ["abdomen.navel", "back.spine.lumbar"],
        ["neck.throat", "neck.nape"],
        ["leg.thigh.front.left", "leg.thigh.back.left"],
        ["leg.knee.cap.left", "leg.knee.back.left"],
        ["leg.shin.left", "leg.calf.left"],
        ["arm.elbow.crease.left", "arm.elbow.point.left"],
      ];
      for (const [front, back] of pairs) {
        expect(anchor(front)[2], `${front} vs ${back}`).toBeGreaterThan(
          anchor(back)[2],
        );
      }
    });

    it("the rest pose pronates the forearm: palm faces backward of the hand's dorsum", () => {
      expect(anchor("hand.palm.left")[2]).toBeLessThan(anchor("hand.back.left")[2]);
      expect(anchor("hand.palm.right")[2]).toBeLessThan(anchor("hand.back.right")[2]);
    });

    it("the shoulder-blade band lies between the shoulder line and the waist, posterior", () => {
      for (const id of ["back.scapula.left", "back.scapula.right"] as const) {
        const [, y, z] = anchor(id);
        expect(y, id).toBeLessThan(lm.shoulder.y);
        expect(y, id).toBeGreaterThan(lm.waist.y);
        expect(z, id).toBeLessThan(anchor("chest.sternum")[2]);
      }
    });

    it("vertical ordering holds down the body", () => {
      // AABB mid-heights: anchors are interior-most vertices and can sit
      // anywhere inside a zone that wraps (e.g. the ankle collar)
      const midY = (id: RegionId) => {
        const box = manifest.regions[id].aabb;
        return (box.min[1] + box.max[1]) / 2;
      };
      const below = (a: RegionId, b: RegionId) =>
        expect(midY(a), `${a} below ${b}`).toBeLessThan(midY(b));
      below("neck.throat", "head.mouth");
      below("chest.sternum", "neck.throat");
      below("abdomen.navel", "chest.sternum");
      below("pelvis.pubic", "abdomen.navel");
      below("back.spine.lumbar", "back.spine.mid");
      below("back.spine.mid", "back.spine.upper");
      below("back.tailbone", "back.spine.lumbar");
      below("leg.knee.cap.left", "leg.thigh.front.left");
      below("leg.shin.left", "leg.knee.cap.left");
      below("foot.toes.left", "leg.ankle.outer.left");
      below("arm.forearm.inner.left", "arm.elbow.point.left");
      below("hand.fingers.left", "arm.wrist.left");
    });

    it("feet zones are oriented: toes forward of heel, sole below top", () => {
      for (const side of ["left", "right"] as const) {
        expect(anchor(`foot.toes.${side}`)[2]).toBeGreaterThan(
          anchor(`foot.heel.${side}`)[2],
        );
        expect(anchor(`foot.sole.${side}`)[1]).toBeLessThan(
          anchor(`foot.top.${side}`)[1],
        );
      }
    });

    it("ears are the most lateral head zones", () => {
      expect(Math.abs(anchor("head.ear.left")[0])).toBeGreaterThan(
        Math.abs(anchor("head.eye.left")[0]),
      );
      expect(Math.abs(anchor("head.ear.left")[0])).toBeGreaterThan(
        Math.abs(anchor("head.nose")[0]),
      );
    });

    if (variant === "body-b") {
      it("breast zones exist only on body-b, forward of the pecs", () => {
        expect(anchor("chest.breast.left")[2]).toBeGreaterThan(
          anchor("back.scapula.left")[2],
        );
      });
    } else {
      it("breast zones are absent on body-a", () => {
        expect(manifest.regions["chest.breast.left"]).toBeUndefined();
        expect(manifest.regions["chest.breast.right"]).toBeUndefined();
      });
    }
  });
}
