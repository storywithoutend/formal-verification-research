------------------------ MODULE RetryQueueFaults ------------------------
EXTENDS RetryQueue

CONSTANT Fault

MissingAtomicity(from, to, job, worker) ==
  /\ Fault = "missing-atomicity"
  /\ from.phase[job] = "leased"
  /\ Cardinality(from.owners[job]) = 1
  /\ worker \notin from.owners[job]
  /\ to = [from EXCEPT
       !.owners[job] = @ \cup {worker},
       !.event = [kind |-> "lease", job |-> job, worker |-> worker]]

DuplicatedEffect(from, to, job) ==
  /\ Fault = "duplicated-effect"
  /\ from.phase[job] = "submitted"
  /\ from.submissions[job] = 1
  /\ to = [from EXCEPT
       !.submissions[job] = 2,
       !.event = [kind |-> "submit", job |-> job, worker |-> NoWorker]]

StaleWorkerRace(from, to, job, worker) ==
  /\ Fault = "stale-worker-race"
  /\ from.phase[job] = "leased"
  /\ Cardinality(from.owners[job]) = 1
  /\ worker \notin from.owners[job]
  /\ to = [from EXCEPT
       !.phase[job] = "queued",
       !.event = [kind |-> "retryable-failure", job |-> job, worker |-> worker]]

BadRetry(from, to, job, worker) ==
  /\ Fault = "bad-retry"
  /\ from.phase[job] = "failed"
  /\ from.attempts[job] = MaxAttempts
  /\ to = [from EXCEPT
       !.phase[job] = "leased",
       !.owners[job] = {worker},
       !.attempts[job] = @ + 1,
       !.event = [kind |-> "lease", job |-> job, worker |-> worker]]

FaultAction(from, to) ==
  \/ \E job \in Jobs, worker \in Workers : MissingAtomicity(from, to, job, worker)
  \/ \E job \in Jobs : DuplicatedEffect(from, to, job)
  \/ \E job \in Jobs, worker \in Workers : StaleWorkerRace(from, to, job, worker)
  \/ \E job \in Jobs, worker \in Workers : BadRetry(from, to, job, worker)

FaultNext == AllowedStep(state, state') \/ FaultAction(state, state')
FaultSpec == Init /\ [][FaultNext]_vars

=============================================================================
