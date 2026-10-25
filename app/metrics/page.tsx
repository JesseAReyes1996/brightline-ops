"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { CATEGORY_LABELS, TRIAGE_FIELDS, type TriageField } from "@/src/lib/domain";
import type {
  MetricName,
  MetricsGroup,
  MetricsReport,
  MetricStats,
  MetricsSummary,
  TriageReviewStats,
} from "@/src/lib/metrics";
import { isOpsLead } from "@/src/lib/permissions";
import { useApi } from "../_components/api";
import { formatDuration } from "../_components/format";
import { UserGate } from "../_components/UserGate";

const METRICS: { key: MetricName; label: string; definition: string }[] = [
  {
    key: "timeToAssignment",
    label: "Time to assign",
    definition: "How long from when a request is submitted until it's first assigned to someone.",
  },
  {
    key: "timeToPickup",
    label: "Time to start",
    definition: "How long from the first assignment until the request is first moved to In progress.",
  },
  {
    key: "handlingTime",
    label: "Time working",
    definition: "Total time a finished request spent In progress, not counting time waiting on the requester.",
  },
  {
    key: "waitingOnRequesterTime",
    label: "Waiting on requester",
    definition: "Total time a finished request spent waiting for the requester to reply.",
  },
];

const FIELD_LABELS: Record<TriageField, string> = {
  category: "Category overridden",
  urgency: "Urgency overridden",
  summary: "Summary overridden",
};

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const percent = (rate: number | null) => (rate === null ? "—" : `${Math.round(rate * 100)}%`);

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
      <Headlines overall={data.overall} triage={data.triage} />

      <section>
        <h2>By category</h2>
        <div className="table-scroll">
          <table className="metrics-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Requests</th>
                {METRICS.map((m, i) => (
                  <th key={m.key}>
                    {m.label}
                    <InfoTip label={`What is “${m.label}”?`} align={i === METRICS.length - 1 ? "end" : "center"}>
                      {m.definition}
                    </InfoTip>
                  </th>
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
        <p className="muted small">Figures are medians, in wall-clock time.</p>
      </section>

      <TriageReviewSection stats={data.triage} />
    </div>
  );
}

/** Four numbers across all categories: overall medians, and the AI acceptance rate. */
function Headlines({ overall, triage }: { overall: MetricsSummary; triage: TriageReviewStats }) {
  return (
    <section className="headlines" aria-label="Across all categories">
      {METRICS.slice(0, 3).map((m) => (
        <div key={m.key} className="headline">
          <div className="headline-label">{m.label}</div>
          <div className="headline-value">
            <StatValue stats={overall[m.key]} align="start" />
          </div>
          <div className="muted small">median, all requests</div>
        </div>
      ))}
      <div className="headline">
        <div className="headline-label">AI suggestions accepted unchanged</div>
        <div className="headline-value">{percent(triage.acceptedUnchangedRate)}</div>
        <div className="muted small">
          {triage.reviewed ? `${triage.acceptedUnchanged} of ${triage.reviewed} reviewed` : "none reviewed yet"}
        </div>
      </div>
    </section>
  );
}

function GroupRow({ group }: { group: MetricsGroup }) {
  const empty = group.requestCount === 0;
  return (
    <tr>
      <th scope="row">{group.category === "untriaged" ? "Untriaged" : CATEGORY_LABELS[group.category]}</th>
      <td>{empty ? "—" : group.requestCount}</td>
      {METRICS.map(({ key }, i) => (
        <td key={key}>
          {empty ? "—" : <StatValue stats={group[key]} align={i === METRICS.length - 1 ? "end" : "center"} />}
        </td>
      ))}
    </tr>
  );
}

/** Lets Escape hide a hover or focus tooltip until focus or the pointer moves away. */
function useEscapeToDismiss() {
  const [dismissed, setDismissed] = useState(false);
  const reset = () => setDismissed(false);
  return {
    dismissed,
    handlers: {
      onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
        if (e.key === "Escape") setDismissed(true);
      },
      onBlur: reset,
      onMouseLeave: reset,
    },
  };
}

/** The median, with its average and sample size on hover or keyboard focus. */
function StatValue({ stats, align }: { stats: MetricStats; align: "start" | "center" | "end" }) {
  const id = useId();
  const { dismissed, handlers } = useEscapeToDismiss();
  if (stats.median === null) return <>—</>;
  return (
    <span
      className={`tip-host stat${dismissed ? " dismissed" : ""}`}
      tabIndex={0}
      aria-describedby={id}
      {...handlers}
    >
      {formatDuration(stats.median)}
      <span role="tooltip" id={id} className={`tip above ${align}`}>
        Average {formatDuration(stats.average)}, based on {plural(stats.count, "request")}
      </span>
    </span>
  );
}

/**
 * An "i" button with a one-sentence definition. Shows on hover (on devices
 * that can hover), on keyboard focus, and on tap, which toggles it so it
 * works on phones; tapping anywhere else closes it.
 */
function InfoTip({ label, align = "center", children }: { label: string; align?: "center" | "end"; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLSpanElement>(null);
  const id = useId();
  const { dismissed, handlers } = useEscapeToDismiss();

  useEffect(() => {
    if (!open) return;
    const closeIfOutside = (e: PointerEvent) => {
      if (!host.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeIfOutside);
    return () => document.removeEventListener("pointerdown", closeIfOutside);
  }, [open]);

  return (
    <span
      ref={host}
      className={`tip-host info${open ? " open" : ""}${dismissed ? " dismissed" : ""}`}
      {...handlers}
      onKeyDown={(e) => {
        handlers.onKeyDown(e);
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <button
        type="button"
        className="info-button"
        aria-label={label}
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        i
      </button>
      <span role="tooltip" id={id} className={`tip below ${align}`}>
        {children}
      </span>
    </span>
  );
}

function TriageReviewSection({ stats }: { stats: TriageReviewStats }) {
  const outOf = (count: number) => (stats.reviewed === 0 ? "—" : `${count} of ${stats.reviewed}`);
  return (
    <section>
      <h2>
        AI triage
        <InfoTip label="What is “AI triage”?">
          Of the requests where Ops reviewed an AI suggestion, how often they kept it unchanged and how often they
          changed each field; requests triaged by hand after the AI failed aren&apos;t counted.
        </InfoTip>
      </h2>
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
    </section>
  );
}
