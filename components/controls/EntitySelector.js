"use client";

import { useAuth, useOrganization } from "@clerk/nextjs";
import { useCallback, useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Icon, ENTITY_PATHS } from "@/components/icons";
import { markEntitiesResolved, setSelectedEntity } from "./entityStore";

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
  const { getToken, isLoaded: authLoaded } = useAuth();
  const { organization, isLoaded: orgLoaded } = useOrganization();

  const [entities, setEntities] = useState(null); // null = loading
  const [selectedId, setSelectedId] = useState(null);
  // Mirrors selectedId so the fetch continuation can read the current choice
  // without a functional updater — see the note in the effect below.
  const selectedIdRef = useRef(null);
  const [open, setOpen] = useState(false);

  // Through a ref rather than a dependency. Clerk hands back a NEW getToken on
  // hydration and on every ~60s rotation, and fetchEntities listed it — so the
  // effect below tore down and re-ran, fetching the entity list a second time.
  // Measured on the live deployment: two GET /legal-entities on every load,
  // warm as well as cold.
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const fetchEntities = useCallback(async () => {
    try {
      const token = await getTokenRef.current();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/legal-entities`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.legalEntities ?? [];
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    // Nothing goes out before Clerk has a session. It resolves getToken to null
    // until then, so the first call left as `Bearer null` and took a 401 — and
    // a 401 here is not the harmless wasted round trip it looks like. The
    // handler below cannot tell it apart from an empty list, so it marks the
    // entity RESOLVED with no id, which is the flag that releases all
    // seventeen of the overview's metric requests. They would run unscoped.
    //
    // For a single-entity org that is the same answer either way. For an org
    // with two GST registrations it is the consolidated figure — and the header
    // still falls back to the workspace name in that state, so it is at least
    // not labelled as one company. The gate removes the question.
    if (!authLoaded) return;
    let cancelled = false;
    fetchEntities().then((list) => {
      if (cancelled) return;
      setEntities(list);
      // The selection is read from a ref rather than through a functional
      // setState updater, and that is the whole point of this shape.
      //
      // setSelectedEntity notifies the module store that DateRangeProvider
      // subscribes to via useSyncExternalStore. Calling it from INSIDE an
      // updater — which is where it used to live — meant it ran while React
      // was invoking that updater, so the store told DateRangeProvider to
      // re-render in the middle of rendering EntitySelector. React reported it
      // as "Cannot update a component (DateRangeProvider) while rendering a
      // different component (EntitySelector)". An updater has to be pure; this
      // one had a side effect with a subscriber on the other end.
      const next = selectedIdRef.current ?? list[0]?.id ?? null;
      selectedIdRef.current = next;
      setSelectedId(next);
      // Published to the shared store, which DateRangeContext folds into the
      // query string every page appends. Without this the picker changes a
      // label and nothing else — which is what it did before P5.6. Now called
      // from the effect's async continuation, which is not a render.
      //
      // markEntitiesResolved rather than setSelectedEntity: it also flips the
      // store's `resolved` flag, which is what releases every page's held
      // fetch. Until it fires, pages wait instead of fetching unfiltered and
      // then refetching — see the header of entityStore.js.
      markEntitiesResolved(next);
    }).catch(() => {
      // A failed lookup is still an answer. Leaving `resolved` false would
      // hold every page's data fetch forever on a request that is not coming
      // back — a blank dashboard instead of an unfiltered one.
      if (!cancelled) markEntitiesResolved(selectedIdRef.current ?? null);
    });
    return () => {
      cancelled = true;
    };
    // Refetched when the active organisation changes — the entity list is
    // org-scoped, so keeping the previous org's entity on screen would label
    // the whole dashboard with the wrong company.
  }, [fetchEntities, organization?.id, authLoaded]);

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
                selectedIdRef.current = entity.id;
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
