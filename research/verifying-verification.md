# How to check that formal verification itself is correct

Prepared for David Chu, 15 Nov 2026 (Asia/Taipei). Links checked 15 Nov 2026. "Source says" marks a paraphrase or quote; "Synthesis" marks my own reasoning.

A green check from a verifier is only worth as much as three things:

1. the spec (does it say what we mean?),
2. the link between the model and the code (is this the system we ship?),
3. the checker (is the tool itself trustworthy?).

Each section below covers one of these, plus the human review that ties them together.

---

## 1. Spec validation: does the spec say what we mean?

- **Kleppmann (source says):** once proofs are automated, "the challenge will move to correctly defining the specification: that is, how do you know that the properties that were proved are actually the properties that you cared about?" https://martin.kleppmann.com/2025/12/08/ai-formal-verification.html
- **Lean reference manual (source says):** every level of proof checking is "meaningful if one believes the formal theorem statement corresponds to its intended informal meanings". It is "important to distinguish the question 'does the theorem have a valid proof' from 'what does the theorem statement mean'". It treats "un-reviewed AI-generated proofs and programs" as potentially *malicious* input. https://lean-lang.org/doc/reference/latest/ValidatingProofs/
- **Paulson (source says):** "The most important concern is the correct formulation of the definitions and theorem statements: if they are wrong, the proofs mean nothing." He adds that "a legible proof can even reveal incorrect definitions". https://lawrencecpaulson.github.io/2022/01/05/LCF.html
- **AlphaProof (source says):** even curated benchmarks had "misformalized problems (for example, disprovable statements, or statements with contradictions in its hypothesis)". These were corrected in miniF2F and upstream in PutnamBench. https://www.nature.com/articles/s41586-025-09833-y
- **Fonseca et al., EuroSys 2017 (source says):** they reviewed and tested three verified distributed systems (IronFleet, Verdi, Chapar) and found **16 bugs**. The bugs sat "at the interface between verified and other components, namely in the specification, shim layer, and auxiliary tools". None were in the verified protocols, despite more than eight months of searching. https://cs.purdue.edu/homes/pfonseca/papers/eurosys2017-dsbugs.pdf

**Synthesis.** Validate a spec by *executing* it, not only by reading it:

- ask the model checker for example traces you expect to exist;
- ask it for traces you expect to be impossible;
- check that the informal requirement and the formal property agree on those examples.

## 2. Vacuity: properties that pass for the wrong reason

- **Classic definition (source says).** Kupferman & Vardi: `AG(req → AF grant)` "is satisfied vacuously in systems in which requests are never sent". A stronger vacuity check asks "whether all the subformulas of the specification affect its truth value". The idea builds on Beer et al. https://www.cs.huji.ac.il/~ornak/publications/charme99abs.txt (CHARME 1999; DOI 10.1007/3-540-48153-2_8)
- **Real TLA+ example (source says).** Markus Kuppe found that two liveness properties in a published TLA+ post were "vacuously true". He confirmed it by replacing the consequent with `23=42 /\ 23#42`, and the property still held. He quotes Lamport: "Always be suspicious of success". https://lemmster.de/tla-liveness-review.html ; the original post with its correction: https://www.hillelwayne.com/post/adversaries/
- **LLM-written tautologies (source says).** In Wayne's review of an LLM-generated spec, both Alloy assertions "are tautologically true", and a TLA+ invariant only restated an action's own assignment. https://buttondown.com/hillelwayne/archive/llms-are-bad-at-vibing-specifications
- **Bait / witness properties (source says).**
  - Informal Systems recommends simpler, deliberately failing `Witness…` properties, e.g. `WitnessPeerSetIsNeverEmpty`, so that "we expect a model checker to produce a counterexample". https://github.com/informalsystems/vdd/blob/master/guide/guide.md
  - Ponzi describes Demirbas-style "bait invariants" such as `TLCGet("level") < 14`, and calls them "a form of mutation testing". https://blog.fponzi.me/2023-10-26-tla-plus-is-easy-if-you-know-how-to-abstract.html
- **TLC coverage and profiling (source says).**
  - `-coverage minutes` turns on coverage collection. https://docs.tlapl.us/using:tlc:start
  - The Toolbox profiler highlights "expressions with zero invocations and actions whose enablement predicate is never true — which are considered spec errors". It does not profile liveness properties. https://nightly.tlapl.us/doc/model/profiling.html ; https://dl.tlapl.us/tlatoolbox/branches/master/doc/model/tlc-options-page.html
