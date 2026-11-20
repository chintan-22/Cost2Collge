// tour.js — short guided tour for first-time visitors.
//
// A dimmed overlay with a "spotlight" on one part of the page and a card that
// explains it. Opens by itself on the first visit (remembered in this browser)
// and any time from the "How to use" button.

const SEEN_KEY = "c2c-tour-seen";

const STEPS = [
  {
    target: null,
    title: "Welcome!",
    text: "Compare U.S. colleges on cost, debt, graduation and pay.",
  },
  {
    target: ".header-filters",
    title: "Narrow it down",
    text: "Pick a state, type, size or major. All plots update together.",
  },
  {
    target: ".grid4",
    title: "Explore the plots",
    text: "Each dot is a college. Click one to pin it, and open \"How to read this\" on any plot.",
  },
  {
    target: "#example-btn",
    title: "See it in action",
    text: "Watch a real example, step by step.",
    final: true,
  },
];

function storage(fn) {
  try { return fn(window.localStorage); } catch { return null; }
}

export function createTour({ onTryExample } = {}) {
  const spot = document.createElement("div");
  spot.className = "tour-spot";
  const shade = document.createElement("div");
  shade.className = "tour-shade";
  const card = document.createElement("div");
  card.className = "tour-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-labelledby", "tour-title");
  document.body.append(shade, spot, card);

  let index = 0;
  let isOpen = false;

  function render() {
    const step = STEPS[index];
    card.innerHTML = `
      <div class="tour-progress">${index + 1} of ${STEPS.length}</div>
      <h3 id="tour-title">${step.title}</h3>
      <p>${step.text}</p>
      <div class="tour-actions">
        <button type="button" class="tour-skip">${step.final ? "Close" : "Skip tour"}</button>
        <span class="tour-spacer"></span>
        ${index > 0 ? '<button type="button" class="tour-back">Back</button>' : ""}
        ${step.final
          ? '<button type="button" class="tour-next tour-primary">Try the example</button>'
          : `<button type="button" class="tour-next tour-primary">${index === 0 ? "Start the tour" : "Next"}</button>`}
      </div>`;
    card.querySelector(".tour-skip").onclick = close;
    card.querySelector(".tour-back")?.addEventListener("click", () => go(index - 1));
    card.querySelector(".tour-next").onclick = () => {
      if (step.final) {
        close();
        onTryExample?.();
      } else {
        go(index + 1);
      }
    };

    const el = step.target && document.querySelector(step.target);
    if (el) {
      const tall = el.getBoundingClientRect().height > window.innerHeight * 0.7;
      el.scrollIntoView({ behavior: "smooth", block: tall ? "start" : "center" });
    }
    place();
    card.querySelector(".tour-next").focus({ preventScroll: true });
  }

  /** Positions the spotlight on the target and the card next to it. */
  function place() {
    if (!isOpen) return;
    const step = STEPS[index];
    const el = step.target && document.querySelector(step.target);
    const vw = window.innerWidth, vh = window.innerHeight;
    const cw = Math.min(380, vw - 32);
    card.style.width = `${cw}px`;
    const ch = card.offsetHeight;

    if (!el) {
      spot.style.display = "none";
      shade.style.display = "block";
      card.style.left = `${(vw - cw) / 2}px`;
      card.style.top = `${Math.max(16, (vh - ch) / 2)}px`;
      return;
    }
    shade.style.display = "none";
    spot.style.display = "block";
    const pad = 6;
    const r = el.getBoundingClientRect();
    const top = Math.max(r.top - pad, 4);
    const bottom = Math.min(r.bottom + pad, vh - 4);
    spot.style.left = `${r.left - pad}px`;
    spot.style.top = `${top}px`;
    spot.style.width = `${r.width + pad * 2}px`;
    spot.style.height = `${Math.max(0, bottom - top)}px`;

    // card: below the target if it fits, else above, else inside its top-right corner
    let x = Math.min(Math.max(16, r.left), vw - cw - 16);
    let y;
    if (r.bottom + 12 + ch < vh - 8) y = r.bottom + 12;
    else if (r.top - 12 - ch > 8) y = r.top - 12 - ch;
    else {
      x = Math.min(Math.max(16, r.right - cw - 16), vw - cw - 16);
      y = Math.min(Math.max(16, top + 16), vh - ch - 16);
    }
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
  }

  function go(i) {
    index = Math.max(0, Math.min(STEPS.length - 1, i));
    render();
  }

  function open(start = 0) {
    isOpen = true;
    document.body.classList.add("tour-open");
    shade.style.display = spot.style.display = card.style.display = "block";
    storage((s) => s.setItem(SEEN_KEY, "1"));
    go(start);
  }

  function hide() {
    isOpen = false;
    document.body.classList.remove("tour-open");
    shade.style.display = spot.style.display = card.style.display = "none";
  }

  function close() {
    hide();
    document.getElementById("tour-btn")?.focus({ preventScroll: true });
  }

  let raf;
  const replace = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(place); };
  window.addEventListener("scroll", replace, { passive: true });
  window.addEventListener("resize", replace);
  document.addEventListener("keydown", (e) => {
    if (!isOpen) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowRight" && !STEPS[index].final) go(index + 1);
    else if (e.key === "ArrowLeft") go(index - 1);
  });
  shade.addEventListener("click", close);

  document.getElementById("tour-btn")?.addEventListener("click", () => open(0));
  hide();

  // first visit in this browser: open by itself once the page has drawn
  if (!storage((s) => s.getItem(SEEN_KEY))) setTimeout(() => open(0), 700);

  return { open, close };
}
