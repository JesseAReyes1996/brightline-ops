import {
  CATEGORIES,
  TRIAGE_FIELDS,
  overriddenTriageFields,
  type Category,
  type HistoryEvent,
  type Status,
  type TriageField,
  type TriageValues,
} from "../domain";

/** Durations in milliseconds of wall-clock time; null when the metric doesn't apply. */
export interface RequestMetrics {
  /** Created → first assignment. */
  timeToAssignment: number | null;
  /** First assignment → first move to In progress. */
  timeToPickup: number | null;
  /** Total time In progress, for requests that reached Done or Closed after being picked up. */
  handlingTime: number | null;
  /** Total time Waiting on requester, for the same requests as handlingTime. */
  waitingOnRequesterTime: number | null;
}

/**
 * Computes one request's metrics from its history alone. History is append-only,
 * so its events are already in time order.
 */
export function computeRequestMetrics(history: readonly HistoryEvent[]): RequestMetrics {
  const created = history.find((e) => e.type === "created");
  const firstAssignment = history.find((e) => e.type === "assigned");
  const firstPickup = history.find((e) => e.type === "status_changed" && e.toStatus === "in_progress");

  // Walk the status changes and add up how long the request sat in each
  // status. Handling time only counts In progress, so time spent waiting on
  // the requester is excluded without any special case.
  const timeInStatus: Partial<Record<Status, number>> = {};
  let current: Status = "new";
  let since = created?.at;
  for (const event of history) {
    if (event.type !== "status_changed" || !event.toStatus) continue;
    if (since) timeInStatus[current] = (timeInStatus[current] ?? 0) + elapsed(since, event.at);
    current = event.toStatus;
    since = event.at;
  }

  // Totals are only final once the request is finished, and only mean
  // something if it was picked up; closed straight from New has no handling.
  const handled = (current === "done" || current === "closed") && firstPickup !== undefined && created !== undefined;

  return {
    timeToAssignment: created && firstAssignment ? elapsed(created.at, firstAssignment.at) : null,
    timeToPickup: firstAssignment && firstPickup ? elapsed(firstAssignment.at, firstPickup.at) : null,
    handlingTime: handled ? (timeInStatus.in_progress ?? 0) : null,
    waitingOnRequesterTime: handled ? (timeInStatus.waiting_on_requester ?? 0) : null,
  };
}

function elapsed(from: Date, to: Date): number {
  return to.getTime() - from.getTime();
}

export const METRIC_NAMES = ["timeToAssignment", "timeToPickup", "handlingTime", "waitingOnRequesterTime"] as const;
export type MetricName = (typeof METRIC_NAMES)[number];

export interface MetricStats {
  /** How many requests in the group have a value for this metric. */
  count: number;
  median: number | null;
  average: number | null;
}

export type MetricsGroup = { category: Category | "untriaged"; requestCount: number } & Record<MetricName, MetricStats>;

/**
 * Groups requests by the category Ops accepted ("untriaged" when none was
 * accepted yet) and summarizes each metric over the requests it applies to.
 * Every group comes back, in the fixed category order with untriaged last;
 * a group with no requests has a requestCount of 0.
 */
export function aggregateMetrics(
  requests: ReadonlyArray<{ accepted: Pick<TriageValues, "category"> | null; history: readonly HistoryEvent[] }>,
): MetricsGroup[] {
  const byGroup = new Map<Category | "untriaged", RequestMetrics[]>();
  for (const request of requests) {
    const group = request.accepted?.category ?? "untriaged";
    byGroup.set(group, [...(byGroup.get(group) ?? []), computeRequestMetrics(request.history)]);
  }

  const groups: (Category | "untriaged")[] = [...CATEGORIES, "untriaged"];
  return groups.map((group) => {
    const metrics = byGroup.get(group) ?? [];
    const stats = Object.fromEntries(
      METRIC_NAMES.map((name) => [name, summarize(metrics.map((m) => m[name]))]),
    ) as Record<MetricName, MetricStats>;
    return { category: group, requestCount: metrics.length, ...stats };
  });
}

export interface TriageReviewStats {
  /** Requests with an AI suggestion that Ops has accepted or overridden. */
  reviewed: number;
  acceptedUnchanged: number;
  /** Share of reviewed requests confirmed with no field changed; null when none were reviewed. */
  acceptedUnchangedRate: number | null;
  /** Per field, how many reviewed requests had it changed, and that share of `reviewed`. */
  overrides: Record<TriageField, { count: number; rate: number | null }>;
}

/**
 * How often Ops agreed with the AI. Only requests where Ops confirmed triage
 * and there is an AI suggestion count: when AI triage failed and Ops
 * classified by hand, there is no AI output to judge. The confirmed values are
 * compared with the suggestion by the same rule that decides between the
 * triage_accepted and triage_overridden history events. A request can have
 * several fields overridden, so the per-field rates don't add up to the
 * overall override share.
 */
export function summarizeTriageReviews(
  requests: ReadonlyArray<{ triage: { suggestion: TriageValues | null }; accepted: TriageValues | null }>,
): TriageReviewStats {
  const reviews = requests.flatMap(({ triage, accepted }) =>
    triage.suggestion && accepted ? [overriddenTriageFields(triage.suggestion, accepted)] : [],
  );
  const share = (count: number) => (reviews.length === 0 ? null : count / reviews.length);
  const acceptedUnchanged = reviews.filter((fields) => fields.length === 0).length;
  const overrides = Object.fromEntries(
    TRIAGE_FIELDS.map((field) => {
      const count = reviews.filter((fields) => fields.includes(field)).length;
      return [field, { count, rate: share(count) }];
    }),
  ) as TriageReviewStats["overrides"];

  return { reviewed: reviews.length, acceptedUnchanged, acceptedUnchangedRate: share(acceptedUnchanged), overrides };
}

/** What GET /api/metrics returns. */
export interface MetricsReport {
  groups: MetricsGroup[];
  triage: TriageReviewStats;
}

function summarize(values: (number | null)[]): MetricStats {
  const present = values.filter((v): v is number => v !== null).sort((a, b) => a - b);
  if (present.length === 0) return { count: 0, median: null, average: null };
  const mid = Math.floor(present.length / 2);
  return {
    count: present.length,
    median: present.length % 2 === 1 ? present[mid] : (present[mid - 1] + present[mid]) / 2,
    average: present.reduce((sum, v) => sum + v, 0) / present.length,
  };
}
