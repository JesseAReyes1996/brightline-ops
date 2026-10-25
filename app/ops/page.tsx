"use client";

import Link from "next/link";
import { useState } from "react";
import {
  CATEGORY_LABELS,
  OPEN_STATUSES,
  STATUS_LABELS,
  URGENCY_LABELS,
  type OpenStatus,
  type RequestView,
  type User,
} from "@/src/lib/domain";
import { isOps, isOpsLead } from "@/src/lib/permissions";
import { api, errorMessage, useApi } from "../_components/api";
import { formatAge, StatusBadge } from "../_components/format";
import { useSession } from "../_components/session";
import { UserGate } from "../_components/UserGate";

export default function OpsQueuePage() {
  return (
    <>
      <h1>Ops queue</h1>
      <UserGate opsOnly>{(me) => <Queue me={me} />}</UserGate>
    </>
  );
}

function Queue({ me }: { me: User }) {
  const { users, userName } = useSession();
  const [status, setStatus] = useState<OpenStatus | "">("");
  const { data, error, loading, reload } = useApi<{ requests: RequestView[] }>(
    `/api/requests?view=queue${status ? `&status=${status}` : ""}`,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const opsTeam = users.filter(isOps);

  async function assign(requestId: string, assigneeId: string) {
    setActionError(null);
    try {
      await api(`/api/requests/${requestId}/assign`, { body: { assigneeId } });
    } catch (err) {
      setActionError(errorMessage(err));
    }
    reload();
  }

  return (
    <>
      <p>
        <label>
          Status{" "}
          <select value={status} onChange={(e) => setStatus(e.target.value as OpenStatus | "")}>
            <option value="">All open</option>
            {OPEN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>{" "}
        {loading && <span className="muted">Loading…</span>}
      </p>
      {error && <p className="error">{error}</p>}
      {actionError && <p className="error">{actionError}</p>}
      {data && data.requests.length === 0 && <p>Nothing in the queue.</p>}
      {data && data.requests.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Requester urgency</th>
              <th>AI urgency</th>
              <th>Category</th>
              <th>Assignee</th>
              <th>Status</th>
              <th>Age</th>
            </tr>
          </thead>
          <tbody>
            {data.requests.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/requests/${r.id}`}>{r.title}</Link>
                </td>
                <td>{URGENCY_LABELS[r.requesterUrgency]}</td>
                <td>
                  {r.triage.suggestion ? (
                    URGENCY_LABELS[r.triage.suggestion.urgency]
                  ) : (
                    <span className={r.triage.status === "failed" ? "error" : "muted"}>
                      {r.triage.status === "failed" ? "Triage failed" : "Pending"}
                    </span>
                  )}
                </td>
                <td>{r.accepted ? CATEGORY_LABELS[r.accepted.category] : <span className="muted">Not confirmed</span>}</td>
                <td>
                  {isOpsLead(me) ? (
                    <select
                      aria-label={`Assignee for ${r.title}`}
                      value={r.assigneeId ?? ""}
                      onChange={(e) => void assign(r.id, e.target.value)}
                    >
                      {!r.assigneeId && (
                        <option value="" disabled>
                          Unassigned
                        </option>
                      )}
                      {opsTeam.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  ) : r.assigneeId ? (
                    userName(r.assigneeId)
                  ) : (
                    <span className="muted">Unassigned</span>
                  )}
                </td>
                <td>
                  <StatusBadge status={r.status} />
                </td>
                <td className="nowrap">{formatAge(r.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
