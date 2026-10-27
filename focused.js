// focused.js — Visualization 2: Focused trade-off scatterplot (DR2).
//
// One large scatterplot for the active metric pair (state.activePair).
// x/y position = the two chosen measures; color = sector (same as the SPLOM).
//
// Interactions (same grammar as the SPLOM so the views feel like one tool):
//   hover  → tooltip + linked ring in the SPLOM
//   drag   → brush; brushed colleges stay colored in every view
//   click  → pin / unpin a college (numbered + named here)
//   preset buttons / X-Y selects / double-click a SPLOM cell → change the pair
//
// Optional Pareto frontier: colleges that no other (visible) college beats on
// BOTH measures. It is a trade-off aid, not a ranking.

import { METRICS, METRIC_BY_KEY, SECTORS } from "./config.js";
import { state, on, isVisible, setBrushed, setHovered, togglePin } from "./state.js";

const MARGIN = { top: 18, right: 28, bottom: 54, left: 72 };
const R = 3.5;
const HIT_RADIUS = 8;
const DURATION = 500;

export function createFocused(container, data, scales, { tooltip, onMessage, onFrontier } = {}) {
  const byId = new Map(data.map((d) => [d.UNITID, d]));
  const sectorVar = Object.fromEntries(SECTORS.map((s) => [s.key, s.cssVar]));

  const svg = d3.select(container).append("svg").attr("class", "focused-svg").attr("role", "img");
  const plot = svg.append("g");
  const gGrid = plot.append("g").attr("class", "f-grid");
  const gAxisX = plot.append("g").attr("class", "axis");
  const gAxisY = plot.append("g").attr("class", "axis");
  const titleX = plot.append("text").attr("class", "axis-title f-title").attr("text-anchor", "middle");
  const titleY = plot.append("text").attr("class", "axis-title f-title").attr("text-anchor", "middle");
  const betterLabel = plot.append("text").attr("class", "better-label");
  const gDots = plot.append("g").attr("class", "f-dots");
  const gFrontier = plot.append("g").attr("class", "f-frontier");
  const gBrush = plot.append("g").attr("class", "f-brush");
  const gPins = plot.append("g").attr("class", "f-pins");
  const gHover = plot.append("g").attr("class", "f-hover");

  let width, height, x, y;
  let visible = data.filter(isVisible);
  let quadtree;
  let frontier = [];
  let frontierIds = new Set();
  let showFrontier = false;
  let activeBrush = null; // { extent }
  let gesture = null;
  let rafId = null;

  const keys = () => state.activePair;

  const brush = d3.brush()
    .on("start", onBrushStart)
    .on("brush", onBrush)
    .on("end", onBrushEnd);

  gBrush.call(brush)
    .on("mousemove", onPointerMove)
    .on("mouseleave", () => { setHovered(null); tooltip?.hide(); });

  // ----------------------------------------------------------------- layout
  function resize() {
    const prev = width ? [width, height] : null;
    const w = container.clientWidth;
    width = Math.max(320, w) - MARGIN.left - MARGIN.right;
    height = Math.round(Math.min(560, Math.max(320, width * 0.62)));
    svg.attr("width", width + MARGIN.left + MARGIN.right)
      .attr("height", height + MARGIN.top + MARGIN.bottom);
    plot.attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
    brush.extent([[0, 0], [width, height]]);
    gBrush.call(brush);
    if (activeBrush && prev) {
      const kx = width / prev[0], ky = height / prev[1];
      activeBrush.extent = activeBrush.extent.map(([a, b]) => [a * kx, b * ky]);
      gBrush.call(brush.move, activeBrush.extent);
    }
    update(false);
  }

  /** Redraws everything for the current pair, optionally animating positions. */
  function update(animate) {
    const [kx, ky] = keys();
    const mx = METRIC_BY_KEY[kx], my = METRIC_BY_KEY[ky];
    x = scales[kx].copy().range([0, width]);
    y = scales[ky].copy().range([height, 0]);

    svg.attr("aria-label", `Scatterplot of ${my.label} against ${mx.label}, one dot per college`);

    // gridlines + axes
    gGrid.selectAll("line.gx").data(x.ticks(8)).join("line").attr("class", "grid gx")
      .attr("x1", (t) => x(t)).attr("x2", (t) => x(t)).attr("y1", 0).attr("y2", height);
    gGrid.selectAll("line.gy").data(y.ticks(6)).join("line").attr("class", "grid gy")
      .attr("y1", (t) => y(t)).attr("y2", (t) => y(t)).attr("x1", 0).attr("x2", width);
    gAxisX.attr("transform", `translate(0,${height + 6})`)
      .call(d3.axisBottom(x).ticks(8).tickFormat(mx.tick).tickSizeOuter(0));
    gAxisY.attr("transform", "translate(-6,0)")
      .call(d3.axisLeft(y).ticks(6).tickFormat(my.tick).tickSizeOuter(0));
    titleX.attr("x", width / 2).attr("y", height + 46).text(mx.label);
    titleY.attr("transform", `translate(${-56},${height / 2}) rotate(-90)`).text(my.label);

    // "preferred corner" hint, e.g. low price + high earnings → top-left
    const left = mx.better === "low";
    const top = my.better === "high";
    betterLabel
      .attr("x", left ? 10 : width - 10).attr("y", top ? 18 : height - 10)
      .attr("text-anchor", left ? "start" : "end")
      .text(`${top ? (left ? "↖" : "↗") : (left ? "↙" : "↘")} preferred corner`);

    quadtree = d3.quadtree().x((d) => x(d[kx])).y((d) => y(d[ky])).addAll(visible);

    drawDots(animate);
    computeFrontier();
    drawFrontier(animate);
    updatePins(animate);
    updateHover();
  }

  // ------------------------------------------------------------------- dots
  function drawDots(animate = false) {
    const [kx, ky] = keys();
    const br = state.brushed;
    const isOn = (d) => !br || br.has(d.UNITID);
    // brushed dots last so they sit on top
    const rows = br ? [...visible].sort((a, b) => isOn(a) - isOn(b)) : visible;

    const dots = gDots.selectAll("circle").data(rows, (d) => d.UNITID)
      .join((enter) => enter.append("circle").attr("r", R)
        .attr("cx", (d) => x(d[kx])).attr("cy", (d) => y(d[ky])))
      .attr("class", (d) => (isOn(d) ? "f-dot" : "f-dot dim"))
      .style("fill", (d) => (isOn(d) ? `var(${sectorVar[d.sector]})` : null))
      .order();

    (animate ? dots.transition().duration(DURATION) : dots)
      .attr("cx", (d) => x(d[kx])).attr("cy", (d) => y(d[ky]));
  }

  // ------------------------------------------------------- Pareto frontier
  function computeFrontier() {
    const [kx, ky] = keys();
    const sx = METRIC_BY_KEY[kx].better === "high" ? 1 : -1;
    const sy = METRIC_BY_KEY[ky].better === "high" ? 1 : -1;
    // turn both measures into "bigger is better", sort by x (best first),
    // keep a college only if its y beats every college with a better x
    const pts = visible
      .map((d) => ({ d, a: sx * d[kx], b: sy * d[ky] }))
      .sort((p, q) => q.a - p.a || q.b - p.b);
    frontier = [];
    let best = -Infinity;
    for (const p of pts) {
      if (p.b > best) {
        frontier.push(p.d);
        best = p.b;
      }
    }
    frontierIds = new Set(frontier.map((d) => d.UNITID));
    onFrontier?.(showFrontier ? frontier : null);
  }

  function drawFrontier(animate = false) {
    const [kx, ky] = keys();
    const rows = showFrontier ? frontier : [];
    const line = d3.line().x((d) => x(d[kx])).y((d) => y(d[ky])).curve(d3.curveStepAfter);

    gFrontier.selectAll("path").data(showFrontier ? [frontier] : []).join("path")
      .attr("class", "frontier-line").attr("d", line);
    gFrontier.selectAll("circle").data(rows, (d) => d.UNITID).join("circle")
      .attr("class", "frontier-ring").attr("r", R + 2.5)
      .attr("cx", (d) => x(d[kx])).attr("cy", (d) => y(d[ky]));

    if (animate) {
      // fade in after the dots finish moving, so the line never floats
      gFrontier.interrupt().style("opacity", 0)
        .transition().delay(DURATION).duration(200).style("opacity", 1);
    }
  }

  function setShowFrontier(on) {
    showFrontier = on;
    computeFrontier();
    drawFrontier(false);
  }

  // ------------------------------------------------------ pins and hover
  function labelSide(px) {
    return px > width - 180 ? "left" : "right";
  }

  function updatePins(animate = false) {
    const [kx, ky] = keys();
    const rows = state.pinned.map((id) => byId.get(id)).filter(Boolean);
    const pins = gPins.selectAll("g.f-pin").data(rows, (d) => d.UNITID)
      .join((enter) => {
        const g = enter.append("g").attr("class", "f-pin")
          .attr("transform", (d) => `translate(${x(d[kx])},${y(d[ky])})`);
        g.append("circle").attr("class", "pin-ring").attr("r", 7);
        g.append("text").attr("class", "pin-label f-pin-label").attr("dy", "0.32em");
        return g;
      });
    pins.select("text")
      .attr("x", (d) => (labelSide(x(d[kx])) === "left" ? -11 : 11))
      .attr("text-anchor", (d) => (labelSide(x(d[kx])) === "left" ? "end" : "start"))
      .text((d) => `${state.pinned.indexOf(d.UNITID) + 1}  ${shorten(d.name)}`);
    (animate ? pins.transition().duration(DURATION) : pins)
      .attr("transform", (d) => `translate(${x(d[kx])},${y(d[ky])})`);
  }

  function updateHover() {
    const [kx, ky] = keys();
    const d = state.hovered ? byId.get(state.hovered) : null;
    gHover.selectAll("circle").data(d ? [d] : []).join("circle")
      .attr("class", "hover-ring").attr("r", R + 4)
      .attr("cx", (d) => x(d[kx])).attr("cy", (d) => y(d[ky]));
  }

  function onPointerMove(event) {
    const [mx, my] = d3.pointer(event, this);
    const hit = quadtree.find(mx, my, HIT_RADIUS) || null;
    // querySelector (not d3 .select) so the brush overlay keeps its own datum
    this.querySelector(".overlay").style.cursor = hit ? "pointer" : "";
    setHovered(hit ? hit.UNITID : null);
    if (!tooltip) return;
    if (hit) {
      tooltip.show(event, hit, showFrontier && frontierIds.has(hit.UNITID)
        ? "On the trade-off frontier for this pair" : "");
    } else {
      tooltip.hide();
    }
  }

  // --------------------------------------------------------------- brushing
  function idsInExtent([[x0, y0], [x1, y1]]) {
    const [kx, ky] = keys();
    const ids = new Set();
    for (const d of visible) {
      const px = x(d[kx]), py = y(d[ky]);
      if (px >= x0 && px <= x1 && py >= y0 && py <= y1) ids.add(d.UNITID);
    }
    return ids;
  }

  function onBrushStart(event) {
    if (!event.sourceEvent) return;
    gesture = { down: d3.pointer(event.sourceEvent, this), prev: activeBrush };
  }

  function onBrush(event) {
    if (!event.sourceEvent || !event.selection) return;
    const [[x0, y0], [x1, y1]] = event.selection;
    if (x1 - x0 < 3 && y1 - y0 < 3) return;
    const ids = idsInExtent(event.selection);
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => setBrushed(ids, "focused"));
  }

  function onBrushEnd(event) {
    if (!event.sourceEvent || !gesture) return;
    cancelAnimationFrame(rafId);
    let up;
    try { up = d3.pointer(event.sourceEvent, this); } catch { up = gesture.down; }
    const isClick = Math.hypot(up[0] - gesture.down[0], up[1] - gesture.down[1]) < 3;
    const prev = gesture.prev;
    gesture = null;

    if (isClick) {
      const hit = quadtree.find(up[0], up[1], HIT_RADIUS);
      if (hit) {
        if (!togglePin(hit.UNITID)) onMessage?.("You can pin up to 4 colleges. Unpin one first.");
        if (prev) {
          activeBrush = prev;
          gBrush.call(brush.move, prev.extent);
        }
        return;
      }
      if (!event.selection) {
        activeBrush = null;
        setBrushed(null);
      }
      return;
    }

    if (!event.selection) {
      activeBrush = null;
      setBrushed(null);
    } else {
      activeBrush = { extent: event.selection };
      setBrushed(idsInExtent(event.selection), "focused");
    }
  }

  function clearOwnBrush() {
    if (activeBrush) gBrush.call(brush.move, null);
    activeBrush = null;
  }

  function clearBrush() {
    clearOwnBrush();
    setBrushed(null);
  }

  // -------------------------------------------------------- state listeners
  on("pair", () => {
    // a rectangle drawn for the old pair means nothing on the new axes
    if (activeBrush) {
      clearOwnBrush();
      if (state.brushSource === "focused") setBrushed(null);
    }
    update(true);
  });

  on("filters", () => {
    visible = data.filter(isVisible);
    if (activeBrush) setBrushed(idsInExtent(activeBrush.extent), "focused");
    update(false);
  });

  on("brushed", () => {
    if (state.brushSource !== "focused" && activeBrush) clearOwnBrush();
    drawDots(false);
  });

  on("pinned", () => updatePins(false));
  on("hovered", updateHover);

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });

  resize();
  return { clearBrush, setShowFrontier };
}

function shorten(name, max = 34) {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}
