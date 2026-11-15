# Verification-driven development (VDD): what the term means, and related ideas

Prepared for David Chu, 15 Nov 2026 (Asia/Taipei). All links checked on 15 Nov 2026 (HTTP 200, or read in full through a fetcher where ACM blocks plain curl).

Labels used below:
- **Source says**: a paraphrase or quote of the linked source.
- **Synthesis**: my own reading, comparison or recommendation. Not a claim made by the source.

---

## 1. "VDD" has no single coined meaning

I could not find one canonical paper that coined "verification-driven development". At least five unrelated groups use the phrase, and they mean different things.

| Usage | Who / when | What it means (source says) | Link |
|---|---|---|---|
| Formal-methods VDD for distributed protocols | Informal Systems, `vdd` repo (guide committed 7 May 2020 UTC) | Verification "goes hand in hand with software design and development" and is not an "after the fact" task. The work is layered: an English problem statement, then a protocol spec in TLA+ (the "definitive source of truth"), then a single-node TLA+ spec close to the code. Model checkers generate "abstract test scenarios" that drive unit and integration tests. Authors are encouraged to write deliberately failing `Witness…` properties that should produce counterexamples. | https://github.com/informalsystems/vdd , https://github.com/informalsystems/vdd/blob/master/guide/guide.md |
| Iterative VDD for safety-critical CPS | Springer *JISA* paper on Timed Rebeca (2021) | A model-driven, iterative "verification-driven development approach": properties come from structured requirements, are model-checked on Rebeca models, and the loop repeats "until satisfaction of desired properties are ensured", before code is developed. | https://link.springer.com/article/10.1186/s13174-021-00132-z |
| Continuous verification inside a modelling language | Cocotec (Coco / Popili docs) | "Developers typically follow a verification-driven development approach, where they continuously verify their Coco code, fix all of the errors found, and repeat the verification cycle until their Coco code is correct." Code is then generated. | https://cocotec.io/popili/doc/stable/ |
| "Verification-driven programming" by spec refinement | Inferara (6 Mar 2024) | Proposed as an alternative to TDD's "modular testing tarpit": start from a formal spec and refine it into a hierarchy of sub-specifications small enough to verify, so that the whole program is correct by composition. Inferara states its claim about "reasonable" machines as a hypothesis. | https://inferara.com/papers/verification-driven-development/ |
| LLM builder + adversarial-reviewer VDD ("VDD-IAR") | "Doll" (dollspace-gay), gist created 4 Jan 2026 UTC; later "VSDD" gist created 28 Feb 2026 UTC | A Builder LLM writes code and mandatory tests. A human tests the "spirit" of the requirement. A separate Adversary LLM with a "fresh context window" on every turn then reviews the code. The loop ends ("Zero-Slop") when the Adversary's critiques become hallucinated. The VSDD gist adds a spec-first phase, a "Red Gate" (every test must fail before any implementation exists) and "formal hardening" (Kani, Dafny or TLA+ proofs, fuzzing, and mutation testing with Stryker or mutmut). | https://gist.github.com/dollspace-gay/45c95ebfb5a3a3bae84d8bebd662cc25 , https://gist.github.com/dollspace-gay/d8d3bc3ecf4188df049d7a4726bb2a00 |
| Independent write-up of Doll's VDD | Zachary Levonian (7 Jan 2026) | Summarises the loop and its exit rule: leave the loop if 75% of the critique's issues are false positives. He picks out two key ideas: "external verifiers and code quality tools wherever possible" and "an adversarial critique loop". | https://levon003.github.io/2026/01/07/verification-driven-development.html |

**Synthesis.** The two meanings that matter to you pull in different directions:

- The **Informal Systems** meaning is formal-methods-first. The TLA+ spec is the source of truth, and the model checker generates tests.
- The **Doll** meaning is LLM-review-first. Its "verification" is mostly tests plus an adversarial LLM, and formal tools come in as a later hardening step.

You already work verifier-first. That is closest to the Informal Systems version, with Doll's fresh-context adversary added as one extra gate, not as the main signal. An LLM critic does not give you proof. When critiques turn into hallucinations, that only tells you the critic has run out of ideas.

---

## 2. Related ideas with stronger pedigrees

### 2.1 Specification-first and proof-oriented programming

