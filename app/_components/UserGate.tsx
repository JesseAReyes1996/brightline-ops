"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { User } from "@/src/lib/domain";
import { isOps } from "@/src/lib/permissions";
import { useSession } from "./session";

/** "Loading…", plus an explanation if it takes long enough to look stuck. */
function SessionLoading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 3000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <p className="muted">
      Loading…
      {slow && " Still starting up. On the very first run the server downloads MongoDB, which takes about a minute; progress is shown in the terminal."}
    </p>
  );
}

/**
 * Renders `children` with the current user once one is picked. This only
 * decides what to show; the API enforces the same rules on every call.
 */
export function UserGate({ opsOnly = false, children }: { opsOnly?: boolean; children: (me: User) => ReactNode }) {
  const { loading, error, me } = useSession();
  if (loading) return <SessionLoading />;
  if (error) return <p className="error">{error}</p>;
  if (!me) {
    return (
      <p>
        Pick a user from <strong>Viewing as</strong> in the header to continue.
      </p>
    );
  }
  if (opsOnly && !isOps(me)) return <p>This page is only for the Ops team.</p>;
  return <>{children(me)}</>;
}
