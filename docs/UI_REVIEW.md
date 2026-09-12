# UI Review and Proposals — 2026-09-12

Screens reviewed in the running app at desktop size: home, draft room, deck builder,
player and play cards (front and back, full and compact), rosters, season game view.
Findings are ordered by screen; proposals are marked **quick** (under an hour, no design
decision needed) or **medium** (a few hours or needs a decision).

---

## 1. Player card (`frontend/src/components/PlayerCard.tsx`)

The card is the unit everything else is built from, so its problems show up on every
screen.

### Findings

- **Rarity is almost invisible on the front.** The card frame is the same
  `border-stone-300` for every rarity. The rarity colour is applied only as a 3px ring
  around the 20px position icon (`borderColor` is passed to `PositionIcon`, not to the
  card). The `RarityGem` dot is used only in compact mode, and the back shows the rarity
  as 8px grey text. Mythic and Common cards look the same at a glance in the draft grid.
- **Position is illegible.** `PositionIcon` renders "G/F" at 0.7 × 8px ≈ 5.6px inside a
  20px circle. It reads as a coloured dot. Since it also carries the rarity ring, two
  signals are competing inside one tiny element.
- **Names truncate after 4-5 characters** at grid width ("KEVI…", "KARL-…", "ISAIAH…")
  because the top bar puts the name and "TEAM AGE" on one 15px line.
- **Overall rating is shown nowhere.** Neither card face shows OVR; the seven game
  ratings (finishing, mid-range, perimeter, playmaking, rebounding, perimeter D, post D)
  that the simulation actually uses are only visible on the `/data` page. Players draft
  and build rosters from season averages the engine does not use.
- **Six-column stats row collides** at compact widths ("16.5.4.5.41.1.1.339" in the
  depth chart starters).
- **Hover flips the card.** In a grid you cannot hover a card to look at the front; the
  flip also happens while moving the mouse to click, which is disorienting.
- The back's stat grid uses `(player.stats as any).fg2a`; `fg2a` is not on `SeasonStat`,
  so "2PA" is always 0.0.

### Proposals

1. **quick** Rarity on the frame: `border-2` in the rarity colour on the front and back,
   plus a matching top accent bar. Keep the gem as a secondary marker. Suggested palette:
   Common stone-400, Uncommon emerald-500, Rare blue-500, Mythic amber-500 with a soft
   glow (the current yellow/orange pair for Rare/Mythic is hard to tell apart).
2. **quick** Position as a pill, not a dot: a 22px-tall rounded pill with 10px bold text
   ("PG", "G/F"), colour-coded as today, placed top-left. Drop the rarity ring from it.
3. **quick** Two-line header: name on its own line with `text-[13px]`, auto-shrink at 18+
   characters, and "TEAM · AGE" underneath in 9px. Names stop truncating at grid width.
4. **medium (design decision)** Show OVR: a large number top-right of the photo in a
   rarity-coloured badge (the FIFA/2K convention). OVR was hidden from compact cards in
   an earlier commit; if the intent was to hide it during the draft to reward reading
   the card, keep it hidden only in the draft grid and show it everywhere else.
5. **medium** Replace the back's 14 raw stats with what matters in this game: a 7-bar
   ratings block (the engine ratings, 0-99, coloured by tier) at the top, then a compact
   4×2 season-averages grid, then awards and badges. This single change makes drafting
   for synergies possible without the data page.
6. **quick** Stats row: four columns (PTS, REB, AST, FG%) on cards under 180px, six only
   on full-size cards.
7. **quick** Flip on click of a small corner button (or long-press on touch), hover only
   lifts the card. Selection stays a single click on the card body.
8. **quick** Fix the `fg2a` field (compute `fga - fg3a` or add it to the card data).

## 2. Home page (`frontend/src/app/page.tsx`)

### Findings

- **Photos do not match names.** The hero and pack cards are hard-coded mock objects
  with made-up ids. Headshots are keyed by real NBA player id, so the "LeBron James" card
  shows Karl-Anthony Towns, "Stephen Curry" shows Tyus Jones, "James Harden" shows
  D'Angelo Russell, "Kevin Durant" shows Kelly Oubre Jr., and "Nikola Jokic" is not in
  the card pool at all. Every mock also has identical ratings (90/85/88…).
- The pack fan overlaps cards so tightly (140px wide, 4.5° apart) that names show as
  "S…", "JA…" and the stats rows smear together.
- Dev-tool links (Deckbuilder test, Test UI, Data viewer, Debug) sit on the home page
  for everyone.

### Proposals

1. **quick** Build the hero and pack from real cards: import `getAllCards()` from
   `@/engine/cards`, pick a fixed list of ids (or the top Mythics by OVR) and render
   those. Photos, badges, and stats become real and consistent automatically.
2. **quick** Pack preview: three cards at 170px with a 12° spread and a hover lift, or a
   simple row of three. Names must be readable.
3. **quick** Move dev links behind a small "Dev" toggle in the footer, hidden in
   production builds.
4. **medium** Make the hero card do something: clicking it flips it (shows the new
   ratings back), which doubles as a tutorial for the card.

## 3. Draft room (`frontend/src/components/DraftRoom.tsx`)

### Findings

- **The bottom of the grid is permanently darkened.** The confirm-button container with
  its black gradient is rendered whether or not a card is selected; only the button
  animates. The last row of cards always sits under a dark fade.
