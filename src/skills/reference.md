# Viberail Project Conventions

## Folder Structure

Operation-first layout. Each operation gets its own folder. Shell at parent level,
core in `core/` subfolder. Shared steps live in `shared/steps/`.

```
src/
  domain/
    shared/                         <- reusable steps (guards, transforms, parsers)

    cart/
      types.ts                <- domain types, primitives, failure unions

      shared/steps/           <- reusable atomic steps (used across operations)
        check-active.spec.ts
        check-active.test.ts
        check-active.ts

      subtract-quantity/      <- one folder per operation
        subtract-quantity.spec.ts       <- shell spec
        subtract-quantity.spec.md       <- auto-generated structural docs (pipeline + decision table)
        subtract-quantity.test.ts
        subtract-quantity.ts            <- shell factory implementation
        core/
          subtract-quantity.spec.ts     <- core spec
          subtract-quantity.spec.md
          subtract-quantity.test.ts
          subtract-quantity.ts          <- core factory implementation

docs/                       <- Jekyll Just the Docs site (business-friendly prose)
  _config.yml               <- Just the Docs theme config
  index.md                  <- Domain home
  dependency-graph.md       <- Auto-generated Mermaid dependency graph of all specs
  cart/
    index.md                <- Aggregate overview (has_children: true)
    subtract-quantity.md    <- Operation page (parent: Cart)
    remove-item.md
    add-item.md
```

## File Naming

Every function produces up to 4 co-located files:

| File | Purpose | Created by |
|---|---|---|
| `name.spec.ts` | Behavioral contract: SpecFn type + Spec declaration | viberail-spec skill |
| `name.test.ts` | Test runner wiring (imports + one call) | `generate-test` MCP tool |
| `name.ts` | Implementation | viberail-implement skill |
| `name.spec.md` | Structural docs: pipeline + decision table (auto-generated) | `gen` MCP tool or `npm run vr:gen` |

All code files live in the same directory. No separation by concern (no `tests/` folder).

Business-friendly prose docs live separately in `/docs/` as a Jekyll Just the Docs
site, organized by aggregate. Scaffolded by the `generate-docs` MCP tool, prose
filled in via the viberail-docs skill.

## Naming Conventions

- **Files:** kebab-case — `check-active.spec.ts`, `subtract-quantity.ts`
- **Exports:** camelCase — `checkActiveSpec`, `subtractQuantityShellSpec`
- **Type exports:** PascalCase — `CheckActiveFn`, `SubtractQuantityShellFn`
- **Failure literals:** snake_case — `cart_empty`, `not_a_string`
- **Success types:** kebab-case, **past tense** — domain events describing what
  happened. `cart-id-parsed`, `quantity-reduced`, `cart-emptied`. Never present
  tense (`cart-is-active`) or noun phrases (`cart-total`)
- **Assertion names:** kebab-case — `status-is-active`, `total-recalculated`

## Core Types

All types are imported from the `viberail` package:

```ts
import type { Result, SpecFn, Spec, StepInfo, CanonicalFn, StrategyFn } from 'viberail'
import { testSpec, execCanonical, asStepSpec } from 'viberail'
```

### SpecFn — function contract bundle

```ts
type SpecFn<I, O, F extends string, S extends string> = {
    signature: (i: I) => Result<O, F, S>
    asyncSignature: (i: I) => Promise<Result<O, F, S>>
    result: Result<O, F, S>
    input: I
    failures: F
    successTypes: S
    output: O
}
```

Accessed via indexed types: `Fn['signature']`, `Fn['input']`, `Fn['failures']`, etc.

### StrategyFn — strategy dispatch contract

```ts
type StrategyFn<N extends string, I, O, C extends string, F extends string, S extends string> = {
    name: N
    input: I
    output: O
    cases: C
    failures: F
    successTypes: S
    handlers: Record<C, (i: I) => Result<O, F, S>>
}
```

Enforces all handlers share the same input and output types. Accessed via indexed types:
`Fn['handlers']` (for Steps typing), `Fn['failures']`, `Fn['successTypes']`, `Fn['cases']`.

### Spec — behavioral contract

```ts
type Spec<Fn extends AnyFn> = {
    document?: boolean
    steps?: StepInfo[]
    shouldFailWith: Partial<Record<Fn['failures'], FailGroup<Fn>>>
    shouldSucceedWith: Record<Fn['successTypes'], SuccessGroup<Fn>>
    shouldAssert: Record<Fn['successTypes'], AssertionGroup<Fn>>
}
```