- **Deadlock (source says).** TLC checks for deadlock by default. `-deadlock` or `CHECK_DEADLOCK FALSE` turns that off. https://docs.tlapl.us/using:tlc:start ; https://learning.tlapl.us/intro/tlc-config/
  - Synthesis: turning deadlock off hides "nothing can happen" states. Any spec that sets it off needs a stated reason, plus a liveness or witness property showing that progress really happens.
- **Property tests (source says).**
  - `fc.pre` skips runs whose precondition fails. Too many skips (governed by `maxSkipsPerRun`) fail the run.
  - `fc.statistics` shows how the generated inputs are distributed.
  - https://fast-check.dev/docs/api/interfaces/Parameters/ ; https://fast-check.dev/docs/api/functions/statistics/
- **Lean (source says).**
  - `sorry` and incomplete proofs show up as `sorryAx` under `#print axioms`.
  - The only expected axioms are `propext`, `Classical.choice` and `Quot.sound`. Anything else is a custom axiom or native evaluation.
  - `native_decide` / `decide +native` puts the Lean compiler into the trusted base. Since Lean 4.29.0 each such use appears as its own `_native` axiom (before that, as `Lean.trustCompiler`).
  - External checkers "cannot check such proofs".
  - https://lean-lang.org/doc/reference/latest/ValidatingProofs/ ; https://github.com/leanprover/lean4/pull/12217

## 3. Mutation testing of specs and models

- **Mutation model checking (source says).** Cordy, Lazreg, Legay & Schobbens (ESEC/FSE 2023 IVR) mutate the *model* and ask whether the spec rejects the mutants. In two case studies the specs detected only "40% and 60% of the mutants". They propose strengthening specs until the original model passes and the mutants fail. https://2023.esec-fse.org/details/fse-2023-ideas--visions-and-reflections/6/Towards-Strengthening-Formal-Specifications-with-Mutation-Model-Checking
- **Code-level mutation (source says).** The VSDD gist uses Stryker or mutmut "to verify the test suite actually catches real bugs". https://gist.github.com/dollspace-gay/d8d3bc3ecf4188df049d7a4726bb2a00 ; Stryker for JS/TS: https://stryker-mutator.io/
- **Synthesis: mutants worth running on any TLA+ model**
  - drop a guard conjunct;
  - swap `\A`/`\E`;
  - remove a variable from `UNCHANGED`;
  - weaken a fairness condition;
  - shrink the constants to 1.

  Each mutant should break at least one invariant or witness. A mutant that survives means the properties are weak in that area.

## 4. Model-vs-implementation conformance

- **AWS 2015 (source says):** "How do we know that the executable code correctly implements the verified design? … we do not know." https://cacm.acm.org/research/how-amazon-web-services-uses-formal-methods/
- **TLA+ trace validation (source says).** Cirstea, Kuppe, Loillier & Merz (SEFM 2024; arXiv 2404.16075):
  - The program is instrumented to log updates to spec variables, and TLC checks whether each logged trace is a behaviour of the spec. This reduces conformance checking to "a constrained model checking problem".
  - They found "discrepancies between the specifications and the implementations in all cases".
  - The approach "does not provide formal correctness guarantees".
  - https://arxiv.org/abs/2404.16075
- **Smart casual verification of CCF (source says).** Howard, Kuppe et al. tie the TLA+ spec of Azure Confidential Ledger's consensus to the C++ code, run it in CI, and found "six subtle bugs". https://arxiv.org/abs/2406.17455
- **MongoDB eXtreme Modelling (source says).** Model-based trace-checking was "impractical" against a highly abstract spec of the server. Model-based *test-case generation* "was highly successful" for Realm Sync. https://arxiv.org/abs/2006.00915
- **AWS PObserve (source says):** checks structured production logs post hoc against P specs. https://cacm.acm.org/practice/systems-correctness-practices-at-amazon-web-services/
- **fast-check model-based testing (source says).** `fc.commands` with `fc.modelRun` runs random command sequences against both a model and the real system. https://fast-check.dev/docs/advanced/model-based-testing/
- **Wayne (source says):** for TLA+, "there are no industry-ready tools" for trace validation. You do "a lot of manual labour tailored to your specific product". https://buttondown.com/hillelwayne/archive/ai-is-a-gamechanger-for-tla-users

