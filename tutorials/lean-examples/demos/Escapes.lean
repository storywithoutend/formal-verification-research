import EnsExample.Registry
namespace EnsExample

-- 1. `sorry`: "trust me". Lean accepts the file with a warning.
theorem claimed_with_sorry (w : World) (root : RegId) (name : List Label) :
    ∀ x ∈ walk w root name, isCertified w x = true := by
  sorry

-- 2. `axiom`: the TLA+ stub's situation. Assumed, not proved.
axiom CertifiedRegistryPathAssumed : ∀ (w : World), CertifiedLinksOnlyCertified w

theorem uses_assumption (w : World) (root : RegId) (h : isCertified w root = true)
    (name : List Label) : ∀ x ∈ walk w root name, isCertified w x = true :=
  root_walk_certified w root h (CertifiedRegistryPathAssumed w) name

-- 3. Vacuous hypotheses: clean axioms, proves nothing useful.
theorem vacuous (w : World) (r : RegId)
    (h1 : isCertified w r = true) (h2 : isCertified w r = false) :
    ∀ name, ∀ x ∈ walk w r name, isCertified w x = true := by
  simp_all

#print axioms claimed_with_sorry
#print axioms uses_assumption
#print axioms vacuous

end EnsExample
