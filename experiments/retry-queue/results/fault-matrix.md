# Planted-fault detection matrix

`✓` means the checked artifact actually failed in the recorded run. `—` means
that layer was not designed or configured to inject that named fault; it must
not be counted as a detection.

| Planted fault | TLC model mutant | TypeScript trace replay | TLC trace replay | Targeted Vitest fixture | fast-check model-based run | Stryker run |
|---|---|---|---|---|---|---|
| Missing lease atomicity (two owners) | ✓ `ExclusiveLease` | ✓ invariant failure | ✓ deadlock before bad state | ✓ | — generated commands are sequential; separate fiber test covers the race | — not an equivalent generated mutant |
| Duplicated external submission | ✓ `SubmitAtMostOnce` | ✓ invariant failure | ✓ deadlock before bad state | ✓ | — correct adapter compared over legal sequences, but the planted adapter was not substituted | — abstract transition code was outside the mutation target |
| Stale-worker race requeues a currently owned job | ✓ `LeasePhaseConsistent` | ✓ transition/invariant failure | ✓ deadlock before bad state | ✓ | — stale/illegal commands are filtered by model preconditions | — not an equivalent generated mutant |
| Retry after budget exhaustion | ✓ `RetryBound` | ✓ transition/invariant failure | ✓ deadlock before bad state | ✓ | — commands beyond the model budget are filtered | — not an equivalent generated mutant |

Additional measured signals:

- the normal TLC model completed 495 distinct states;
- the normal good implementation trace was accepted by both validators;
- fast-check completed 200 runs against the correct Effect adapter;
- Stryker killed all six runtime-valid mutants in `src/queue.ts`.

The gaps are intentional findings: random model-based command testing does not
replace schedule exploration or negative/illegal-command testing, and a high
mutation score only describes the selected target and mutation operators.
