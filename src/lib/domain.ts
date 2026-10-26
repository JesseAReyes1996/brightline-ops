// Fixed vocabularies and the core record shapes. This module has no runtime
// dependencies, so the services, the API routes, and client components all
// import from it.

export type Role = "requester" | "ops" | "ops_lead";

export const STATUSES = ["new", "in_progress", "waiting_on_requester", "done", "closed"] as const;
export type Status = (typeof STATUSES)[number];

export const OPEN_STATUSES = ["new", "in_progress", "waiting_on_requester"] as const;

export const CLOSE_REASONS = ["cancelled_by_requester", "wont_do", "cant_do"] as const;
export type CloseReason = (typeof CLOSE_REASONS)[number];

export const CATEGORIES = [
  "laptops_hardware",
  "vendor_contracts",
  "system_access",
  "office_facilities",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const URGENCIES = ["low", "medium", "high", "critical"] as const;
export type Urgency = (typeof URGENCIES)[number];

type HistoryEventType =
  | "created"
  | "assigned"
  | "status_changed"
  | "triage_completed"
  | "triage_failed"
  | "triage_accepted"
  | "triage_overridden";

export const ROLE_LABELS: Record<Role, string> = {
  requester: "Requester",
  ops: "Ops",
  ops_lead: "Ops Lead",
};

export const STATUS_LABELS: Record<Status, string> = {
  new: "New",
  in_progress: "In progress",
  waiting_on_requester: "Waiting on requester",
  done: "Done",
  closed: "Closed",
};

export const CLOSE_REASON_LABELS: Record<CloseReason, string> = {
  cancelled_by_requester: "Cancelled by requester",
  wont_do: "Won't do",
  cant_do: "Can't do",
};

export const CATEGORY_LABELS: Record<Category, string> = {
  laptops_hardware: "Laptops & hardware",
  vendor_contracts: "Vendor contracts",
  system_access: "System access",
  office_facilities: "Office & facilities",
  other: "Other",
};

export const URGENCY_LABELS: Record<Urgency, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export interface User {
  id: string;
  name: string;
  role: Role;
}

export interface TriageValues {
  category: Category;
  urgency: Urgency;
  summary: string;
}
export type TriageField = keyof TriageValues;
export const TRIAGE_FIELDS: readonly TriageField[] = ["category", "urgency", "summary"];
export const TITLE_MAX_LENGTH = 120;
export const DESCRIPTION_MAX_LENGTH = 5000;
export const SUMMARY_MAX_LENGTH = 140;
export const UPDATE_NOTE_MAX_LENGTH = 1000;

/** Fields where the final values Ops set differ from the AI suggestion; all of them when there was no suggestion. */
export function overriddenTriageFields(suggestion: TriageValues | null, final: TriageValues): TriageField[] {
  return TRIAGE_FIELDS.filter((field) => !suggestion || suggestion[field] !== final[field]);
}

// The shapes below are generic over the date type `D`: `Date` in the stored
// Mongo document, ISO `string` once a service has serialized it for the API.

export interface TriageState<D = Date> {
  status: "pending" | "complete" | "failed";
  suggestion: TriageValues | null;
  model: string | null;
  error: string | null;
  attemptedAt: D | null;
}

export interface HistoryEvent<D = Date> {
  type: HistoryEventType;
  at: D;
  actorId: string;
  fromStatus?: Status;
  toStatus?: Status;
  fromAssigneeId?: string | null;
  toAssigneeId?: string | null;
  detail?: {
    closeReason?: CloseReason;
    model?: string;
    error?: string;
    overriddenFields?: TriageField[];
    /** The requester's update when sending a request back to Ops. */
    note?: string;
    /** On triage events, which attempt this was when the first output was rejected and the model was asked to fix it. */
    attempt?: number;
    /** On triage_overridden: there was no AI suggestion, so Ops triaged it by hand. */
    noSuggestion?: true;
  };
}

/**
 * The history event for Ops setting the final triage. Values identical to the
 * AI suggestion are a triage_accepted event; any difference is a
 * triage_overridden event listing the fields changed. With no suggestion
 * (triage failed or is pending) every field counts as overridden and the event
 * is flagged noSuggestion, so the history can say it was triaged by hand; the
 * event type stays the same, so the metrics don't change.
 */
export function triageReviewEvent(
  suggestion: TriageValues | null,
  final: TriageValues,
  actorId: string,
  at: Date,
): HistoryEvent {
  const overriddenFields = overriddenTriageFields(suggestion, final);
  if (overriddenFields.length === 0) return { type: "triage_accepted", at, actorId };
  return {
    type: "triage_overridden",
    at,
    actorId,
    detail: suggestion ? { overriddenFields } : { overriddenFields, noSuggestion: true },
  };
}

export interface RequestFields<D = Date> {
  title: string;
  description: string;
  requesterId: string;
  requesterUrgency: Urgency;
  status: Status;
  closeReason: CloseReason | null;
  assigneeId: string | null;
  triage: TriageState<D>;
  accepted: TriageValues | null;
  history: HistoryEvent<D>[];
  createdAt: D;
  updatedAt: D;
}

/** A request as the API returns it. */
export type RequestView = RequestFields<string> & { id: string };

/** What the current user may do to a request, so the UI doesn't re-derive the rules. */
export interface RequestActions {
  /** Assign or reassign to anyone on the Ops team (Ops Lead). */
  canAssign: boolean;
  /** Take this unassigned request yourself. */
  canSelfAssign: boolean;
  statusTransitions: Status[];
  /** Reasons this user may pick when closing; empty when they can't close. */
  closeReasons: CloseReason[];
  /** Moving to In progress is the requester sending it back, which needs their update. */
  sendBackNeedsUpdate: boolean;
  /** Accept, override, or edit the triage review. */
  canReviewTriage: boolean;
  canRetryTriage: boolean;
}

export interface RequestDetail {
  request: RequestView;
  actions: RequestActions;
}
