"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Outlines, useCursor } from "@react-three/drei";
import * as THREE from "three";
import { regionsForVariant, type RegionId } from "@/data/regions";
import { useSession } from "@/store/session";
import { FIGURE } from "./placeholder-figure";
import {
  overlayInflateFor,
  resolveProxy,
  type ResolvedProxy,
} from "./body-variants";

/**
 * Raycast layer reserved for selectable region proxies. Scene.tsx restricts
 * the event raycaster to this layer, so the visual body, floor, stage, and
 * any helper objects can never be selected or highlighted — only proxies
 * are eligible hits.
 */
export const REGION_RAYCAST_LAYER = 1;

const EMBER = "#E4572E";
// Translucent ember wash over the visual mesh (DESIGN.md: mild = 35%)
const OVERLAY_OPACITY = 0.35;
const OVERLAY_FADE_SECONDS = 0.2; // fades in over 200ms (DESIGN.md §4)
const TAP_SLOP_PX = 5; // pointer moved further than this = rotate, not tap

function buildProxyGeometry(id: RegionId): THREE.BufferGeometry {
  const spec = FIGURE[id];
  return spec.kind === "capsule"
    ? new THREE.CapsuleGeometry(spec.radius, spec.length ?? 0, 8, 24)
    : new THREE.SphereGeometry(spec.radius, 32, 24);
}

/**
 * The invisible interaction layer: one raycastable proxy volume per region.
 * Proxies stay rendered (visible=false can drop meshes out of raycasting)
 * but draw nothing: opacity 0, no color write, no depth write.
 */