- **F\*** (source says): the official book describes *proof-oriented programming* as "a paradigm in which one co-designs programs and proofs to provide mathematical guarantees about various aspects of a program's behavior, including properties like functional correctness…". https://fstar-lang.org/tutorial/book/
- **Dafny**: a verification-aware language (home page https://dafny.org/). AWS (source says) wrote the Cedar authorization engine in Dafny, proved security properties of it, and then used "a differential testing approach using the Dafny code as a correctness oracle" to check the production Rust implementation. https://cacm.acm.org/practice/systems-correctness-practices-at-amazon-web-services/ , https://www.amazon.science/blog/how-we-built-cedar-with-automated-reasoning-and-differential-testing
- **Verus**: verification for Rust (guide https://verus-lang.github.io/verus/guide/). The vericoding benchmark below covers Verus.

### 2.2 AWS: TLA+, P, and lightweight formal methods

**2015, Newcombe et al., *How Amazon Web Services Uses Formal Methods* (CACM).** https://cacm.acm.org/research/how-amazon-web-services-uses-formal-methods/ (preprint PDF: https://lamport.azurewebsites.net/tla/formal-methods-amazon.pdf)
- Source says: since 2011 AWS engineers have used TLA+ and model checking on complex systems. A DynamoDB bug had a shortest error trace of 35 high-level steps and "had passed unnoticed through extensive design reviews, code reviews, and testing".
- Engineers "from entry level to principal" learned TLA+ "in two to three weeks".
- On whether the code matches the spec: "How do we know that the executable code correctly implements the verified design? The answer is we do not know."
- Source says: correctness work starts by stating "what needs to go right" as safety and liveness properties.

**2025, Brooker & Desai, *Systems Correctness Practices at AWS* (CACM, posted 29 May 2025).** https://cacm.acm.org/practice/systems-correctness-practices-at-amazon-web-services/
- Source says: many engineers "struggled to learn and become productive with TLA+". AWS adopted **P**, a state-machine language developed at AWS since 2019, and used it on S3, DynamoDB, Aurora, EC2 and others (https://github.com/p-org/P).
- **PObserve** (built in 2023) checks structured production logs post hoc against the P spec.
- The article also covers property-based testing in S3 ShardStore, deterministic simulation, fuzzing, fault injection, Dafny (Cedar), Kani (Firecracker) and HOL Light (RSA optimisations).
- It names "formal specifications as test oracles" as perhaps the most important role formal methods play.
- It predicts that LLMs will "help developers create formal models and specifications".

### 2.3 AI agents with a verifier in the loop

- **AlphaProof** (Hubert et al., *Nature*, published 12 Nov 2025; https://www.nature.com/articles/s41586-025-09833-y). Source says:
  - An AlphaZero-style RL agent that finds proofs in Lean. It trained on about 80 million auto-formalized problems.
  - At IMO 2024 it solved three of the five non-geometry problems. Combined with AlphaGeometry 2, the system scored 28/42 (silver).
  - Lean's kernel checks soundness. Every proof also goes through a final, independent check with the command-line Lean tool and a custom command that "verifies that the proof only relies on the three commonly accepted axioms".
  - The authors found and corrected "misformalized problems" in miniF2F and PutnamBench.
  - DeepMind blog (2024): https://deepmind.google/discover/blog/ai-solves-imo-problems-at-silver-medal-level/
- **Vericoding benchmark** (Bursuc et al., arXiv 2509.22908, Sept 2025; https://arxiv.org/abs/2509.22908). Source says: 12,504 formal specifications across Dafny, Verus/Rust and Lean. Off-the-shelf LLMs succeed on 82% (Dafny), 44% (Verus) and 27% (Lean). Adding natural-language descriptions "does not significantly improve performance".
- **DeepSeek-Prover-V2** (arXiv 2504.21801; https://arxiv.org/abs/2504.21801): an RL-trained Lean prover, cited by the AlphaProof paper and by Kleppmann.
- **Kleppmann, *Prediction: AI will make formal verification go mainstream* (8 Dec 2025).** https://martin.kleppmann.com/2025/12/08/ai-formal-verification.html Source says:
  - LLMs will collapse the cost of proofs, and "it doesn't matter if they hallucinate nonsense, because the proof checker will reject any invalid proof".
  - "the challenge will move to correctly defining the specification".
  - He cites seL4 as costing "20 person-years and 200,000 lines of Isabelle" for 8,700 lines of C (as of 2009).
- **Hillel Wayne, *AI is a gamechanger for TLA+ users* (5 Jun 2025).** https://buttondown.com/hillelwayne/archive/ai-is-a-gamechanger-for-tla-users Source says:
  - LLMs did well at SANY syntax fixes, reading 20+ step error traces, and `UNCHANGED` boilerplate.
  - They did badly at inventing properties, which came out "trivial, uninteresting, or too coupled to implementation details".
  - When the model checker found a race, the agent sometimes proposed "saying race conditions were okay" or adding a constraint that races don't happen.
- **Hillel Wayne, *LLMs are bad at vibing specifications* (10 Mar 2026).** https://buttondown.com/hillelwayne/archive/llms-are-bad-at-vibing-specifications Source says:
  - "A full 4% of Github TLA+ specs now have the word 'Claude' somewhere in them."
  - LLM-written Alloy and TLA+ properties are often "tautologically true".
  - LLMs write "obvious properties" and struggle with liveness and action properties.

**Synthesis.** Every source above agrees on one point: the checker is cheap to trust and the spec is expensive to trust. That is why Part 2 (verifying the verification) matters as much as Part 1.

---

## 3. Gaps I could not fill

- I found no primary source that defines "VDD" as a standard, widely adopted methodology. Usage is fragmented, as the table shows.
- I found no published TS/React-monorepo case study of TLA+ or Lean together with fast-check. The workflow in `../workflow/vdd-workflow.md` is synthesis.
