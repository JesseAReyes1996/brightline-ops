"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  CLOSE_REASON_LABELS,
  SUMMARY_MAX_LENGTH,
  TRIAGE_FIELDS,
  UPDATE_NOTE_MAX_LENGTH,
  URGENCIES,
  URGENCY_LABELS,
  overriddenTriageFields,
  type Category,
  type CloseReason,
  type RequestDetail,
  type RequestView,
  type Status,
  type TriageField,
  type TriageValues,
  type Urgency,
  type User,
} from "@/src/lib/domain";
import { isOps } from "@/src/lib/permissions";
import { isTerminal } from "@/src/lib/transitions";
import { api, errorMessage, useApi } from "../../_components/api";
import { describeEvent, formatDateTime, StatusBadge } from "../../_components/format";
import { useSession } from "../../_components/session";
import { UserGate } from "../../_components/UserGate";

export default function RequestPage() {
  const { id } = useParams<{ id: string }>();
  return <UserGate>{(me) => <RequestDetailView id={id} me={me} />}</UserGate>;
}

function RequestDetailView({ id, me }: { id: string; me: User }) {
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

      {isOps(me) ? (
        <TriagePanel
          key={request.updatedAt}
          request={request}
          canReview={actions.canReviewTriage}
          lockedNote={
            isTerminal(request.status)
              ? "Only the Ops Lead can change the triage of a finished request."
              : `Only ${request.assigneeId ? userName(request.assigneeId) : "the assignee"} or the Ops Lead can change this request's triage.`
          }
          canRetry={actions.canRetryTriage}
          busy={busy}
          onRetry={() => act("triage", {})}
          onSave={(values) => act("accepted", values)}
        />
      ) : (
        <TriageSummary request={request} />
      )}

      {(actions.canAssign || actions.canSelfAssign || actions.statusTransitions.length > 0) && (
        <section className="stack">
          <h2>Actions</h2>
          {actions.canAssign ? (
            <AssignControl
              key={request.assigneeId}
              current={request.assigneeId}
              busy={busy}
              onAssign={(assigneeId) => act("assign", { assigneeId })}
            />
          ) : (
            actions.canSelfAssign && (
              <p>
                <button disabled={busy} onClick={() => act("assign", { assigneeId: me.id })}>
                  Assign to me
                </button>
              </p>
            )
          )}
          {actions.statusTransitions.length > 0 && (
            <StatusControls
              from={request.status}
              transitions={actions.statusTransitions}
              closeReasons={actions.closeReasons}
              sendBackNeedsUpdate={actions.sendBackNeedsUpdate}
              busy={busy}
              onChange={(status, closeReason, note) => act("status", { status, closeReason, note })}
            />
          )}
        </section>
      )}

      <section>
        <h2>
          History <span className="muted small">newest first</span>
        </h2>
        {/* Display order only: the stored history stays oldest-first, which the metrics rely on. */}
        <ol className="timeline">
          {request.history
            .map((event, index) => ({ event, index }))
            .reverse()
            .map(({ event, index }) => (
              <li key={index}>
                <time dateTime={event.at}>{formatDateTime(event.at)}</time> {describeEvent(event, userName)}
                {event.detail?.note && <p className="note prewrap">{event.detail.note}</p>}
              </li>
            ))}
        </ol>
      </section>
    </article>
  );
}

/**
 * Ops view: the AI suggestion (read-only) and the final triage Ops sets, as two
 * separate things. Saving sends the final values; the server still decides
 * whether that was an accept or an override by comparing with the suggestion.
 */
