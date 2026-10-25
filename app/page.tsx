"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { CATEGORY_LABELS, URGENCIES, URGENCY_LABELS, type RequestView, type Urgency } from "@/src/lib/domain";
import { api, errorMessage } from "./_components/api";
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

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
          Submitted: <Link href={`/requests/${submitted.id}`}>{submitted.title}</Link>
          <br />
          {submitted.triage.suggestion
            ? `AI triage suggests ${CATEGORY_LABELS[submitted.triage.suggestion.category]}, ${URGENCY_LABELS[submitted.triage.suggestion.urgency].toLowerCase()} urgency. The Ops team will review it.`
            : "AI triage didn't complete, so the Ops team will categorize it by hand."}
        </p>
      )}
      {error && <p className="error">{error}</p>}
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
      </label>
      <label>
        Description
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} required maxLength={5000} rows={6} />
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
        <button type="submit" disabled={submitting}>
          {submitting ? "Submitting and running AI triage…" : "Submit request"}
        </button>
      </div>
    </form>
  );
}
