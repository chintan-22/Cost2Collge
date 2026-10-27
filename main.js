// main.js — loads the data, builds controls and wires the views together.

import { DATA_FILES, METRICS, METRIC_BY_KEY, SECTORS, MAX_PINNED, PAIR_PRESETS, buildScales } from "./config.js";
import { state, on, isVisible, setFilters, setHovered, togglePin, clearPins, setActivePair } from "./state.js";
import { createSplom } from "./splom.js";
import { createFocused } from "./focused.js";
import { createCompare } from "./compare.js";
import { createFields, buildProgramScales } from "./fields.js";

const num = (v) => (v === "" || v == null ? null : +v);

function parseInstitution(d) {
  return {
    UNITID: d.UNITID, // kept as a string so it matches the programs file
    name: d.institution_name,
    city: d.city,
    state: d.state,
    sector: d.sector,
    enrollment: num(d.undergrad_enrollment),
    net_price: num(d.net_price),
    median_debt: num(d.median_debt),
    completion_rate: num(d.completion_rate),
    median_earnings_5yr: num(d.median_earnings_5yr),
  };
}

// Programs: sector/city come from the institution file via UNITID, because the
// sector column in programs_bachelors_*.csv is "Other/Unknown" for every row.
function parseProgram(instLookup) {
  return (d) => {
    const debt = num(d.program_median_debt);
    const earnings = num(d.program_median_earnings_5yr);
    if (debt == null || earnings == null) return null; // d3.csv drops nulls
    const inst = instLookup.get(d.UNITID);
    return {
      UNITID: d.UNITID,
      cip: d.CIPCODE,
      field: d.field_of_study.replace(/\.$/, ""),
      debt,
      earnings,
      completers: num(d.completer_count_1),
      name: d.institution_name || inst?.name,
      city: inst?.city || "",
      state: inst?.state || d.state,
      sector: inst?.sector || d.sector,
    };
  };
}

// ------------------------------------------------------------------ tooltip
function createTooltip(el) {
  const tip = d3.select(el);
  return {
    show(event, d, extra = "") {
      this.showHtml(event, `
        <div class="tt-name">${d.name}</div>
        <div class="tt-sub">${d.city}, ${d.state} · ${d.sector}</div>
        <dl>${METRICS.map((m) => `<dt>${m.label}</dt><dd>${m.fmt(d[m.key])}</dd>`).join("")}</dl>
        ${extra ? `<div class="tt-extra">${extra}</div>` : ""}
        <div class="tt-hint">${state.pinned.includes(d.UNITID) ? "Click to unpin" : "Click to pin"}</div>`);
    },
    showHtml(event, html) {
      tip.html(html);
      const box = el.getBoundingClientRect();
      let x = event.clientX + 14;
      let y = event.clientY + 14;
      if (x + box.width > window.innerWidth - 8) x = event.clientX - box.width - 14;
      if (y + box.height > window.innerHeight - 8) y = event.clientY - box.height - 14;
      tip.style("left", `${x}px`).style("top", `${y}px`).classed("visible", true);
    },
    hide() {
      tip.classed("visible", false);
    },
  };
}

// --------------------------------------------------------------- controls
function buildControls(data, views) {
  const counts = d3.rollup(data, (v) => v.length, (d) => d.sector);

  const chips = d3.select("#sector-filter").selectAll("button").data(SECTORS).join("button")
    .attr("type", "button")
    .attr("class", "chip")
    .attr("aria-pressed", "true")
    .html((s) => `<span class="swatch" style="background:var(${s.cssVar})"></span>${s.label}<span class="chip-count">${counts.get(s.key) || 0}</span>`)
    .on("click", (event, s) => {
      const sectors = new Set(state.filters.sectors);
      sectors.has(s.key) ? sectors.delete(s.key) : sectors.add(s.key);
      if (sectors.size === 0) return; // keep at least one sector on
      setFilters({ sectors });
    });

  const states = Array.from(new Set(data.map((d) => d.state))).sort();
  d3.select("#state-filter").selectAll("option").data(["All", ...states]).join("option")
    .attr("value", (s) => s).text((s) => (s === "All" ? "All states" : s));
  d3.select("#state-filter").on("change", (event) => setFilters({ state: event.target.value }));

  d3.select("#reset").on("click", () => {
    views.forEach((v) => v.clearBrush());
    clearPins();
    d3.select("#state-filter").property("value", "All");
    setFilters({ sectors: new Set(SECTORS.map((s) => s.key)), state: "All" });
  });

  on("filters", () => chips.attr("aria-pressed", (s) => state.filters.sectors.has(s.key)));
}

