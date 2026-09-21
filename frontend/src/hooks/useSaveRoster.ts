'use client';

import { useState } from 'react';
import { getGameStore } from '@/storage';
import { StorageQuotaError, type SavedRoster } from '@/storage/types';
import type { DraftCard, Play, PlayerCardData } from '@/engine/types';
import type { PlayAssignment } from '@/engine/playbook';
import type { ArchetypeSelection } from '@/engine/archetypes';

export interface UseSaveRosterParams {
  readOnly: boolean;
  rosterId?: string;
  existingRosterName?: string;
  sessionId?: string;
  isChallenge: boolean;
  /** plan_challenge_mode T7: embeds this builder inside the 82:0 front office (D8).
   *  When set, saving skips the naming modal, `store.saveRoster` and the session's
   *  `builtRoster` update entirely, and hands the built `SavedRoster` to this callback
   *  instead — D11 requires the front office's edits to land only in the run's
   *  `rosterPost` SNAPSHOT, never mutate the roster record the user actually drafted. */
  embedOverride?: { onSave: (roster: SavedRoster) => void };
  draftedCards: DraftCard[];
  depthChart: Record<string, PlayerCardData[]>;
  activePlays: (Play | null)[];
  playbookAssignments: PlayAssignment[];
  validArchetypes: ArchetypeSelection;
  rosterPlayers: PlayerCardData[];
  rosterPlays: Play[];
  /** Wraps navigation so the Android back-guard's history entry doesn't survive under
   *  the destination (plan mobile_load D10). */
  exitTo: (fn: () => void) => void;
  replace: (url: string) => void;
}

export interface UseSaveRosterResult {
  showSaveModal: boolean;
  saveDestination: 'rosters' | 'season';
  /** Computed once, lazily, at mount: `existingRosterName` or a timestamped default.
   *  Seeds `SaveRosterModal`'s own name field and is also the name used by the
   *  embedded (front-office) save path, which skips the naming modal entirely. */
  defaultRosterName: string;
  isSavingRoster: boolean;
  saveError: string | null;
  openSaveModal: (destination: 'rosters' | 'season') => void;
  closeSaveModal: () => void;
  /** D19: "Save" lands on `/rosters`; "Save & play season" jumps straight into the
   *  season for this draft session (only offered when there IS a session). */
  saveRoster: (name: string, destination?: 'rosters' | 'season') => Promise<void>;
}

/**
 * Save/persist state and logic (plan render_and_engine_perf, D8 layout half / T10) —
 * moved out of `DeckBuilder.tsx` as one unit: the naming modal's open/destination state,
 * the lazily-computed default name, the in-flight/error state, and `saveRoster` itself.
 */
export function useSaveRoster({
  readOnly, rosterId, existingRosterName, sessionId, isChallenge, embedOverride,
  draftedCards, depthChart, activePlays, playbookAssignments, validArchetypes,
  rosterPlayers, rosterPlays, exitTo, replace,
}: UseSaveRosterParams): UseSaveRosterResult {
  // Stable id for a freshly-drafted roster (no `rosterId` prop yet): computed once per
  // mount so repeated/concurrent saves in this DeckBuilder session upsert the same
  // IndexedDB row instead of minting a new "roster_<timestamp>" each time (which showed
  // up as duplicate entries in /rosters, only one of which ever got a ChallengeRun).
  const [generatedRosterId] = useState(() => rosterId || `roster_${Date.now()}`);
  const [isSavingRoster, setIsSavingRoster] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveDestination, setSaveDestination] = useState<'rosters' | 'season'>('rosters');
  const [defaultRosterName] = useState(() => existingRosterName || `Draft Roster - ${new Date().toLocaleString()}`);
  const [saveError, setSaveError] = useState<string | null>(null);

  const openSaveModal = (destination: 'rosters' | 'season') => {
    setSaveDestination(destination);
    setShowSaveModal(true);
  };
  const closeSaveModal = () => setShowSaveModal(false);

  const saveRoster = async (name: string, destination: 'rosters' | 'season' = 'rosters') => {
    if (readOnly || isSavingRoster) return;
    try {
      setIsSavingRoster(true);
      setSaveError(null);

      const saveId = rosterId || generatedRosterId;
      const depthChartOrder = Object.fromEntries(Object.entries(depthChart).map(([k, v]) => [k, v.map(p => p.id)]));
      const activePlayIds = activePlays.map(p => p ? p.id : null).filter((id): id is string => id !== null);

      const newRosterData: SavedRoster = {
        id: saveId,
        name,
        timestamp: new Date().toISOString(),
        draftedCards,
        depthChartOrder,
        activePlays: activePlayIds,
        playAssignments: playbookAssignments,
        archetypes: validArchetypes,
        version: 2,
        sessionId: sessionId ?? null,
      };

      if (embedOverride) {
        embedOverride.onSave(newRosterData);
        return;
      }

      const store = getGameStore();
      await store.saveRoster(newRosterData);

      // Update the human's built roster in the draft session so opponents can be retrieved
      if (sessionId) {
        const session = await store.getDraftSession(sessionId);
        if (session) {
          session.seats[0].builtRoster = {
            version: 2,
            depthChart: depthChartOrder,
            activePlays: activePlayIds,
            playAssignments: playbookAssignments,
            archetypes: validArchetypes,
            rosterPlayers: rosterPlayers.map(p => p.id),
            rosterPlays: rosterPlays.map(p => p.id),
          };
          await store.saveDraftSession(session);
        }
      }

      // plan mobile_load D10: `exitTo` + `replace`, not `push`. The builder's history entry
      // (and its back-guard entry) must not survive under the destination: back from the
      // rosters list used to walk into /draft again and silently start a new draft.
      const next = destination === 'season' && sessionId
        ? (isChallenge
          ? `/challenge/${encodeURIComponent(saveId)}`
          : `/season?rosterId=${encodeURIComponent(saveId)}&sessionId=${encodeURIComponent(sessionId)}`)
        : '/rosters';
      exitTo(() => replace(next));
    } catch (error) {
      if (error instanceof StorageQuotaError) {
        setSaveError(error.message);
      } else {
        setSaveError('Failed to save roster. Please try again.');
      }
    } finally {
      setIsSavingRoster(false);
    }
  };

  return {
    showSaveModal,
    saveDestination,
    defaultRosterName,
    isSavingRoster,
    saveError,
    openSaveModal,
    closeSaveModal,
    saveRoster,
  };
}
