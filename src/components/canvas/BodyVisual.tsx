"use client";

import { useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useSession } from "@/store/session";
import { BODY_VARIANTS, VISUAL_TARGET_HEIGHT } from "./body-variants";

/**
 * The single continuous visual body mesh — purely decorative. All taps land
 * on the invisible proxy layer (BodyModel); this mesh is double-locked out
 * of selection: raycast nulled per mesh AND never on REGION_RAYCAST_LAYER.
 */
export function BodyVisual() {
  const variant = useSession((s) => s.bodyVariant) ?? "body-a";
  const { glbPath } = BODY_VARIANTS[variant];
  const { scene } = useGLTF(glbPath);

  // Clay material per DESIGN.md §1, overriding whatever the export carries.
  const clayMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({ color: "#C9B8A8", roughness: 0.85 }),
    [],
  );
  useEffect(() => () => clayMaterial.dispose(), [clayMaterial]);

  const body = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.material = clayMaterial;
        mesh.raycast = () => {};
      }
    });
    // Auto-fit: scale to the proxy figure's height, feet on the floor,
    // centered on x/z — so any export (placeholder blob or MakeHuman body)
    // drops in with no code changes.
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    if (size.y > 0) root.scale.setScalar(VISUAL_TARGET_HEIGHT / size.y);
    box.setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    root.position.set(-center.x, root.position.y - box.min.y, -center.z);
    return root;
  }, [scene, clayMaterial]);

  return <primitive object={body} />;
}

for (const config of Object.values(BODY_VARIANTS)) {
  useGLTF.preload(config.glbPath);
}
