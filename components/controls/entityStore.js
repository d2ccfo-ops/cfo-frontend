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

// `resolved` exists because `id: null` had to mean two different things and
// could not: "no entity is selected" and "we have not asked yet". Pages read
// the id straight into their fetch query, so before GET /legal-entities came
// back every page fetched UNFILTERED, then fetched again the moment the entity
// arrived.
//
// Measured on the live deployment: the overview fired seventeen unfiltered
// metric requests, GET /legal-entities queued BEHIND them and took 4563ms, and
// when it finally landed all seventeen fired again with ?legalEntityId= — so
// the entity lookup was delayed by the very requests that needed it, and the
// server spent 4.5 seconds computing results the browser had already aborted.
// Aborting a fetch does not stop Express finishing the work.
//
// DateRangeContext already had exactly this guard for the stored date range
// (`ready: hydrated`, and the comment there describes the same failure). This
// gives the entity the same one, so the fix reaches all fourteen pages through
// the flag they already wait on.
const listeners = new Set();
let snapshot = Object.freeze({ id: null, resolved: false });
// The server render never has an entity and never will — waiting for one would
// hold the first paint forever.
const SERVER_SNAPSHOT = Object.freeze({ id: null, resolved: true });

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
  snapshot = Object.freeze({ id: id ?? null, resolved: snapshot.resolved });
  for (const listener of listeners) listener();
}

/**
 * Called once GET /legal-entities has answered — including when it answers
 * with nothing, or fails. Both are real answers: "this org has no entities" is
 * a resolved state, and a failed lookup must release the pages rather than
 * leave every dashboard waiting on a request that is never coming back.
 */
export function markEntitiesResolved(id) {
  const next = id ?? null;
  if (snapshot.resolved && snapshot.id === next) return;
  snapshot = Object.freeze({ id: next, resolved: true });
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
