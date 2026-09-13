# Plan: <topic>

File: `docs/plans/plan_<topic>_<YYYY-MM-DD>.md` (date written). Status: planned | in progress |
done <date> (then `git mv` unchanged to `docs/completed/`)
Sequence: <n> in `docs/ROADMAP.md`. Depends on: <plans>. Files owned: <list>.

## Goal

One paragraph: what is different for the user when this is done, and why now.

## Decisions (locked)

Numbered `D1..Dn`. Every open question is answered here before work starts. If a task
later needs a decision that is not here, stop and add it (owner sign-off), don't improvise.
Numbers are concrete (targets, bands, constants), not "tune until it feels right".

## Out of scope

What this plan deliberately does not do, and which plan does it instead.

## Tasks

Numbered `T1..Tn`, each with: files touched, done-when (a test, a command output, a
screenshot), model tier (top | mid | low).

## Parallelization (optional)

Waves. Wave 0 is the driver writing contracts (shared types/signatures) so later waves
don't block. Each later wave lists tasks that run at the same time, each with disjoint
files and the tier that runs it. Agents never run git.

## Recommended model tier

Main driver (Anthropic / Google) and per-wave agent tiers, with one line on why.

## Verification / exit criteria

Commands to run and the numbers/screens that must be true before `/roadmap done`.
