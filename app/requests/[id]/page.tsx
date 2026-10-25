"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  CLOSE_REASON_LABELS,
  SUMMARY_MAX_LENGTH,
  TRIAGE_FIELDS,
  URGENCIES,
  URGENCY_LABELS,
  type Category,
  type CloseReason,
  type RequestDetail,
  type RequestView,
  type Status,
  type TriageValues,
  type Urgency,
} from "@/src/lib/domain";
import { isOps } from "@/src/lib/permissions";
import { api, errorMessage, useApi } from "../../_components/api";
import { describeEvent, formatDateTime, StatusBadge } from "../../_components/format";
import { useSession } from "../../_components/session";
import { UserGate } from "../../_components/UserGate";

export default function RequestPage() {
  const { id } = useParams<{ id: string }>();
  return <UserGate>{() => <RequestDetailView id={id} />}</UserGate>;
}

function RequestDetailView({ id }: { id: string }) {
  const { userName } = useSession();
  const { data, error, reload } = useApi<RequestDetail>(`/api/requests/${id}`);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!data) return error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>;
  const { request, actions } = data;

  async function act(action: "assign" | "status" | "triage" | "accepted", body: unknown) {
    setBusy(true);
    setActionError(null);
    try {
      await api(`/api/requests/${id}/${action}`, { body });
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
      reload();
    }
  }

  return (
    <article className="stack">
      <header>
        <h1>{request.title}</h1>
        <StatusBadge status={request.status} closeReason={request.closeReason} />
      </header>
      {actionError && <p className="error">{actionError}</p>}

      <dl className="facts">
        <dt>Requester</dt>
        <dd>{userName(request.requesterId)}</dd>
        <dt>Requester urgency</dt>
        <dd>{URGENCY_LABELS[request.requesterUrgency]}</dd>
        <dt>Assignee</dt>
        <dd>{request.assigneeId ? userName(request.assigneeId) : <span className="muted">Not assigned yet</span>}</dd>
        <dt>Submitted</dt>
        <dd>{formatDateTime(request.createdAt)}</dd>
        <dt>Last updated</dt>
        <dd>{formatDateTime(request.updatedAt)}</dd>
      </dl>

      <section>
        <h2>Description</h2>
        <p className="prewrap">{request.description}</p>
      </section>

      {actions.canManageTriage ? (
        <TriagePanel
          key={request.updatedAt}
          request={request}
          canRetry={actions.canRetryTriage}
          busy={busy}
          onRetry={() => act("triage", {})}
          onConfirm={(values) => act("accepted", values)}
        />
      ) : (
        <TriageSummary request={request} />
      )}

      {(actions.canAssign || actions.statusTransitions.length > 0) && (
        <section className="stack">
          <h2>Actions</h2>
          {actions.canAssign && (
            <AssignControl
              key={request.assigneeId}
              current={request.assigneeId}
              busy={busy}
              onAssign={(assigneeId) => act("assign", { assigneeId })}
            />
          )}
          {actions.statusTransitions.length > 0 && (
            <StatusControls
              from={request.status}
              transitions={actions.statusTransitions}
              closeReasons={actions.closeReasons}
              busy={busy}
              onChange={(status, closeReason) => act("status", { status, closeReason })}
            />
          )}
        </section>
      )}

      <section>
        <h2>History</h2>
        <ol className="timeline">
          {request.history.map((event, i) => (
            <li key={i}>
              <time dateTime={event.at}>{formatDateTime(event.at)}</time> {describeEvent(event, userName)}
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}

/**
 * Ops view: the requester's urgency, the AI suggestion, and the confirmed
 * values side by side. "Accept all" confirms the suggestion as is; editing the
 * Confirmed column and saving records an override. The server decides which
 * history event it was by comparing against the suggestion.
 */
function TriagePanel({
  request,
  canRetry,
  busy,
  onRetry,
  onConfirm,
}: {
  request: RequestView;
  canRetry: boolean;
  busy: boolean;
  onRetry: () => void;
  onConfirm: (values: TriageValues) => void;
}) {
  const { triage, accepted, requesterUrgency } = request;
  const suggestion = triage.suggestion;
  const initial = accepted ?? suggestion;
  const [category, setCategory] = useState<Category | "">(initial?.category ?? "");
  const [urgency, setUrgency] = useState<Urgency | "">(initial?.urgency ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const suggestionAccepted =
    accepted !== null && suggestion !== null && TRIAGE_FIELDS.every((field) => accepted[field] === suggestion[field]);

  return (
    <section className="stack">
      <h2>Triage</h2>
      {triage.status === "complete" && (
        <p className="muted">
          AI suggestion from {triage.model}
          {triage.attemptedAt && `, ${formatDateTime(triage.attemptedAt)}`}.
        </p>
      )}
      {triage.status === "failed" && <p className="error">AI triage failed: {triage.error}</p>}
      {triage.status === "pending" && <p className="muted">AI triage is running…</p>}
      {canRetry && (
        <p>
          <button disabled={busy} onClick={onRetry}>
            {busy ? "Working…" : "Retry AI triage"}
          </button>
        </p>
      )}

      <table className="triage">
        <thead>
          <tr>
            <th />
            <th>Requester</th>
            <th>AI suggestion</th>
            <th>Confirmed {!accepted && <span className="muted">(not yet)</span>}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Category</th>
            <td className="muted">–</td>
            <td>{suggestion ? CATEGORY_LABELS[suggestion.category] : "–"}</td>
            <td>
              <select aria-label="Confirmed category" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
                {category === "" && (
                  <option value="" disabled>
                    Pick one…
                  </option>
                )}
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr>
            <th scope="row">Urgency</th>
            <td>{URGENCY_LABELS[requesterUrgency]}</td>
            <td>{suggestion ? URGENCY_LABELS[suggestion.urgency] : "–"}</td>
            <td>
              <select aria-label="Confirmed urgency" value={urgency} onChange={(e) => setUrgency(e.target.value as Urgency)}>
                {urgency === "" && (
                  <option value="" disabled>
                    Pick one…
                  </option>
                )}
                {URGENCIES.map((u) => (
                  <option key={u} value={u}>
                    {URGENCY_LABELS[u]}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr>
            <th scope="row">Summary</th>
            <td className="muted">–</td>
            <td>{suggestion?.summary ?? "–"}</td>
            <td>
              <input
                aria-label="Confirmed summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                maxLength={SUMMARY_MAX_LENGTH}
              />
            </td>
          </tr>
        </tbody>
      </table>

      <p className="row">
        {suggestion && (
          <button disabled={busy || suggestionAccepted} onClick={() => onConfirm(suggestion)}>
            {suggestionAccepted ? "AI suggestion accepted" : "Accept all"}
          </button>
        )}
        <button
          disabled={busy || category === "" || urgency === "" || summary.trim() === ""}
          onClick={() => category && urgency && onConfirm({ category, urgency, summary })}
        >
          Save confirmed values
        </button>
      </p>
    </section>
  );
}

/** Requester view: what Ops confirmed, or else the AI's suggestion. */
function TriageSummary({ request }: { request: RequestView }) {
  const { triage, accepted } = request;
  return (
    <section>
      <h2>Triage</h2>
      {accepted ? (
        <p>
          {CATEGORY_LABELS[accepted.category]} · {URGENCY_LABELS[accepted.urgency]} urgency
          <br />
          {accepted.summary}
        </p>
      ) : triage.suggestion ? (
        <p>
          <span className="muted">AI suggestion, not yet confirmed by Ops:</span>
          <br />
          {CATEGORY_LABELS[triage.suggestion.category]} · {URGENCY_LABELS[triage.suggestion.urgency]} urgency
          <br />
          {triage.suggestion.summary}
        </p>
      ) : (
        <p className="muted">{triage.status === "failed" ? "AI triage failed." : "AI triage pending."}</p>
      )}
    </section>
  );
}

function AssignControl({
  current,
  busy,
  onAssign,
}: {
  current: string | null;
  busy: boolean;
  onAssign: (assigneeId: string) => void;
}) {
  const { users } = useSession();
  const [assigneeId, setAssigneeId] = useState(current ?? "");
  return (
    <p>
      <label>
        Assignee{" "}
        <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
          <option value="" disabled>
            Pick someone…
          </option>
          {users.filter(isOps).map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </label>{" "}
      <button disabled={busy || !assigneeId || assigneeId === current} onClick={() => onAssign(assigneeId)}>
        {current ? "Reassign" : "Assign"}
      </button>
    </p>
  );
}

function StatusControls({
  from,
  transitions,
  closeReasons,
  busy,
  onChange,
}: {
  from: Status;
  transitions: Status[];
  closeReasons: CloseReason[];
  busy: boolean;
  onChange: (status: Status, closeReason?: CloseReason) => void;
}) {
  const [closeReason, setCloseReason] = useState<CloseReason | "">("");
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const moves = transitions.filter((s) => s !== "closed");
  const buttonLabel: Partial<Record<Status, string>> = {
    in_progress: from === "waiting_on_requester" ? "Resume work" : "Start work",
    waiting_on_requester: "Wait on requester",
    done: "Mark done",
  };
  // A requester's only status action is cancelling their own request.
  const cancelOnly = closeReasons.length === 1 && closeReasons[0] === "cancelled_by_requester";

  return (
    <>
      {moves.length > 0 && (
        <p className="row">
          {moves.map((s) => (
            <button key={s} disabled={busy} onClick={() => onChange(s)}>
              {buttonLabel[s]}
            </button>
          ))}
        </p>
      )}
      {cancelOnly &&
        (confirmingCancel ? (
          <p className="row">
            Cancel this request? This can&apos;t be undone.
            <button disabled={busy} onClick={() => onChange("closed", "cancelled_by_requester")}>
              Yes, cancel it
            </button>
            <button disabled={busy} onClick={() => setConfirmingCancel(false)}>
              No, keep it
            </button>
          </p>
        ) : (
          <p>
            <button disabled={busy} onClick={() => setConfirmingCancel(true)}>
              Cancel this request
            </button>
          </p>
        ))}
      {!cancelOnly && closeReasons.length > 0 && (
        <p>
          <label>
            Close with reason{" "}
            <select value={closeReason} onChange={(e) => setCloseReason(e.target.value as CloseReason)}>
              <option value="" disabled>
                Pick a reason…
              </option>
              {closeReasons.map((r) => (
                <option key={r} value={r}>
                  {CLOSE_REASON_LABELS[r]}
                </option>
              ))}
            </select>
          </label>{" "}
          <button disabled={busy || !closeReason} onClick={() => closeReason && onChange("closed", closeReason)}>
            Close request
          </button>
        </p>
      )}
    </>
  );
}
