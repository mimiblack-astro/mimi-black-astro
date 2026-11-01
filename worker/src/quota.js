export function applyQuota(prev, userKey, now, limits) {
  const day = now.toISOString().slice(0, 10);
  const fresh = !prev || prev.day !== day;
  const state = fresh
    ? { day, global: 0, users: {}, last: {} }
    : {
      day: prev.day,
      global: prev.global || 0,
      users: { ...(prev.users || {}) },
      last: { ...(prev.last || {}) }
    };

  const used = state.users[userKey] || 0;
  const last = state.last[userKey] || 0;
  if (limits.minIntervalMs > 0 && now.getTime() - last < limits.minIntervalMs) {
    return {
      state,
      ok: false,
      reason: "slow",
      remaining: Math.max(0, limits.userDaily - used),
      changed: fresh
    };
  }
  if (used >= limits.userDaily) {
    return { state, ok: false, reason: "user", remaining: 0, changed: fresh };
  }
  if (state.global >= limits.globalDaily) {
    return {
      state,
      ok: false,
      reason: "global",
      remaining: Math.max(0, limits.userDaily - used),
      changed: fresh
    };
  }
  state.users[userKey] = used + 1;
  state.global += 1;
  state.last[userKey] = now.getTime();
  return {
    state,
    ok: true,
    remaining: limits.userDaily - state.users[userKey],
    changed: true
  };
}
