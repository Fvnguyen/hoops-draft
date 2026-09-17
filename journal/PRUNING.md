# Session pruning rule

Default policy for pruning Claude Code sessions from the desktop app sidebar.
Applies per project root (`cwd`), independently.

Prune on **state**, not on age. Recency alone fails in both directions: it
protects empty `/remote-control` rows while archiving finished substantive work.

## The rule

Evaluate every session in a project. Apply the tiers **in order** — the first
tier a session matches decides it.

### Tier 1 — Protected. Never auto-archive.

- Running, pinned, or open on screen.
- Worktree has uncommitted changes, **or** its branch holds commits not
  contained in `main` → unfinished work.
- Has an open, unmerged PR.

### Tier 2 — Always archive, regardless of recency.

- **Trivial:** fewer than 3 user turns **and** no files edited **and** no
  commits. The `/remote-control` invocations, empty sessions, one-shot slash
  commands. Nothing happened, so nothing is lost, and they must never occupy a
  keep slot.

  All three conditions must hold. An earlier version of this rule used
  "<3 user turns **or** <5 KB transcript" and was wrong: a session **dispatched
  from a parent session has 0 user turns** — its instructions arrive as assistant
  context, not as a user message — while still editing files and committing. In
  magic-ball, `6b41d57c` had 0 user turns, 2 file edits and a commit, and the old
  rule would have classified it as trivial. Turn count alone does not measure
  whether work happened; file edits and commits do.

### Tier 3 — Keep floor.

- Among the sessions still undecided, keep the **4 most recently active**.

### Tier 4 — Archive the remainder.

- Everything left. In practice these are sessions whose work has landed in
  `main` and whose transcript is captured in `journal/sessions/`.

## Standing constraints

- **Archive is the only routine verb.** `delete_session` never runs as part of
  pruning — only on an explicit request naming specific sessions. Archiving
  preserves the transcript on disk and stays restorable; deletion destroys the
  transcript and can take the branch with it.
- **Digesting is not a prerequisite for archiving** (archiving loses nothing).
  It **is** a hard prerequisite for deleting.
- Run when a project crosses ~12 rows. Not on a schedule.

## Mandatory pre-check

`archive_session` **does not guard uncommitted work.** It cleans up the
session's worktree by default, and only refuses sessions that are running,
pinned, or on screen. (`delete_session` is the one that checks for dirty
worktrees.) So Tier 1's worktree test is *ours* to run, every time, before
archiving anything in a project that uses worktrees:

```bash
git worktree list --porcelain | grep ^worktree | cut -d' ' -f2 | while read w; do
  echo "$(git -C "$w" status --porcelain | wc -l) dirty : $w"
done
```

and for each worktree branch, confirm its commits are in `main`:

```bash
git merge-base --is-ancestor <worktree-HEAD> main && echo "contained in main"
```

## Matching sessions to transcripts

The app's session id (`local_<uuid>`) is **not** the transcript filename.
They only correspond by last-activity timestamp — match
`lastActivityAt` from `list_sessions` against the final timestamp of
`~/.claude/projects/<slug>/<id>.jsonl`. A match inside ~5 minutes is reliable.

Sessions that ran in a git worktree store their transcripts under a **separate
project slug** (`<project>--claude-worktrees-<branch>`), not the main project
folder. Any sweep that globs only the main slug silently misses them — and they
are often the largest sessions.

## Known limits

- `list_sessions` returns at most 50 rows per call, so counts for a busy project
  are a floor, not a total.
- Pruning the sidebar does not reclaim disk. The JSONL transcripts stay where
  they are. Reclaiming disk is a separate, deletion-based pass and should only
  follow digests that have actually been read.
