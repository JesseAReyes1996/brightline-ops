"use client";

import { Fragment } from "react";
import { CATEGORY_LABELS, TRIAGE_FIELDS, type TriageField } from "@/src/lib/domain";
import type { MetricName, MetricsGroup, MetricsReport, TriageReviewStats } from "@/src/lib/metrics";
import { isOpsLead } from "@/src/lib/permissions";
import { useApi } from "../_components/api";
import { formatDuration } from "../_components/format";
import { UserGate } from "../_components/UserGate";

const METRICS: { key: MetricName; label: string }[] = [
  { key: "timeToAssignment", label: "Time to assignment" },
  { key: "timeToPickup", label: "Time to pickup" },
  { key: "handlingTime", label: "Handling time" },
  { key: "waitingOnRequesterTime", label: "Waiting on requester" },
];

const FIELD_LABELS: Record<TriageField, string> = {
  category: "Category overridden",
  urgency: "Urgency overridden",
  summary: "Summary overridden",
};

export default function MetricsPage() {
  return (
    <>
      <h1>Metrics</h1>
      <UserGate allow={isOpsLead} denied="The metrics page is only for the Ops Lead.">
        {() => <Metrics />}
      </UserGate>
    </>
  );
}

function Metrics() {
  const { data, error } = useApi<MetricsReport>("/api/metrics");
  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  return (
    <div className="stack wide">
      <section>
        <h2>By category</h2>
        <div className="table-scroll">
          <table className="metrics-table">
            <thead>
              <tr>
                <th rowSpan={2}>Category</th>
                <th rowSpan={2}>Requests</th>
                {METRICS.map((m) => (
                  <th key={m.key} colSpan={3} scope="colgroup">
                    {m.label}
                  </th>
                ))}
              </tr>
              <tr>
                {METRICS.map((m) => (
                  <Fragment key={m.key}>
                    <th>Median</th>
                    <th>Average</th>
                    <th>Count</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.groups.map((group) => (
                <GroupRow key={group.category} group={group} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          Grouped by the final category set by Ops; &ldquo;Untriaged&rdquo; means Ops hasn&apos;t reviewed it yet. Wall-clock
          time. Time to assignment: submitted to first assignment. Time to pickup: first assignment to first moved to In
          progress. Handling time: total time In progress, not counting time waiting on the requester. Handling and
          waiting times only count requests that were picked up and are now Done or Closed. Count is how many requests
          each figure is based on.
        </p>
      </section>

      <TriageReviewSection stats={data.triage} />
    </div>
  );
}

function GroupRow({ group }: { group: MetricsGroup }) {
  const empty = group.requestCount === 0;
  return (
    <tr>
      <th scope="row">{group.category === "untriaged" ? "Untriaged" : CATEGORY_LABELS[group.category]}</th>
      <td>{empty ? "—" : group.requestCount}</td>
      {METRICS.map(({ key }) => (
        <Fragment key={key}>
          <td>{empty ? "—" : formatDuration(group[key].median)}</td>
          <td>{empty ? "—" : formatDuration(group[key].average)}</td>
          <td>{empty ? "—" : group[key].count}</td>
        </Fragment>
      ))}
    </tr>
  );
}

function TriageReviewSection({ stats }: { stats: TriageReviewStats }) {
  const percent = (rate: number | null) => (rate === null ? "—" : `${Math.round(rate * 100)}%`);
  const outOf = (count: number) => (stats.reviewed === 0 ? "—" : `${count} of ${stats.reviewed}`);

  return (
    <section>
      <h2>AI triage</h2>
      <p className="muted">
        Of the requests where Ops accepted or overrode the AI&apos;s suggestion ({stats.reviewed}). Requests that Ops
        classified by hand after AI triage failed aren&apos;t counted.
      </p>
      <table className="narrow">
        <tbody>
          <tr>
            <th scope="row">Accepted unchanged</th>
            <td>{percent(stats.acceptedUnchangedRate)}</td>
            <td className="muted">{outOf(stats.acceptedUnchanged)}</td>
          </tr>
          {TRIAGE_FIELDS.map((field) => (
            <tr key={field}>
              <th scope="row">{FIELD_LABELS[field]}</th>
              <td>{percent(stats.overrides[field].rate)}</td>
              <td className="muted">{outOf(stats.overrides[field].count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">One request can have several fields overridden, so the override rates don&apos;t add up.</p>
    </section>
  );
}
