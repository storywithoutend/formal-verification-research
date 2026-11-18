# Instructions for the experiment agent

You are running the research brief in `research/model-first-brief.md` in this repo. Read it in full first. Also skim the earlier work: `research/vdd.md`, `research/verifying-verification.md`, `workflow/vdd-workflow.md`, `tutorials/`.

## Hard rules
- This repo is PUBLIC (github.com/storywithoutend/formal-verification-research). Never commit secrets, tokens, private Slack/Linear content, or unreleased ENS code. Do not read or copy anything from ~/projects/storywithoutend/lean-effect-research (private).
- Work only inside this repo. Do not edit any other repo. Short quotes from the public ensdomains/apps-monorepo branch `formal/migration-model` are OK, with links.
- Install tools under `experiments/.tools/` or via project-local npm; never with sudo. Keep `.tools/`, `node_modules/`, TLC `states/` dirs out of git (.gitignore).
- Never invent sources. Verify title, authors, venue, year, DOI of every paper by fetching it. Mark anything you could not verify as UNVERIFIED. Flag preprints.
- Never claim a model check or trace test proves the implementation correct.
- Commit in small steps to `main` with clear messages and push. Stop and ask if anything is unclear or risky.

## Deliverables (in this order)
1. `research/model-first-evidence.md`: evidence table (paper/project, year, URL, problem, method, language, guarantee, limitations, artifact) + guarantee taxonomy (full proof, bounded exhaustive model checking, refinement proof, trace validation, model-based testing, empirical tests). Commit + push.
2. `experiments/retry-queue/` (or a similarly small made-up workflow with concurrent actions, retries, failures, and at least two safety invariants, ENS-flavored is a plus, e.g. concurrent name-renewal jobs):
   - TLA+ model + .cfg, checked with TLC (and Apalache if it installs cleanly). Save TLC output summaries.
   - TypeScript / Effect TS implementation with deterministic time/randomness (TestClock etc.).
   - Trace logging of abstract state transitions + a trace validator against the model.
   - fast-check model-based tests, Stryker mutation run.
   - Planted faults (missing atomicity, duplicated effect, race, bad retry): table of which layer catches each.
   - README with how to run everything and the results.
3. `research/model-first-feasibility.md`: feasibility assessment, minimal prototype plan, and open questions, from the brief.

When done, write a short summary in `experiments/STATUS.md` (what was done, commits, results, what is still open) and stop.
