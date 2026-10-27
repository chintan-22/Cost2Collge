// state.js — the small shared state that links all views.
// Views never talk to each other directly: they update state through the
// setters below and redraw when the matching event fires.

import { SECTORS, MAX_PINNED, SIZE_BUCKETS } from "./config.js";

export const state = {
  filters: {
    sectors: new Set(SECTORS.map((s) => s.key)),
    state: "All",
    size: "All", // "All" or a SIZE_BUCKETS key
  },
  brushed: null, // Set<UNITID> of colleges inside the current brush, or null
  brushSource: null, // which view owns the current brush
  pinned: [], // UNITIDs pinned for comparison (max MAX_PINNED)
  hovered: null, // UNITID under the pointer, or null
  activePair: ["net_price", "median_earnings_5yr"], // Viz 2 (focused scatterplot)
  selectedField: null, // Viz 4 (field-of-study view)
};

const listeners = {};

/** Subscribe to "filters" | "brushed" | "pinned" | "hovered" | "pair" | "field". */
export function on(event, fn) {
  (listeners[event] ||= []).push(fn);
}

function emit(event) {
  (listeners[event] || []).forEach((fn) => fn(state));
}

export function isVisible(d) {
  const f = state.filters;
  if (!f.sectors.has(d.sector)) return false;
  if (f.state !== "All" && d.state !== f.state) return false;
  if (f.size !== "All") {
    const bucket = SIZE_BUCKETS.find((b) => b.key === f.size);
    if (d.enrollment == null || !bucket.test(d.enrollment)) return false;
  }
  return true;
}

export function setFilters(partial) {
  Object.assign(state.filters, partial);
  emit("filters");
}

/**
 * source = the view that drew the brush ("splom" | "focused").
 * Only one brush exists at a time: other views clear their own brush
 * rectangle when a brush starts somewhere else.
 */
export function setBrushed(set, source = null) {
  state.brushed = set || null;
  state.brushSource = set ? source : null;
  emit("brushed");
}

export function setHovered(id) {
  if (state.hovered === id) return;
  state.hovered = id;
  emit("hovered");
}

/** Returns false when the pin list is already full. */
export function togglePin(id) {
  const i = state.pinned.indexOf(id);
  if (i >= 0) {
    state.pinned.splice(i, 1);
  } else {
    if (state.pinned.length >= MAX_PINNED) return false;
    state.pinned.push(id);
  }
  emit("pinned");
  return true;
}

export function clearPins() {
  state.pinned = [];
  emit("pinned");
}

export function setActivePair(pair) {
  state.activePair = pair;
  emit("pair");
}

export function setSelectedField(field) {
  state.selectedField = field;
  emit("field");
}
