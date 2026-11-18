# Formal Verification for Model-First Software Development

Research brief for an AI research agent · 2026-11-18

## Research objective

Investigate practical workflows that begin with a formal specification or verified intermediate representation and end with working software. Focus on **TypeScript / Effect TS**, concurrency, state machines, and AI-assisted coding. Distinguish mathematical proofs of implementation correctness from bounded model checking, runtime trace conformance, and model-generated tests.

## Priority research topics and links

### 1. Model-first development with TLA+, PlusCal, and TLC

- [TLA+ official site](https://lamport.azurewebsites.net/tla/tla.html)
- [PlusCal algorithm language](https://lamport.azurewebsites.net/tla/pluscal.html)
- [TLA+ tools and TLC model checker](https://github.com/tlaplus/tlaplus)
- [How Amazon Web Services Uses Formal Methods (2015)](https://cdn.amazon.science/67/f9/92733d574c11ba1a11bd08bfb8ae/how-amazon-web-services-uses-formal-methods.pdf)

**Questions:** Which properties can TLC exhaustively check for finite models? How do PlusCal models map to implementation architectures? How do refinement and abstraction affect the guarantee?

### 2. Linking verified models to running implementations

- [TraceLinking Implementations with Their Verified Designs (OOPSLA 2025)](https://doi.org/10.1145/3763128)
- [Validating Traces of Distributed Programs Against TLA+ Specifications (SEFM 2024)](https://doi.org/10.1007/978-3-031-77382-2_8)
- [PGo project / related research search](https://scholar.google.com/scholar?q=PGo+Modular+PlusCal+Go+code+generation)

**Questions:** How are implementation events mapped to abstract states/actions? Can the method be adapted to TypeScript or Effect TS? What behavior remains unverified when only observed traces are checked?

### 3. Verified intermediate representations and code generation

- [Dafny as Verification-Aware Intermediate Language for Code Generation (2025)](https://arxiv.org/abs/2501.06283)
- [Dafny documentation](https://dafny.org/)
- [Verus: verified Rust](https://github.com/verus-lang/verus)
- [Lean theorem prover](https://lean-lang.org/)

**Questions:** Can agents generate a verifiable intermediate program first? Which proof obligations survive compilation or translation? Is a trustworthy TypeScript backend feasible?

### 4. AI-generated verified code and specifications

- [AlgoVeri: An Aligned Benchmark for Verified Code Generation on Classical Algorithms (ICML 2026)](https://proceedings.mlr.press/v306/zhao26bm.html)
- [How Powerful are LLMs in Generating Formal Program Specifications? (ICML 2026)](https://proceedings.mlr.press/v306/yang26am.html)
- [LLM-Assisted Synthesis of High-Assurance C Programs (SynVer, 2025)](https://ieeexplore.ieee.org/abstract/document/11334588)
- [From Natural Language to Verified C: Verification-Guided Generation with ACSL Specifications (2026 preprint)](https://arxiv.org/abs/2610.30725)

**Questions:** How are spec errors separated from code errors? How much does proof feedback improve generation? Which experiments report independently checked correctness rather than only test success?

### 5. Visual formal modeling and counterexample exploration

- [UPPAAL](https://uppaal.org/)
- [Event-B](https://www.event-b.org/)
- [Rodin Platform](https://www.event-b.org/rodin.html)
- [Alloy Analyzer](https://alloytools.org/)
- [Spectacle: TLA+ state visualizer](https://github.com/will62794/spectacle)
- [TLA+ debugger documentation](https://docs.tlapl.us/using:debugger)

**Questions:** Is the diagram the executable specification or only a visualization? Can visual models be version-controlled and used to generate implementation contracts? How usable are counterexamples?

### 6. TypeScript / Effect TS conformance strategy

- [Effect documentation](https://effect.website/docs/)
- [XState documentation](https://stately.ai/docs)
- [fast-check property-based testing](https://fast-check.dev/)
- [Stryker mutation testing](https://stryker-mutator.io/)
- [Apalache symbolic model checker](https://apalache-mc.org/)

**Questions:** How can state transitions be logged as a deterministic trace? Can model-based tests drive Effect programs with controlled time, randomness, retries, and concurrency? How should external side effects be abstracted? What are the limits of each guarantee?

## Suggested experiment

1. Select a small but realistic TypeScript workflow with concurrent actions, retries, failures, and at least two safety invariants.
2. Write a TLA+ or PlusCal model, then check it using TLC or Apalache.
3. Have an AI coding agent implement it in TypeScript / Effect TS.
4. Instrument abstract state transitions and validate execution traces against the model.
5. Generate model-based tests; add property-based and mutation testing.
6. Deliberately introduce faults (missing atomicity, duplicated effects, race conditions, incorrect retries) and measure detection.
7. Compare time, verification coverage, false confidence, and maintenance cost against a conventional testing baseline.

## Required research deliverables

- **Evidence table:** paper/project, publication year, URL, problem, method, language, verification guarantee, limitations, reproducible artifact.
- **Guarantee taxonomy:** distinguish full proof, bounded exhaustive model checking, refinement proof, trace validation, model-based testing, and empirical tests.
- **Feasibility assessment:** TypeScript/Effect integration, required instrumentation, agent suitability, performance and developer effort.
- **Minimal prototype plan:** repository structure, model, verifier, implementation adapter, tests, and acceptance criteria.
- **Open questions:** gaps between verified specification and deployed executable, including compiler/runtime/environment assumptions.

## Source-validation instructions

Verify the title, authors, venue, year, DOI, and actual claims of **every linked paper** before relying on it. Some links above are discovery leads rather than independently revalidated bibliographic records. Prefer primary papers, official repositories, and reproducible artifacts. Flag broken links, mismatched metadata, unreviewed preprints, and results that cannot be reproduced. Do not equate passing model checks or trace tests with proving an entire implementation correct.
