// fields.js — Visualization 4: Field-of-study scatterplot (DR4 drill-down).
//
// x = program median debt, y = program median earnings (5 yr), one dot per
// program (college × field), colored by the college's sector.
//
// Two modes:
//   "across" (main mode): one major, every college that reports it.
//            Pinned colleges keep their number and name (identity is
//            preserved from the institution-level views), and can show an
//            arrow from their institution-wide position to the program.
//   "within" (optional mode): every major at one pinned college.
//            Click a major to see it across all colleges.
//
// Linked: sector/state filters apply; colleges brushed in Viz 1/2 stay
// colored here and the rest are greyed; hover rings the college everywhere.

import { SECTORS } from "./config.js";
import { state, on, isVisible, setHovered, togglePin, setSelectedField } from "./state.js";

const MARGIN = { top: 18, right: 28, bottom: 54, left: 72 };
const R = 4;
const HIT_RADIUS = 8;
const DURATION = 400;
const usd = d3.format("$,.0f");
const usdK = (v) => `$${d3.format(",.0f")(v / 1000)}k`;

export function createFields(container, programs, scales, ui, { tooltip, onMessage, pinnableIds, instById } = {}) {
  const sectorVar = Object.fromEntries(SECTORS.map((s) => [s.key, s.cssVar]));

  // ---- lookups
  const fieldName = new Map();
  const fieldCount = d3.rollup(programs, (v) => v.length, (p) => p.cip);
  const byCollege = d3.group(programs, (p) => p.UNITID);
  for (const p of programs) fieldName.set(p.cip, p.field);
  const allFields = Array.from(fieldName.keys())
    .sort((a, b) => d3.ascending(fieldName.get(a), fieldName.get(b)));

  let mode = "across";
  let withinCollege = null;
  let showInstitution = true;

  // default field: Computer Science if present, else the most common field
  if (!state.selectedField) {
    const cs = allFields.find((c) => fieldName.get(c).startsWith("Computer and Information Sciences, General"));
    const common = d3.greatest(fieldCount, ([, n]) => n)[0];
    state.selectedField = cs || common;
  }

  // ---- SVG skeleton
  const svg = d3.select(container).append("svg").attr("class", "focused-svg fields-svg").attr("role", "img");
  const plot = svg.append("g");
  const gGrid = plot.append("g");
  const gAxisX = plot.append("g").attr("class", "axis");
  const gAxisY = plot.append("g").attr("class", "axis");
  const titleX = plot.append("text").attr("class", "axis-title f-title").attr("text-anchor", "middle").text("Program median debt");
  const titleY = plot.append("text").attr("class", "axis-title f-title").attr("text-anchor", "middle").text("Program median earnings (5 yr)");
  const gMedian = plot.append("g").attr("class", "fs-median");
  const gLinks = plot.append("g").attr("class", "fs-links");
  const gDots = plot.append("g").attr("class", "f-dots");
  const gMarks = plot.append("g").attr("class", "f-pins");
  const gLabels = plot.append("g").attr("class", "f-pins fs-labels");
  const gHover = plot.append("g").attr("class", "f-hover");
  const overlay = plot.append("rect").attr("class", "fs-overlay");

  svg.append("defs").append("marker")
    .attr("id", "fs-arrow").attr("viewBox", "0 0 10 10").attr("refX", 9).attr("refY", 5)
    .attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto-start-reverse")
    .append("path").attr("d", "M0,0 L10,5 L0,10 z").attr("class", "fs-arrowhead");

  let width, height, x, y, rows = [], quadtree;

  // ---------------------------------------------------------------- controls
  const modeButtons = d3.select(ui.mode).selectAll("button")
    .data([{ key: "across", label: "One major across colleges" }, { key: "within", label: "All majors at one college" }])
    .join("button").attr("type", "button").attr("class", "seg").text((d) => d.label)
    .on("click", (e, d) => setMode(d.key));

  d3.select(ui.fieldSelect).on("change", (e) => setSelectedField(e.target.value));
  d3.select(ui.collegeSelect).on("change", (e) => { withinCollege = e.target.value; update(true); });
  d3.select(ui.instToggle).property("checked", showInstitution)
    .on("change", (e) => { showInstitution = e.target.checked; update(false); });

  function setMode(m) {
    if (m === "within" && !state.pinned.length) {
      onMessage?.("Pin a college first to see all of its majors.");
      return;
    }
    mode = m;
    update(true);
  }

  function fillFieldSelect() {
    // fields offered (with data) by every pinned college go first
    const pinned = state.pinned;
    const shared = pinned.length
      ? allFields.filter((c) => pinned.every((id) => (byCollege.get(id) || []).some((p) => p.cip === c)))
      : [];
    const sel = d3.select(ui.fieldSelect);
    sel.selectAll("*").remove();
    const opt = (g, codes) => g.selectAll("option").data(codes).join("option")
      .attr("value", (c) => c)
      .text((c) => `${fieldName.get(c)} (${fieldCount.get(c)} colleges)`);
    if (shared.length) {
      opt(sel.append("optgroup").attr("label", "Reported by all pinned colleges"), shared);
      opt(sel.append("optgroup").attr("label", "All fields"), allFields);
    } else {
      opt(sel, allFields);
    }
    sel.property("value", state.selectedField);
  }

  function fillCollegeSelect() {
    const pinned = state.pinned.filter((id) => instById.has(id));
    if (!pinned.includes(withinCollege)) withinCollege = pinned[0] || null;
    if (!withinCollege && mode === "within") mode = "across";
    d3.select(ui.collegeSelect).selectAll("option").data(pinned).join("option")
      .attr("value", (id) => id)
      .text((id) => `${state.pinned.indexOf(id) + 1}. ${instById.get(id).name}`);
    d3.select(ui.collegeSelect).property("value", withinCollege);
  }

  function syncControls() {
    modeButtons.attr("aria-pressed", (d) => d.key === mode);
    d3.select(ui.fieldWrap).style("display", mode === "across" ? null : "none");
    d3.select(ui.collegeWrap).style("display", mode === "within" ? null : "none");
  }

  // ------------------------------------------------------------------ layout
  function resize() {
    width = Math.max(320, container.clientWidth) - MARGIN.left - MARGIN.right;
    height = Math.round(Math.min(520, Math.max(300, width * 0.55)));
    svg.attr("width", width + MARGIN.left + MARGIN.right).attr("height", height + MARGIN.top + MARGIN.bottom);
    plot.attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
    x = scales.debt.copy().range([0, width]);
    y = scales.earnings.copy().range([height, 0]);

    gGrid.selectAll("line.gx").data(x.ticks(8)).join("line").attr("class", "grid gx")
      .attr("x1", (t) => x(t)).attr("x2", (t) => x(t)).attr("y1", 0).attr("y2", height);
    gGrid.selectAll("line.gy").data(y.ticks(6)).join("line").attr("class", "grid gy")
      .attr("y1", (t) => y(t)).attr("y2", (t) => y(t)).attr("x1", 0).attr("x2", width);
    gAxisX.attr("transform", `translate(0,${height + 6})`).call(d3.axisBottom(x).ticks(8).tickFormat(usdK).tickSizeOuter(0));
    gAxisY.attr("transform", "translate(-6,0)").call(d3.axisLeft(y).ticks(6).tickFormat(usdK).tickSizeOuter(0));
    titleX.attr("x", width / 2).attr("y", height + 46);
    titleY.attr("transform", `translate(-56,${height / 2}) rotate(-90)`);
    overlay.attr("width", width).attr("height", height);
    update(false);
  }

  // ------------------------------------------------------------------ update
  function currentRows() {
    if (mode === "within") return byCollege.get(withinCollege) || [];
    const pinned = new Set(state.pinned);
    // pinned colleges stay visible even if the filters would hide them
    return programs.filter((p) => p.cip === state.selectedField && (isVisible(p) || pinned.has(p.UNITID)));
  }

  function rowKey(p) {
    return mode === "within" ? p.cip : p.UNITID;
  }

  function update(animate) {
    syncControls();
    rows = currentRows();
    const br = state.brushed;
    const isOn = (p) => mode === "within" || !br || br.has(p.UNITID);
    const ordered = br && mode === "across" ? [...rows].sort((a, b) => isOn(a) - isOn(b)) : rows;

    svg.attr("aria-label", mode === "across"
      ? `Program debt and earnings for ${fieldName.get(state.selectedField)} across colleges`
      : `Program debt and earnings for every major at ${instById.get(withinCollege)?.name}`);

    const dots = gDots.selectAll("circle").data(ordered, rowKey)
      .join(
        (enter) => enter.append("circle").attr("r", R)
          .attr("cx", (p) => x(p.debt)).attr("cy", (p) => y(p.earnings))
          .style("opacity", animate ? 0 : null),
        (upd) => upd,
        (exit) => (animate ? exit.transition().duration(DURATION / 2).style("opacity", 0).remove() : exit.remove()),
      )
      .attr("class", (p) => {
        const sel = mode === "within" && p.cip === state.selectedField;
        return `f-dot${isOn(p) ? "" : " dim"}${sel ? " fs-selected" : ""}`;
      })
      .style("fill", (p) => (isOn(p) ? `var(${sectorVar[p.sector] || "--text-muted"})` : null))
      .order();
    (animate ? dots.transition().duration(DURATION) : dots)
      .attr("cx", (p) => x(p.debt)).attr("cy", (p) => y(p.earnings)).style("opacity", null);

    quadtree = d3.quadtree().x((p) => x(p.debt)).y((p) => y(p.earnings)).addAll(rows);

    drawMedians();
    drawMarks(animate);
    drawWithinLabels();
    updateHover();
    writeNote();
  }

  function drawMedians() {
    const shown = mode === "across" ? rows.filter(isVisible) : [];
    const md = shown.length ? d3.median(shown, (p) => p.debt) : null;
    const me = shown.length ? d3.median(shown, (p) => p.earnings) : null;
    const lines = md == null ? [] : [
      { x1: x(md), x2: x(md), y1: 0, y2: height, label: `Field median debt ${usd(md)}`, lx: x(md) + 4, ly: 12, anchor: "start" },
      { x1: 0, x2: width, y1: y(me), y2: y(me), label: `Field median earnings ${usd(me)}`, lx: width - 4, ly: y(me) - 6, anchor: "end" },
    ];
    gMedian.selectAll("line").data(lines).join("line").attr("class", "fs-median-line")
      .attr("x1", (d) => d.x1).attr("x2", (d) => d.x2).attr("y1", (d) => d.y1).attr("y2", (d) => d.y2);
    gMedian.selectAll("text").data(lines).join("text").attr("class", "fs-median-label")
      .attr("x", (d) => d.lx).attr("y", (d) => d.ly).attr("text-anchor", (d) => d.anchor).text((d) => d.label);
  }

  /** Pinned colleges (across mode) or the selected major (within mode). */
  function drawMarks(animate) {
    let marks = [];
    let links = [];
    if (mode === "across") {
      marks = state.pinned
        .map((id) => rows.find((p) => p.UNITID === id))
        .filter(Boolean)
        .map((p) => ({ key: p.UNITID, p, label: `${state.pinned.indexOf(p.UNITID) + 1}  ${shorten(p.name)}` }));
      if (showInstitution) {
        links = marks
          .map((m) => ({ key: m.key, inst: instById.get(m.key), p: m.p }))
          .filter((l) => l.inst && l.inst.median_debt != null && l.inst.median_earnings_5yr != null);
      }
    } else {
      const p = rows.find((r) => r.cip === state.selectedField);
      if (p) marks = [{ key: p.cip, p, label: shorten(p.field, 40) }];
      const inst = instById.get(withinCollege);
      if (showInstitution && inst && inst.median_debt != null && inst.median_earnings_5yr != null) {
        links = [{ key: "inst", inst, p: null }];
      }
    }

    const side = (px) => (px > width - 200 ? "left" : "right");
    const g = gMarks.selectAll("g.f-pin").data(marks, (m) => m.key).join((enter) => {
      const e = enter.append("g").attr("class", "f-pin")
        .attr("transform", (m) => `translate(${x(m.p.debt)},${y(m.p.earnings)})`);
      e.append("circle").attr("class", "pin-ring").attr("r", 7.5);
      e.append("text").attr("class", "pin-label f-pin-label").attr("dy", "0.32em");
      return e;
    });
    g.select("text")
      .attr("x", (m) => (side(x(m.p.debt)) === "left" ? -12 : 12))
      .attr("text-anchor", (m) => (side(x(m.p.debt)) === "left" ? "end" : "start"))
      .text((m) => m.label);
    (animate ? g.transition().duration(DURATION) : g)
      .attr("transform", (m) => `translate(${x(m.p.debt)},${y(m.p.earnings)})`);

    // institution-wide position: hollow square, with an arrow to the program
    const lg = gLinks.selectAll("g.fs-link").data(links, (l) => l.key).join((enter) => {
      const e = enter.append("g").attr("class", "fs-link");
      e.append("line").attr("marker-end", "url(#fs-arrow)");
      e.append("rect").attr("class", "fs-inst").attr("width", 9).attr("height", 9).attr("x", -4.5).attr("y", -4.5);
      e.append("text").attr("class", "fs-inst-label").attr("dy", "0.32em").attr("x", -9).attr("text-anchor", "end");
      return e;
    });
    lg.select("rect").attr("transform", (l) => `translate(${x(l.inst.median_debt)},${y(l.inst.median_earnings_5yr)})`);
    lg.select("text")
      .attr("transform", (l) => `translate(${x(l.inst.median_debt)},${y(l.inst.median_earnings_5yr)})`)
      .text((l) => (mode === "within" ? "Institution-wide" : ""));
    lg.select("line")
      .style("display", (l) => (l.p ? null : "none"))
      .attr("x1", (l) => x(l.inst.median_debt)).attr("y1", (l) => y(l.inst.median_earnings_5yr))
      .attr("x2", (l) => (l.p ? shortenTowards(l, 9).x : 0)).attr("y2", (l) => (l.p ? shortenTowards(l, 9).y : 0));
    if (animate) gLinks.interrupt().style("opacity", 0).transition().delay(DURATION).duration(200).style("opacity", 1);
  }

  // "within" mode: name every major when there are few enough to read
  function drawWithinLabels() {
    const MAX_LABELS = 10;
    const show = mode === "within" && rows.length <= MAX_LABELS ? rows.filter((p) => p.cip !== state.selectedField) : [];
    // nudge labels apart vertically so close dots don't print on top of each other
    const ly = new Map();
    let last = -Infinity;
    for (const p of [...show].sort((a, b) => y(a.earnings) - y(b.earnings))) {
      const want = Math.max(y(p.earnings), last + 14);
      ly.set(p.cip, want);
      last = want;
    }
    gLabels.selectAll("text").data(show, (p) => p.cip).join("text")
      .attr("class", "fs-major-label")
      .attr("dy", "0.32em")
      .attr("x", (p) => x(p.debt) + (x(p.debt) > width - 200 ? -8 : 8))
      .attr("y", (p) => ly.get(p.cip))
      .attr("text-anchor", (p) => (x(p.debt) > width - 200 ? "end" : "start"))
      .text((p) => shorten(p.field, 38));
  }

  // end the arrow just before the program dot's ring
  function shortenTowards(l, by) {
    const x1 = x(l.inst.median_debt), y1 = y(l.inst.median_earnings_5yr);
    const x2 = x(l.p.debt), y2 = y(l.p.earnings);
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const k = Math.max(0, (len - by) / len);
    return { x: x1 + (x2 - x1) * k, y: y1 + (y2 - y1) * k };
  }

  function writeNote() {
    const el = d3.select(ui.note);
    if (mode === "within") {
      const inst = instById.get(withinCollege);
      el.html(inst
        ? `<b>${rows.length}</b> bachelor's programs at ${inst.name} report both debt and earnings. Click a dot to see that major across all colleges.`
        : "");
      return;
    }
    const shown = rows.filter(isVisible).length;
    const missing = state.pinned
      .filter((id) => instById.has(id) && !rows.some((p) => p.UNITID === id))
      .map((id) => `${state.pinned.indexOf(id) + 1}. ${instById.get(id).name}`);
    el.html(`<b>${shown.toLocaleString()}</b> colleges matching the filters report debt and earnings for <b>${fieldName.get(state.selectedField)}</b>.` +
      (missing.length ? ` Not reported for this major (not offered, or suppressed for privacy): ${missing.join(", ")}.` : "") +
      (showInstitution && state.pinned.length ? " Squares show each pinned college's institution-wide position; arrows point to the program." : ""));
  }

  // ------------------------------------------------------------- hover/click
  function updateHover() {
    const hit = mode === "across" && state.hovered ? rows.find((p) => p.UNITID === state.hovered) : null;
    gHover.selectAll("circle").data(hit ? [hit] : []).join("circle")
      .attr("class", "hover-ring").attr("r", R + 4)
      .attr("cx", (p) => x(p.debt)).attr("cy", (p) => y(p.earnings));
  }

  function programTooltip(event, p) {
    const inst = instById.get(p.UNITID);
    const instLine = (v, f) => (v == null ? "not reported" : f(v));
    tooltip?.showHtml(event, `
      <div class="tt-name">${p.name}</div>
      <div class="tt-sub">${p.field}<br>${p.city ? `${p.city}, ` : ""}${p.state} · ${p.sector}</div>
      <dl>
        <dt>Program debt</dt><dd>${usd(p.debt)}</dd>
        <dt>Program earnings</dt><dd>${usd(p.earnings)}</dd>
        ${p.completers != null ? `<dt>Completers</dt><dd>${p.completers}</dd>` : ""}
      </dl>
      <div class="tt-extra">Institution-wide</div>
      <dl>
        <dt>Median debt</dt><dd>${instLine(inst?.median_debt, usd)}</dd>
        <dt>Earnings (5 yr)</dt><dd>${instLine(inst?.median_earnings_5yr, usd)}</dd>
      </dl>
      <div class="tt-hint">${mode === "within" ? "Click to see this major across colleges"
        : state.pinned.includes(p.UNITID) ? "Click to unpin" : "Click to pin"}</div>`);
  }

  overlay
    .on("mousemove", function (event) {
      const [mx, my] = d3.pointer(event, this);
      const hit = quadtree.find(mx, my, HIT_RADIUS) || null;
      this.style.cursor = hit ? "pointer" : "";
      if (mode === "across") setHovered(hit ? hit.UNITID : null);
      else highlightWithin(hit);
      hit ? programTooltip(event, hit) : tooltip?.hide();
    })
    .on("mouseleave", () => {
      if (mode === "across") setHovered(null);
      highlightWithin(null);
      tooltip?.hide();
    })
    .on("click", function (event) {
      const [mx, my] = d3.pointer(event, this);
      const hit = quadtree.find(mx, my, HIT_RADIUS);
      if (!hit) return;
      if (mode === "within") {
        // drill across: same major, every college
        mode = "across";
        tooltip?.hide();
        setSelectedField(hit.cip);
        return;
      }
      if (!pinnableIds.has(hit.UNITID)) {
        onMessage?.("This college is missing an institution-level metric, so it can't be pinned.");
        return;
      }
      if (!togglePin(hit.UNITID)) onMessage?.("You can pin up to 4 colleges. Unpin one first.");
    });

  function highlightWithin(hit) {
    gHover.selectAll("circle").data(mode === "within" && hit ? [hit] : []).join("circle")
      .attr("class", "hover-ring").attr("r", R + 4)
      .attr("cx", (p) => x(p.debt)).attr("cy", (p) => y(p.earnings));
  }

  // ---------------------------------------------------------- state listeners
  on("field", () => { d3.select(ui.fieldSelect).property("value", state.selectedField); update(true); });
  on("filters", () => update(false));
  on("brushed", () => update(false));
  on("pinned", () => { fillFieldSelect(); fillCollegeSelect(); update(false); });
  on("hovered", () => { if (mode === "across") updateHover(); });

  let resizeTimer;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 150); });

  fillFieldSelect();
  fillCollegeSelect();
  resize();
}

function shorten(name, max = 34) {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

/** Shared program scales: fixed across fields so switching majors stays comparable. */
export function buildProgramScales(programs, instRows) {
  const cap = (vals) => Math.min(d3.max(vals), d3.quantile(vals.sort(d3.ascending), 0.99) * 1.5);
  const debtVals = programs.map((p) => p.debt);
  const earnVals = programs.map((p) => p.earnings);
  const instDebt = instRows.map((d) => d.median_debt).filter((v) => v != null);
  const instEarn = instRows.map((d) => d.median_earnings_5yr).filter((v) => v != null);
  const debtMax = Math.max(cap(debtVals), d3.max(instDebt) || 0);
  const earnMax = Math.max(cap(earnVals), d3.max(instEarn) || 0);
  const earnMin = Math.min(d3.min(earnVals), d3.min(instEarn) || Infinity);
  return {
    debt: d3.scaleLinear().domain([0, debtMax]).nice().clamp(true),
    earnings: d3.scaleLinear().domain([earnMin, earnMax]).nice().clamp(true),
  };
}
