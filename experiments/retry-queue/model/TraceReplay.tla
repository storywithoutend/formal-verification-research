--------------------------- MODULE TraceReplay ---------------------------
EXTENDS RetryQueue, Sequences

CONSTANT Trace
VARIABLE index

traceVars == <<state, index>>

TraceInit ==
  /\ Trace # <<>>
  /\ index = 1
  /\ state = Trace[1]
  /\ state = InitialState

TraceNext ==
  \/ /\ index < Len(Trace)
     /\ AllowedStep(state, Trace[index + 1])
     /\ state' = Trace[index + 1]
     /\ index' = index + 1
  \/ /\ index = Len(Trace)
     /\ UNCHANGED traceVars

TraceSpec == TraceInit /\ [][TraceNext]_traceVars
TraceIndexOK == index \in 1..Len(Trace)

=============================================================================
