"use client";

import { useAuth, useOrganization } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Icon, ENTITY_PATHS } from "@/components/icons";
import { setSelectedEntity } from "./entityStore";

// The legal entity the numbers belong to — the GST-registered company, not the
// Clerk workspace.
//
// This used to render one of three invented names ("Aara Wellness Pvt Ltd",
// "Aara Retail (D2C)", "Aara Exports LLP") hardcoded from the design mockups,
// so the header confidently displayed a company that does not exist and has no
// relationship to the data below it. Nothing is invented here now: the names
// come from GET /legal-entities, and if none exists the Clerk organisation the
// user actually signed in to is used instead.

export default function EntitySelector({ onChange }) {
  const { getToken } = useAuth();
  const { organization, isLoaded: orgLoaded } = useOrganization();

  const [entities, setEntities] = useState(null); // null = loading
  const [selectedId, setSelectedId] = useState(null);
  const [open, setOpen] = useState(false);

  const fetchEntities = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/legal-entities`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.legalEntities ?? [];
    } catch {
      return [];
    }
  }, [getToken]);

  useEffect(() => {
    let cancelled = false;
    fetchEntities().then((list) => {
      if (cancelled) return;
      setEntities(list);
      setSelectedId((current) => {
        const next = current ?? list[0]?.id ?? null;
        // Published to the shared store, which DateRangeContext folds into the
        // query string every page appends. Without this the picker changes a
        // label and nothing else — which is what it did before P5.6.
        setSelectedEntity(next);
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // Refetched when the active organisation changes — the entity list is
    // org-scoped, so keeping the previous org's entity on screen would label
    // the whole dashboard with the wrong company.
  }, [fetchEntities, organization?.id]);

  const selected = entities?.find((e) => e.id === selectedId) ?? null;

  // Falls back to the workspace the user is actually signed in to, which is
  // still a real name. Only shows a neutral placeholder while genuinely
  // unknown — never a stand-in company.
  const label =
    selected?.name ??
    (entities !== null && orgLoaded ? (organization?.name ?? "No organisation") : "…");

  const canSwitch = (entities?.length ?? 0) > 1;

  const trigger = (
    <button
      type="button"
      className="inline-flex items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-md border border-border bg-card px-3 py-1.5 text-[13px] text-foreground"
      style={{ maxWidth: 240 }}
      // A single entity is not a choice. Rendering a dropdown that opens onto
      // one option implies there is something to switch to.
      disabled={!canSwitch}
      title={label}
    >
      <Icon paths={ENTITY_PATHS} size={15} strokeWidth={1.6} className="mr-1.5" />
      <span className="overflow-hidden text-ellipsis">{label}</span>
    </button>
  );

  if (!canSwitch) return trigger;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-10 overflow-hidden rounded-md border border-border bg-card py-1 shadow-raised"
          style={{ minWidth: 240 }}
        >
          {entities.map((entity) => (
            <div
              key={entity.id}
              className={`cursor-pointer px-3.5 py-2.5 text-[13px] ${
                entity.id === selectedId ? "bg-primary-soft text-primary" : "text-foreground hover:bg-muted"
              }`}
              onClick={() => {
                setSelectedId(entity.id);
                setSelectedEntity(entity.id);
                setOpen(false);
                onChange?.(entity);
              }}
            >
              <div>{entity.name}</div>
              {entity.gstin ? (
                <div className="mt-0.5 text-[11px] text-muted-foreground">{entity.gstin}</div>
              ) : null}
            </div>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
