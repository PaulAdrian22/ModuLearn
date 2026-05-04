// Review cooldown gate.
//
// Per the General Process diagram (Item Interaction sidebar, Review section):
//   "Is incorrect → Redo to lesson discussion. Apply 30s cooldown before
//    allowing to scroll down to take the review item again."
//
// Faithful per-item enforcement during a Review attempt would require
// item-by-item branching in QuickAssessment.js. As a smaller-but-real
// implementation, we enforce cooldown at the LESSON level: after a Review
// attempt where any item triggers needsRedoDiscussion, the next attempt at
// that lesson's Review is gated for `cooldownSeconds` (default 30s).
//
// Storage: localStorage so the gate survives reload but is per-browser.

const KEY = (moduleId) => `review_cooldown_until_${moduleId}`;

export function setReviewCooldown(moduleId, cooldownSeconds = 30) {
  if (!moduleId) return;
  const until = Date.now() + Math.max(0, Number(cooldownSeconds) || 0) * 1000;
  try {
    localStorage.setItem(KEY(moduleId), String(until));
  } catch {
    /* localStorage may be disabled; gate just won't persist */
  }
}

// Returns 0 if no cooldown active, else seconds remaining (rounded up).
export function getReviewCooldownRemaining(moduleId) {
  if (!moduleId) return 0;
  try {
    const raw = localStorage.getItem(KEY(moduleId));
    if (!raw) return 0;
    const until = Number(raw);
    if (!Number.isFinite(until)) return 0;
    const remainingMs = until - Date.now();
    if (remainingMs <= 0) {
      localStorage.removeItem(KEY(moduleId));
      return 0;
    }
    return Math.ceil(remainingMs / 1000);
  } catch {
    return 0;
  }
}

// Aggregate the cooldown decision from a Modal batch-update response.
// Returns { triggered: boolean, cooldownSeconds: number } — when triggered,
// the longest cooldown across all skills wins so the gate covers them all.
export function deriveReviewCooldownFromResponse(response) {
  const rules = Array.isArray(response?.timeRules) ? response.timeRules : [];
  let maxCooldown = 0;
  let triggered = false;
  for (const r of rules) {
    if (r?.needsRedoDiscussion) {
      triggered = true;
      const c = Number(r.cooldownSeconds || 0);
      if (c > maxCooldown) maxCooldown = c;
    }
  }
  return { triggered, cooldownSeconds: maxCooldown || 30 };
}