function TriagePanel({
  request,
  canReview,
  lockedNote,
  canRetry,
  busy,
  onRetry,
  onSave,
}: {
  request: RequestView;
  /** False shows the triage read-only, with `lockedNote` saying who can change it. */
  canReview: boolean;
  lockedNote: string;
  canRetry: boolean;
  busy: boolean;
  onRetry: () => void;
  onSave: (values: TriageValues) => void;
}) {
  const { triage, accepted } = request;
  const suggestion = triage.suggestion;
  // With AI triage failed and nothing reviewed yet, the fields start open for triage by hand.
  const handTriageNeeded = canReview && !accepted && triage.status === "failed";
  const [editing, setEditing] = useState(handTriageNeeded);

  return (
    <section className="stack">
      <h2>Triage</h2>
      <AiSuggestionPanel request={request} canRetry={canRetry} busy={busy} onRetry={onRetry} />

      <div className="panel">
        <h3>Final triage (set by Ops)</h3>
        <p className="muted">{reviewStatus(suggestion, accepted)}</p>
        {!canReview ? (
          <>
            {accepted && <TriageValuesList values={accepted} suggestion={suggestion} />}
            <p className="muted small">{lockedNote}</p>
          </>
        ) : editing ? (
          <TriageEditor
            suggestion={suggestion}
            current={accepted}
            busy={busy}
            onSave={onSave}
            onCancel={handTriageNeeded ? undefined : () => setEditing(false)}
          />
        ) : accepted ? (
          <>
            <TriageValuesList values={accepted} suggestion={suggestion} />
            <p>
              <button disabled={busy} onClick={() => setEditing(true)}>
                Edit
              </button>
            </p>
          </>
        ) : (
          <p className="row">
            {suggestion && (
              <button disabled={busy} onClick={() => onSave(suggestion)}>
                Accept AI suggestion
              </button>
            )}
            <button disabled={busy} onClick={() => setEditing(true)}>
              {suggestion ? "Edit before accepting" : "Triage by hand"}
            </button>
          </p>
        )}
      </div>
    </section>
  );
}

function reviewStatus(suggestion: TriageValues | null, accepted: TriageValues | null): string {
  if (!accepted) return "Not reviewed yet";
  if (!suggestion) return "Set by Ops (no AI suggestion)";
  const edited = overriddenTriageFields(suggestion, accepted);
  return edited.length === 0 ? "Accepted AI suggestion" : `Edited by Ops: ${edited.join(", ")}`;
}

function AiSuggestionPanel({
  request,
  canRetry,
  busy,
  onRetry,
}: {
  request: RequestView;
  canRetry: boolean;
  busy: boolean;
  onRetry: () => void;
}) {
  const { triage, requesterUrgency } = request;
  const suggestion = triage.suggestion;
  return (
    <div className="panel">
      <h3>AI suggestion</h3>
      {triage.status === "complete" && (
        <p className="muted small">
          From {triage.model}
          {triage.attemptedAt && `, ${formatDateTime(triage.attemptedAt)}`}
        </p>
      )}
      {triage.status === "failed" && <p className="error">AI triage failed: {triage.error}</p>}
      {triage.status === "pending" && <p className="muted">AI triage is running…</p>}
      {suggestion && (
        <dl className="facts">
          <dt>Category</dt>
          <dd>{CATEGORY_LABELS[suggestion.category]}</dd>
          <dt>Urgency</dt>
          <dd>
            <span className={suggestion.urgency !== requesterUrgency ? "differs" : undefined}>
              Requester said {URGENCY_LABELS[requesterUrgency]} · AI suggests {URGENCY_LABELS[suggestion.urgency]}
            </span>
          </dd>
          <dt>Summary</dt>
          <dd>{suggestion.summary}</dd>
        </dl>
      )}
      {canRetry && (
        <p>
          <button disabled={busy} onClick={onRetry}>
            {busy ? "Working…" : "Retry AI triage"}
          </button>
        </p>
      )}
    </div>
  );
}

const ChangedTag = () => <span className="tag">changed from AI</span>;

/** Read-only final values, marking any that differ from the AI suggestion. */
function TriageValuesList({ values, suggestion }: { values: TriageValues; suggestion: TriageValues | null }) {
  const changed = (field: TriageField) => suggestion !== null && suggestion[field] !== values[field];
  return (
    <dl className="facts">
      <dt>Category</dt>
      <dd>
        {CATEGORY_LABELS[values.category]} {changed("category") && <ChangedTag />}
      </dd>
      <dt>Urgency</dt>
      <dd>
        {URGENCY_LABELS[values.urgency]} {changed("urgency") && <ChangedTag />}
      </dd>
      <dt>Summary</dt>
      <dd>
        {values.summary} {changed("summary") && <ChangedTag />}
      </dd>
    </dl>
  );
}

