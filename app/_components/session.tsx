"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "@/src/lib/domain";
import { api } from "./api";

interface Session {
  loading: boolean;
  error: string | null;
  /** The user picked in "Viewing as", or null if nobody is picked yet. */
  me: User | null;
  users: User[];
  userName: (id: string) => string;
  switchUser: (id: string) => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState({ loading: true, error: null as string | null, me: null as User | null, users: [] as User[] });

  useEffect(() => {
    Promise.all([api<{ user: User | null }>("/api/session"), api<{ users: User[] }>("/api/users")]).then(
      ([session, list]) => setState({ loading: false, error: null, me: session.user, users: list.users }),
      (err: Error) => setState({ loading: false, error: err.message, me: null, users: [] }),
    );
  }, []);

  const value = useMemo<Session>(() => {
    const byId = new Map(state.users.map((user) => [user.id, user]));
    return {
      ...state,
      userName: (id) => byId.get(id)?.name ?? id,
      switchUser: async (id) => {
        await api("/api/session", { body: { userId: id } });
        // Every page loads its data as the current user, so reloading is the
        // simplest way to make sure nothing from the previous user lingers.
        window.location.reload();
      },
    };
  }, [state]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside <SessionProvider>");
  return session;
}
