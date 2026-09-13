# Plan: <topic>

File: `docs/plans/plan_<topic>_<YYYY-MM-DD>.md` (date written). Status: planned | in progress |
done <date> (then `git mv` unchanged to `docs/completed/`)
Sequence: <n> in `docs/ROADMAP.md`. Depends on: <plans>. Files owned: <list>.

## Goal

One paragraph: what is different for the player when this is done.

## Decisions (locked)

Numbered `D1..Dn`. Every open question is answered here before work starts. If a task
later needs a decision that is not here, stop and add it (owner sign-off), don't improvise.

## Out of scope

What this plan deliberately does not do.

## Tasks

Numbered `T1..Tn`, each with: files touched, done-when, model tier.

## Parallelization (optional)

Waves. A wave lists tasks that run at the same time, each with disjoint files and the
model tier that runs it. Contracts (shared type/function signatures) are written in wave 0
so later waves don't block on each other.

## Recommended model tier

Main driver (Anthropic / Google) and per-wave agent tiers.

## Verification / exit criteria

Commands to run and the numbers/screens that must be true before moving to completed.
