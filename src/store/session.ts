"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { RegionId } from "@/data/regions";
import { regionLabel } from "@/i18n/en";

/** PainRecord conforms to the schema in PLANNING.md §3 exactly — do not add fields ad hoc. */
export type PainQuality =
  | "sharp"
  | "dull"
  | "burning"
  | "throbbing"
  | "needle"
  | "pressure"
  | "cramping";

export type Trigger =
  | "constant"
  | "movement"
  | "position"
  | "breathing"
  | "touch"
  | "intermittent";

export type Duration = "new" | "days" | "weeks" | "months" | "episodic";

export interface PainRecord {
  id: string;
  createdAt: string;
  location: {
    regionId: string;
    regionLabel: string;
    mode: "tap" | "paint";
    paintedRegionIds?: string[];
  };
  depth?: "skin" | "muscle" | "deep" | "unsure";
  quality?: PainQuality[];
  trigger?: Trigger;
  intensity?: 1 | 2 | 3 | 4;
  duration?: Duration;
  conditional?: {
    [ruleId: string]: string | { travelsToRegionId: string };
  };
  freeText?: string;
}

export interface SessionProfile {
  ageBand?: string;
  sex?: string;
  heightCm?: number;
  weightKg?: number;
}

interface PendingSelection {
  regionId: RegionId;
  /** true while the "Adjust" neighbor chips are showing */
  adjusting: boolean;
}

interface SessionState {
  pins: PainRecord[];
  profile: SessionProfile;
  pending: PendingSelection | null;
  reviewPinId: string | null;

  selectRegion: (regionId: RegionId) => void;
  startAdjust: () => void;
  confirmPending: () => void;
  clearPending: () => void;
  openPinReview: (pinId: string) => void;
  closePinReview: () => void;
  deletePin: (pinId: string) => void;
}

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      pins: [],
      profile: {},
      pending: null,
      reviewPinId: null,

      selectRegion: (regionId) =>
        set({ pending: { regionId, adjusting: false }, reviewPinId: null }),

      startAdjust: () => {
        const pending = get().pending;
        if (pending) set({ pending: { ...pending, adjusting: true } });
      },

      confirmPending: () => {
        const pending = get().pending;
        if (!pending) return;
        // SPEC-QUESTION: PLANNING.md §3 says regionLabel is "resolved from
        // i18n at render time, not stored logic", yet the schema includes the
        // field on the record. Storing the resolved English label at creation
        // keeps schema conformance; revisit when Phase 2 adds locales.
        const record: PainRecord = {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          location: {
            regionId: pending.regionId,
            regionLabel: regionLabel(pending.regionId),
            mode: "tap",
          },
        };
        set({ pins: [...get().pins, record], pending: null });
      },

      clearPending: () => set({ pending: null }),

      openPinReview: (pinId) => set({ reviewPinId: pinId, pending: null }),

      closePinReview: () => set({ reviewPinId: null }),

      deletePin: (pinId) =>
        set({
          pins: get().pins.filter((p) => p.id !== pinId),
          reviewPinId: null,
        }),
    }),
    {
      name: "whereithurts-session",
      // sessionStorage, NOT localStorage: pins survive a refresh, health data
      // clears when the tab closes (CLAUDE.md).
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ pins: state.pins, profile: state.profile }),
    },
  ),
);
