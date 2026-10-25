import { CATEGORIES, type Category, type HistoryEvent, type Status, type TriageValues } from "../domain";

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
 * Groups come back in the fixed category order, untriaged last, and only
 * groups that have requests are included.
 */
export function aggregateMetrics(
  requests: ReadonlyArray<{ accepted: Pick<TriageValues, "category"> | null; history: readonly HistoryEvent[] }>,
): MetricsGroup[] {
  const byGroup = new Map<Category | "untriaged", RequestMetrics[]>();
  for (const request of requests) {
    const group = request.accepted?.category ?? "untriaged";
    byGroup.set(group, [...(byGroup.get(group) ?? []), computeRequestMetrics(request.history)]);
  }

  const order: (Category | "untriaged")[] = [...CATEGORIES, "untriaged"];
  return order
    .filter((group) => byGroup.has(group))
    .map((group) => {
      const metrics = byGroup.get(group)!;
      const stats = Object.fromEntries(
        METRIC_NAMES.map((name) => [name, summarize(metrics.map((m) => m[name]))]),
      ) as Record<MetricName, MetricStats>;
      return { category: group, requestCount: metrics.length, ...stats };
    });
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
