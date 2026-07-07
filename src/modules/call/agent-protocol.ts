// C.3: the in-call agent control protocol, shared by the call UI and the
// agent worker (plain types + constants only — both runtimes import this).
// Messages ride LiveKit data channels as JSON.

/** Clients → agent: mode switches (host-only) and answer requests. */
export const AGENT_CONTROL_TOPIC = "agent-control";
/** Agent → clients: current mode, for UI badges. */
export const AGENT_STATE_TOPIC = "agent-state";

/**
 * active — replies at the end of each user turn (normal assistant behaviour).
 * muted  — keeps listening AND transcribing but never speaks on its own;
 *          anyone can still summon an answer with an `ask` message.
 */
export type AgentMode = "active" | "muted";

export type AgentControlMessage =
  | { type: "set_mode"; mode: AgentMode }
  | { type: "ask" };

export type AgentStateMessage = { type: "mode_changed"; mode: AgentMode };
