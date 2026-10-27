// compare.js — Visualization 3: Aligned college comparison (DR3).
//
// One row per metric, each with its own labeled horizontal scale (the same
// domains as the SPLOM). Each pinned college is a numbered dot on every row,
// so the same college can be compared precisely across metrics without
// collapsing them into a single score.
//
// Peer reference: the grey band is the middle 50% (25th–75th percentile) of
// the colleges that match the current filters; the dark tick is their median.
// A value table under the chart gives the exact numbers.

import { METRICS } from "./config.js";
import { state, on, isVisible, setHovered } from "./state.js";

const LABEL_W = 150;
const RIGHT = 24;
const ROW_H = 74;
const TOP = 14;
const DOT_R = 9;
const LANE_GAP = 2 * DOT_R + 4; // px two dots need before they overlap
const LANES = [0, -1, 1, -2]; // max 4 pins, so 4 lanes always suffice
const LANE_STEP = 2 * DOT_R - 3;

export function createCompare(container, data, scales, { tooltip } = {}) {
  const byId = new Map(data.map((d) => [d.UNITID, d]));
  const root = d3.select(container);
  const empty = root.append("p").attr("class", "empty");
  const svg = root.append("svg").attr("class", "compare-svg").attr("role", "img")
    .attr("aria-label", "Aligned dot plot comparing pinned colleges on four metrics");
  const legend = root.append("div").attr("class", "compare-legend");
  const tableWrap = root.append("div").attr("class", "table-scroll compare-table");

  function render() {
    const pinned = state.pinned.map((id) => byId.get(id)).filter(Boolean);
    const visible = data.filter(isVisible);

    empty.style("display", pinned.length >= 2 ? "none" : null)
      .text(pinned.length === 0
        ? "Pin 2–4 colleges (click a dot in either scatterplot, or a table row) to compare them here."
        : "Pin at least one more college to compare.");
    svg.style("display", pinned.length ? null : "none");
    legend.style("display", pinned.length ? null : "none");
    tableWrap.style("display", pinned.length ? null : "none");
    if (!pinned.length) return;

    const width = Math.max(420, container.clientWidth);
    const plotW = width - LABEL_W - RIGHT;
    const height = TOP + METRICS.length * ROW_H;
    svg.attr("width", width).attr("height", height);

    const rows = METRICS.map((m) => {
      const vals = visible.map((d) => d[m.key]).sort(d3.ascending);
      return {
        m,
        x: scales[m.key].copy().range([0, plotW]),
        q1: d3.quantileSorted(vals, 0.25),
        med: d3.quantileSorted(vals, 0.5),
        q3: d3.quantileSorted(vals, 0.75),
        sorted: vals,
      };
    });

    const g = svg.selectAll("g.c-row").data(rows, (r) => r.m.key).join((enter) => {
      const r = enter.append("g").attr("class", "c-row");
      r.append("text").attr("class", "c-label").attr("y", -2);
      r.append("text").attr("class", "c-sublabel").attr("y", 14);
      r.append("rect").attr("class", "c-band");
      r.append("line").attr("class", "c-base");
      r.append("line").attr("class", "c-median");
      r.append("g").attr("class", "axis c-axis");
      r.append("g").attr("class", "c-dots");
      return r;
    }).attr("transform", (r, i) => `translate(${LABEL_W},${TOP + i * ROW_H + 20})`);

    g.select(".c-label").attr("x", -LABEL_W).text((r) => r.m.label);
    g.select(".c-sublabel").attr("x", -LABEL_W)
      .text((r) => (r.m.better === "low" ? "lower preferred" : "higher preferred"));
    g.select(".c-band")
      .attr("x", (r) => r.x(r.q1)).attr("width", (r) => Math.max(1, r.x(r.q3) - r.x(r.q1)))
      .attr("y", -8).attr("height", 16).attr("rx", 3);
    g.select(".c-base").attr("x1", 0).attr("x2", plotW);
    g.select(".c-median")
      .attr("x1", (r) => r.x(r.med)).attr("x2", (r) => r.x(r.med)).attr("y1", -12).attr("y2", 12);
    g.select(".c-axis").attr("transform", "translate(0,26)")
      .each(function (r) {
        d3.select(this).call(d3.axisBottom(r.x).ticks(6).tickFormat(r.m.tick).tickSizeOuter(0));
      });

    // dots: stack colleges with nearly equal values into lanes so none hide
    g.select(".c-dots").each(function (r) {
      const placed = [];
      const items = pinned
        .map((d) => ({ d, px: r.x(d[r.m.key]) }))
        .sort((a, b) => a.px - b.px);
      for (const it of items) {
        const lane = LANES.find((ln) => !placed.some((p) => p.lane === ln && Math.abs(p.px - it.px) < LANE_GAP)) ?? 0;
        it.lane = lane;
        placed.push(it);
      }
      const dots = d3.select(this).selectAll("g.c-dot").data(items, (it) => it.d.UNITID)
        .join((enter) => {
          const e = enter.append("g").attr("class", "c-dot");
          e.append("circle").attr("r", DOT_R);
          e.append("text").attr("dy", "0.34em").attr("text-anchor", "middle");
          return e;
        })
        .attr("transform", (it) => `translate(${it.px},${it.lane * LANE_STEP})`)
        .classed("faded", (it) => state.hovered && state.pinned.includes(state.hovered) && it.d.UNITID !== state.hovered)
        .on("mouseenter", (event, it) => {
          setHovered(it.d.UNITID);
          tooltip?.show(event, it.d, percentileText(r, it.d));
        })
        .on("mousemove", (event, it) => tooltip?.show(event, it.d, percentileText(r, it.d)))
        .on("mouseleave", () => { setHovered(null); tooltip?.hide(); });
      dots.select("text").text((it) => state.pinned.indexOf(it.d.UNITID) + 1);
    });

    legend.html(`
      <span class="c-key"><span class="c-key-band"></span>Middle 50% of the ${visible.length.toLocaleString()} colleges matching the filters</span>
      <span class="c-key"><span class="c-key-median"></span>Median</span>
      <span class="c-key"><span class="c-key-dot">1</span>Pinned college</span>`);

    renderTable(pinned, rows);
  }

  function percentileText(r, d) {
    const v = d[r.m.key];
    const below = d3.bisectLeft(r.sorted, v) / r.sorted.length;
    const pct = Math.round(below * 100);
    return `${r.m.label}: higher than ${pct}% of the colleges matching the filters`;
  }

  function renderTable(pinned, rows) {
    const peer = Object.fromEntries(rows.map((r) => [r.m.key, r.med]));
    tableWrap.html(`
      <table>
        <thead><tr><th>#</th><th>College</th>${METRICS.map((m) => `<th class="num">${m.label}</th>`).join("")}</tr></thead>
        <tbody>
          ${pinned.map((d, i) => `
            <tr data-id="${d.UNITID}">
              <td><span class="pin-badge sm">${i + 1}</span></td>
              <td>${d.name}<span class="td-sub">${d.state} · ${d.sector}</span></td>
              ${METRICS.map((m) => `<td class="num">${m.fmt(d[m.key])}</td>`).join("")}
            </tr>`).join("")}
          <tr class="peer-row">
            <td></td><td>Median of colleges matching the filters</td>
            ${METRICS.map((m) => `<td class="num">${m.fmt(peer[m.key])}</td>`).join("")}
          </tr>
        </tbody>
      </table>`);
    tableWrap.selectAll("tbody tr[data-id]")
      .on("mouseenter", function () { setHovered(this.dataset.id); })
      .on("mouseleave", () => setHovered(null));
  }

  on("pinned", render);
  on("filters", render);
  on("hovered", () => {
    svg.selectAll("g.c-dot").classed("faded", (it) =>
      state.hovered && state.pinned.includes(state.hovered) && it.d.UNITID !== state.hovered);
  });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 150);
  });

  render();
  return { render };
}
