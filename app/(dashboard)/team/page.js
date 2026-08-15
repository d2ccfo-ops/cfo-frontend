"use client";

import { useAuth, useOrganization } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import TopNav from "@/components/layout/TopNav";
import NoDataPanel from "@/components/ui/NoDataPanel";
import TableSkeleton from "@/components/ui/TableSkeleton";

// P5.1. Roles now mean something, so this page can too.
//
// Two things this page has been wrong about before, and neither may come back:
//
//   It once invented five colleagues with working-looking email addresses
//   ("ananya@aara.co", "priya@sharmaassociates.in"). Inventing named people is
//   a different category of wrong from inventing a number — it reads as a
//   record of who has access to the company's finances.
//
//   It then published a role-permissions matrix the app did not enforce
//   anywhere. An access-control table a system does not implement is a
//   security claim, not a cosmetic one.
//
// What is shown now is read from GET /organization/members — the Membership
// rows the backend actually decides on — and every permission line below is
// the policy in cfo-backend/src/middleware/rbac.ts, not an aspiration.

const ROLE_LABEL = {
  OWNER: "Owner",
  ADMIN: "Admin",
  FINANCE_MANAGER: "Finance manager",
  ACCOUNTANT: "Accountant",
  ANALYST: "Analyst",
  VIEWER: "Viewer",
  EXTERNAL_CA: "External CA",
  MEMBER: "Member (legacy)",
};

// Mirrors middleware/rbac.ts. Kept short deliberately: a matrix nobody can
// hold in their head is one people widen to make a bug go away.
const WHAT_EACH_ROLE_CAN_DO = [
  ["Owner", "Everything, including making someone else an owner."],
  ["Admin", "Everything except transferring ownership. Manages connections and members."],
  ["Finance manager", "Acts on findings: write-offs, anomaly status, org settings, resyncs. Cannot touch credentials."],
  ["Accountant", "Enters and restamps product costs. Reads everything else."],
  ["Analyst", "Reads everything, runs what-if scenarios, asks the AI. Changes nothing."],
  ["Viewer", "Reads everything. Nothing else."],
  ["External CA", "Reads everything. Cannot spend anything — not even a model call."],
];

function initialsFor(email) {
  const parts = (email || "").split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export default function TeamPage() {
  const { getToken } = useAuth();
  const { organization } = useOrganization();
  const api = process.env.NEXT_PUBLIC_API_URL;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${api}/organization/members`, {
        headers: { Authorization: `Bearer ${await getToken()}` },
      });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      setData(await res.json());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [api, getToken]);

  useEffect(() => {
    // Wrapped in an async IIFE: React 19's lint rejects a setState-triggering
    // call made synchronously in an effect body.
    let cancelled = false;
    (async () => {
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function changeRole(memberId, role) {
    setSaving(memberId);
    setError(null);
    try {
      const res = await fetch(`${api}/organization/members/${memberId}/role`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${await getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        // The server's own message, not a generic one: "this is the
        // organisation's only owner" and "you cannot change your own role" are
        // different problems with different fixes.
        setError(body?.message ?? `Could not change the role (HTTP ${res.status}).`);
        return;
      }
      await load();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(null);
    }
  }

  const members = data?.members ?? [];
  const canManage = data?.canManage === true;

  return (
    <>
      <TopNav
        title="Team & permissions"
        subtitle={organization?.name ? `Members of ${organization.name}` : "Who can see and act on what"}
      />

      <div className="flex flex-col gap-6">
        {failed ? (
          <NoDataPanel
            tone="error"
            title="Could not reach the server"
            reason="The member list could not be loaded. This is a connection failure, not an empty organisation."
          />
        ) : null}

        {error ? (
          <div className="rounded-md bg-destructive-soft px-3 py-2.5 text-[13px] text-destructive" role="alert">
            {error}
          </div>
        ) : null}

        <div className="gcard p-5">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Role</th>
                  <th>Joined</th>
                </tr>
              </thead>
              {loading ? (
                <TableSkeleton rows={3} columns={3} />
              ) : (
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-[11px] font-semibold text-primary">
                            {initialsFor(m.email)}
                          </div>
                          <div>
                            <div className="text-[13.5px] font-medium text-foreground">
                              {m.email}
                              {m.isYou ? <span className="ml-1.5 text-[11px] text-muted-foreground">(you)</span> : null}
                            </div>
                            {/* A row still carrying the legacy MEMBER shows what
                                is in the database AND what it resolves to.
                                Silently relabelling it would hide the fact from
                                whoever is auditing permissions. */}
                            {m.role === "MEMBER" ? (
                              <div className="text-xs text-muted-foreground">
                                stored as MEMBER, treated as {ROLE_LABEL[m.effectiveRole]}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td>
                        {canManage && !m.isYou ? (
                          <select
                            className="input"
                            style={{ maxWidth: 190 }}
                            value={m.effectiveRole}
                            disabled={saving === m.id}
                            onChange={(e) => changeRole(m.id, e.target.value)}
                          >
                            {(data?.roles ?? []).map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABEL[r] ?? r}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-[13px] text-foreground">{ROLE_LABEL[m.effectiveRole] ?? m.effectiveRole}</span>
                        )}
                      </td>
                      <td className="text-[12.5px] text-muted-foreground">
                        {m.createdAt
                          ? new Date(m.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                          : "—"}
                      </td>
                    </tr>
                  ))}
                  {members.length === 0 && !failed ? (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-muted-foreground">
                        No members found for this organisation.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              )}
            </table>
          </div>

          {!loading && !canManage ? (
            <p className="mt-4 text-[12.5px] text-muted-foreground">
              Your role ({ROLE_LABEL[data?.yourRole] ?? data?.yourRole}) can see this list but not change it. Roles are
              managed by an owner or admin.
            </p>
          ) : null}
          {!loading && canManage ? (
            <p className="mt-4 text-[12.5px] text-muted-foreground">
              You cannot change your own role — ask another owner or admin. Inviting and removing members is done from
              the account menu in the top-right.
            </p>
          ) : null}
        </div>

        <div className="gcard p-5">
          <div className="mb-1 text-base font-medium text-foreground">What each role can do</div>
          <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">
            These are enforced on the server, on every request. A role that cannot do something gets a 403 explaining
            which roles can, and the refusal is written to the audit log.
          </p>
          <div className="flex flex-col gap-2">
            {WHAT_EACH_ROLE_CAN_DO.map(([role, what]) => (
              <div key={role} className="flex flex-col gap-0.5 border-b border-border pb-2 last:border-0 sm:flex-row sm:gap-3">
                <div className="w-40 flex-none text-[13px] font-medium text-foreground">{role}</div>
                <div className="text-[13px] leading-relaxed text-muted-foreground">{what}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
