import EnsExample.Registry
namespace EnsExample

-- Deliberately broken: we "forgot" the invariant hypothesis.
theorem walk_certified_no_inv (w : World) :
    ∀ (labels : List Label) (r : RegId),
      isCertified w r = true → ∀ x ∈ walk w r labels, isCertified w x = true := by
  intro labels
  induction labels with
  | nil =>
    intro r hr x hx
    simp [walk] at hx
    subst hx
    exact hr
  | cons l ls ih =>
    intro r hr x hx
    unfold walk at hx
    cases hw : w r with
    | none => simp [hw] at hx; subst hx; exact hr
    | some reg =>
      cases hl : reg.subs.lookup l with
      | none => simp [hw, hl] at hx; subst hx; exact hr
      | some child =>
        simp [hw, hl] at hx
        cases hx with
        | inl h => subst h; exact hr
        | inr h => exact ih child hr x h   -- wrong: hr is about r, not child

end EnsExample
