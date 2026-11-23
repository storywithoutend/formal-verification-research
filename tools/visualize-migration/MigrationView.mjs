export const title =
  "ENS manager migration: what today's code can do (A1, A5, A7, C5)";

const stories = {
  A1: "Two tabs, one migration",
  A5: "The receipt never comes back",
  A7: "You reject the wallet prompt",
  C5: "The run finishes and the app reports an outcome",
};

function has(set, value) {
  return Array.isArray(set) && set.includes(value);
}

function size(set) {
  return Array.isArray(set) ? set.length : 0;
}

export const state = (v) => {
  const story = stories[v.scenario] ?? v.scenario;
  const s = v.state;
  if (s.phase === 0) return [story, "Ready"];

  if (v.scenario === "A1") {
    if (size(s.promptingTabs) > 1) return [story, "Both tabs have a wallet prompt"];
    if (size(s.promptingTabs) === 1) return [story, "The first tab is waiting on the wallet"];
    if (s.lifecycle === "blocked") return [story, "The second tab is blocked"];
    return [story, "Settled"];
  }

  if (v.scenario === "A5") {
    if (s.promptCount > 1) {
      return [story, "Receipt missing, and a second wallet prompt already went out"];
    }
    if (s.lifecycle === "blocked" || has(s.blockedNames, "root.eth")) {
      return [story, "Waiting on the receipt, no second prompt"];
    }
    return [story, "Receipt missing"];
  }

  if (v.scenario === "A7") {
    if (s.userRejected) return [story, "Prompt rejected, intent dropped, recovery kept"];
    return [story, "Settled"];
  }

  if (v.scenario === "C5") {
    if (s.outcome === "success" && size(s.completedNames) === 2) {
      return [story, "Reported a full success (both names landed)"];
    }
    if (s.outcome === "success") {
      return [story, "Reported success, but only one name landed"];
    }
    if (s.outcome === "partial-success") {
      return [story, "Reported a partial success"];
    }
    if (s.outcome === "failed-nothing-landed" && size(s.completedNames) > 0) {
      return [story, "Reported that nothing landed, but a name already did"];
    }
    if (s.outcome === "failed-nothing-landed") {
      return [story, "Reported that nothing landed"];
    }
    if (s.outcome === "cancelled" || s.cancelled) {
      return [story, "Reported that you cancelled"];
    }
    return [story, "Reported an outcome"];
  }

  return [story, "Settled"];
};

export const step = (action) => {
  if (action === "Done") return null;
  const labels = {
    A1FirstPrompt: "the first tab opens a wallet prompt",
    A1SecondPrompt: "a second tab starts the same migration",
    A5MissingReceipt: "the receipt is unavailable and another prompt opens",
    A7RejectWithoutHash: "you reject the wallet prompt",
    C5ReportSuccess: "the app reports a full success",
    C5ReportPartialThroughComplete:
      "the app reports success after only one name landed",
    C5ReportPartialThroughFailure:
      "the app reports that nothing landed, but a name already did",
    C5ReportFailedNothingLanded: "the app reports that nothing landed",
    C5ReportCancelled: "the app reports that you cancelled",
  };
  return labels[action] ?? action;
};

export const group = (v) => {
  const s = v.state;
  if (s.phase === 0) return "ready";
  if (v.scenario === "C5" && s.outcome === "success" && size(s.completedNames) < 2)
    return "untruthful";
  if (v.scenario === "C5" && s.outcome === "failed-nothing-landed" && size(s.completedNames) > 0)
    return "untruthful";
  if (v.scenario === "A1" && size(s.promptingTabs) > 1) return "untruthful";
  if (v.scenario === "A5" && s.promptCount > 1) return "untruthful";
  if (s.lifecycle === "blocked") return "blocked";
  if (s.lifecycle === "failure" || s.cancelled || s.userRejected) return "failure";
  if (s.lifecycle === "success" || s.completionClaimed || s.outcome === "success")
    return "complete";
  if (s.outcome === "partial-success") return "partial";
  if (s.phase !== 99) return "running";
  return "settled";
};

export const colors = {
  ready: "blue",
  running: "yellow",
  blocked: "orange",
  complete: "teal",
  partial: "purple",
  failure: "pink",
  untruthful: "orange",
  settled: "tan",
};
