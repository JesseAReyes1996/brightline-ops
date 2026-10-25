import type { Db } from "mongodb";
import { requestsCollection } from "../collections";
import type { User } from "../domain";
import { ServiceError } from "../errors";
import { aggregateMetrics, summarizeTriageReviews, type MetricsReport } from "../metrics";
import { canViewMetrics } from "../permissions";

/** Metrics over every request, open or finished. Ops Lead only. */
export async function getMetricsReport(db: Db, actor: User): Promise<MetricsReport> {
  if (!canViewMetrics(actor)) throw new ServiceError("forbidden", "Only the Ops Lead can see metrics.");
  const requests = await requestsCollection(db)
    .find({}, { projection: { accepted: 1, history: 1, "triage.suggestion": 1 } })
    .toArray();
  return { ...aggregateMetrics(requests), triage: summarizeTriageReviews(requests) };
}
