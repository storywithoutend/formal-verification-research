--------------------------- MODULE RetryQueue ---------------------------
EXTENDS Naturals, FiniteSets

CONSTANTS
  \* @type: Set(Str);
  Jobs,
  \* @type: Set(Str);
  Workers,
  \* @type: Int;
  MaxAttempts,
  \* @type: Str;
  NoJob,
  \* @type: Str;
  NoWorker

Phases == {"queued", "leased", "backoff", "submitted", "done", "failed"}
EventKinds == {
  "init", "lease", "retryable-failure", "wake-retry",
  "submit", "confirm", "permanent-failure"
}

Events == [
  kind : EventKinds,
  job : Jobs \cup {NoJob},
  worker : Workers \cup {NoWorker}
]

InitialEvent == [kind |-> "init", job |-> NoJob, worker |-> NoWorker]

InitialState == [
  phase |-> [j \in Jobs |-> "queued"],
  owners |-> [j \in Jobs |-> {}],
  attempts |-> [j \in Jobs |-> 0],
  submissions |-> [j \in Jobs |-> 0],
  event |-> InitialEvent
]

VARIABLE
  \* @type: [phase: Str -> Str, owners: Str -> Set(Str), attempts: Str -> Int, submissions: Str -> Int, event: [kind: Str, job: Str, worker: Str]];
  state
\* @type: Seq([phase: Str -> Str, owners: Str -> Set(Str), attempts: Str -> Int, submissions: Str -> Int, event: [kind: Str, job: Str, worker: Str]]);
vars == <<state>>

StateType == [
  phase : [Jobs -> Phases],
  owners : [Jobs -> SUBSET Workers],
  attempts : [Jobs -> 0..(MaxAttempts + 1)],
  submissions : [Jobs -> 0..2],
  event : Events
]

TypeOK == state \in StateType

\* @type: ([phase: Str -> Str, owners: Str -> Set(Str), attempts: Str -> Int, submissions: Str -> Int, event: [kind: Str, job: Str, worker: Str]], [phase: Str -> Str, owners: Str -> Set(Str), attempts: Str -> Int, submissions: Str -> Int, event: [kind: Str, job: Str, worker: Str]], Str, Str) => Bool;
Lease(from, to, job, worker) ==
  /\ from.phase[job] = "queued"
  /\ from.owners[job] = {}
  /\ from.attempts[job] < MaxAttempts
  /\ to = [from EXCEPT
       !.phase[job] = "leased",
       !.owners[job] = {worker},
       !.attempts[job] = @ + 1,
       !.event = [kind |-> "lease", job |-> job, worker |-> worker]]

\* @type: ([phase: Str -> Str, owners: Str -> Set(Str), attempts: Str -> Int, submissions: Str -> Int, event: [kind: Str, job: Str, worker: Str]], [phase: Str -> Str, owners: Str -> Set(Str), attempts: Str -> Int, submissions: Str -> Int, event: [kind: Str, job: Str, worker: Str]], Str, Str) => Bool;
RetryableFailure(from, to, job, worker) ==
  /\ from.phase[job] = "leased"
  /\ from.owners[job] = {worker}
  /\ to = [from EXCEPT
       !.phase[job] = IF from.attempts[job] < MaxAttempts
                       THEN "backoff" ELSE "failed",
       !.owners[job] = {},
       !.event = [kind |-> "retryable-failure", job |-> job, worker |-> worker]]

\* @type: ([phase: Str -> Str, owners: Str -> Set(Str), attempts: Str -> Int, submissions: Str -> Int, event: [kind: Str, job: Str, worker: Str]], [phase: Str -> Str, owners: Str -> Set(Str), attempts: Str -> Int, submissions: Str -> Int, event: [kind: Str, job: Str, worker: Str]], Str) => Bool;
WakeRetry(from, to, job) ==
  /\ from.phase[job] = "backoff"
  /\ from.owners[job] = {}
  /\ to = [from EXCEPT
       !.phase[job] = "queued",
       !.event = [kind |-> "wake-retry", job |-> job, worker |-> NoWorker]]

