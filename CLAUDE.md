@AGENTS.md

## Claude Code notes

Read `AGENTS.md` first, then `docs/HANDOVER.md` (current state, open issues) and
`docs/ARCHITECTURE.md` (how the pieces connect) before making non-trivial changes. Work
larger than a bug fix follows a plan `docs/plans/plan_<topic>_<date>.md` (sequence in
`docs/ROADMAP.md`; create with `/plan <topic>`); when a plan is done, `git mv` it to
`docs/completed/` and update both (`/plan done <topic>`).

**Document budgets** (compact by rewriting, never by appending; if a change pushes a file
over budget, rewrite it down in the same commit):

| Document | Budget | Keep |
|---|---|---|
| `CLAUDE.md` | 40 lines | pointers and rules only |
| `AGENTS.md` | 150 lines | repo map, commands, product rules, gotchas; no changelog |
| `docs/HANDOVER.md` | 250 lines | current state + last 3 milestones in full; older ones one line each under "History"; open issues re-verified at every rewrite |
| `docs/ROADMAP.md` | 80 lines | sequence table + latest 3 completed |
| `docs/plans/*.md` | 150 lines | decisions and tasks only |

**Verification expectations:**
- Run `npm test` (root) after touching anything in `frontend/src/engine/` or `src/storage/` — Vitest tests in
  `frontend/tests/unit/` import the real engine. For balance-relevant changes also run
  `npm run balance` and quote before/after PPP and score distribution.
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