// ------------------------------------------- Viz 2 controls (metric pair)
function buildPairControls(focused) {
  const samePair = (a, b) => a[0] === b[0] && a[1] === b[1];

  const presets = d3.select("#pair-presets").selectAll("button").data(PAIR_PRESETS).join("button")
    .attr("type", "button")
    .attr("class", "seg")
    .text((p) => p.label)
    .on("click", (e, p) => setActivePair(p.pair));

  const fill = (sel) => sel.selectAll("option").data(METRICS).join("option")
    .attr("value", (m) => m.key).text((m) => m.label);
  const xSel = d3.select("#x-select").call(fill);
  const ySel = d3.select("#y-select").call(fill);

  // picking the same metric on both axes swaps them instead
  xSel.on("change", (e) => {
    const [x, y] = state.activePair;
    const nx = e.target.value;
    setActivePair([nx, nx === y ? x : y]);
  });
  ySel.on("change", (e) => {
    const [x, y] = state.activePair;
    const ny = e.target.value;
    setActivePair([ny === x ? y : x, ny]);
  });

  d3.select("#pareto-toggle").on("change", (e) => focused.setShowFrontier(e.target.checked));

  const sync = () => {
    presets.attr("aria-pressed", (p) => samePair(p.pair, state.activePair));
    xSel.property("value", state.activePair[0]);
    ySel.property("value", state.activePair[1]);
  };
  on("pair", sync);
  sync();
}

function updateFrontierNote(frontier) {
  const note = d3.select("#frontier-note");
  if (!frontier) return note.text("");
  const [kx, ky] = state.activePair;
  const mx = METRIC_BY_KEY[kx], my = METRIC_BY_KEY[ky];
  const dir = (m) => (m.better === "low" ? "lower" : "higher");
  note.html(`<b>${frontier.length}</b> colleges are on the trade-off frontier: no other visible college has both ` +
    `${dir(mx)} ${mx.label.toLowerCase()} and ${dir(my)} ${my.label.toLowerCase()}. ` +
    `This shows trade-offs, not a ranking; colleges off the line may still fit a student better.`);
}

// ---------------------------------------------------------- status + panels
function updateStatus(data) {
  const shown = data.filter(isVisible).length;
  const br = state.brushed;
  const brushedCount = br ? data.filter((d) => isVisible(d) && br.has(d.UNITID)).length : 0;
  d3.select("#status").html(
    `Showing <strong>${shown.toLocaleString()}</strong> of ${data.length.toLocaleString()} colleges` +
    (br ? ` · <strong>${brushedCount.toLocaleString()}</strong> brushed` : ""));
}

function updatePinnedPanel(byId) {
  const rows = state.pinned.map((id) => byId.get(id)).filter(Boolean);
  d3.select("#pinned-count").text(`${rows.length}/${MAX_PINNED}`);
  d3.select("#pinned-empty").style("display", rows.length ? "none" : null);
  const sectorVar = Object.fromEntries(SECTORS.map((s) => [s.key, s.cssVar]));

  d3.select("#pinned-list").selectAll("li").data(rows, (d) => d.UNITID).join("li")
    .attr("class", "pinned-item")
    .html((d, i) => `
      <span class="pin-badge">${i + 1}</span>
      <div class="pin-text">
        <div class="pin-name">${d.name}</div>
        <div class="pin-meta"><span class="swatch" style="background:var(${sectorVar[d.sector]})"></span>${d.city}, ${d.state}</div>
        <div class="pin-metrics">${METRICS.map((m) => `<span>${m.label}: <b>${m.fmt(d[m.key])}</b></span>`).join("")}</div>
      </div>
      <button type="button" class="unpin" aria-label="Unpin ${d.name}">×</button>`)
    .on("mouseenter", (e, d) => setHovered(d.UNITID))
    .on("mouseleave", () => setHovered(null))
    .call((li) => li.select("button.unpin").on("click", (e, d) => togglePin(d.UNITID)));
}

const TABLE_LIMIT = 100;
function updateBrushTable(data) {
  const br = state.brushed;
  const rows = br
    ? data.filter((d) => isVisible(d) && br.has(d.UNITID))
      .sort((a, b) => d3.descending(a.median_earnings_5yr, b.median_earnings_5yr))
    : [];
  d3.select("#table-empty").style("display", br ? "none" : null)
    .text("Drag a rectangle in any scatterplot cell to list those colleges here.");
  d3.select("#brush-table").style("display", br ? null : "none");
  d3.select("#table-note").text(
    !br ? "" : rows.length > TABLE_LIMIT
      ? `Top ${TABLE_LIMIT} of ${rows.length} by earnings. Click a row to pin.`
      : `${rows.length} colleges, sorted by earnings. Click a row to pin.`);

  d3.select("#brush-table tbody").selectAll("tr").data(rows.slice(0, TABLE_LIMIT), (d) => d.UNITID).join("tr")
    .classed("is-pinned", (d) => state.pinned.includes(d.UNITID))
    .html((d) => `<td>${d.name}<span class="td-sub">${d.state} · ${d.sector}</span></td>` +
      METRICS.map((m) => `<td class="num">${m.fmt(d[m.key])}</td>`).join(""))
    .on("mouseenter", (e, d) => setHovered(d.UNITID))
    .on("mouseleave", () => setHovered(null))
    .on("click", (e, d) => {
      if (!togglePin(d.UNITID)) flash("You can pin up to 4 colleges. Unpin one first.");
    });
}

