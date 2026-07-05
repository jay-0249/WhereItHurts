"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useSession } from "@/store/session";
import { isRegionId } from "@/data/regions";
import { computeFitFromBounds, fitsMatch } from "@/lib/body-fit.mjs";
import {
  BODY_VARIANTS,
  figureForVariant,
  landmarksForVariant,
  resolveProxy,
} from "./body-variants";

const SELECT_OPACITY = 0.35; // ember wash at 35% (DESIGN.md)
const HOVER_OPACITY = 0.15;
const FADE_SECONDS = 0.2; // fades in over 200ms (DESIGN.md §4)

interface TintShader {
  uniforms: Record<string, THREE.IUniform>;
}

/**
 * The single continuous visual body mesh. All taps land on the invisible
 * proxy layer (BodyModel); this mesh is double-locked out of selection:
 * raycast nulled per mesh AND never on REGION_RAYCAST_LAYER.
 *
 * The selection/hover highlight is fragment tinting IN this mesh's
 * material: the clay shader receives one active proxy volume as uniforms,
 * computes each fragment's signed distance to it, and tints inside
 * fragments with ember. The wash is therefore literally part of the skin
 * surface — it cannot spill past the silhouette, show through from the
 * far side, or disconnect into buried-shell patches.
 */
export function BodyVisual() {
  const variant = useSession((s) => s.bodyVariant) ?? "body-a";
  const { glbPath } = BODY_VARIANTS[variant];
  const { scene } = useGLTF(glbPath);

  const shaderRef = useRef<TintShader | null>(null);

  const clayMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: "#C9B8A8",
      roughness: 0.85,
    });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        uTintPos: { value: new THREE.Vector3() },
        uTintScale: { value: new THREE.Vector3(1, 1, 1) },
        uTintRotInv: { value: new THREE.Matrix3() },
        uTintRadius: { value: 0 },
        uTintHalfLen: { value: 0 },
        uTintKind: { value: 0 }, // 0 = sphere/ellipsoid, 1 = y-axis capsule
        uTintOpacity: { value: 0 },
        uTintColor: { value: new THREE.Color("#E4572E") },
      });
      shader.vertexShader =
        "varying vec3 vTintWorldPos;\n" +
        shader.vertexShader.replace(
          "#include <worldpos_vertex>",
          [
            "#include <worldpos_vertex>",
            "  vTintWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;",
          ].join("\n"),
        );
      shader.fragmentShader =
        [
          "varying vec3 vTintWorldPos;",
          "uniform vec3 uTintPos;",
          "uniform vec3 uTintScale;",
          "uniform mat3 uTintRotInv;",
          "uniform float uTintRadius;",
          "uniform float uTintHalfLen;",
          "uniform float uTintKind;",
          "uniform float uTintOpacity;",
          "uniform vec3 uTintColor;",
          "",
        ].join("\n") +
        shader.fragmentShader.replace(
          "#include <dithering_fragment>",
          [
            "#include <dithering_fragment>",
            "{",
            "  vec3 p = (uTintRotInv * (vTintWorldPos - uTintPos)) / uTintScale;",
            "  float d;",
            "  if (uTintKind < 0.5) {",
            "    d = length(p) - uTintRadius;",
            "  } else {",
            "    vec3 q = p;",
            "    q.y -= clamp(q.y, -uTintHalfLen, uTintHalfLen);",
            "    d = length(q) - uTintRadius;",
            "  }",
            // soft ~0.01-unit falloff at the volume boundary
            "  float inside = 1.0 - smoothstep(-0.01, 0.01, d);",
            "  gl_FragColor.rgb = mix(gl_FragColor.rgb, uTintColor, uTintOpacity * inside);",
            "}",
          ].join("\n"),
        );
      shaderRef.current = shader;
    };
    return mat;
  }, []);
  useEffect(() => () => clayMaterial.dispose(), [clayMaterial]);

  // Tint animation mutates shader uniforms in useFrame — never React state
  // (CLAUDE.md). Selection: 35% with the 200ms fade-in restarting per
  // region. Hover (desktop, when nothing is selected): 15%.
  const lastActiveRef = useRef<string | null>(null);
  useFrame((_, delta) => {
    const shader = shaderRef.current;
    if (!shader) return;
    const state = useSession.getState();
    const pendingId = state.pending?.regionId ?? null;
    const activeId = pendingId ?? state.hoveredRegion;
    const target = pendingId
      ? SELECT_OPACITY
      : state.hoveredRegion
        ? HOVER_OPACITY
        : 0;

    if (activeId !== lastActiveRef.current) {
      lastActiveRef.current = activeId;
      shader.uniforms.uTintOpacity.value = 0;
      if (activeId && isRegionId(activeId)) {
        const activeVariant = state.bodyVariant ?? "body-a";
        const spec = figureForVariant(activeVariant)[activeId];
        const resolved = resolveProxy(activeVariant, activeId);
        shader.uniforms.uTintPos.value.set(...resolved.position);
        shader.uniforms.uTintScale.value.set(...resolved.scale);
        shader.uniforms.uTintRotInv.value.setFromMatrix4(
          new THREE.Matrix4()
            .makeRotationFromEuler(new THREE.Euler(...resolved.rotation))
            .invert(),
        );
        shader.uniforms.uTintRadius.value = spec.radius;
        shader.uniforms.uTintHalfLen.value = (spec.length ?? 0) / 2;
        shader.uniforms.uTintKind.value = spec.kind === "capsule" ? 1 : 0;
      }
    }

    const current = shader.uniforms.uTintOpacity.value as number;
    const step = (delta / FADE_SECONDS) * SELECT_OPACITY;
    shader.uniforms.uTintOpacity.value =
      current + Math.sign(target - current) * Math.min(Math.abs(target - current), step);
  });

  const body = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.material = clayMaterial;
        mesh.raycast = () => {};
      }
    });
    // Auto-fit via THE shared transform (src/lib/body-fit.mjs) — the same
    // function measures landmarks, so mesh and proxies share one frame by
    // construction. fitted = (p - center) * scale.
    const box = new THREE.Box3().setFromObject(root);
    const fit = computeFitFromBounds(box.min.toArray(), box.max.toArray());
    root.scale.setScalar(fit.scale);
    root.position.set(
      -fit.center[0] * fit.scale,
      -fit.center[1] * fit.scale,
      -fit.center[2] * fit.scale,
    );
    if (process.env.NODE_ENV === "development") {
      const measured = landmarksForVariant(variant).fit;
      console.info(
        `[body-fit] ${variant} runtime scale=${fit.scale.toFixed(6)} ` +
          `center=[${fit.center.map((c) => c.toFixed(6)).join(", ")}] | ` +
          `landmarks scale=${measured.scale} center=[${measured.center.join(", ")}]`,
      );
      if (!fitsMatch(fit, measured)) {
        console.error(
          `[body-fit] ${variant}: runtime auto-fit does not match the fit ` +
            `recorded in the landmark file — landmarks/proxies live in a ` +
            `different frame than the rendered mesh. Re-run scripts/measure-body.mjs.`,
        );
      }
    }
    return root;
  }, [scene, clayMaterial, variant]);

  return <primitive object={body} />;
}

for (const config of Object.values(BODY_VARIANTS)) {
  useGLTF.preload(config.glbPath);
}
