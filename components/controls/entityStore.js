"use client";

import { useSyncExternalStore } from "react";

// P5.6. The selected legal entity, as shared state.
//
// The entity picker in the header has been cosmetic since it shipped: it
// changed a label and nothing else, so every figure on every page was the
// whole organisation's whichever entity was selected. On a single-entity org
// that is invisible. The moment a second entity exists it is a wrong number
// presented as a filtered one — the worst shape a wrong number can take,
// because the reader specifically asked for a subset.
//
// A MODULE-LEVEL STORE rather than a React context, and that is the whole
// point of the design: DateRangeContext folds this value into the `query`
// string every page already appends to its fetch URLs. One place to change,
// and all fourteen pages start filtering — as opposed to threading a second
// context through fourteen components and getting thirteen of them.
//
// Not persisted. Which entity you are looking at is a "right now" question in
// the same way the date range is not: an entity selection restored on another
// device would silently relabel every figure. The picker defaults to the first
// entity on each load, which is also what the server treats as unfiltered when
// there is only one.

const listeners = new Set();
let snapshot = Object.freeze({ id: null });
const SERVER_SNAPSHOT = Object.freeze({ id: null });

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

export function setSelectedEntity(id) {
  if (snapshot.id === id) return;
  // A new frozen object, because useSyncExternalStore compares by reference
  // and a mutated one would never re-render.
  snapshot = Object.freeze({ id: id ?? null });
  for (const listener of listeners) listener();
}

export function useSelectedEntity() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Read outside React — used by DateRangeContext when building `query`. */
export function readSelectedEntity() {
  return snapshot.id;
}

export { subscribe as subscribeToEntity };
