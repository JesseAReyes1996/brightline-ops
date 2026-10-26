import {
  CLOSE_REASON_LABELS,
  STATUS_LABELS,
  type CloseReason,
  type HistoryEvent,
  type Status,
} from "@/src/lib/domain";

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** A duration such as "45m", "5h 20m", or "2d 4h"; "—" when there is none. */
export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
  return hours % 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h` : `${Math.floor(hours / 24)}d`;
}

/** How long ago `sinceIso` was, e.g. "3d 4h". */
export function formatAge(sinceIso: string, now: number = Date.now()): string {
  return formatDuration(now - Date.parse(sinceIso));
}

export function StatusBadge({ status, closeReason }: { status: Status; closeReason?: CloseReason | null }) {
  return (
    <span className="badge">
      {STATUS_LABELS[status]}
      {status === "closed" && closeReason ? ` (${CLOSE_REASON_LABELS[closeReason]})` : ""}
    </span>
  );
}

/** One line of the history timeline, e.g. "Priya reassigned it from Marcus to Dana". */
export function describeEvent(event: HistoryEvent<string>, userName: (id: string) => string): string {
  const actor = userName(event.actorId);
  switch (event.type) {
    case "created":
      return `${actor} submitted the request`;
    case "assigned": {
      if (!event.fromAssigneeId && event.toAssigneeId === event.actorId) return `${actor} took it`;
      const to = event.toAssigneeId ? userName(event.toAssigneeId) : "nobody";
      return event.fromAssigneeId
        ? `${actor} reassigned it from ${userName(event.fromAssigneeId)} to ${to}`
        : `${actor} assigned it to ${to}`;
    }
    case "status_changed": {
      if (event.detail?.note && event.fromStatus === "waiting_on_requester" && event.toStatus === "in_progress") {
        return `${actor} sent it back to Ops with an update:`;
      }
      const from = event.fromStatus ? STATUS_LABELS[event.fromStatus] : "?";
      const to = event.toStatus ? STATUS_LABELS[event.toStatus] : "?";
      const reason = event.detail?.closeReason ? ` (${CLOSE_REASON_LABELS[event.detail.closeReason]})` : "";
      return `${actor} moved it from ${from} to ${to}${reason}`;
    }
    case "triage_completed": {
      const model = event.detail?.model ?? "unknown model";
      return event.detail?.attempt
        ? `AI triage completed on attempt ${event.detail.attempt} (${model})`
        : `AI triage completed (${model})`;
    }
    case "triage_failed": {
      const error = event.detail?.error ?? "unknown error";
      return event.detail?.attempt
        ? `AI triage attempt ${event.detail.attempt} failed: ${error}`
        : `AI triage failed: ${error}`;
    }
    case "triage_accepted":
      return `${actor} accepted the AI triage`;
    case "triage_overridden":
      // No AI suggestion means there was nothing to override.
      if (event.detail?.noSuggestion) return `${actor} triaged it by hand`;
      return `${actor} overrode the AI triage (${event.detail?.overriddenFields?.join(", ") ?? "fields not recorded"})`;
  }
}
