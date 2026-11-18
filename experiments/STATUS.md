# Model-first experiment status

Completed 2026-11-19 on `main`.

## Delivered

- `research/model-first-evidence.md`: validated evidence table, bibliographic
  discrepancies, artifacts, and guarantee taxonomy.
- `experiments/retry-queue/`: ENS-flavored concurrent renewal workflow with:
  - TLA+ model/config and four model faults;
  - complete TLC finite-state run and bounded Apalache run;
  - TypeScript / Effect implementation with atomic `Ref.modify`, injected
    outcomes, concurrent fibers, and `TestClock`;
  - abstract transition logs and TLC-backed trace replay;
  - fast-check model-based tests;
  - Stryker mutation run;
  - four planted implementation traces and a layer-by-layer detection matrix;
  - reproducible scripts, committed result summaries, and README.
- `research/model-first-feasibility.md`: feasibility assessment, recommended
  architecture, minimal real-repository prototype plan, acceptance criteria,
  cost/performance observations, and open questions.

## Commits pushed

- `e792099` — research: document model-first verification evidence
- `7f94adf` — experiment: model concurrent renewal retries
- `1da9c83` — experiment: implement and validate Effect retry queue
- `3e5db9e` — docs: record retry queue experiment results
- `5633f0d` — research: assess model-first TypeScript feasibility

## Recorded results

- TLC normal model: pass; 1,247 generated / 495 distinct states; depth 13.
- TLC deliberate model faults: 4/4 produced the intended invariant violation.
- Apalache 0.63.0: no invariant error through 12 transitions.
- Strict TypeScript: pass.
- Vitest: 4 files, 14 tests, all pass.
- fast-check: 200 model-based runs with seed `20261119`.
- Trace replay: good trace accepted; 4/4 planted bad traces rejected by both the
  TypeScript replay and TLC.
- Stryker: 41 generated mutants; 35 type-invalid/rejected by the checker; all
  6 runtime-valid mutants killed; reported mutation score 100%.
- Final `experiments/retry-queue/scripts/run-all.sh`: exit 0.

These results do not prove the TypeScript implementation or a deployed ENS
workflow correct. They establish bounded/model-specific checks and conformance
for selected observed traces.

## Still open

- Apply the workflow to one real public TypeScript / Effect feature with a
  reviewed abstraction and production-safe trace schema.
- Model durable storage, idempotency/fencing, RPC/wallet behavior, cancellation,
  and recovery rather than the experiment's in-memory atomic effect.
- Add generated stale/illegal commands and controlled schedule generation to the
  fast-check layer.
- Decide whether Apalache adds value beyond TLC for the selected real model and,
  if so, attempt an inductive invariant rather than only a bounded check.
- Resolve the trusted bridge for any verified-IR-to-TypeScript approach; no
  trustworthy general Effect/TypeScript backend was found.
- The dedicated archival artifacts for the SEFM trace-validation and ICML Coins
  papers remain marked `UNVERIFIED` in the evidence report.
