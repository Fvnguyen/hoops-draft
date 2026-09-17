# journal/

Retrospective record of Claude Code sessions. **Not an agent-facing document.**

Nothing in `CLAUDE.md` or `AGENTS.md` points here, and nothing should. This
folder is for Fabian to read, and for a human or agent that has been *explicitly*
pointed at it. It sits outside the planning docs and outside any document
budget — it grows, it keeps history, and it repeats things the other docs say.

## Why it exists

The planning docs record *what was decided*. They do not record what was tried
and abandoned, what the reasoning felt like at the time, how long something took,
or how the working relationship is changing. Session transcripts hold all of
that and then get deleted.

## Layout

- `sessions/YYYY-MM-DD-topic.md` — one digest per session. Sections: what it was,
  decisions (with the *why* and the losing alternative), what was tried and
  rejected, build history, working-style observations, open threads.
- `tools/extract.py` — mechanical pre-filter of `~/.claude/projects/<slug>/*.jsonl`.
- `tools/DIGEST-BRIEF.md` — authoring brief for the model pass.
- `PRUNING.md` — the rule for archiving sessions from the app sidebar.

## Coverage

26 sessions, 2026-09-12 → 2026-09-17. Note how short that window is: this
project produced 26 sessions in six days, so the digests read more like a
continuous build log than separate episodes.

Raw transcripts totalled 234 MB across five project slugs (the main one plus
four worktrees) and reduced to 1.3 MB — a 129x ratio, roughly double what the
same filter achieves on prose-heavier projects, because these sessions are
overwhelmingly tool calls rather than discussion.

## Gotchas this project surfaced

- **Worktree sessions live under a separate project slug**
  (`C--Users-fabia-magic-ball--claude-worktrees-<branch>`). A sweep that globs
  only the main slug misses them.
- **A session with 0 user turns is not empty.** It was dispatched from a parent
  session, so its instructions never appear as a user message. Two such sessions
  here did real work, one of them committing.

## Source of truth

The digests are the record. Original transcripts live in
`~/.claude/projects/C--Users-fabia-magic-ball*/` and are not backed up here.
Archiving a session in the desktop app keeps it restorable; deleting does not.
