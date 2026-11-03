/**
 * season_2026_27 T5 (D8/D9): card sets by version, and pinning.
 *
 * A weekly refresh replaces `cards.json`; a draft, an 82:0 run or a Playoffs match started
 * on `2025-26.2` must still rebuild exactly as it did. The snapshots below were recorded
 * from the frozen `src/data/cardsets/2025-26.2.json` on 2026-11-03, when it was a byte
 * copy of `cards.json`. They are inline on purpose: once `cards.json` moves to 2026-27
 * they still pin what a legacy draft or run must replay to. Do not regenerate them from a
 * newer set; a change here means a pinned object would change under its player.
 */
import { describe, it, expect } from 'vitest';
import frozenJson from '@/data/cardsets/2025-26.2.json';
import {
  LEGACY_CARD_SET_VERSION, availableCardSetVersions, isCardSetAvailable, loadCardSet, resolveCardSetVersion,
} from '@/engine/cardSets';
import { CARD_SET_VERSION } from '@/engine/cardSetVersion';
import { getAllCards } from '@/engine/cards';
import { replayDraft } from '@/engine/draftReplay';
import { buildNbaTeams } from '@/engine/challenge';
import { PLAY_CATALOG } from '@/engine/plays';
import type { Player } from '@/components/PlayerCard';
import type { PlayerCardData } from '@/engine/types';

const frozen = frozenJson as unknown as PlayerCardData[];
const ids = (cards: { id: string }[]) => cards.map((c) => c.id);

describe('loadCardSet / isCardSetAvailable (D8)', () => {
  it('serves the legacy set for 2025-26.2 and for a missing stamp, same array each time', async () => {
    const legacy = await loadCardSet(LEGACY_CARD_SET_VERSION);
    expect(ids(legacy)).toEqual(ids(frozen));
    expect(legacy).toHaveLength(448);
    expect(await loadCardSet(undefined)).toBe(legacy);
    expect(await loadCardSet(null)).toBe(legacy);
    expect(await loadCardSet(LEGACY_CARD_SET_VERSION)).toBe(legacy);
    expect(resolveCardSetVersion(undefined)).toBe(LEGACY_CARD_SET_VERSION);
    expect(resolveCardSetVersion('')).toBe(LEGACY_CARD_SET_VERSION);
  });

  it('serves the shipping set (getAllCards) for CARD_SET_VERSION', async () => {
    expect(await loadCardSet(CARD_SET_VERSION)).toBe(getAllCards());
    expect(isCardSetAvailable(CARD_SET_VERSION)).toBe(true);
    expect(availableCardSetVersions()[0]).toBe(CARD_SET_VERSION);
  });

  it('keeps the legacy set available', () => {
    expect(isCardSetAvailable(LEGACY_CARD_SET_VERSION)).toBe(true);
    expect(isCardSetAvailable(undefined)).toBe(true);
    expect(availableCardSetVersions()).toContain(LEGACY_CARD_SET_VERSION);
  });

  it('rejects a version this build does not carry', async () => {
    expect(isCardSetAvailable('2019-20.1')).toBe(false);
    await expect(loadCardSet('2019-20.1')).rejects.toThrow(/no longer available/);
  });
});

// ── (b) a legacy draft replays to the same packs ────────────────────────────

const DRAFT_SEED = 20261103;

/** Pack 1 as dealt to seats 0-7 (card ids, pack order). */
const LEGACY_OPENING_PACKS: string[][] = [
  ['201142','1629652','201572','play-std-9_pack0','1626192','1641722','1642363','1642905'],
  ['1630178','1641824','201143','play-std-1_pack1','1628366','1630256','1642868','203484'],
  ['play-sys-1_pack2','1630573','1631230','1627741','1627752','1630543','1631104','1642367'],
  ['1628983','1641764','1642914','1627747','1631121','1642860','1642920','play-std-3_pack3'],
  ['203507','1628386','203937','1628396','1642404','1642854','203486','play-std-5_pack4'],
  ['1630552','1642845','204060','play-std-2_pack5','1630264','1630598','1642853','1642948'],
  ['1629638','1630200','1630695','play-std-7_pack6','1631132','1641763','1642382','1643007'],
  ['1641709','play-std-6_pack7','1629628','1642844','1629234','1629656','1631243','1642964'],
];

/** The human (seat 0) always takes the first card of the pack in front of them. */
const LEGACY_HUMAN_PICKS: string[] = [
  '201142', '1630178', '1631230', '1641764', '1628396', '1630264', '1641763', '1642964',
  'play-sys-2_pack8', '1629631', '1630168', '203468', '1630560', '08d0e9d2', '1642383', '1631124',
  '1628384', '203999', '1631128', '203482', '1627884', '1629162', '1630551', '203926',
];

