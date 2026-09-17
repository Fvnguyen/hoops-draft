# Digest authoring brief

You are writing retrospective digests of past Claude Code sessions for the
`magic-ball` project (repo: hoops-draft), into `journal/sessions/`.

## Inputs

Pre-filtered transcript renderings live in:
`C:/Users/fabia/AppData/Local/Temp/claude/C--Users-fabia-fvn-ai/3d465623-7b22-49dc-b660-007430cecc04/scratchpad/digest-mb/<session-id>.txt`

Each begins with a metadata header (window, branch, tool counts, files edited,
commit/failure counts), then the session in order:

- `[timestamp] USER:` — the user's message, **verbatim and complete**
- `  CLAUDE:` — assistant prose, truncated at 700 chars
- `    > Tool(arg)` — a tool call; `> Tool xN [...]` is a collapsed run
- `    ! FAILED Tool: ...` — a tool call that errored
- `    < AGENT REPORT: ...` — a subagent's returned result
- `=== SUBAGENT RUNS ===` at the end — each subagent's brief and final result

Tool *results* were dropped deliberately. If a fact is not in the rendering,
say so rather than inferring it.

## Output

One file per session: `C:/Users/fabia/magic-ball/journal/sessions/YYYY-MM-DD-topic.md`
where `YYYY-MM-DD` is the session's start date and `topic` is a short kebab-case
slug you choose from the content (not the auto-generated title, which is often
wrong or missing).

**Follow `C:/Users/fabia/fvn-ai/journal/sessions/2026-08-21-taste-canon-anchor-review.md`
exactly** — read it first. (It is from a different project; copy its STRUCTURE and
voice, not its subject matter.) Same frontmatter keys, same section order, same voice.

Sections: frontmatter · What this session was · Decisions made · What was tried
and rejected · Build history · Working-style observations · Open threads.

## What matters

1. **Decisions** — record the *why* and the alternative that lost, not just the
   outcome. A decision whose reasoning is recoverable from the repo is less
   valuable than one whose reasoning exists only in the transcript. Include
   constraints that drove the choice (blast radius, cost, existing convention).
2. **What was tried and rejected** — dead ends, abandoned approaches, things the
   user vetoed. Quote the veto. This is the highest-value section and the one
   that exists nowhere else.
3. **Build history** — numbered, terse, what actually happened in order,
   including commits and deploys.
4. **Working-style observations** — how Fabian works and decides. Dated, quoted,
   **raw and un-synthesized** — these are inputs to a profile built later, so do
   not generalize across sessions or draw conclusions about his character. Note:
   how he scopes and gates work, how he corrects, what he delegates, what he
   challenges, how he reacts to being wrong or to you being wrong, what he
   ignores. Quote the actual words. If a session shows nothing notable here,
   write "Nothing distinctive." rather than padding.
5. **Open threads** — what was left unfinished or deferred.

## Rules

- **Do not read the repo.** No Grep, no Glob, no exploring `magic-ball` source. Work
  only from the transcript rendering and the sample digest. The point is to
  capture what the transcript holds, not to re-derive the current state of the code.
- Never invent specifics. No fabricated commit hashes, file counts, or timings —
  the header gives you the real ones.
- Short sessions get short digests. A 10 KB transcript may warrant 30 lines. Do
  not pad to match the sample's length.
- Write for a reader who has forgotten the session entirely but knows the project.
- Use `→` for consequence lines and `**Dn —**` numbering for decisions, as in the
  sample.

## magic-ball specifics

- Almost every session here is **untitled** — derive the topic slug entirely
  from content.
- Sessions are dense and close together (2026-09-12 to 2026-09-17), so several
  share a date. Give each a distinct topic slug so filenames never collide.
- Some sessions ran in a git worktree; their header shows a `claude/...` branch.
  Add a `worktree:` line to the frontmatter for those.
- A session with **0 user turns** was dispatched from a parent session — its
  instructions arrive as the first assistant context, not as a USER line. Do not
  describe these as "empty"; report what was built and note it was agent-dispatched.
