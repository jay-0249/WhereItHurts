/**
 * Generates the placeholder capsule-blob body GLBs. Run from the project
 * root: node <this file>. Writes public/assets/body-neutral.glb and copies
 * it to body-a.glb / body-b.glb (the paths BODY_VARIANTS points at).
 *
 * The blob is ~8% slimmer than the proxy capsules so proxies envelop the
 * visual surface and the ember overlay draws outside it.
 */
import { mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

// GLTFExporter's binary path uses FileReader, which Node lacks.
class FileReaderShim {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      this.onloadend?.({ target: this });
      this.onload?.({ target: this });
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = `data:application/octet-stream;base64,${Buffer.from(buf).toString("base64")}`;
      this.onloadend?.({ target: this });
      this.onload?.({ target: this });
    });
  }
}
globalThis.FileReader ??= FileReaderShim;

function part(geom, x, y, z, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion(),
    new THREE.Vector3(sx, sy, sz),
  );
  return geom.applyMatrix4(m);
}

const parts = [
  part(new THREE.SphereGeometry(0.3, 24, 18), 0, 3.28, 0), // head
  part(new THREE.CylinderGeometry(0.09, 0.11, 0.35, 16), 0, 2.98, 0), // neck
  part(new THREE.CapsuleGeometry(0.36, 0.8, 8, 20), 0, 2.15, 0, 1.15, 1, 0.72), // torso
  part(new THREE.SphereGeometry(0.13, 20, 14), 0.44, 2.68, 0), // shoulders
  part(new THREE.SphereGeometry(0.13, 20, 14), -0.44, 2.68, 0),
  part(new THREE.CapsuleGeometry(0.095, 0.95, 8, 16), 0.55, 2.05, 0), // arms
  part(new THREE.CapsuleGeometry(0.095, 0.95, 8, 16), -0.55, 2.05, 0),
  part(new THREE.SphereGeometry(0.1, 16, 12), 0.57, 1.48, 0), // hands
  part(new THREE.SphereGeometry(0.1, 16, 12), -0.57, 1.48, 0),
  part(new THREE.CapsuleGeometry(0.125, 1.05, 8, 16), 0.2, 0.85, 0), // legs
  part(new THREE.CapsuleGeometry(0.125, 1.05, 8, 16), -0.2, 0.85, 0),
  part(new THREE.SphereGeometry(0.11, 16, 12), 0.2, 0.09, 0.1, 0.85, 0.6, 1.5), // feet
  part(new THREE.SphereGeometry(0.11, 16, 12), -0.2, 0.09, 0.1, 0.85, 0.6, 1.5),
];

const merged = mergeGeometries(parts, false);
const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial());
mesh.name = "Body";
const scene = new THREE.Scene();
scene.add(mesh);

new GLTFExporter().parse(
  scene,
  (result) => {
    mkdirSync("public/assets", { recursive: true });
    const out = Buffer.from(result);
    writeFileSync("public/assets/body-neutral.glb", out);
    copyFileSync("public/assets/body-neutral.glb", "public/assets/body-a.glb");
    copyFileSync("public/assets/body-neutral.glb", "public/assets/body-b.glb");
    console.log(`wrote ${out.length} bytes x3`);
  },
  (err) => {
    console.error(err);
    process.exit(1);
  },
  { binary: true },
);
