# Domain Layer Conventions — Shell / Core Pattern

This document describes the standardized pattern for domain operations when using
viberail to build a domain layer. These conventions apply to aggregate operations
(commands that change state), not to standalone utility functions or parsers.

## Overview

Every domain operation is split into two factories:

- **Core** — pure domain logic, no infrastructure. Receives everything it needs
  as input. Can be built with `CanonicalFn` / `execCanonical`.
- **Shell** — orchestrates infrastructure. Fetches state, resolves context,
  calls core, applies side effects.

This split gives you: pure-logic unit tests on core (no mocks), clear infrastructure
boundary at the shell, and a standardized algorithm that both humans and AI agents
can follow without guessing.

## Core factory

### Input shape

Core always receives a single object with standardized fields:

```ts
type CoreInput = {
    cmd: ParsedCommand      // what to do (validated, typed)
    state: AggregateState   // current aggregate state (fetched by shell)
    ctx?: Context           // resolved external info (timestamps, IDs, config)
}
```

- **`cmd`** — the parsed, validated command. Never raw input.
- **`state`** — the current aggregate, fetched from persistence by the shell.
  Core never fetches its own state.
- **`ctx`** — any values resolved from outside the aggregate: generated IDs,
  timestamps, config lookups, related aggregate data. Optional when the
  operation needs nothing beyond cmd and state.

### Algorithm

Core follows a linear pipeline:

1. **Validate state** — guard steps that check the aggregate is in the right
   lifecycle state for this operation (e.g., `checkActive`, `checkNotConfirmed`)
2. **Apply business rules** — domain steps that transform state according to
   the command (e.g., `subtractQuantity`, `removeItem`)
3. **Evaluate success type** — always the last step, classifies the outcome
   (e.g., `'quantity-reduced'` vs `'item-removed'` vs `'cart-emptied'`)

No deps, no side effects, no persistence. Core is deterministic given its input.

### Canonical implementation

Core functions are excellent candidates for `CanonicalFn` / `execCanonical` when
the logic is flat (no sub-step decomposition needed):

```ts
import type { CanonicalFn } from 'viberail'
import { execCanonical } from 'viberail'

const createDispatchCoreDef: CanonicalFn<CreateDispatchCoreFn> = {
    constraints: {
        already_exists: (input) => input.state === null,
    },

    conditions: {
        'dispatch-created': (_input) => true,
    },

    transform: {
        'dispatch-created': (input) => ({
            status: 'to-deliver',
            id: input.cmd.dispatchId,
            processingId: input.cmd.processingId,
            mediationId: input.cmd.mediationId,
            destination: input.cmd.destination,
            event: input.cmd.event,
            createdAt: input.ctx.createdAt,
        }),
    },
}

export const createDispatchCore = execCanonical<CreateDispatchCoreFn>(createDispatchCoreDef)
```

The canonical formula maps directly to the core algorithm:
- `constraints` = validate state (step 1)
- `conditions` = evaluate success type (step 3, moved up for structural reasons)
- `transform` = apply business rules and produce output (step 2)

When core needs sub-step decomposition (multiple independent validations, complex
transforms), use the factory pattern with explicit steps instead.

### SpecFn for core

```ts
export type CreateDispatchCoreFn = SpecFn<
    { cmd: ParsedCmd; state: Dispatch | null; ctx: { createdAt: Date } },
    ToDeliverDispatch,
    'already_exists',
    'dispatch-created'
>
```

Input is always the `{ cmd, state, ctx }` shape. Output is the new aggregate state.

## Shell factory

### Input shape

Shell receives only the raw command:

```ts
type ShellInput = {
    cmd: {
        dispatchId: string
        processingId: string
        destination: string
        event: unknown
    }
}
```

Everything else (state, context) is resolved by the shell's pipeline.

### Algorithm

Shell follows a standardized pipeline:

1. **Parse command** — validate and parse raw input fields (parse steps)
2. **Fetch state** — retrieve current aggregate from persistence (safe-deps)
3. **Resolve context** — generate timestamps, IDs, fetch related data (safe-deps)
4. **Run core** — call the core factory with `{ cmd, state, ctx }` (step)
5. **Apply side effects** — persist the result, emit events via outbox (deps)

```ts
return async (input) => {
    // 1. fetch and validate aggregate state
    const stateResult = await getDispatchById(input.cmd.dispatchId)
    if (!stateResult.ok) return stateResult as any
    const state = stateResult.value

    // 2. generate validated timestamp
    const createdAtResult = await generateTimestamp()
    if (!createdAtResult.ok) return createdAtResult as any

    // 3. core domain logic — cmd + state + ctx
    const result = steps.createDispatchCore({
        cmd: input.cmd,
        state,
        ctx: { createdAt: createdAtResult.value },
    })
    if (!result.ok) return result as any

    // 4. persist result
    await deps.upsertDispatch(result.value)

    // forward successType from core
    return { ok: true, value: result.value, successType: result.successType }
}
```

### Side effects

Shell is where side effects happen. Common patterns:

- **Persistence** — `upsertAggregate(result.value)` after core succeeds
- **Outbox** — if core returns domain events, shell persists them for async
  dispatch: `await deps.appendOutbox(result.events)`
- **Notifications** — emit events after successful persistence

Side effects happen AFTER core succeeds. If core fails, no side effects run
(short-circuit guarantees this).

### Shell forwards successType from core

Shell never reclassifies the outcome. Core determines the success type,
shell passes it through:

```ts
return { ok: true, value: result.value, successType: result.successType }
```

### Partial application — wiring

Shell uses three-level partial application:

```ts
const createDispatchShellFactory =
    (steps: ShellSteps) =>       // 1. bake in domain steps (at module level)
    (deps: Deps) => {            // 2. inject infrastructure deps (at app startup)
        // wire safe-deps once
        const getDispatchById = steps.safeGetDispatchById(deps.getDispatchById)

        return async (input) => {  // 3. the actual function (called per request)
            // ...pipeline
        }
    }

export const _createDispatch = createDispatchShellFactory(shellSteps)
// App layer: const createDispatch = _createDispatch(realDeps)
```

The `_` prefix signals "needs dep injection before use."

## When this pattern applies

Use shell/core split for **aggregate operations** — commands that read and modify
aggregate state through a defined lifecycle.

Do NOT use shell/core for:
- **Parse functions** — standalone, no aggregate state
- **Utility steps** — pure transforms, no lifecycle
- **Query functions** — read-only, no state mutation
- **Infrastructure adapters** — outside the domain layer

These use viberail's spec framework directly without the shell/core convention.