- Rarity and position are unreadable at grid size (see section 1), so a pack looks like
  twelve equal cards.
- The sidebar defaults to a 64px strip with two "0" counters and no labels. Drafted
  players are dropped into "Roster" or "G-League" zones by drag-and-drop during the
  draft; that decision belongs in the deck builder and is invisible to a new player.
- No way to inspect a card without flipping it; no view of the seven ratings; no
  positional balance or badge tally, so there is no guidance on what to pick next.
- Bot picks are invisible; the draft feels solitary.

### Proposals

1. **quick** Render the gradient only when a card is selected (same condition as the
   button).
2. **quick** Card-level fixes from section 1 (rarity frame, position pill, name line)
   fix most of the "all cards look the same" problem.
3. **medium** Replace the zone drag-and-drop with a plain "My picks" panel: drafted cards
   as compact rows grouped by position, with a PG/SG/SF/PF/C count strip and the badge
   tally with synergy teasers (`getBadgeTally` in `engine/rosterStats.ts` already computes
   "Sharpshooter 3/4"). Zoning moves to the deck builder, which already handles it.
4. **medium** Inspect panel: selecting a card shows it large on the right with the seven
   ratings as bars and the season line; "Confirm pick" lives in that panel. Removes the
   need for hover-flip in the grid.
5. **medium** Pick ticker: after each pass, show the last pick of the two neighbouring
   seats ("Astro took Tyrese Maxey"). Data is already in `pickLog`.
6. **quick** Sort the pack by OVR by default with a rarity-first toggle, and show the pack
   number/pick as a progress bar ("Pack 1 · Pick 4 of 12", 36 total).

## 4. Deck builder (`frontend/src/components/DeckBuilder.tsx`)

### Findings

- The top band is dense and unlabeled: seven identity bars with no scale, a donut, and
  fourteen identical-looking synergy chips with no active/inactive state.
- The depth chart is five fixed columns wider than the container, so a horizontal
  scrollbar appears at 1440px. Starters are full cards (with the colliding stats row);
  backups are compact rows with truncated names.
- Everything is drag-and-drop only. There is no click-to-place, no auto-fill, and no
  "clear". The engine already has `buildBotRoster`, which would give a one-click best
  lineup.
- Plays: three slots on the left show as text chips; "NEED 1 PLAY(S)" is the only
  validation hint, and the save button is in a modal behind the header.
- The G-League list on the right shows 22 rows with a 12px rarity dot and 9px position
  text; sorting is by rarity only.
- Team overall is shown on the rosters page (88) but not here while building.

### Proposals

1. **quick** Synergy chips with state: active chips coloured, inactive chips grey with
   progress ("Sharpshooter 3/4"), sorted active-first. The data exists.
2. **quick** Team OVR and the "12/12 players · 2/3 plays" validity in the header, with
   the Save button enabled only when valid (and visible without a modal).
3. **quick** "Auto-fill" (calls `buildBotRoster` on the human's pool) and "Clear" buttons.
4. **medium** Click-to-place: click a bench player, eligible columns highlight, click a
   column to insert at the bottom; click a placed player to promote/demote or send to
   G-League. Keep drag-and-drop for pointer users. This is also the path to touch.
5. **medium** Depth chart columns as `minmax(150px, 1fr)` in a grid that fits the
   container; starters as a "starter" compact row with OVR badge instead of a full card,
   with hover/click to see the full card (the hover pop-up exists already).
6. **quick** Identity bars: add the 0-99 value at the end of each bar and a league-average
   tick, so the bars mean something.
7. **quick** G-League list: sort by OVR, show OVR, and filter chips by position.

## 5. Rosters page and season view

Minor: the roster card header (name, timestamp, team OVR) is good; the five starter
cards inherit the card fixes above. The season scoreboard's team "fan" of five 20px
cards is decorative only; replace with team OVR and record. Both are fine to leave for
Phase 3.

---

## Suggested execution (three parallel agents, disjoint files)

| Agent | Files | Scope |
|---|---|---|
| Cards | `components/PlayerCard.tsx` (+ `PlayCard` in it) | Section 1: rarity frame, position pill, two-line header, OVR badge, ratings block on the back, 4-col stats at small width, click-to-flip, fg2a fix |
| Home + draft | `app/page.tsx`, `components/DraftRoom.tsx` | Section 2 (real cards, pack layout, dev links) and section 3 quick items (gradient bug, sort, progress) plus the "My picks" panel |
| Deck builder | `components/DeckBuilder.tsx`, `engine/rosterStats.ts` (read only) | Section 4 quick items (chip state, header validity/OVR/save, auto-fill/clear, identity values, G-League sort) |

Then a second pass for the medium items that touch several files: inspect panel in the
draft, click-to-place in the deck builder, pick ticker.

Decisions taken 2026-09-12 (owner): (a) never show OVR or ratings to users anywhere,
not on cards and not as a team OVR; (b) therefore no ratings block on the card back;
(c) keep zoning in the draft room, add a G/F/C "mana curve" summary and a bot pick
ticker, no inspect panel; (d) rarity as a MtG-style gem/icon rather than a frame,
splashier for Rare/Mythic; (e) no auto-fill in the deck builder; everything else as
proposed.
