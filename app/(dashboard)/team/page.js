"use client";

import { useOrganization } from "@clerk/nextjs";
import TopNav from "@/components/layout/TopNav";
import NoDataPanel from "@/components/ui/NoDataPanel";
import TableSkeleton from "@/components/ui/TableSkeleton";

// The member list is real, from Clerk. This page used to invent five colleagues
// with working-looking email addresses ("ananya@aara.co", "priya@sharmaassociates.in")
// and a role-permissions matrix describing access rules the app does not
// enforce anywhere. Inventing named people is a different category of wrong
// from inventing a number — it reads as a record of who has access to the
// company's finances.

function initialsFor(name, identifier) {
  const source = (name || identifier || "").trim();
  if (!source) return "?";
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || source[0].toUpperCase();
}

export default function TeamPage() {
  // Clerk owns membership; there is no CFOOS-side team table to read.
  const { organization, memberships, isLoaded } = useOrganization({ memberships: true });

  const rows = memberships?.data ?? [];
  const loading = !isLoaded || memberships?.isLoading;

  return (
    <>
      <TopNav
        title="Team & permissions"
        subtitle={organization?.name ? `Members of ${organization.name}` : "Manage who can see and act on what"}
      />

      <div className="flex flex-col gap-6">
        <div className="gcard p-5">
          <table className="table">
            <thead>
              <tr><th>Member</th><th>Role</th><th>Joined</th></tr>
            </thead>
            {loading ? (
              <TableSkeleton rows={3} columns={3} />
            ) : (
              <tbody>
                {rows.map((m) => {
                  const u = m.publicUserData;
                  const name = [u?.firstName, u?.lastName].filter(Boolean).join(" ");
                  return (
                    <tr key={m.id}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-[11px] font-semibold text-primary">
                            {initialsFor(name, u?.identifier)}
                          </div>
                          <div>
                            <div className="text-[13.5px] font-medium text-foreground">{name || u?.identifier || "Unknown"}</div>
                            <div className="text-xs text-muted-foreground">{u?.identifier}</div>
                          </div>
                        </div>
                      </td>
                      <td>{m.role?.replace("org:", "") ?? "member"}</td>
                      <td className="text-[12.5px] text-muted-foreground">
                        {m.createdAt ? new Date(m.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 ? (
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

        {/* The old permissions matrix described four roles with per-page rules
            ("CA (external): Reconciliation — Approve"). None of that is
            enforced anywhere in the codebase: every signed-in member of an org
            sees every page. Publishing an access-control table the system does
            not implement is a security claim, not a cosmetic one. */}
        <NoDataPanel
          title="Role permissions"
          reason="Per-page permissions aren't implemented — every member of this organisation can currently see every page and take every action. Roles shown above come from Clerk and control organisation management, not what CFOOS displays. Inviting and removing members is done from the account menu in the top-right."
        />
      </div>
    </>
  );
}