export function BodyModel() {
  const variant = useSession((s) => s.bodyVariant) ?? "body-a";
  const pending = useSession((s) => s.pending);
  const selectRegion = useSession((s) => s.selectRegion);
  const [hovered, setHovered] = useState<RegionId | null>(null);
  useCursor(hovered !== null);

  const regionIds = useMemo(() => regionsForVariant(variant), [variant]);

  const geometries = useMemo(() => {
    const map = new Map<RegionId, THREE.BufferGeometry>();
    for (const id of regionIds) map.set(id, buildProxyGeometry(id));
    return map;
  }, [regionIds]);

  const transforms = useMemo(() => {
    const map = new Map<RegionId, ResolvedProxy>();
    for (const id of regionIds) map.set(id, resolveProxy(variant, id));
    return map;
  }, [variant, regionIds]);

  const proxyMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        colorWrite: false,
        depthWrite: false,
      }),
    [],
  );

  // Dev-only proxy visualization for mesh alignment passes: open the app
  // with ?proxies=1 to see every proxy volume tinted at 20% opacity.
  const debugProxies =
    process.env.NODE_ENV === "development" &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("proxies") === "1";

  const debugMaterials = useMemo(() => {
    if (!debugProxies) return null;
    const map = new Map<RegionId, THREE.MeshBasicMaterial>();
    regionIds.forEach((id, i) => {
      map.set(
        id,
        new THREE.MeshBasicMaterial({
          // golden-ratio hue steps give adjacent regions distinct colors
          color: new THREE.Color().setHSL((i * 0.618034) % 1, 0.7, 0.5),
          transparent: true,
          opacity: 0.2,
          depthWrite: false,
        }),
      );
    });
    return map;
  }, [debugProxies, regionIds]);

  useEffect(
    () => () => debugMaterials?.forEach((m) => m.dispose()),
    [debugMaterials],
  );

  // Depth-tested (so it hides when the camera is on the far side of the
  // body) but never depth-written; negative polygon offset wins ties where
  // the overlay surface nearly coincides with the skin. Combined with the
  // normal inflation below, the wash always reads as ON the body surface.
  const overlayMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: EMBER,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        // explicit: far hemisphere of the inflated shell must be culled,
        // never rendered as a rim around the silhouette
        side: THREE.FrontSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    [],
  );

  useEffect(() => {
    return () => {
      geometries.forEach((g) => g.dispose());
    };
  }, [geometries]);

  useEffect(() => {
    return () => {
      proxyMaterial.dispose();
      overlayMaterial.dispose();
    };
  }, [proxyMaterial, overlayMaterial]);

  const selectedRegionId =
    pending && regionIds.includes(pending.regionId) ? pending.regionId : null;
  const selectedTransform = selectedRegionId
    ? transforms.get(selectedRegionId)
    : undefined;

  // Overlay geometry: proxy geometry with scale baked in, then inflated
  // along recomputed normals — a uniform world-space offset even for
  // non-uniformly scaled proxies. Inflation is per-region-overridable in
  // body-variants.ts and sized to clear the visual surface everywhere.
  const overlayGeometry = useMemo(() => {
    if (!selectedRegionId || !selectedTransform) return null;
    const inflate = overlayInflateFor(selectedRegionId);
    const g = buildProxyGeometry(selectedRegionId);
    g.scale(...selectedTransform.scale);
    g.computeVertexNormals();
    const pos = g.attributes.position as THREE.BufferAttribute;
    const nor = g.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(
        i,
        pos.getX(i) + nor.getX(i) * inflate,
        pos.getY(i) + nor.getY(i) * inflate,
        pos.getZ(i) + nor.getZ(i) * inflate,
      );
    }
    pos.needsUpdate = true;
    return g;
  }, [selectedRegionId, selectedTransform]);

  useEffect(() => () => overlayGeometry?.dispose(), [overlayGeometry]);

  // Overlay opacity animates by mutating the material in useFrame — never
  // setState per frame (CLAUDE.md). Fade restarts whenever selection moves.
  const lastSelectedRef = useRef<RegionId | null>(null);
  useFrame((_, delta) => {
    if (selectedRegionId !== lastSelectedRef.current) {
      overlayMaterial.opacity = 0;
      lastSelectedRef.current = selectedRegionId;
    }
    if (selectedRegionId) {
      overlayMaterial.opacity = Math.min(
        OVERLAY_OPACITY,
        overlayMaterial.opacity +
          (delta / OVERLAY_FADE_SECONDS) * OVERLAY_OPACITY,
      );
    }
  });

  const handleTap = (id: RegionId) => (event: ThreeEvent<MouseEvent>) => {
    if (event.delta > TAP_SLOP_PX) return;
    event.stopPropagation();
    navigator.vibrate?.(10);
    selectRegion(id);
  };

  return (
    <group>
      {regionIds.map((id) => {
        const t = transforms.get(id)!;
        const isSelected = selectedRegionId === id;
        return (
          <mesh
            key={id}
            ref={(mesh) => mesh?.layers.enable(REGION_RAYCAST_LAYER)}
            geometry={geometries.get(id)}
            material={debugMaterials?.get(id) ?? proxyMaterial}
            position={t.position}
            scale={t.scale}
            rotation={t.rotation}
            onClick={handleTap(id)}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHovered(id);
            }}
            onPointerOut={() => setHovered((h) => (h === id ? null : h))}
          >
            {/* Hover: outline only. Selected: outline + ember overlay
                (DESIGN.md). World-space thickness — screenspace mode
                misrenders on non-uniformly scaled meshes. */}
            {/* Outline displaced by the same amount as the overlay so it
                also clears the visual surface */}
            {(isSelected || hovered === id) && (
              <Outlines thickness={overlayInflateFor(id)} color={EMBER} />
            )}
          </mesh>
        );
      })}

      {selectedRegionId && overlayGeometry && selectedTransform && (
        <mesh
          geometry={overlayGeometry}
          material={overlayMaterial}
          position={selectedTransform.position}
          rotation={selectedTransform.rotation}
          raycast={() => {}}
          // draw after the visual body so the wash composites over the skin
          renderOrder={2}
        />
      )}
    </group>
  );
}
