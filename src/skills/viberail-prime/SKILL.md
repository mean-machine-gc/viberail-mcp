---
name: viberail-prime
description: Primes the agent on viberail philosophy, workflow, and rules. Load this when working on a viberail project to understand the spec-first approach before taking any action.
---

## What is viberail

Viberail is a spec-first development framework for TypeScript. It exists to give
both humans and AI agents the structure needed for productive collaboration and
high quality results — avoiding the entropy of vibe coding where plausible-looking
code slowly rots without anyone noticing.

Every function starts as a behavioral contract (`Spec<Fn>`) — what can fail,
what success looks like, what properties hold. Tests, documentation, and
implementation are all derived from this single artifact. The spec is the source
of truth. Always.

## Two layers

**Viberail the framework** is universal. `Spec<Fn>`, `testSpec`, `Result`,
`CanonicalFn` — these work on any function. A CSV parser, a math utility,
an API validator. No opinions about architecture.

**Viberail for domain layers** adds conventions on top of the framework. When
building aggregate operations (the primary use case), a standardized shell/core
pattern applies: core receives `{ cmd, state, ctx }`, shell orchestrates
infrastructure around it. See [domain-layer-reference.md](../domain-layer-reference.md)
for the full pattern.

The workflow below covers both. When building a domain layer, start with discover.
When using viberail for standalone functions, skip to model or spec directly.

## The law

1. **Spec first.** Never write implementation before the spec exists and is complete.
2. **Spec is source of truth.** Never modify a spec to match an implementation.
   If the implementation doesn't pass, fix the implementation.
3. **Never throw.** All errors are `Result<T, F, S>`. No exceptions, anywhere.
4. **Never vibe code.** Every function has a spec. Every spec has examples.
   Every example has concrete, realistic values. No handwaving.

## Workflow

The workflow is sequential. Each step produces one artifact. Don't skip steps.

0. **Discover** (`viberail-discover` skill) — map the domain: aggregates,
   lifecycle states, operations, event flows, dependencies. Only when building
   a domain layer. Produces a domain map in prose.

1. **Model** (`viberail-model` skill) — design domain types in `types.ts`.
   Discriminated unions for lifecycle states, value objects, failure unions.

2. **Spec** (`viberail-spec` skill) — design the behavioral contract in `.spec.ts`.
   SpecFn type, failure groups, success groups, assertions, algorithm decomposition.
   This is the most important step.

3. **Test** (`generate-test` MCP tool) — generate the test file. One call, fully
   automatic. Tests will fail — that's correct.

4. **Implement** (`viberail-implement` skill) — write the simplest code that makes
   all tests pass. Inside-out: steps first, then core factory, then shell factory.

5. **Docs** (`generate-docs` MCP tool + `viberail-docs` skill) — scaffold the doc
   page, then fill in business prose.

## Orientation — before you start

Before writing anything, call `status` to get the full project picture in one
shot. It returns:

- Every spec with its check status, test/impl/doc file existence, and test results
- A project-level summary (how many specs, how many passing, coverage gaps)
- A prioritized `nextActions` list telling you exactly what to do next
- Staleness detection: if source files changed since the last test run,
  `summary.tests.stale` is `true` and `nextActions` warns you to re-run

**Always start with `status`.** It replaces the need to call `list-specs`,
`check`, `get-test-results`, and `get-dependency-graph` separately. Use those
individual tools only when you need to drill deeper into a specific spec or issue.

**When you need authoritative test results**, call `status` with `runTests: true`.
This runs the test suite first and guarantees fresh data. Use it:
- At the start of a session (to know the real state)
- After implementing or modifying code (to verify your changes)
- Before making decisions based on pass/fail data

Without `runTests`, test data may be stale. Status will warn you when it is —
follow the warning.

For a visual overview, call `launch-ui` to open the interactive workbench.

## The status loop

The workflow is not strictly one-way. After any phase, call `status` to verify
and orient. The `nextActions` field tells you what to do next — follow it.

```
status → act → status → act → ...
```

This means you can drop into a project at any point and `status` will tell you
where things stand and what needs attention. You don't need to start from scratch.

## When to use tools vs skills

**MCP tools** — programmatic operations with structured output:
- `status` — **start here** — full project health, per-spec matrix, next actions
- `init-project` — set up a new project (once)
- `check` — validate specs for completeness (deep-dive)
- `gen` — regenerate .spec.md files
- `generate-test` — create test file from spec
- `generate-docs` — scaffold doc page from spec
- `list-specs`, `get-spec`, `get-dependency-graph` — drill into specifics
- `get-test-results` — detailed test results per spec
- `launch-ui` — open the visual workbench

**Skills** — interactive guidance for design decisions:
- `viberail-discover` — domain mapping (interactive, aggregates and operations)
- `viberail-model` — types design (interactive, one decision per turn)
- `viberail-spec` — spec design (interactive, one section at a time)
- `viberail-implement` — implementation (guided, diagnose against spec)
- `viberail-docs` — prose writing (fill in template placeholders)

## Key principles

- **Accumulate errors, don't short-circuit** — parse and step functions collect
  all failures before returning. Factories short-circuit between steps.
- **Work inside-out** — implement leaf steps first, then core factory, then shell.
  Each layer's tests pass before the next depends on it.
- **Specs compose fractally** — factory specs reference step specs. Failures
  auto-inherit up the chain. You only declare overrides and own failures.
- **One function, one spec, one test, one file** — no bundling, no shared test
  files, no multi-function modules.
- **Realistic test data** — "4 sneakers at $100 each", not "item1 with price 1".
  Test data is domain-meaningful.