/** Every seat's 24 drafted card ids in pick order, comma-joined (seat 0 = the human). */
const LEGACY_SEATS_DRAFTED: string[] = [
  '201142,1630178,1631230,1641764,1628396,1630264,1641763,1642964,play-sys-2_pack8,1629631,1630168,203468,1630560,08d0e9d2,1642383,1631124,1628384,203999,1631128,203482,1627884,1629162,1630551,203926',
  'play-std-1_pack1,1630573,1642914,203937,1630598,1631132,1629234,1642905,play-sys-3_pack9,play-sys-4_pack8,play-std-5_copy1_pack15,1631159,203992,1630631,1642959,1642880,play-std-7_copy1_pack17,1642276,1630163,1642873,1630228,1642266,1630702,1641711',
  'play-sys-1_pack2,1628983,1628386,1642845,1642382,1631243,1641722,1642868,play-std-4_pack10,203991,1627936,1642263,1642859,1630533,1641842,1642502,play-std-8_pack18,play-std-4_copy1_pack19,1641739,1630217,201567,1642352,202691,1642261',
  'play-std-3_pack3,203507,204060,1630695,1629656,1642363,203484,1631104,play-std-10_pack11,1641708,1629750,1629028,1626156,1630529,1630592,1642874,1641705,play-std-10_copy1_pack20,1630194,1628381,1641729,203114,1631093,1630526',
  'play-std-5_pack4,1630552,1629638,1629628,1626192,1630256,1627752,1642860,play-std-9_copy1_pack12,203497,203954,1642275,1642866,1627827,203903,1642358,1628973,1631105,1630583,1642907,1642950,1631165,1630534,1630214',
  'play-std-2_pack5,1630200,1642844,1629652,1628366,1642367,1631121,1642404,play-std-1_copy1_pack13,1629674,1641854,1629655,1629111,203471,1629018,1631126,play-std-9_copy2_pack21,1641717,1628436,1641774,1641783,1629021,1642419,1641767',
  'play-std-7_pack6,1641709,201572,1641824,1627741,1642920,1642854,1642853,202695,1629057,202331,1630245,1642346,1630249,201587,1642877,play-std-1_copy2_pack22,play-std-3_copy2_pack23,1628976,1629640,1642885,1642450,1630587,1630623',
  'play-std-6_pack7,play-std-9_pack0,201143,1630543,1627747,203486,1642948,1643007,1628401,play-std-3_copy1_pack14,1626220,1631123,1642348,1631321,1631245,1629216,203076,play-std-2_copy1_pack16,1630193,1630322,1626166,1631166,1631246,1642353',
];

function asPlayers(cards: PlayerCardData[]): Player[] {
  return cards.map((c) => ({ ...c, type: 'Player' as const })) as unknown as Player[];
}

function draftFirstCardEveryPick(players: Player[]) {
  const picks: string[] = [];
  let state = replayDraft(DRAFT_SEED, { 'human-0': picks }, players, PLAY_CATALOG);
  while (state.phase === 'drafting') {
    picks.push(state.seats[0].currentPack[0].id);
    state = replayDraft(DRAFT_SEED, { 'human-0': [...picks] }, players, PLAY_CATALOG);
  }
  return { picks, state };
}

const SOURCES: Array<[string, () => Promise<PlayerCardData[]>]> = [
  ['the frozen file', async () => frozen],
  ['loadCardSet(2025-26.2)', () => loadCardSet(LEGACY_CARD_SET_VERSION)],
];

describe('a 2025-26.2 draft replays to the same packs (D9 draft resume)', () => {
  for (const [label, load] of SOURCES) {
    it(`deals the recorded opening packs over ${label}`, async () => {
      const players = asPlayers(await load());
      const opening = replayDraft(DRAFT_SEED, { 'human-0': [] }, players, PLAY_CATALOG);
      expect(opening.seats.map((s) => ids(s.currentPack))).toEqual(LEGACY_OPENING_PACKS);
    });

    it(`replays a whole draft to the recorded picks over ${label}`, async () => {
      const { picks, state } = draftFirstCardEveryPick(asPlayers(await load()));
      expect(state.phase).toBe('complete');
      expect(picks).toEqual(LEGACY_HUMAN_PICKS);
      expect(state.seats.map((s) => ids(s.drafted).join(','))).toEqual(LEGACY_SEATS_DRAFTED);
    });
  }
});

// ── (c) a legacy 82:0 run rebuilds the same 30 NBA teams ────────────────────