\* @type: ([phase: Str -> Str, owners: Str -> Set(Str), attempts: Str -> Int, submissions: Str -> Int, event: [kind: Str, job: Str, worker: Str]], [phase: Str -> Str, owners: Str -> Set(Str), attempts: Str -> Int, submissions: Str -> Int, event: [kind: Str, job: Str, worker: Str]], Str, Str) => Bool;
Submit(from, to, job, worker) ==
  /\ from.phase[job] = "leased"
  /\ from.owners[job] = {worker}
  /\ from.submissions[job] = 0
  /\ to = [from EXCEPT
       !.phase[job] = "submitted",
       !.owners[job] = {},
       !.submissions[job] = @ + 1,
       !.event = [kind |-> "submit", job |-> job, worker |-> worker]]

\* @type: ([phase: Str -> Str, owners: Str -> Set(Str), attempts: Str -> Int, submissions: Str -> Int, event: [kind: Str, job: Str, worker: Str]], [phase: Str -> Str, owners: Str -> Set(Str), attempts: Str -> Int, submissions: Str -> Int, event: [kind: Str, job: Str, worker: Str]], Str) => Bool;
Confirm(from, to, job) ==
  /\ from.phase[job] = "submitted"
  /\ from.submissions[job] = 1
  /\ to = [from EXCEPT
       !.phase[job] = "done",
       !.event = [kind |-> "confirm", job |-> job, worker |-> NoWorker]]

\* @type: ([phase: Str -> Str, owners: Str -> Set(Str), attempts: Str -> Int, submissions: Str -> Int, event: [kind: Str, job: Str, worker: Str]], [phase: Str -> Str, owners: Str -> Set(Str), attempts: Str -> Int, submissions: Str -> Int, event: [kind: Str, job: Str, worker: Str]], Str, Str) => Bool;
PermanentFailure(from, to, job, worker) ==
  /\ from.phase[job] = "leased"
  /\ from.owners[job] = {worker}
  /\ to = [from EXCEPT
       !.phase[job] = "failed",
       !.owners[job] = {},
       !.event = [kind |-> "permanent-failure", job |-> job, worker |-> worker]]

\* @type: ([phase: Str -> Str, owners: Str -> Set(Str), attempts: Str -> Int, submissions: Str -> Int, event: [kind: Str, job: Str, worker: Str]], [phase: Str -> Str, owners: Str -> Set(Str), attempts: Str -> Int, submissions: Str -> Int, event: [kind: Str, job: Str, worker: Str]]) => Bool;
AllowedStep(from, to) ==
  \/ \E job \in Jobs, worker \in Workers : Lease(from, to, job, worker)
  \/ \E job \in Jobs, worker \in Workers : RetryableFailure(from, to, job, worker)
  \/ \E job \in Jobs : WakeRetry(from, to, job)
  \/ \E job \in Jobs, worker \in Workers : Submit(from, to, job, worker)
  \/ \E job \in Jobs : Confirm(from, to, job)
  \/ \E job \in Jobs, worker \in Workers : PermanentFailure(from, to, job, worker)

Init == state = InitialState
Next == AllowedStep(state, state')
Spec == Init /\ [][Next]_vars

ExclusiveLease ==
  \A job \in Jobs : Cardinality(state.owners[job]) <= 1

LeasePhaseConsistent ==
  \A job \in Jobs :
    (state.phase[job] = "leased") <=> (Cardinality(state.owners[job]) = 1)

SubmitAtMostOnce ==
  \A job \in Jobs : state.submissions[job] <= 1

CompletionAfterSubmission ==
  \A job \in Jobs : state.phase[job] = "done" => state.submissions[job] = 1

RetryBound ==
  \A job \in Jobs : state.attempts[job] <= MaxAttempts

TerminalUnowned ==
  \A job \in Jobs :
    state.phase[job] \in {"done", "failed", "submitted"} => state.owners[job] = {}

=============================================================================
