// config.js — shared constants used by every view.
// Metric keys match the column names in institutions_visualizable.csv.

export const DATA_FILES = {
  institutions: "institutions_visualizable.csv",
  institutionsAll: "institutions_clean.csv", // metadata lookup for Viz 4
  programs: "programs_bachelors_visualizable.csv", // Viz 4
};

export const MAX_PINNED = 4;

const usd = d3.format("$,.0f");
const usdK = (v) => `$${d3.format(",.0f")(v / 1000)}k`;
const pct = d3.format(".0%");

export const METRICS = [
  {
    key: "net_price",
    label: "Net price",
    fmt: usd,
    tick: usdK,
    better: "low",
    note: "Average annual net price (NPT4_PUB / NPT4_PRIV)",
  },
  {
    key: "median_debt",
    label: "Median debt",
    fmt: usd,
    tick: usdK,
    better: "low",
    note: "Median debt of graduates (GRAD_DEBT_MDN)",
  },
  {
    key: "completion_rate",
    label: "Completion rate",
    fmt: pct,
    tick: pct,
    better: "high",
    note: "Completion within 150% of normal time (C150_4)",
  },
  {
    key: "median_earnings_5yr",
    label: "Earnings (5 yr)",
    fmt: usd,
    tick: usdK,
    better: "high",
    note: "Median earnings, 5-year measure (MD_EARN_WNE_5YR)",
  },
];

// `better` = which direction a student would usually prefer. Used only to
// orient the Pareto frontier and the "preferred corner" hint in Viz 2.

export const METRIC_BY_KEY = Object.fromEntries(METRICS.map((m) => [m.key, m]));

// Viz 2 presets: [x metric, y metric]
export const PAIR_PRESETS = [
  { label: "Net price × Earnings", pair: ["net_price", "median_earnings_5yr"] },
  { label: "Debt × Earnings", pair: ["median_debt", "median_earnings_5yr"] },
  { label: "Net price × Completion", pair: ["net_price", "completion_rate"] },
];

// Sector colors live in style.css (light + dark), referenced here by CSS variable.
export const SECTORS = [
  { key: "Public", label: "Public", cssVar: "--sector-public" },
  { key: "Private nonprofit", label: "Private nonprofit", cssVar: "--sector-nonprofit" },
  { key: "Private for-profit", label: "Private for-profit", cssVar: "--sector-forprofit" },
];

/**
 * Builds one shared scale per metric (range is set by each view).
 * A few extreme values (e.g. one net price of ~$289k) would squash every
 * other college into a corner, so the upper bound is capped at 1.5 × the
 * 99th percentile. Values beyond the cap are clamped to the axis edge and
 * reported in the footnote — they are never dropped.
 */
export function buildScales(data) {
  const scales = {};
  const clipped = {};
  for (const m of METRICS) {
    const values = data.map((d) => d[m.key]).sort(d3.ascending);
    let lo = values[0];
    let hi = values[values.length - 1];
    if (m.key === "completion_rate") {
      lo = 0;
      hi = 1;
    } else {
      const cap = d3.quantileSorted(values, 0.99) * 1.5;
      hi = Math.min(hi, cap);
    }
    scales[m.key] = d3.scaleLinear().domain([lo, hi]).nice().clamp(true);
    const max = scales[m.key].domain()[1];
    clipped[m.key] = data.filter((d) => d[m.key] > max);
  }
  return { scales, clipped };
}