/** buildNbaTeams(2025-26.2): team -> its roster's player ids, in roster order. */
const LEGACY_NBA_ROSTERS: Record<string, string> = {
  ATL: '1630700 203468 1630811 1629638 1627741 1630552 1642258 1630228 1642854 1631243 1630168 1629111',
  BOS: '1628401 1630202 1627759 1631248 1642864 1630573 1631199 1641775 1642873 1629674 1630568 202696',
  BRK: '1642856 1630623 1629611 1642962 1629008 1631169 1630533 1630549 1630604 1642874 1641730 1629651',
  CHO: '1630163 1629632 1630182 1626192 1642851 1641706 1628970 1629684 1642275 1631217 1641750 1630214',
  CHI: '1630581 1630200 1629012 1629014 1631093 1641824 1631159 1630171 1630188 1627824 1642950 1630208',
  CLE: '1628378 1641854 1628366 203471 201935 1642281 1631165 1630241 1630596 1629731 1628386 1628418',
  DAL: '1630314 1642948 1626156 1631108 1642843 1630230 1628997 203076 1629655 1629023 1628963 203939',
  DEN: '1627750 1628971 1631212 1631128 203501 1629618 203932 1629661 1642461 203999 1641747 202685',
  DET: '1630595 1642450 1629130 1629750 1628989 1641709 202699 1627747 1641842 1630194 1630191 1631105',
  GSW: '201939 1629001 202710 1641764 1642954 1630541 1627780 203110 204001 1630611 1642366 201143',
  HOU: '1641708 1642263 1628988 201142 1631120 1629006 1630256 1631095 1631106 1630578 203991 203500',
  IND: '204456 1631245 1629614 1642277 1641767 1630174 1627783 1630167 1630695 1641716 1630643 1627826',
  LAC: '1627739 1629636 1642920 1631097 203992 202695 1641757 1628381 1627884 1630543 201572 1642949',
  LAL: '1629029 203935 2544 1630559 1628379 1642261 1631222 1631166 1629060 1629020 1629637 1629028',
  MEM: '1642914 1629630 1642383 1642285 1642907 203484 1641712 1642377 1630583 1641713 1641707 1641765',
  MIA: '1630558 1642857 1629639 1630696 1626181 1641796 1631170 203952 1642066 1631323 1628389 1642276',
  MIL: '203507 1631157 1630175 1629645 203914 1628398 1627752 1626171 1630579 1631172 1626167 1631250',
  MIN: '1630538 1630162 1630245 1628978 1641740 204060 1630183 203937 203944 1629675 203497 1642866',
  NOP: '1642847 1629673 1631121 1642877 1630530 1630180 1630529 1629627 1631255 1626172 1642852 1642274',
  NYK: '1628973 1630540 1630631 1642278 1628404 1629013 1628969 1628384 1626157 1631110 1629011 1630574',
  OKC: '1628983 1627936 1631114 1642349 1641717 1630198 1630598 1629026 1631096 1631119 1628392 1642382',
  ORL: '1630591 1641710 1628975 1630217 1642859 1630532 1641783 1631288 1642869 1631094 1628976 1629048',
  PHI: '1630178 1626166 202331 1642845 1629656 1626162 1642348 1630570 1631230 1641737 203954 203083',
  PHO: '1626164 1631221 1631123 1628960 1630692 1630224 1629599 1626220 1628415 1642346 1642345 1631109',
  POR: '201950 1630249 1630703 1629680 1631101 1642959 1630166 203924 1631200 1641739 1629057 1642270',
  SAC: '201566 1642269 201942 1628370 1631342 203897 1631099 1629631 1642875 1630173 1642928 1629234',
  SAS: '1628368 1629162 1642264 1642844 1630170 1629640 1630577 203084 1641705 203482 1628436 203486',
  TOR: '1630567 1642347 1630193 1629628 1642266 1627742 1642419 1630572 1642867 1642367 1627751 1631218',
  UTA: '1641718 1642268 1629723 1631246 1628374 1629004 1641729 1628991 201567 1631131 203994 1642271',
  WAS: '1630536 1642267 1631103 1642273 1642364 1642848 1630551 1641731 1642860 1642259 1630264 1641774',
};

function rostersOf(cards: PlayerCardData[]) {
  const teams = buildNbaTeams(cards, PLAY_CATALOG);
  return { teams, rosters: Object.fromEntries([...teams.entries()].map(([code, t]) => [code, ids(t.players).join(' ')])) };
}

describe('a 2025-26.2 82:0 run rebuilds identical NBA teams (D9)', () => {
  it('builds the recorded 30 rosters from the frozen file', () => {
    const { teams, rosters } = rostersOf(frozen);
    expect(teams.size).toBe(30);
    expect(rosters).toEqual(LEGACY_NBA_ROSTERS);
  });

  it('builds them from loadCardSet(2025-26.2), cached by array reference', async () => {
    const { teams, rosters } = rostersOf(await loadCardSet(LEGACY_CARD_SET_VERSION));
    expect(rosters).toEqual(LEGACY_NBA_ROSTERS);
    expect(buildNbaTeams(await loadCardSet(undefined), PLAY_CATALOG)).toBe(teams);
  });
});
