# ens-lean-example

A small, original Lean 4 project used by [`../lean4-primer.md`](../lean4-primer.md).
It models the property stubbed in
[`CertifiedRegistryPathProof.tla`](https://github.com/ensdomains/apps-monorepo/blob/formal/migration-model/apps/manager/verification/migration/CertifiedRegistryPathProof.tla)
(ensdomains/apps-monorepo, `formal/migration-model` branch): a walk from a certified root
only visits certified registries, as long as certified registries only link certified
subregistries. It is a toy, not ENS contract code.

```sh
curl -sSfL https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh | sh -s -- -y
lake build                              # builds EnsExample (Registry + Concrete)
lake env lean demos/Broken.lean         # deliberately broken proof, exits 1
lake env lean demos/Escapes.lean        # sorry / axiom / vacuous hypotheses
lake env lean demos/GoalStates.lean     # prints goal states with trace_state
```

`demos/` is not part of the default build target. Real outputs from 2026-11-16 (UTC+8),
Lean 4.35.0 on x86_64 Linux, are in [`logs/`](./logs/).
