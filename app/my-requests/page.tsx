"use client";

import Link from "next/link";
import type { RequestView } from "@/src/lib/domain";
import { useApi } from "../_components/api";
import { formatDateTime, StatusBadge } from "../_components/format";
import { useSession } from "../_components/session";
import { UserGate } from "../_components/UserGate";

export default function MyRequestsPage() {
  return (
    <>
      <h1>My requests</h1>
      <UserGate>{() => <MyRequests />}</UserGate>
    </>
  );
}

function MyRequests() {
  const { userName } = useSession();
  const { data, error } = useApi<{ requests: RequestView[] }>("/api/requests?view=mine");

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;
  if (data.requests.length === 0) {
    return (
      <p>
        You haven&apos;t submitted any requests yet. <Link href="/">Submit one</Link>.
      </p>
    );
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Title</th>
          <th>Status</th>
          <th>Assignee</th>
          <th>Submitted</th>
        </tr>
      </thead>
      <tbody>
        {data.requests.map((r) => (
          <tr key={r.id}>
            <td>
              <Link href={`/requests/${r.id}`}>{r.title}</Link>
            </td>
            <td>
              <StatusBadge status={r.status} closeReason={r.closeReason} />
            </td>
            <td>{r.assigneeId ? userName(r.assigneeId) : <span className="muted">Not assigned yet</span>}</td>
            <td>{formatDateTime(r.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
