import EnsExample.Registry

namespace EnsExample

/-- A tiny world: 0 = root, 1 = "eth" registry, 2 = "nick.eth" registry,
    99 = a foreign (uncertified) registry that exists but is not linked. -/
def demoWorld : World
  | 0 => some { certified := true, subs := [("eth", 1)] }
  | 1 => some { certified := true, subs := [("nick", 2)] }
  | 2 => some { certified := true, subs := [] }
  | 99 => some { certified := false, subs := [] }
  | _ => none

#eval walk demoWorld 0 ["eth", "nick"]          -- registries visited for nick.eth
#eval walk demoWorld 0 ["eth", "nobody"]        -- missing link: stops at 1

/-- Checked by evaluation inside the kernel (`decide`). -/
example : walk demoWorld 0 ["eth", "nick"] = [0, 1, 2] := by decide

/-- The same fact, checked by compiled code (`native_decide`). Faster on big
    inputs, but it adds an axiom that trusts the compiler. -/
theorem demo_walk_native : walk demoWorld 0 ["eth", "nick"] = [0, 1, 2] := by
  native_decide

/-- An unguarded link from the certified "eth" registry to the foreign one. -/
def hijacked : World := setSub demoWorld 1 "evil" 99

/-- The walk now passes through a foreign registry ... -/
theorem hijacked_visits_foreign :
    99 ∈ walk hijacked 0 ["eth", "evil"] ∧ isCertified hijacked 99 = false := by
  decide

/-- ... so the unguarded `setSub` can break the invariant. -/
theorem setSub_can_break : ¬ CertifiedLinksOnlyCertified hijacked := by
  intro h
  have h99 := h 1 { certified := true, subs := [("evil", 99), ("nick", 2)] } "evil" 99
    rfl rfl (by decide)
  revert h99
  decide

/-- The guarded version refuses the same link, so nothing changes. -/
theorem safeSetSub_refuses : safeSetSub demoWorld 1 "evil" 99 = demoWorld := by
  simp [safeSetSub, isCertified, demoWorld]

#print axioms root_walk_certified
#print axioms safeSetSub_preserves
#print axioms hijacked_visits_foreign
#print axioms demo_walk_native

end EnsExample