let flashTimer;
function flash(msg) {
  const el = d3.select("#message").text(msg).classed("visible", true);
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => el.classed("visible", false), 2600);
}

function writeFootnote(clipped, total, programInfo) {
  const notes = METRICS.map((m) => `<li><b>${m.label}:</b> ${m.note}</li>`).join("");
  const clippedText = METRICS
    .filter((m) => clipped[m.key].length)
    .map((m) => `${clipped[m.key].length} college(s) with ${m.label.toLowerCase()} above the axis maximum ` +
      `(${clipped[m.key].map((d) => `${d.name}: ${m.fmt(d[m.key])}`).join("; ")}) are drawn at the axis edge.`)
    .join(" ");
  d3.select("#footnote").html(`
    <p>Source: U.S. Department of Education College Scorecard (most recent cohorts). ${total.toLocaleString()} institutions awarding a bachelor's degree or higher, with all four metrics reported. Missing and privacy-suppressed values are excluded, never treated as zero.</p>
    <ul>${notes}</ul>
    ${clippedText ? `<p>${clippedText}</p>` : ""}
    ${programInfo ? `<p><b>Field of study:</b> ${programInfo.count.toLocaleString()} bachelor's programs reporting both median debt of borrowers (DEBT_ALL_STGP_ANY_MDN) and median earnings 5 years out (EARN_MDN_5YR). Program debt covers all borrowers in the program while institution debt covers graduates only, so compare the institution-wide squares with programs as an approximate reference.${programInfo.clipped ? ` ${programInfo.clipped} program(s) with values beyond the axis are drawn at the edge.` : ""}</p>` : ""}`);
}

// ------------------------------------------------------------------- init
let programsPromise;

async function initFields(data, tooltip, total, clipped) {
  const card = d3.select("#fields");
  card.html('<p class="empty">Loading field-of-study data…</p>');
  let instAll, text;
  try {
    [instAll, text] = await programsPromise;
  } catch (err) {
    card.html(`<p class="error">Could not load <code>${DATA_FILES.programs}</code>.</p>`);
    console.error(err);
    return;
  }
  card.html("");
  // lookup over ALL cleaned institutions (some metrics may be missing)
  const instById = new Map(instAll.map((d) => [d.UNITID, d]));
  const programs = d3.csvParse(text, parseProgram(instById));
  const scales = buildProgramScales(programs, data); // inst squares are drawn only for pinnable colleges
  const [dMax, eMax] = [scales.debt.domain()[1], scales.earnings.domain()[1]];
  const clippedPrograms = programs.filter((p) => p.debt > dMax || p.earnings > eMax).length;

  createFields(document.getElementById("fields"), programs, scales, {
    mode: "#field-mode",
    fieldSelect: "#field-select",
    fieldWrap: "#field-select-wrap",
    collegeSelect: "#college-select",
    collegeWrap: "#college-select-wrap",
    instToggle: "#inst-toggle",
    note: "#fields-note",
  }, {
    tooltip,
    onMessage: flash,
    instById,
    pinnableIds: new Set(data.map((d) => d.UNITID)),
  });
  writeFootnote(clipped, total, { count: programs.length, clipped: clippedPrograms });
}

async function init() {
  let raw;
  try {
    raw = await d3.csv(DATA_FILES.institutions, parseInstitution);
    // program data loads in the background; Viz 4 renders when it arrives
    programsPromise = Promise.all([
      d3.csv(DATA_FILES.institutionsAll, parseInstitution),
      d3.text(DATA_FILES.programs),
    ]);
  } catch (err) {
    d3.select("#splom").html(`<p class="error">Could not load <code>${DATA_FILES.institutions}</code>. Start a local server in this folder (see README) instead of opening the HTML file directly.</p>`);
    console.error(err);
    return;
  }
  // defensive: only colleges with all four metrics can be placed in every cell
  const data = raw.filter((d) => METRICS.every((m) => Number.isFinite(d[m.key])));
  const byId = new Map(data.map((d) => [d.UNITID, d]));
  const { scales, clipped } = buildScales(data);

  const tooltip = createTooltip(document.getElementById("tooltip"));
  const splom = createSplom(document.getElementById("splom"), data, scales, { tooltip, onMessage: flash });

  const focused = createFocused(document.getElementById("focused"), data, scales, {
    tooltip, onMessage: flash, onFrontier: updateFrontierNote,
  });

  createCompare(document.getElementById("compare"), data, scales, { tooltip });

  buildControls(data, [splom, focused]);
  buildPairControls(focused);
  writeFootnote(clipped, data.length);

  const refresh = () => { updateStatus(data); updateBrushTable(data); };
  on("filters", refresh);
  on("brushed", refresh);
  on("pinned", () => { updatePinnedPanel(byId); updateBrushTable(data); });

  refresh();
  updatePinnedPanel(byId);

  initFields(data, tooltip, data.length, clipped);
}

init();
