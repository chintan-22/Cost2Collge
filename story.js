// story.js — "Try an example": a guided, real-data walkthrough.
//
// Maria, a Texas student who wants a big university and plans to study
// mechanical engineering, goes from 1,911 colleges to a shortlist. Each step
// sets the filters, pins and major for the visitor (through the same shared
// state the plots use), scrolls to the right plot and explains what to notice.
//
// Numbers in the text were checked against the data files in this repo.
// If the data is updated, re-check them.

import { SECTORS } from "./config.js";
import { state, setFilters, setActivePair, togglePin, clearPins, setSelectedField } from "./state.js";

// UNITIDs of the three colleges Maria pins
const UT_AUSTIN = "228778";
const TEXAS_AM = "228723";
const HOUSTON = "225511";

export function createStory(app) {
  const allSectors = () => new Set(SECTORS.map((s) => s.key));

  const STEPS = [
    {
      title: "Meet Maria",
      text: `<p>Maria lives in Texas, wants a <b>big university</b>, and plans to study <b>mechanical engineering</b>.</p>`,
      target: null,
      run: () => app.resetAll(),
    },
    {
      title: "Start with the big picture",
      target: "#panel-1",
      text: `<p>All 1,911 colleges. In the bottom row, <b>graduation and pay</b> rise together, but <b>cost and pay</b> barely do.</p>`,
      run: () => app.resetAll(),
    },
    {
      title: "Narrow it down",
      target: "#panel-1",
      text: `<p>She picks <b>Texas</b> and <b>Large</b>. 19 colleges are left.</p>`,
      run: () => setFilters({ state: "TX", size: "large", sectors: allSectors() }),
    },
    {
      title: "Find the best deals",
      target: "#panel-2",
      text: `<p>The line shows the <b>6 best deals</b> on cost and pay. Hover over a dot to see its name.</p>`,
      run: () => {
        setFilters({ state: "TX", size: "large", sectors: allSectors() });
        setActivePair(["net_price", "median_earnings_5yr"]);
        app.setFrontier(true);
      },
    },
    {
      title: "Make a shortlist",
      target: "#panel-3",
      text: `<p>She pins <b>UT Austin</b>, <b>Texas A&amp;M</b> and <b>Houston</b>. All three beat the typical college, but Houston costs about <b>half as much</b> as A&amp;M.</p>`,
      run: () => {
        setFilters({ state: "TX", size: "large", sectors: allSectors() });
        clearPins();
        [UT_AUSTIN, TEXAS_AM, HOUSTON].forEach((id) => togglePin(id));
      },
    },
    {
      title: "Check her major",
      target: "#panel-4",
      text: `<p>For mechanical engineering, all three arrows point <b>up</b>: graduates earn <b>$100,000–$113,000</b>.</p>`,
      run: async () => {
        setFilters({ state: "TX", size: "large", sectors: allSectors() });
        if (state.pinned.join() !== [UT_AUSTIN, TEXAS_AM, HOUSTON].join()) {
          clearPins();
          [UT_AUSTIN, TEXAS_AM, HOUSTON].forEach((id) => togglePin(id));
        }
        const fields = await app.fieldsReady;
        fields.setMode("across");
        const cip = fields.findField("Mechanical Engineering");
        if (cip) setSelectedField(cip);
      },
    },
    {
      title: "What Maria learned",
      target: null,
      text: `<p>Houston gives nearly the same engineering pay for <b>half the cost</b>. Now try your own state and major.</p>`,
      run: null,
    },
  ];

  // ---- drawer
  const el = document.createElement("aside");
  el.className = "story";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Example walkthrough");
  el.hidden = true;
  document.body.append(el);

  let index = 0;

  function render() {
    const step = STEPS[index];
    el.innerHTML = `
      <div class="story-head">
        <span class="story-kicker">Example · ${index + 1} of ${STEPS.length}</span>
        <button type="button" class="story-close" aria-label="Close example">×</button>
      </div>
      <h3>${step.title}</h3>
      <div class="story-body">${step.text}</div>
      <div class="story-dots">${STEPS.map((_, i) => `<span class="${i === index ? "on" : ""}"></span>`).join("")}</div>
      <div class="story-actions">
        ${index > 0 ? '<button type="button" class="story-back">Back</button>' : ""}
        ${step.run && index > 0 ? '<button type="button" class="story-again">Show me again</button>' : ""}
        <span class="story-spacer"></span>
        ${index < STEPS.length - 1
          ? `<button type="button" class="story-next">${index === 0 ? "Start" : "Next"}</button>`
          : '<button type="button" class="story-restart">Start over</button><button type="button" class="story-next story-done">Done</button>'}
      </div>`;
    el.querySelector(".story-close").onclick = close;
    el.querySelector(".story-back")?.addEventListener("click", () => go(index - 1));
    el.querySelector(".story-again")?.addEventListener("click", () => apply(step));
    el.querySelector(".story-restart")?.addEventListener("click", () => go(0));
    el.querySelector(".story-next").onclick = () => (index < STEPS.length - 1 ? go(index + 1) : close());
  }

  async function apply(step) {
    try {
      await step.run?.();
    } catch (err) {
      console.error(err);
      app.flash?.("Couldn't set up this step. Try Reset and start again.");
    }
    const target = step.target && document.querySelector(step.target);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      // keep the drawer on the side opposite the plot it explains
      const r = target.getBoundingClientRect();
      el.classList.toggle("story-left", r.left + r.width / 2 > window.innerWidth / 2);
      flashPanel(target);
    } else {
      el.classList.remove("story-left");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function flashPanel(target) {
    target.classList.remove("story-flash");
    void target.offsetWidth; // restart the animation
    target.classList.add("story-flash");
  }

  async function go(i) {
    index = Math.max(0, Math.min(STEPS.length - 1, i));
    render();
    await apply(STEPS[index]);
  }

  function open() {
    el.hidden = false;
    go(0);
    el.querySelector(".story-next")?.focus({ preventScroll: true });
  }

  function close() {
    el.hidden = true;
    document.getElementById("example-btn")?.focus({ preventScroll: true });
  }

  document.addEventListener("keydown", (e) => {
    if (!el.hidden && e.key === "Escape") close();
  });
  document.getElementById("example-btn")?.addEventListener("click", open);

  return { open, close };
}
