// Free-tier limits. S-2: meetings are per calendar month (previously a
// lifetime count); agents are a concurrent total. Paid plans carry their own
// limits in the Polar product metadata (maxAgents, maxMeetingsPerMonth) —
// see server/quotas.ts.
export const MAX_FREE_MEETINGS = 1;
export const MAX_FREE_AGENTS = 1;
