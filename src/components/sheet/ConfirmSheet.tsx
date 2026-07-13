"use client";

import { Drawer } from "vaul";
import { regionSide, type BodyVariant, type RegionId } from "@/data/regions";
import { useSession } from "@/store/session";
import { en, regionLabel } from "@/i18n/en";
import {
  regionAnchor,
  regionNeighbors,
} from "@/components/canvas/body-variants";

/**
 * Direction hint for an Adjust chip ("Higher — Left shoulder"), derived from
 * proxy centroids. Dominant axis wins; anatomical left = +x.
 */
function directionHint(
  variant: BodyVariant,
  from: RegionId,
  to: RegionId,
): string {
  const [fx, fy, fz] = regionAnchor(variant, from);
  const [tx, ty, tz] = regionAnchor(variant, to);
  const dx = tx - fx;
  const dy = ty - fy;
  const dz = tz - fz;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const az = Math.abs(dz);
  if (ay >= ax && ay >= az) return dy > 0 ? en.direction.higher : en.direction.lower;
  if (az >= ax) return dz > 0 ? en.direction.front : en.direction.back;
  return dx > 0 ? en.direction.left : en.direction.right;
}

export function ConfirmSheet() {
  const variant = useSession((s) => s.bodyVariant) ?? "body-a";
  const pending = useSession((s) => s.pending);
  const reviewPinId = useSession((s) => s.reviewPinId);
  const pins = useSession((s) => s.pins);
  const confirmPending = useSession((s) => s.confirmPending);
  const startAdjust = useSession((s) => s.startAdjust);
  const clearPending = useSession((s) => s.clearPending);
  const closePinReview = useSession((s) => s.closePinReview);
  const deletePin = useSession((s) => s.deletePin);
  const selectRegion = useSession((s) => s.selectRegion);

  const reviewIndex = pins.findIndex((p) => p.id === reviewPinId);
  const reviewPin = reviewIndex >= 0 ? pins[reviewIndex] : null;
  const open = pending !== null || reviewPin !== null;

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      clearPending();
      closePinReview();
    }
  };

  const handleConfirm = () => {
    navigator.vibrate?.(20);
    confirmPending();
  };

  return (
    // modal={false}: no overlay, the canvas stays live for re-tapping
    // while adjusting (DESIGN.md §3.2)
    <Drawer.Root open={open} onOpenChange={handleOpenChange} modal={false}>
      <Drawer.Portal>
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-[480px] rounded-t-card bg-card px-5 pb-8 pt-3 shadow-sheet outline-none"
          aria-describedby={undefined}
        >
          <div
            aria-hidden
            className="mx-auto mb-4 h-1 w-10 rounded-chip bg-line"
          />

          {pending && (
            <>
              <Drawer.Title className="font-display text-section text-ink">
                {regionLabel(pending.regionId, variant)}
                {regionSide(pending.regionId) &&
                  ` — ${en.confirm.sideClarifier(regionSide(pending.regionId)!)}`}
              </Drawer.Title>
              <p className="mt-1 text-body text-ink">{en.confirm.question}</p>

              {!pending.adjusting ? (
                <div className="mt-5 flex gap-3">
                  <button
                    onClick={handleConfirm}
                    className="h-12 flex-1 rounded-button bg-teal text-body font-medium text-card"
                  >
                    {en.confirm.yes}
                  </button>
                  <button
                    onClick={startAdjust}
                    className="h-12 flex-1 rounded-button border border-line bg-card text-body font-medium text-ink"
                  >
                    {en.confirm.adjust}
                  </button>
                </div>
              ) : (
                <div className="mt-4">
                  <p className="text-chip text-slate">{en.confirm.adjustHint}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {regionNeighbors(variant, pending.regionId).map(
                      (neighborId) => (
                        <button
                          key={neighborId}
                          onClick={() => selectRegion(neighborId)}
                          className="min-h-11 rounded-chip border border-line bg-card px-4 py-2 text-chip text-ink"
                        >
                          {directionHint(variant, pending.regionId, neighborId)}{" "}
                          — {regionLabel(neighborId, variant)}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {reviewPin && (
            <>
              <Drawer.Title className="font-display text-section text-ink">
                {en.pin.title(reviewIndex + 1)} —{" "}
                {regionLabel(reviewPin.location.regionId, variant)}
              </Drawer.Title>
              <div className="mt-5 flex gap-3">
                <button
                  onClick={closePinReview}
                  className="h-12 flex-1 rounded-button bg-teal text-body font-medium text-card"
                >
                  {en.pin.keep}
                </button>
                <button
                  onClick={() => deletePin(reviewPin.id)}
                  className="h-12 flex-1 rounded-button border border-line bg-card text-body font-medium text-ink"
                >
                  {en.pin.remove}
                </button>
              </div>
            </>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
