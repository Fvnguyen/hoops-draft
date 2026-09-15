'use client';
import { TopKPIBand } from '../../components/TopKPIBand';
import { UiPrimitivesGallery } from './UiPrimitivesGallery';
import { FranchiseDashboard } from '../../components/FranchiseDashboard';
import { GameView } from '../../components/GameView';
import { PlayerCardData } from '../../components/PlayerCard';
import { TeamInfo, GameTheater } from '../../engine/game';
import { emptyModifiers } from '../../engine/synergies';
import { PLAY_BUDGET_OFFENSE, PLAY_BUDGET_DEFENSE } from '../../engine/balance';
import type { PlaybookStatus } from '../../engine/playbook';
import type { PlayerBio, SeasonStat } from '../../engine/types';

const mockBio = (name: string, pos: string, id: string): PlayerBio => ({
  id,
  name,
  position: pos,
  height: '6-6',
  weight: 210,
  age: 25,
  team: 'LAL',
});

const mockStats = (): SeasonStat => ({
  gp: 82,
  mpg: 32,
  pts: 20.5,
  trb: 5.2,
  ast: 4.1,
  stl: 1.1,
  blk: 0.5,
  fga: 15,
  fg3a: 5,
  fta: 4,
  pct_fga_0_3: 0.3,
  pct_fga_3_10: 0.2,
  pct_fga_10_16: 0.1,
  pct_fga_16_3p: 0.1,
  pct_fga_3p: 0.3,
  fg_pct_0_3: 0.65,
  fg_pct_3_10: 0.4,
  fg_pct_10_16: 0.42,
  fg_pct_16_3p: 0.4,
  fg_pct_3p: 0.37,
  fg_pct: 0.45,
  fg3_pct: 0.37,
  fg2_pct: 0.5,
  ft_pct: 0.85,
  per: 20,
  ts: 0.58,
  vorp: 3,
  dbpm: 1,
  tov: 2.5,
});

const mockPlayer = (name: string, pos: string, ovr: number, id: string): PlayerCardData => ({
  type: 'Player',
  id,
  rarity: 'Rare',
  player: mockBio(name, pos, id),
  ratings: {
    overall: ovr,
    finishing: 80,
    midRange: 80,
    perimeter: 80,
    playmaking: 80,
    perimeterDefense: 80,
    postDefense: 80,
    rebounding: 80,
  },
  stats: mockStats(),
  awards: [],
  traits: [],
});

const mockTeamInfo: TeamInfo = {
  seatId: 'test1',
  name: 'Test City Ballers',
  players: [
    mockPlayer('Stephen Curry', 'PG', 85, '1626145'),
    mockPlayer('James Harden', 'SG', 82, '1626156'),
    mockPlayer('LeBron James', 'SF', 88, '1626157'),
    mockPlayer('Kevin Durant', 'PF', 81, '1626162'),
    mockPlayer('Nikola Jokic', 'C', 89, '1626164'),
  ],
  starters: ['1626145', '1626156', '1626157', '1626162', '1626164'],
  depthChart: {
    PG: ['1626145'],
    SG: ['1626156'],
    SF: ['1626157'],
    PF: ['1626162'],
    C: ['1626164'],
  },
  plays: [],
};

const mockPlaybookStatus: PlaybookStatus = {
  plays: [],
  offenseAllocation: 0,
  defenseAllocation: 0,
  offenseBudget: PLAY_BUDGET_OFFENSE,
  defenseBudget: PLAY_BUDGET_DEFENSE,
  overBudget: false,
};

const mockGameTheater: GameTheater = {
  homeTeam: mockTeamInfo,
  awayTeam: { ...mockTeamInfo, name: 'Away Team', seatId: 'test2' },
  isOvertime: false,
  overtimePeriods: 0,
  possessions: [],
  quarterSummaries: [],
  boxScore: { home: [], away: [] },
  homeBonuses: { possessionSwing: 0, activeSynergies: [], activePlays: [], offenseMods: emptyModifiers(), defenseMods: emptyModifiers(), playstyle: [] },
  awayBonuses: { possessionSwing: 0, activeSynergies: [], activePlays: [], offenseMods: emptyModifiers(), defenseMods: emptyModifiers(), playstyle: [] },
  finalScore: [0, 0],
  seed: 0,
  playbook: { home: mockPlaybookStatus, away: mockPlaybookStatus },
};

const mockDepthChart: Record<string, PlayerCardData[]> = {
  PG: [mockTeamInfo.players[0]],
  SG: [mockTeamInfo.players[1]],
  SF: [mockTeamInfo.players[2]],
  PF: [mockTeamInfo.players[3]],
  C: [mockTeamInfo.players[4]],
};

export default function TestUI() {
  return (
    <div className="p-8 bg-stone-100 min-h-screen flex flex-col gap-8">
      <div id="kpi-band-test">
         <h1 className="mb-2 font-bold text-stone-400">Top KPI Band</h1>
         <div className="border border-stone-200">
            <TopKPIBand
              identity={{ finishing: 85, midRange: 75, perimeter: 90, playmaking: 80, rebounding: 65, perDef: 70, postDef: 75 }}
              shotDiet={{ rim: 0.3, mid: 0.2, per: 0.5 }}
              depthChart={mockDepthChart}
              bonuses={{
                offenseMods: emptyModifiers(),
                defenseMods: emptyModifiers(),
                possessionSwing: 0,
                activeSynergies: [{ name: 'Paint Dominance', description: '+1% rim share' }],
                activePlays: [{ name: 'Triangle Offense', activated: 'full', description: 'Strong spacing' }],
                playstyle: [],
              }}
            />
         </div>
      </div>

      <div id="franchise-dashboard-test">
         <h1 className="mb-2 font-bold text-stone-400">Franchise Dashboard</h1>
         <FranchiseDashboard team={mockTeamInfo} />
      </div>

      <div id="game-view-test" className="h-[600px]">
         <h1 className="mb-2 font-bold text-stone-400">Game View (Matchup)</h1>
         <GameView game={mockGameTheater} />
      </div>

      {/* plan_ui_foundation T2: primitives gallery, snapshotted as ui-primitives.png */}
      <div id="ui-primitives-test">
         <h1 className="mb-2 font-bold text-stone-400">UI Primitives</h1>
         <UiPrimitivesGallery />
      </div>
    </div>
  );
}
