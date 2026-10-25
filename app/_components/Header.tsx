"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ROLE_LABELS } from "@/src/lib/domain";
import { isOps } from "@/src/lib/permissions";
import { useSession } from "./session";

export function Header() {
  const { me, users, loading, switchUser } = useSession();
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Submit a request" },
    { href: "/my-requests", label: "My requests" },
    ...(me && isOps(me) ? [{ href: "/ops", label: "Ops queue" }] : []),
  ];

  return (
    <header className="site-header">
      <strong>Brightline Ops</strong>
      <nav>
        {links.map((link) => (
          <Link key={link.href} href={link.href} className={pathname === link.href ? "active" : undefined}>
            {link.label}
          </Link>
        ))}
      </nav>
      <label className="viewing-as">
        Viewing as{" "}
        <select value={me?.id ?? ""} disabled={loading} onChange={(e) => void switchUser(e.target.value)}>
          {!me && (
            <option value="" disabled>
              Pick a user…
            </option>
          )}
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} ({ROLE_LABELS[user.role]})
            </option>
          ))}
        </select>{" "}
        <small className="muted">(stand-in for SSO)</small>
      </label>
    </header>
  );
}
