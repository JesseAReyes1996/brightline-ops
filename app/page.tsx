"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import {
  CATEGORY_LABELS,
  DESCRIPTION_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  URGENCIES,
  URGENCY_LABELS,
  type RequestView,
  type Urgency,
} from "@/src/lib/domain";
import { api, errorMessage } from "./_components/api";
import { CharCount, OverLimitMessage, overLimitBy } from "./_components/CharLimit";
import { UserGate } from "./_components/UserGate";

export default function SubmitPage() {
  return (
    <>
      <h1>Submit a request</h1>
      <p className="muted">Tell the Ops team what you need. You can follow it under My requests.</p>
      <UserGate>{() => <SubmitForm />}</UserGate>
    </>
  );
}

function SubmitForm() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState<Urgency | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<RequestView | null>(null);
  const ids = useId();
  const titleOver = overLimitBy(title, TITLE_MAX_LENGTH) > 0;
  const descriptionOver = overLimitBy(description, DESCRIPTION_MAX_LENGTH) > 0;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (titleOver || descriptionOver) return;
    setSubmitting(true);
    setError(null);
    try {
      const { request } = await api<{ request: RequestView }>("/api/requests", {
        body: { title, description, urgency },
      });
      setSubmitted(request);
      setTitle("");
      setDescription("");
      setUrgency("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      {submitted && (
        <p className="notice">
          {submitted.triage.suggestion
            ? `Submitted. AI triage suggests ${CATEGORY_LABELS[submitted.triage.suggestion.category]}, ${URGENCY_LABELS[submitted.triage.suggestion.urgency].toLowerCase()} urgency. The Ops team will review it.`
            : "Submitted. The Ops team will review it."}
          <br />
          <Link href={`/requests/${submitted.id}`}>View “{submitted.title}”</Link>
        </p>
      )}
      {error && <p className="error">{error}</p>}
      <label>
        <span className="label-row">
          <span>Title</span>
          <CharCount value={title} max={TITLE_MAX_LENGTH} />
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          aria-invalid={titleOver}
          aria-describedby={titleOver ? `${ids}-title` : undefined}
        />
        <OverLimitMessage id={`${ids}-title`} value={title} max={TITLE_MAX_LENGTH} field="Title" />
      </label>
      <label>
        <span className="label-row">
          <span>Description</span>
          <CharCount value={description} max={DESCRIPTION_MAX_LENGTH} />
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          rows={6}
          aria-invalid={descriptionOver}
          aria-describedby={descriptionOver ? `${ids}-description` : undefined}
        />
        <OverLimitMessage
          id={`${ids}-description`}
          value={description}
          max={DESCRIPTION_MAX_LENGTH}
          field="Description"
        />
      </label>
      <label>
        How urgent is it?
        <select value={urgency} onChange={(e) => setUrgency(e.target.value as Urgency)} required>
          <option value="" disabled>
            Pick one…
          </option>
          {URGENCIES.map((u) => (
            <option key={u} value={u}>
              {URGENCY_LABELS[u]}
            </option>
          ))}
        </select>
      </label>
      <div>
        <button type="submit" disabled={submitting || titleOver || descriptionOver}>
          {submitting ? "Submitting and running AI triage…" : "Submit request"}
        </button>
      </div>
    </form>
  );
}
