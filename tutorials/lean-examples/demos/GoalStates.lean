import EnsExample.Registry
namespace EnsExample

-- Same proof as walk_certified, with `trace_state` printing what the
-- editor's infoview would show at each point.
example (w : World) (hinv : CertifiedLinksOnlyCertified w) :
    ∀ (labels : List Label) (r : RegId),
      isCertified w r = true → ∀ x ∈ walk w r labels, isCertified w x = true := by
  intro labels
  trace_state
  induction labels with
  | nil =>
    intro r hr x hx
    trace_state
    simp [walk] at hx
    trace_state
    subst hx
    exact hr
  | cons l ls ih =>
    intro r hr x hx
    trace_state
    unfold walk at hx
    cases hw : w r with
    | none =>
      simp [hw] at hx
      subst hx
      exact hr
    | some reg =>
      have hcert : reg.certified = true := by
        simpa [isCertified, hw] using hr
      cases hl : reg.subs.lookup l with
      | none =>
        simp [hw, hl] at hx
        subst hx
        exact hr
      | some child =>
        simp [hw, hl] at hx
        trace_state
        cases hx with
        | inl h => subst h; exact hr
        | inr h => exact ih child (hinv r reg l child hw hcert hl) x h

end EnsExample
