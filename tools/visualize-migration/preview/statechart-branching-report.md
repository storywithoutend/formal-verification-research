# Model

TLC reached 13 states and 17 steps. The chart draws 13 states and 9 arrows.
The view hides 8 steps, so the chart does not draw them.

## A5_PendingAttemptNeverReprompts breaks
The shortest path has 1 step:
0. The receipt never comes back / Ready
1. the receipt is unavailable and another prompt opens: The receipt never comes back / Receipt missing, and a second wallet prompt already went out

## C5_OutcomeAndViewsAreTruthful breaks
The shortest path has 1 step:
0. The run finishes and the app reports an outcome / Ready
1. the app reports success after only one name landed: The run finishes and the app reports an outcome / Reported success, but only one name landed

## A1_OneExecutionPerScope breaks
The shortest path has 2 steps:
0. Two tabs, one migration / Ready
1. the first tab opens a wallet prompt: Two tabs, one migration / The first tab is waiting on the wallet
2. a second tab starts the same migration: Two tabs, one migration / Both tabs have a wallet prompt

## Rules that hold
TypeOK, A7_RejectionDropsOnlyIntent
