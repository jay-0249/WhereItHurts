"use client";

import { Html } from "@react-three/drei";
import { motion } from "motion/react";
import { isRegionId } from "@/data/regions";
import { useSession } from "@/store/session";
import { en, regionLabel } from "@/i18n/en";
import { regionAnchor } from "./body-variants";

export function Pins() {
  const variant = useSession((s) => s.bodyVariant) ?? "body-a";
  const pins = useSession((s) => s.pins);
  const openPinReview = useSession((s) => s.openPinReview);

  return (
    <>
      {pins.map((pin, index) => {
        const { regionId } = pin.location;
        if (!isRegionId(regionId)) return null;
        const [x, y, z] = regionAnchor(variant, regionId);
        return (
          <Html
            key={pin.id}
            position={[x, y, z]}
            center
            zIndexRange={[20, 0]}
          >
            <motion.button
              // Single soft 1.2x→1x settle on confirm, no bounce (DESIGN.md §4)
              initial={{ scale: 1.2 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              onClick={() => openPinReview(pin.id)}
              aria-label={en.pin.ariaLabel(
                index + 1,
                regionLabel(regionId, variant),
              )}
              className="flex h-7 w-7 items-center justify-center rounded-chip bg-ember text-chip font-medium text-card shadow-card"
            >
              {index + 1}
            </motion.button>
          </Html>
        );
      })}
    </>
  );
}