## 5. Trusted computing base and kernel trust

- **de Bruijn criterion (source says).** Barendregt & Wiedijk: "A Mathematical Assistant satisfying the possibility of independent checking by a small program is said to satisfy the de Bruijn criterion." https://www.cs.ru.nl/~freek/pubs/rspaper.pdf
  - Paulson contrasts this with the LCF architecture, where a sceptic "must trust this kernel". https://lawrencecpaulson.github.io/2022/01/05/LCF.html
- **Lean's escalating checks (source says):**
  1. blue double check marks;
  2. `#print axioms`;
  3. `lean4checker --fresh`, which replays `.olean` declarations through the kernel. It is recommended in CI via lean-action `lean4checker: true`.
  4. the "gold standard": `lake comparator`, which builds in a sandbox and replays proofs with the Lean kernel and the independent Rust checker **nanoda**. It also checks that the proved statements match a trusted challenge file.

  Remaining assumptions include "no implementation bug affecting all of the used checkers simultaneously" and "no human error or misleading presentation of the theorem statement". https://lean-lang.org/doc/reference/latest/ValidatingProofs/ ; https://github.com/leanprover/lean4checker ; https://github.com/leanprover/comparator
- **Synthesis on Kleppmann's TCB claim.** Kleppmann says the proof checker is "a small amount of code that is itself verified". The Lean manual instead lists checker bugs as a residual risk that is reduced by using several independent checkers. Fonseca et al. show that in practice the shim and spec layers of the TCB are where the bugs were.

## 6. Human review of specs

- **Source says:**
  - AWS 2015: a formal spec should be "precise, short", and "well-commented".
  - Informal Systems: map TLA+ constructs to the English explanation through comments.
  - Ponzi: render specs to PDF to read them.
  - Wayne: LLM-written properties are "weak"; "intended properties need to be strong".
  - The VSDD "Spec Review Gate" asks the human and the adversary to look for ambiguity, missing edge cases, implicit assumptions and contradictions.
- **"Spec smells":** I found no established catalogue of *formal-spec* smells. There is a literature on *requirements* smells (e.g. https://dl.acm.org/doi/pdf/10.1145/2593812.2593817 ; https://arxiv.org/abs/2202.05641), but not for TLA+ or Lean. The smell list in the checklist is my synthesis from the sources above.

---

## 7. Checklist for agent-produced specs (synthesis, built from the sources above)

**A. Meaning**
1. Every property has a one-line English gloss next to it. A human has signed off that gloss and formula agree.
2. The Lean theorem statement and every definition it uses (including notation and type-class instances) have been read by a human, per the Lean manual's "remaining issues".
3. For each property, at least one concrete trace that *should* satisfy it and one that *should* violate it.

**B. Vacuity**

4. Every implication `P => Q` in an invariant or temporal property has a Witness or reachability property showing that `P` actually occurs.
5. TLC run with `-coverage`. No action has 0 distinct states. Expressions with zero invocations have been explained.
6. Deadlock checking is on. If it is off, there is a written reason and a liveness property.
7. Constants are not degenerate (e.g. `N = 1`, empty sets) unless that is the point. Say what state-space size was reached.
8. fast-check: `fc.statistics` shows the interesting cases are generated. No run fails on `maxSkipsPerRun`.
9. Lean: `#print axioms` on every exported theorem shows only `propext`, `Classical.choice` and `Quot.sound`. No `sorry`, no custom `axiom`, no `native_decide` unless explicitly approved.

**C. Strength**

10. A mutant set has been run (drop a guard, drop an `UNCHANGED` variable, swap a quantifier, weaken fairness, flip a comparison). Each mutant is killed by some property.
11. A spec change that only *weakens* a property, or *adds an assumption*, after a counterexample needs human approval. Wayne observed agents "fixing" races by declaring them OK.
12. At least one non-obvious property (liveness, action, or multi-step) per spec, not just type invariants.

**D. Conformance**

13. Property tests or model-based tests were generated from the spec, or the implementation's logs are trace-validated against it.
14. The mapping from spec variables to code state is written down.

**E. Trust**

15. CI runs `lean4checker` (and comparator for high-stakes proofs). It pins Lean and TLC versions and records them in the report.
16. The verifier's output is machine-readable and stored with the PR, so a reviewer can re-run it.
