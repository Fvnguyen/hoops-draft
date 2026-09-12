@AGENTS.md

## Claude Code notes

Read `AGENTS.md` first, then `docs/HANDOVER.md` (current state, open issues) and
`docs/ARCHITECTURE.md` (how the pieces connect) before making non-trivial changes.

**Verification expectations:**
- Run `npm test` (root) after touching anything in `frontend/src/lib/` — the tests in
  `tests/` mirror the engine/deckbuilder logic inline in plain Node, so update both sides
  together.
- For any UI-visible change, capture a screenshot with `node scripts/screenshot.js
  [route] [outfile] [--full]` (requires `npm run dev` running) rather than describing the
  change from code alone.
- For engine/balance changes, run `npm run analyze` against a fresh `/debug` export and
  compare before/after numbers — don't eyeball it.
- Playwright visual tests (`npm run test:e2e`) have committed win32 snapshots; expect
  diffs on non-Windows runners and say so rather than "fixing" the baseline blind.

**Commit style** (see `git log`): conventional prefixes — `feat:`, `fix:`, `chore:`,
`docs:`, `refactor:` — short imperative subject, body explains why when non-obvious.

**End of a substantial session**: update `docs/HANDOVER.md` with what changed, what's
still open, and how to verify it — the next session (human or agent) starts from that
file.
