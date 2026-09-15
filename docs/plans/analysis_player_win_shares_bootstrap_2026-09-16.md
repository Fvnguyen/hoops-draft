# Analysis: player-level win-shares bootstrap

File: `docs/plans/analysis_player_win_shares_bootstrap_2026-09-16.md`. Not a locked plan
(no tasks/decisions of its own) — a findings doc referenced by
`plan_card_balance_2026-09-13.md`'s "Real-data findings" section. Internal/analysis use
only.

## Method

New harness: `frontend/scripts/player_bootstrap.ts` (`npm run player-bootstrap`). 150
headless drafts x 28-game round robin = 4,200 games, seed 42. Every drafted card was
placed at a **random** eligible depth-chart slot (`buildRandomRoster`), not a
deckbuilder's best-OVR choice, so a card's measured output reflects its own rating, not
a smart roster builder's judgment of it. 100% of the 448-card pool was drafted and
played, mean 225 games/card.

**Win Shares proxy** (the engine has no native concept — analyze.ts's header notes a
prior OVR-vs-win system was removed when the game moved to the archetype layer): when a
team wins, the win is split across its players in proportion to their on-court
possessions that game (from the real `PlayerBoxScore`); summed and divided by games
played = `winSharesPerGame`. Not the real NBA formula, but directly comparable in spirit.

Full per-player dump: `data/game_logs/player_bootstrap_2026-09-15T22-15-30-781Z.json`
(gitignored, regenerate with `npm run player-bootstrap -- 150 --seed 42 --json`). Visual
canvas: [Player Balance Curve](https://claude.ai/artifact/S32bAaBwoUN8kbTTcXrSFq)
(OVR-vs-win-shares scatter, rarity/badge breakdowns, best/worst, over/underrated tables).

## Headline numbers

- `corr(OVR, winSharesPerGame) = 0.617` — OVR is a real, moderate predictor, not tight.
- Win-shares/game by rarity: Mythic 0.048, Rare 0.047, Uncommon 0.046, Common 0.037 —
  directionally correct, but Common's own spread (sd 0.0076) is wider than the gap
  between Mythic and Rare's means. A well-rated Common frequently beats a mediocre Mythic.
- Badge-level correlation with win-shares/game (7 skill badges, all positive):
  Finisher +0.34, Paint Protector +0.31, Glass Cleaner +0.31, Mid-Range Maestro +0.25,
  Floor General +0.17, Lockdown Defender +0.14, **Sharpshooter +0.10** (weakest, despite
  being the most-held badge at 76).

## Findings for card_balance (D2/D3 rarity + badge tuning)

1. **Shot-creation/scoring-volume ratings are over-credited relative to what they win.**
   The biggest OVR-residual outliers (actual win-shares far below what OVR predicts) are
   high-usage, high-OVR shot-creators: LeBron James (Rare 79, residual -0.015), Tyrese
   Maxey (Mythic 95, -0.014), LaMelo Ball (Rare 84, -0.013), Cade Cunningham (Mythic 95,
   -0.012). Consistent with Sharpshooter being the weakest badge predictor — volume
   scoring/shot-creation doesn't swing possessions the way `game.ts` resolves them.
2. **Finishing/interior-impact badges are under-weighted in `ratings.ts` relative to how
   much they actually predict winning.** Finisher/Paint Protector/Glass Cleaner are 2-3x
   the correlation strength of Sharpshooter/Floor General. A card can reach Mythic almost
   entirely off scoring-volume stats without these badges and still underperform its tier.
3. **Common-tier role players are systematically undervalued by OVR.** The
   "underrated" list is almost entirely OVR 40-63 Commons: Al Horford (42), Nikola Jović
   (40), Cam Spencer (58), Kelly Oubre Jr. (60), Kristaps Porziņģis (63) — 2-3 sd above
   their own rarity bucket's mean. Since roster slots were random here (not a deckbuilder
   cherry-picking diamonds), this is the rating formula under-crediting efficient,
   low-usage production, not a lineup-construction effect.
4. **The OVR floor (40) is severely crowded** — 204 of 448 cards (45.5% of the pool) sit
   at exactly OVR 40 — the low end of the rating scale is not differentiating
   replacement-level talent at all, it's clipping it. Those 204 cards still show real
   win-shares/game spread (0.017 to 0.056, a >3x range) once actually played, so there is
   real signal being thrown away below the floor. This is the single highest-leverage
   fix available to D2/T2's retune: uncompressing OVR 40 into a wider band would likely
   move `corr(OVR, winSharesPerGame)` up more than any other single change.

## Suggested follow-up (for T2/T5 when re-tuning)

- When re-deriving `RATING_CONFIG` skill weights (T2, `ratings.ts`), check whether
  finishing/rebounding/post-defense weights should rise relative to perimeter/playmaking
  volume stats, using this harness (not just `npm run feasibility`'s draft-side view) as
  the win-side check.
- Re-run `npm run player-bootstrap -- 150 --seed 42 --json` before/after any rating
  formula change and compare `corr(OVR, winSharesPerGame)` and the badge-correlation
  table — the same before/after discipline D9 already requires for `npm run balance`.
- Consider whether OVR 40 should stay a hard floor or whether the profile-weight formula
  should be allowed to differentiate further below it.
