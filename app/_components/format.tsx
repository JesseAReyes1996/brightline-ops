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

/** Compact age such as "45m", "6h", or "3d 4h". */
export function formatAge(sinceIso: string, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(sinceIso)) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function StatusBadge({ status, closeReason }: { status: Status; closeReason?: CloseReason | null }) {
  return (
    <span className={`badge status-${status}`}>
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
      const to = event.toAssigneeId ? userName(event.toAssigneeId) : "nobody";
      return event.fromAssigneeId
        ? `${actor} reassigned it from ${userName(event.fromAssigneeId)} to ${to}`
        : `${actor} assigned it to ${to}`;
    }
    case "status_changed": {
      const from = event.fromStatus ? STATUS_LABELS[event.fromStatus] : "?";
      const to = event.toStatus ? STATUS_LABELS[event.toStatus] : "?";
      const reason = event.detail?.closeReason ? ` (${CLOSE_REASON_LABELS[event.detail.closeReason]})` : "";
      return `${actor} moved it from ${from} to ${to}${reason}`;
    }
    case "triage_completed":
      return `AI triage completed (${event.detail?.model ?? "unknown model"})`;
    case "triage_failed":
      return `AI triage failed: ${event.detail?.error ?? "unknown error"}`;
    case "triage_accepted":
      return `${actor} accepted the AI triage`;
    case "triage_overridden":
      return `${actor} overrode the AI triage (${event.detail?.overriddenFields?.join(", ") ?? "fields not recorded"})`;
  }
}
