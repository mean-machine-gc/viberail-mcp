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

Before writing anything, understand what already exists:

- Call `list-specs` to see all specs in the project
- Call `check` to find incomplete specs, missing examples, inheritance drift
- Call `get-dependency-graph` to see how specs relate to each other
- Call `get-test-results` to see what's passing and what's failing
- Call `launch-ui` to open the visual workbench — interactive dependency graph,
  spec browser, coverage matrix, test dashboard, and spec diff viewer. Useful
  for getting a visual overview of the project or reviewing changes before a PR.

## When to use tools vs skills

**MCP tools** — programmatic operations with structured output:
- `init-project` — set up a new project (once)
- `check` — validate specs for completeness
- `gen` — regenerate .spec.md files
- `generate-test` — create test file from spec
- `generate-docs` — scaffold doc page from spec
- `list-specs`, `get-spec`, `get-dependency-graph` — orientation
- `get-test-results` — check test status
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
