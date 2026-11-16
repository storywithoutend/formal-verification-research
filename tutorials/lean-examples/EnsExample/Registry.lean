/-
  A toy model of the property stubbed in ensdomains/apps-monorepo
  `apps/manager/verification/migration/CertifiedRegistryPathProof.tla`:
  "every registry reachable from the root only links certified
  subregistries, so a traversal from root never passes through a
  foreign subregistry."  Original example code, not ENS contract code.
-/
namespace EnsExample

/-- Registries are identified by a number in this toy (think: contract address). -/
abbrev RegId := Nat

/-- One label of a name, e.g. "eth" or "nick". -/
abbrev Label := String

/-- A registry: is it a certified ENS registry, and which subregistry
    is linked under each label. -/
structure Registry where
  certified : Bool
  subs : List (Label × RegId)
  deriving Repr

/-- The whole world: which registry (if any) lives at each id. -/
abbrev World := RegId → Option Registry

/-- `true` iff a registry exists at `r` and it is certified. -/
def isCertified (w : World) (r : RegId) : Bool :=
  match w r with
  | some reg => reg.certified
  | none => false

/-- Walk down from registry `r` following `labels` (root-first, so
    "nick.eth" is `["eth", "nick"]`) and return every registry visited.
    Stops early when a registry or a link is missing. -/
def walk (w : World) (r : RegId) : List Label → List RegId
  | [] => [r]
  | l :: ls =>
    match w r with
    | none => [r]
    | some reg =>
      match reg.subs.lookup l with
      | none => [r]
      | some child => r :: walk w child ls

/-- The construction invariant: a certified registry only links
    certified subregistries. (The TLA+ stub states it for every registry;
    here we only need it for certified ones.) -/
def CertifiedLinksOnlyCertified (w : World) : Prop :=
  ∀ r reg l child,
    w r = some reg → reg.certified = true →
    reg.subs.lookup l = some child → isCertified w child = true

/-- Main lemma: starting from any certified registry, every registry the
    walk visits is certified. -/
theorem walk_certified (w : World) (hinv : CertifiedLinksOnlyCertified w) :
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
        cases hx with
        | inl h => subst h; exact hr
        | inr h => exact ih child (hinv r reg l child hw hcert hl) x h

/-- The promise in the stub's words: if the root is certified and the
    invariant holds, resolving any name from root only ever visits
    certified registries. -/
theorem root_walk_certified (w : World) (root : RegId)
    (hroot : isCertified w root = true) (hinv : CertifiedLinksOnlyCertified w)
    (name : List Label) :
    ∀ x ∈ walk w root name, isCertified w x = true :=
  walk_certified w hinv name root hroot

/-! ## Keeping the invariant true while the world changes -/

/-- Link `child` under `label` in registry `parent` (no check at all). -/
def setSub (w : World) (parent : RegId) (label : Label) (child : RegId) : World :=
  fun r =>
    if r = parent then
      (w r).map (fun reg => { reg with subs := (label, child) :: reg.subs })
    else w r

/-- The guarded version: only link certified children. -/
def safeSetSub (w : World) (parent : RegId) (label : Label) (child : RegId) : World :=
  if isCertified w child then setSub w parent label child else w

/-- Linking never changes who is certified. -/
theorem isCertified_setSub (w : World) (p : RegId) (l : Label) (c x : RegId) :
    isCertified (setSub w p l c) x = isCertified w x := by
  unfold isCertified setSub
  by_cases h : x = p
  · subst h
    cases w x <;> simp
  · simp [h]

/-- The guarded update preserves the invariant. -/
theorem safeSetSub_preserves (w : World) (p : RegId) (l : Label) (c : RegId)
    (hinv : CertifiedLinksOnlyCertified w) :
    CertifiedLinksOnlyCertified (safeSetSub w p l c) := by
  unfold safeSetSub
  by_cases hc : isCertified w c = true
  · simp only [hc, ite_true]
    intro r reg l' child hr hcert hlook
    rw [isCertified_setSub]
    unfold setSub at hr
    by_cases hrp : r = p
    · subst hrp
      cases hw : w r with
      | none => simp [hw] at hr
      | some reg0 =>
        simp [hw] at hr
        subst hr
        by_cases hll : l' = l
        · subst hll
          simp [List.lookup] at hlook
          subst hlook
          exact hc
        · have hbeq : (l' == l) = false := by simpa using hll
          simp [List.lookup, hbeq] at hlook
          exact hinv r reg0 l' child hw hcert hlook
    · simp [hrp] at hr
      exact hinv r reg l' child hr hcert hlook
  · simp [hc]
    exact hinv

end EnsExample