/** Fields for setting the final triage, starting from the current final values, else the AI's. */
function TriageEditor({
  suggestion,
  current,
  busy,
  onSave,
  onCancel,
}: {
  suggestion: TriageValues | null;
  current: TriageValues | null;
  busy: boolean;
  onSave: (values: TriageValues) => void;
  onCancel?: () => void;
}) {
  const start = current ?? suggestion;
  const [category, setCategory] = useState<Category | "">(start?.category ?? "");
  const [urgency, setUrgency] = useState<Urgency | "">(start?.urgency ?? "");
  const [summary, setSummary] = useState(start?.summary ?? "");

  const values = category && urgency && summary.trim() ? { category, urgency, summary: summary.trim() } : null;
  // Re-saving the values already in place would change nothing, so it's disabled.
  const unchanged = values !== null && current !== null && TRIAGE_FIELDS.every((f) => values[f] === current[f]);
  const changed = (field: TriageField, value: string) => suggestion !== null && value !== "" && suggestion[field] !== value;

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (values && !unchanged) onSave(values);
      }}
    >
      <label>
        <span>Category {changed("category", category) && <ChangedTag />}</span>
        <select aria-label="Final category" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
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
      </label>
      <label>
        <span>Urgency {changed("urgency", urgency) && <ChangedTag />}</span>
        <select aria-label="Final urgency" value={urgency} onChange={(e) => setUrgency(e.target.value as Urgency)}>
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
      </label>
      <label>
        <span className="label-row">
          <span>Summary {changed("summary", summary.trim()) && <ChangedTag />}</span>
          <span className="muted small">
            {summary.length}/{SUMMARY_MAX_LENGTH}
          </span>
        </span>
        <textarea
          aria-label="Final summary"
          rows={2}
          value={summary}
          maxLength={SUMMARY_MAX_LENGTH}
          // The summary must be one line, so line breaks (typed or pasted) become spaces.
          onChange={(e) => setSummary(e.target.value.replace(/[\r\n]+/g, " "))}
        />
      </label>
      <p className="row">
        <button type="submit" disabled={busy || !values || unchanged}>
          Save final values
        </button>
        {onCancel && (
          <button type="button" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        )}
      </p>
    </form>
  );
}

/** Requester view: the final triage once Ops has reviewed it, otherwise the AI's suggestion. */
function TriageSummary({ request }: { request: RequestView }) {
  const { triage, accepted } = request;
  return (
    <section>
      <h2>Triage</h2>
      {accepted ? (
        <p>
          <span className="muted">Reviewed by Ops:</span>
          <br />
          {CATEGORY_LABELS[accepted.category]} · {URGENCY_LABELS[accepted.urgency]} urgency
          <br />
          {accepted.summary}
        </p>
      ) : triage.suggestion ? (
        <p>
          <span className="muted">AI suggestion, not yet reviewed by Ops:</span>
          <br />
          {CATEGORY_LABELS[triage.suggestion.category]} · {URGENCY_LABELS[triage.suggestion.urgency]} urgency
          <br />
          {triage.suggestion.summary}
        </p>
      ) : (
        <p className="muted">
          {triage.status === "failed" ? "Not triaged yet. The Ops team will review it." : "AI triage is running."}
        </p>
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
  sendBackNeedsUpdate,
  busy,
  onChange,
}: {
  from: Status;
  transitions: Status[];
  closeReasons: CloseReason[];
  /** The requester's move back to In progress, which needs their update. */
  sendBackNeedsUpdate: boolean;
  busy: boolean;
  onChange: (status: Status, closeReason?: CloseReason, note?: string) => void;
}) {
  const [closeReason, setCloseReason] = useState<CloseReason | "">("");
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const moves = transitions.filter((s) => s !== "closed" && !(s === "in_progress" && sendBackNeedsUpdate));
  const buttonLabel: Partial<Record<Status, string>> = {
    in_progress: from === "waiting_on_requester" ? "Resume work" : "Start work",
    waiting_on_requester: "Wait on requester",
    done: "Mark done",
  };
  // A requester's only way to close is cancelling their own request.
  const cancelOnly = closeReasons.length === 1 && closeReasons[0] === "cancelled_by_requester";

  return (
    <>
      {sendBackNeedsUpdate && <SendBackForm busy={busy} onSend={(note) => onChange("in_progress", undefined, note)} />}
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

/** For the requester while Ops waits on them: their update, which goes into the history. */
function SendBackForm({ busy, onSend }: { busy: boolean; onSend: (note: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (note.trim()) onSend(note.trim());
      }}
    >
      <p className="muted">The Ops team is waiting on you. Reply here to send the request back to them.</p>
      <label>
        <span className="label-row">
          <span>What&apos;s your update?</span>
          <span className="muted small">
            {note.length}/{UPDATE_NOTE_MAX_LENGTH}
          </span>
        </span>
        <textarea
          rows={4}
          value={note}
          maxLength={UPDATE_NOTE_MAX_LENGTH}
          required
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <p>
        <button type="submit" disabled={busy || !note.trim()}>
          Send back to Ops
        </button>
      </p>
    </form>
  );
}