One type for all functions — atomic, core factory, shell factory. The `steps`
array is optional: present for factories, absent for atomic functions.
All spec exports get `.spec.md` generation automatically via the `gen` MCP tool.
`document: true` controls whether a `/docs/` page is created via `generate-docs`.

### asStepSpec — AnyFn erasure helper

```ts
const asStepSpec = <Fn extends AnyFn>(spec: Spec<Fn>): Spec<AnyFn> =>
    spec as unknown as Spec<AnyFn>
```

Absorbs the `as unknown as Spec<AnyFn>` cast needed when passing typed specs
to `StepInfo.spec` or `StrategyStep.handlers`.

### CanonicalFn — standardized implementation structure

```ts
type CanonicalFn<Fn extends AnyFn> = {
    constraints: Record<Fn['failures'], (input: Fn['input']) => boolean>
    conditions:  Record<Fn['successTypes'], (input: Fn['input']) => boolean>
    transform:   Record<Fn['successTypes'], (input: Fn['input']) => Fn['output']>
}
```

An implementation pattern for flat functions (no decomposition needed). The canonical
formula — `constraints -> conditions -> transform` — standardizes how simple functions
are implemented. `execCanonical(def)` produces a `Fn['signature']`.

## Single Input Object

Functions and factories with more than one parameter always take a single object:

```ts
// YES
type CoreInput = { cart: ActiveCart; productId: ProductId; quantity: Quantity }

// NO — separate args
const subtractQuantityCore = (cart: ActiveCart, productId: ProductId, quantity: Quantity) => ...
```

## Shell / Core Split

- **Shell** — has deps (persistence, external services). Lives at the
  operation folder root: `subtract-quantity/subtract-quantity.ts`
- **Core** — no deps. Lives in `core/` subfolder:
  `subtract-quantity/core/subtract-quantity.ts`
- **Shared steps** — domain functions reused across operations. Live in
  `shared/steps/`: `shared/steps/check-active.ts`

Shell calls core as a step. Core composes domain steps. Steps are leaf nodes.

## Function Taxonomy

The step/dep distinction is about **ownership**, not sync/async:
- **Steps** = domain logic, owned by the factory, baked in at construction
- **Deps** = infrastructure capabilities, injected by the app layer

```
Shell (has deps)
  -> bridges app/infra with domain
  -> parses input (steps), resolves context (deps), calls core (step), persists (deps)
  -> typed via Fn['asyncSignature'] (async because deps are typically async)
  -> exported as: factory(steps)(deps) — partial application
  -> steps are baked in before export; app layer only provides deps

Core (no deps)
  -> implements core domain logic of an operation
  -> everything from outside (persistence, context) provided by shell
  -> orchestrates domain steps
  -> can be sync or async
  -> typed via Fn['signature'] or Fn['asyncSignature']
  -> exported as: factory(steps) — partial application

Step (atomic, single-concern)
  -> domain function (guard, transform, parse, or composed sub-operation)
  -> can be sync or async
  -> typed via Fn['signature'] or Fn['asyncSignature']
  -> exported directly (no factory) or via factory(steps)
```

## Strategy Pattern

When behavior varies by data, use a **strategy step** instead of branching.
A strategy is a `Record<Tag, Handler>` field in `Steps` — the factory dispatches
by property lookup on the input's discriminant. No `if/else`, no `switch`,
no ternary.

Each handler is a standalone function in its own file with its own `SpecFn`, `Spec`, and tests.

## Testing Approach

- **All functions** — tested with `testSpec(name, spec, fn)`. One runner for everything.
- **Test files are minimal** — imports and one `testSpec` call. Generated by
  the `generate-test` MCP tool.
- Inherited failures appear as `test.skip` with origin: `"(covered by parseCartId)"`.
- Empty groups without `coveredBy` appear as `test.todo`.

## Implementation Typing

Implementations are typed via the spec's `SpecFn`:

```ts
// Atomic step — typed via Fn['signature']
export const checkActive: CheckActiveFn['signature'] = (cart) => {
    const errors: CheckActiveFn['failures'][] = []
    // ...
}

// Core factory — returns Fn['signature']
const subtractQuantityCoreFactory =
  (steps: CoreSteps): SubtractQuantityCoreFn['signature'] =>
  (input) => { ... }

// Shell factory — returns Fn['asyncSignature']
const subtractQuantityShellFactory =
  (steps: ShellSteps) =>
  (deps: Deps): SubtractQuantityShellFn['asyncSignature'] =>
  async (input) => { ... }
```

Single source of truth — types flow from spec to implementation.
