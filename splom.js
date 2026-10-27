// splom.js — Visualization 1: Scatterplot Matrix (DR1 multivariate overview).
//
// Layout: 4×4 grid. Column j puts METRICS[j] on x, row i puts METRICS[i] on y.
// Off-diagonal cells: one dot per college, colored by sector.
// Diagonal cells: histogram of that metric (brushed subset overlaid).
//
// Rendering: dots are drawn on a single <canvas> (≈23k dots stay fast while
// brushing); axes, histograms, brushes, pins and hover rings are SVG on top.
//
// Interactions:
//   hover  → tooltip + the same college ringed in every cell (linked)
//   drag   → rectangular brush in any cell; brushed colleges stay colored in
//            all cells, everything else is greyed out
//   click  → pin / unpin a college (up to MAX_PINNED), shown as numbered rings

import { METRICS, SECTORS } from "./config.js";
import { state, on, isVisible, setBrushed, setHovered, togglePin, setActivePair } from "./state.js";

const GAP = 12;
const PAD = { top: 6, right: 6, bottom: 44, left: 58 };
const R = 2.2; // dot radius
const HIT_RADIUS = 7; // pointer pick radius (bigger than the dot)
const N = METRICS.length;

export function createSplom(container, data, scales, { tooltip, onMessage } = {}) {
  const byId = new Map(data.map((d) => [d.UNITID, d]));

  const wrap = d3.select(container).append("div").attr("class", "splom-wrap");
  const canvas = wrap.append("canvas").attr("class", "splom-canvas");
  const svg = wrap.append("svg").attr("class", "splom-svg").attr("role", "img")
    .attr("aria-label", "Scatterplot matrix of net price, median debt, completion rate and earnings for each college");

  let size, totalW, totalH, xs, ys, cells, offCells, diagCells;
  let quadtrees = new Map();
  let visible = data.filter(isVisible);
  let activeBrush = null; // { row, col, node, extent }
  let gesture = null;
  let rafId = null;

  const brush = d3.brush()
    .on("start", onBrushStart)
    .on("brush", onBrush)
    .on("end", onBrushEnd);

  // ---------------------------------------------------------------- layout
  function render() {
    const width = container.clientWidth;
    const prevSize = size;
    size = Math.floor((width - PAD.left - PAD.right - GAP * (N - 1)) / N);
    size = Math.max(110, Math.min(220, size));
    totalW = PAD.left + PAD.right + size * N + GAP * (N - 1);
    totalH = PAD.top + PAD.bottom + size * N + GAP * (N - 1);

    xs = METRICS.map((m) => scales[m.key].copy().range([0, size]));
    ys = METRICS.map((m) => scales[m.key].copy().range([size, 0]));

    cells = d3.cross(d3.range(N), d3.range(N)).map(([row, col]) => ({
      row, col, diag: row === col,
      x: PAD.left + col * (size + GAP),
      y: PAD.top + row * (size + GAP),
    }));
    offCells = cells.filter((c) => !c.diag);
    diagCells = cells.filter((c) => c.diag);

    const dpr = window.devicePixelRatio || 1;
    canvas.attr("width", totalW * dpr).attr("height", totalH * dpr)
      .style("width", `${totalW}px`).style("height", `${totalH}px`);
    svg.attr("width", totalW).attr("height", totalH).attr("viewBox", `0 0 ${totalW} ${totalH}`);
    svg.selectAll("*").remove();

    drawFrame();
    drawHistogramsBase();
    svg.append("rect").attr("class", "active-cell").attr("rx", 4);

    // brushes (off-diagonal only)
    brush.extent([[0, 0], [size, size]]);
    svg.append("g").attr("class", "brushes")
      .selectAll("g.cell-brush").data(offCells).join("g")
      .attr("class", "cell-brush")
      .attr("transform", (c) => `translate(${c.x},${c.y})`)
      .call(brush)
      .on("mousemove", onPointerMove)
      .on("mouseleave", () => hideHover())
      // double-click a cell to open that pair in the focused scatterplot (Viz 2)
      .on("dblclick", (event, c) => setActivePair([METRICS[c.col].key, METRICS[c.row].key]));

    svg.append("g").attr("class", "pin-layer");
    svg.append("g").attr("class", "hover-layer");

    // keep an existing brush across resizes by rescaling its extent
    if (activeBrush && prevSize) {
      const k = size / prevSize;
      const node = svg.selectAll("g.cell-brush").filter((c) => c.row === activeBrush.row && c.col === activeBrush.col).node();
      activeBrush.node = node;
      activeBrush.extent = activeBrush.extent.map(([x, y]) => [x * k, y * k]);
      d3.select(node).call(brush.move, activeBrush.extent);
    }

    rebuildQuadtrees();
    drawDots();
    updateHistograms();
    updatePins();
    updateHover();
    updateActiveCell();
  }

  // outline the cell whose metric pair is shown in the focused scatterplot
  function updateActiveCell() {
    const [kx, ky] = state.activePair;
    const col = METRICS.findIndex((m) => m.key === kx);
    const row = METRICS.findIndex((m) => m.key === ky);
    const c = offCells.find((k) => k.row === row && k.col === col);
    svg.select("rect.active-cell")
      .style("display", c ? null : "none")
      .attr("x", c ? c.x - 3 : 0).attr("y", c ? c.y - 3 : 0)
      .attr("width", size + 6).attr("height", size + 6);
  }

  function drawFrame() {
    const frame = svg.append("g").attr("class", "frame");

    // cell backgrounds + light gridlines
    const cg = frame.selectAll("g.cell").data(cells).join("g")
      .attr("class", (c) => `cell${c.diag ? " diag" : ""}`)
      .attr("transform", (c) => `translate(${c.x},${c.y})`);
    cg.append("rect").attr("class", "cell-bg").attr("width", size).attr("height", size);
    cg.filter((c) => !c.diag).each(function (c) {
      const g = d3.select(this);
      g.selectAll("line.gx").data(xs[c.col].ticks(4)).join("line").attr("class", "grid")
        .attr("x1", (t) => xs[c.col](t)).attr("x2", (t) => xs[c.col](t)).attr("y1", 0).attr("y2", size);
      g.selectAll("line.gy").data(ys[c.row].ticks(4)).join("line").attr("class", "grid")
        .attr("y1", (t) => ys[c.row](t)).attr("y2", (t) => ys[c.row](t)).attr("x1", 0).attr("x2", size);
    });

    // metric name on each diagonal cell (identifies the row and column)
    frame.selectAll("text.diag-label").data(diagCells).join("text")
      .attr("class", "diag-label")
      .attr("x", (c) => c.x + 8).attr("y", (c) => c.y + 17)
      .text((c) => METRICS[c.row].label);

    // x axes under the bottom row, y axes left of the first column
    const bottom = PAD.top + N * size + (N - 1) * GAP;
    METRICS.forEach((m, i) => {
      const x = PAD.left + i * (size + GAP);
      frame.append("g").attr("class", "axis")
        .attr("transform", `translate(${x},${bottom + 4})`)
        .call(d3.axisBottom(xs[i]).ticks(4).tickFormat(m.tick).tickSizeOuter(0));
      frame.append("text").attr("class", "axis-title")
        .attr("x", x + size / 2).attr("y", bottom + 38).attr("text-anchor", "middle")
        .text(m.label);
      frame.append("g").attr("class", "axis")
        .attr("transform", `translate(${PAD.left - 4},${PAD.top + i * (size + GAP)})`)
        .call(d3.axisLeft(ys[i]).ticks(4).tickFormat(m.tick).tickSizeOuter(0));
    });
  }

  // ---------------------------------------------------------- histograms
  let histY = [];
  function binsFor(i, rows) {
    const x = xs[i];
    const [lo, hi] = x.domain();
    const key = METRICS[i].key;
    return d3.bin()
      .domain([lo, hi])
      .thresholds(x.ticks(20))
      .value((d) => Math.min(Math.max(d[key], lo), hi))(rows);
  }

  function drawHistogramsBase() {
    svg.append("g").attr("class", "hists")
      .selectAll("g.hist").data(diagCells).join("g")
      .attr("class", "hist")
      .attr("transform", (c) => `translate(${c.x},${c.y})`)
      .call((g) => {
        g.append("g").attr("class", "hist-base");
        g.append("g").attr("class", "hist-sel");
        g.append("line").attr("class", "hist-hover").attr("y1", 24).attr("y2", size).style("display", "none");
      });
  }

  function updateHistograms() {
    const br = state.brushed;
    const selected = br ? visible.filter((d) => br.has(d.UNITID)) : [];
    svg.selectAll("g.hist").each(function (c) {
      const i = c.row;
      const all = binsFor(i, visible);
      const sel = binsFor(i, selected);
      const y = d3.scaleLinear().domain([0, d3.max(all, (b) => b.length) || 1]).range([size, 26]);
      histY[i] = y;
      const g = d3.select(this);
      const bar = (sel) => sel
        .attr("x", (b) => xs[i](b.x0) + 1)
        .attr("width", (b) => Math.max(0, xs[i](b.x1) - xs[i](b.x0) - 2))
        .attr("y", (b) => y(b.length))
        .attr("height", (b) => size - y(b.length))
        .attr("rx", 1.5);
      g.select(".hist-base").selectAll("rect").data(all).join("rect")
        .attr("class", br ? "bar dim" : "bar").call(bar);
      g.select(".hist-sel").selectAll("rect").data(br ? sel : []).join("rect")
        .attr("class", "bar sel").call(bar);
    });
  }

  // ---------------------------------------------------------------- dots
  function cssVar(name) {
    return getComputedStyle(container).getPropertyValue(name).trim();
  }

  function drawDots() {
    const ctx = canvas.node().getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, totalW, totalH);

    const br = state.brushed;
    const back = br ? visible.filter((d) => !br.has(d.UNITID)) : [];
    const front = br ? visible.filter((d) => br.has(d.UNITID)) : visible;
    const groups = SECTORS.map((s) => ({ color: cssVar(s.cssVar), rows: front.filter((d) => d.sector === s.key) }));
    const dim = cssVar("--point-dim");

    for (const c of offCells) {
      const fx = xs[c.col], fy = ys[c.row];
      const kx = METRICS[c.col].key, ky = METRICS[c.row].key;
      const dots = (rows) => {
        ctx.beginPath();
        for (const d of rows) {
          const x = fx(d[kx]), y = fy(d[ky]);
          ctx.moveTo(x + R, y);
          ctx.arc(x, y, R, 0, 2 * Math.PI);
        }
        ctx.fill();
      };
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.beginPath();
      ctx.rect(0, 0, size, size);
      ctx.clip();
      if (back.length) {
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = dim;
        dots(back);
      }
      ctx.globalAlpha = br ? 0.9 : 0.6;
      for (const g of groups) {
        ctx.fillStyle = g.color;
        dots(g.rows);
      }
      ctx.restore();
    }
  }

  function rebuildQuadtrees() {
    quadtrees = new Map();
    for (const c of offCells) {
      const fx = xs[c.col], fy = ys[c.row];
      const kx = METRICS[c.col].key, ky = METRICS[c.row].key;
      quadtrees.set(`${c.row}-${c.col}`,
        d3.quadtree().x((d) => fx(d[kx])).y((d) => fy(d[ky])).addAll(visible));
    }
  }

  function pick(c, mx, my) {
    return quadtrees.get(`${c.row}-${c.col}`).find(mx, my, HIT_RADIUS) || null;
  }

  // ----------------------------------------------------- pins and hover
  function placeMarks(layerClass, rows, enterFn) {
    const layer = svg.select(`g.${layerClass}`);
    layer.selectAll("g.cell-marks").data(offCells).join("g")
      .attr("class", "cell-marks")
      .attr("transform", (c) => `translate(${c.x},${c.y})`)
      .each(function (c) {
        const kx = METRICS[c.col].key, ky = METRICS[c.row].key;
        d3.select(this).selectAll("g.mark").data(rows, (d) => d.UNITID)
          .join((enter) => enterFn(enter.append("g").attr("class", "mark")))
          .attr("transform", (d) => `translate(${xs[c.col](d[kx])},${ys[c.row](d[ky])})`);
      });
  }

  function updatePins() {
    const rows = state.pinned.map((id) => byId.get(id)).filter(Boolean);
    placeMarks("pin-layer", rows, (g) => {
      g.append("circle").attr("class", "pin-ring").attr("r", 5.5);
      g.append("text").attr("class", "pin-label").attr("x", 7).attr("y", -6);
      return g;
    });
    svg.selectAll("g.pin-layer text.pin-label").text((d) => state.pinned.indexOf(d.UNITID) + 1);
  }

  function updateHover() {
    const d = state.hovered ? byId.get(state.hovered) : null;
    placeMarks("hover-layer", d ? [d] : [], (g) => {
      g.append("circle").attr("class", "hover-ring").attr("r", 6);
      return g;
    });
    svg.selectAll("g.hist").each(function (c) {
      const line = d3.select(this).select(".hist-hover");
      if (!d) return line.style("display", "none");
      const x = xs[c.row](d[METRICS[c.row].key]);
      line.style("display", null).attr("x1", x).attr("x2", x);
    });
  }

  function onPointerMove(event, c) {
    const [mx, my] = d3.pointer(event, this);
    const hit = pick(c, mx, my);
    // querySelector (not d3 .select) so the brush overlay keeps its own datum
    this.querySelector(".overlay").style.cursor = hit ? "pointer" : "";
    setHovered(hit ? hit.UNITID : null);
    if (tooltip) hit ? tooltip.show(event, hit) : tooltip.hide();
  }

  function hideHover() {
    setHovered(null);
    if (tooltip) tooltip.hide();
  }

  // ------------------------------------------------------------- brushing
  function idsInExtent(c, [[x0, y0], [x1, y1]]) {
    const fx = xs[c.col], fy = ys[c.row];
    const kx = METRICS[c.col].key, ky = METRICS[c.row].key;
    const ids = new Set();
    for (const d of visible) {
      const x = fx(d[kx]), y = fy(d[ky]);
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) ids.add(d.UNITID);
    }
    return ids;
  }

  function onBrushStart(event, c) {
    if (!event.sourceEvent) return; // ignore programmatic moves
    gesture = { down: d3.pointer(event.sourceEvent, this), prev: activeBrush };
    // only one brush at a time: clear the one in another cell
    if (activeBrush && activeBrush.node !== this) {
      d3.select(activeBrush.node).call(brush.move, null);
    }
  }

  function onBrush(event, c) {
    if (!event.sourceEvent || !event.selection) return;
    const [[x0, y0], [x1, y1]] = event.selection;
    if (x1 - x0 < 3 && y1 - y0 < 3) return; // still a click, not a drag
    const ids = idsInExtent(c, event.selection);
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => setBrushed(ids, "splom"));
  }

  function onBrushEnd(event, c) {
    if (!event.sourceEvent || !gesture) return;
    cancelAnimationFrame(rafId);
    let up;
    try { up = d3.pointer(event.sourceEvent, this); } catch { up = gesture.down; }
    const isClick = Math.hypot(up[0] - gesture.down[0], up[1] - gesture.down[1]) < 3;
    const prev = gesture.prev;
    gesture = null;

    if (isClick) {
      const hit = pick(c, up[0], up[1]);
      if (hit) {
        if (!togglePin(hit.UNITID) && onMessage) onMessage("You can pin up to 4 colleges. Unpin one first.");
        // a click shouldn't wipe out the brush the user already drew
        if (prev) {
          activeBrush = prev;
          d3.select(prev.node).call(brush.move, prev.extent);
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
      activeBrush = { row: c.row, col: c.col, node: this, extent: event.selection };
      setBrushed(idsInExtent(c, event.selection), "splom");
    }
  }

  /** Removes the brush from the matrix (used by the Reset button). */
  function clearBrush() {
    if (activeBrush) d3.select(activeBrush.node).call(brush.move, null);
    activeBrush = null;
    setBrushed(null);
  }

  // ------------------------------------------------------ state listeners
  on("filters", () => {
    visible = data.filter(isVisible);
    rebuildQuadtrees();
    if (activeBrush) {
      const c = offCells.find((k) => k.row === activeBrush.row && k.col === activeBrush.col);
      setBrushed(idsInExtent(c, activeBrush.extent), "splom"); // triggers redraw
    } else {
      drawDots();
      updateHistograms();
    }
  });
  on("brushed", () => {
    // a brush drawn in another view replaces ours: remove our rectangle
    if (state.brushSource !== "splom" && activeBrush) {
      d3.select(activeBrush.node).call(brush.move, null);
      activeBrush = null;
    }
    drawDots();
    updateHistograms();
  });
  on("pair", updateActiveCell);
  on("pinned", updatePins);
  on("hovered", updateHover);

  // redraw on resize and when the OS light/dark theme flips
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 150);
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", drawDots);

  render();
  return { render, clearBrush };
}
