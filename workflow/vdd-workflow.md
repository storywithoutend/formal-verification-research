# A VDD workflow for coding agents in apps-monorepo and ensjs (proposal)

Prepared for David Chu, 15 Nov 2026 (Asia/Taipei).

**Status: synthesis.** This is my proposal. It is built on the sources in `../research/vdd.md` and `../research/verifying-verification.md`, but no source prescribes this exact workflow for a TS/React monorepo. Where a step borrows a sourced practice, the source is named.

## Principles

1. **The verifier comes first and is frozen.** For each task, you (or a spec agent whose output you review) write the verifier before any implementation exists. The implementing agent may read the verifier but may not edit it.
   - Basis: your current practice; the VSDD "Red Gate"; Wayne's observation that agents "fix" counterexamples by weakening the spec.
2. **Every verifier must fail first.** Run it against an empty stub and against at least one deliberate mutant before handing it to the implementer.
   - Basis: VSDD Red Gate; bait and witness properties; mutation model checking.
3. **Use the cheapest level that can express the property.** Escalate only when needed. AWS uses a portfolio of methods, from property-based testing to proofs (Brooker & Desai 2025).
4. **Specs are oracles.** Formal models are also used as test oracles: AWS used Dafny code as the oracle for Cedar's Rust, and PObserve checks production logs against P specs.
5. **Verifier output is machine-readable.** Agents consume structured results, not prose.

## What gets verified at which level

| Level | Tool | Good for (apps-monorepo / ensjs) | Written before code | Vacuity / strength check |
|---|---|---|---|---|
| L0 Types | `tsc --strict`, branded types, type-level tests | Public SDK signatures, impossible states made unrepresentable | Signature and type tests | A deliberately wrong call must fail to compile (`@ts-expect-error`) |
| L1 Examples | Vitest | Known regressions, edge cases from issues | Failing tests | Must fail on the stub |
| L2 Properties | fast-check (`fc.property`, `fc.commands` + `fc.modelRun`) | Pure functions (encode/decode round-trips, normalisation idempotence, parser totality); stateful hooks and stores against a simple model | Properties plus the model class | `fc.statistics` on the interesting cases; Stryker mutation score on the target file; no `maxSkipsPerRun` failures |
| L3 Model checking | TLA+ with TLC (small constants) and Apalache (symbolic, inductive invariants) | Multi-step, concurrent or async flows: multi-transaction UI flows, retries and timeouts, cache or optimistic-update consistency, cross-tab or wallet-state races | `.tla` model, invariants, Witness properties, `.cfg` | `-coverage`, no action with 0 states, deadlock check on, bait invariants fail as expected, model mutants killed |
| L4 Proof | Lean 4 | Small pure algorithmic cores whose correctness argument is mathematical; refinement lemmas for an L3 model | Theorem statements, with `sorry` as the placeholder in the task file | `#print axioms` shows only the 3 standard axioms; `lean4checker` in CI; human sign-off on statements |
| Conformance | fast-check differential tests against an executable model; trace validation of logged spec-variable updates | Ties L3/L4 to the TS that ships | Logging hooks and mapping table | Discrepancies are triaged as code bug, spec too strict, or atomicity mismatch (the three categories from Cirstea et al.) |

**Notes.**
- The Lean proof is about Lean definitions, not about the TypeScript. To connect them, run the Lean (or TLA+) model as an oracle in fast-check differential tests. This is the Cedar pattern: proof in Dafny, differential testing of the Rust.
- Trace validation of TLA+ has been published for Java and C++ programs (Cirstea et al.; CCF). Doing it for TS is new work. Per Wayne, there are no industry-ready tools.

## The agent loop on herdr

```
spec-agent (fresh ctx) ──► verifier PR (L0–L4 artifacts + verify.json schema)
          ▲                          │  you review: meaning, vacuity, strength (checklist)
          │                          ▼
  spec-change request ◄── implementer agent ──► `pnpm verify --json` ──► verify.json
          │                     ▲                                          │
          │                     └──── reads failures, fixes code ◄─────────┘
          ▼
   adversary agent (fresh ctx, read-only): runs mutants + checklist, reports survivors
```

1. **Spec phase.** A spec agent drafts the verifier artifacts in a separate pane and branch. You review them with the checklist in `verifying-verification.md` section 7. The verifier files then go under a path that the implementer's tooling treats as read-only. For example, a pre-commit or CI check fails if any file under `verify/` changes in an implementer branch, or if their recorded hash changes.
2. **Red check.** CI runs the verifier against the stub and against the mutant set. Expected result: everything fails, and every mutant is killed.
3. **Implement phase.** The implementer agent loops on `pnpm verify --json` until the result is green. It receives structured failures:

```json
{
  "level": "L3",
  "tool": "tlc",
  "status": "fail",
  "property": "NoDoubleSubmit",
  "counterexample": [{"step": 1, "action": "Submit", "state": {"pending": 1}}],
  "coverage": {"actionsWithZeroStates": []},
  "tool_version": "…",
  "next_hint": "Implementation diverges from model at step 3; spec is frozen, fix code or file spec-change request"
}
```

   - For Lean, the record includes `axioms: [...]` and `sorry_count`.
   - For fast-check, it includes `seed`, `path`, `counterexample` and `statistics`. A replayable seed matters because agents need a deterministic reproduction.
4. **Spec-change requests, never silent edits.** If the implementer believes the spec is wrong, it writes `spec-change-request.md` (the counterexample, the proposed change, and whether the change weakens a property or adds an assumption) and stops. In herdr terms, the pane goes to `blocked`, and the completion webhook in this bot's herdr skill can notify you instead of you polling. You decide.
5. **Adversary pass.** A fresh-context reviewer, in the spirit of Doll's VDD, runs mutants and the checklist against the *final* spec and code, and reports surviving mutants and vacuous properties. Its findings are inputs for you, not a stop rule.
6. **Merge gate.**
   - L0–L2 are green.
   - L3 passes TLC on the agreed constants, with coverage attached.
   - L4 passes `#print axioms` and `lean4checker`.
   - Mutation score is at least the threshold you set per package.
   - `verify.json` is attached to the PR.

## Rollout order (suggested)

1. Add `verify.json` emission and the frozen-verifier CI check to existing Vitest and fast-check suites (cheap; works today).
2. Add Stryker on one ensjs pure module to measure how strong the current tests are.
3. With the sibling FV bot: pick one async UI flow in apps-monorepo, model it in TLA+, and add Witness properties, `-coverage` and a mutant set from day one.
4. Lean only for a pure core where a proof gives more than fast-check, with the comparator-style "trusted statement file" kept separate from agent-written proofs.

## Open questions (not answered by sources)

- How well TLA+ trace validation carries over to browser and React event ordering (atomicity grain). Cirstea et al. call grain-of-atomicity mismatches a main source of discrepancies.
- How to set mutation-score thresholds per package. I found no source-backed number.
