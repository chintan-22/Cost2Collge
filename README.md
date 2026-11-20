# Cost2College — College Cost, Debt & Outcomes

**Picking a college? Look past the price tag.** An interactive website that shows what students pay, borrow and earn at U.S. colleges, lets you compare your favorites side by side, and checks how your major pays.

**Live site:** _coming soon_ <!-- replace with the deployed link -->

This repository contains:

- a data-cleaning pipeline that converts the large raw U.S. Department of Education College Scorecard files into smaller, visualization-ready CSV files, and
- a D3.js website with four linked plots built on those files.

## Run the prototype

The cleaned CSV files are already in the repository, so you can run the app straight away. You only need **Python 3** (to start a local web server) and a modern browser (Chrome, Edge, Firefox or Safari). Nothing needs to be installed.

### Steps

1. Clone the repository (skip if you already have it):

   ```bash
   git clone https://github.com/chintan-22/Cost2Collge.git
   ```

2. Open a terminal **inside the `Cost2Collge` folder** (the folder that contains `index.html`).
   - Windows: open the folder in File Explorer, click the address bar, type `cmd` and press Enter.
   - Mac: right-click the folder in Finder → **New Terminal at Folder**.
   - VS Code: open the folder, then **Terminal → New Terminal**.

3. Start the local server:

   ```bash
   python serve.py 8123
   ```

   If that doesn't work, use `python3 serve.py 8123` (Mac/Linux) or `py serve.py 8123` (Windows).
   The number at the end is the port. Port 8123 is used here because the common default, 8000, is often already taken by another local server or holds old cached files.
   You should see:

   ```text
   Serving on http://localhost:8123  (Ctrl+C to stop)
   ```

4. Open **http://localhost:8123** in your browser. Keep the terminal open while you use the app.

5. To stop the server, press **Ctrl + C** in the terminal.

### Why a local server?

Browsers block web pages opened directly from disk (`file://...`) from loading the CSV files, so double-clicking `index.html` shows an error. `serve.py` is a small local server that also tells the browser **not to cache** files, so code changes always show up after a reload.

### Troubleshooting

| Problem | Fix |
| --- | --- |
| Page looks outdated or broken after pulling new code | The browser is using old cached files. Press **Ctrl + Shift + R** (Mac: **Cmd + Shift + R**). If that doesn't help, start the server on another port, e.g. `python serve.py 8124`, and open `http://localhost:8124`. |
| `Address already in use` | Another server is still running. Close the old terminal, or use a different port: `python serve.py 8124`. |
| "Could not load institutions_visualizable.csv" | The page was opened directly from disk, or the server was started in the wrong folder. Start `serve.py` from the folder that contains `index.html`. |
| `python` is not recognized | Try `python3` or `py`, or install Python 3 from python.org. |
| Charts are empty and the console mentions `d3` | The D3 library loads from a CDN, so an internet connection is required. |

## Using the app

All views share the same filters and selections, so an action in one view updates the others.

| Plot | Chart type | What it shows | Interactions |
| --- | --- | --- | --- |
| **1. The big picture** | Scatterplot matrix | Net price, median debt, completion rate and 5-year earnings for every college, each pair in its own box; one dot per college, colored by type; histograms on the diagonal | Hover for details · drag to select · click a dot to pin · double-click a box to open it in plot 2 |
| **2. Zoom in on one trade-off** | Focused scatterplot | One large plot for two chosen measures (Cost vs. pay, Debt vs. pay, Cost vs. graduation, or any pair) | Pair buttons or Across/Up dropdowns · drag to select · click to pin · "Show best deals" draws the Pareto frontier |
| **3. Compare your shortlist** | Aligned dot plot | Up to 4 pinned colleges, one row per measure, against the middle 50% and median of colleges matching the filters; exact values in a table | Hover a dot for details and its percentile |
| **4. Check your major** | Field-of-study scatterplot | Program debt vs. program pay for one major across colleges, or for every major at one pinned college | Pick a major or college · click to pin · arrows show how a pinned college's major compares with the college overall |

Shared controls in the header: **State**, **Type of college**, **Size** and **Major** dropdowns, plus **Reset**. Pinned colleges appear as chips under the header (click × to unpin), and the **Selected colleges** table lists colleges inside the current brush (click a row to pin).

### Help for first-time users

- **How to use**: a 4-step guided tour of the page. It opens by itself on a visitor's first visit (remembered in the browser) and can be reopened from the header.
- **How to read this**: a collapsible, plain-language guide on every plot.
- **Try an example**: a step-by-step walkthrough with real data. A Texas student who wants a big university and plans to study mechanical engineering goes from 1,911 colleges to a shortlist. Each step sets the filters, pins and major automatically. The numbers in its text were checked against the data files; re-check them in `story.js` if the data is updated.

Suggested workflow: filter → spot a pattern in plot 1 → find the best deals in plot 2 → pin 2–4 colleges → compare them in plot 3 → pick a major in plot 4.

## Project structure

```text
Cost2Collge/
├── index.html                          # page layout
├── style.css                           # styling
├── main.js                             # loads data, builds controls, connects the views
├── config.js                           # metrics, sector colors, shared axis scales
├── state.js                            # shared state: filters, brush, pinned colleges, metric pair, field
├── splom.js                            # Plot 1 — the big picture (scatterplot matrix)
├── focused.js                          # Plot 2 — zoom in on one trade-off
├── compare.js                          # Plot 3 — compare your shortlist
├── fields.js                           # Plot 4 — check your major
├── tour.js                             # first-visit guided tour ("How to use")
├── story.js                            # interactive example walkthrough ("Try an example")
├── serve.py                            # local no-cache web server
├── clean_college_scorecard.py          # data-cleaning script
├── institutions_clean.csv              # all cleaned institutions (used by plot 4 for college details)
├── institutions_visualizable.csv       # institutions with all four core metrics (plots 1–3)
├── programs_bachelors_clean.csv
├── programs_bachelors_visualizable.csv # bachelor's programs with debt and earnings (plot 4)
└── README.md
```

The plots never call each other directly. Each one updates the shared state in `state.js` and redraws when that state changes.

---

# Data cleaning guide

The sections below describe how the CSV files were produced. You only need them to regenerate the data.

## Raw data required

Download these two files from the College Scorecard data page:

- `Most-Recent-Cohorts-Institution.csv`
- `Most-Recent-Cohorts-Field-of-Study.csv`

Place them in the same folder as `clean_college_scorecard.py`.

The raw CSVs are very large and should **not** be committed to GitHub.

Your local folder should look like:

```text
Cost2Collge/
├── clean_college_scorecard.py
├── Most-Recent-Cohorts-Institution.csv
├── Most-Recent-Cohorts-Field-of-Study.csv
├── .gitignore
└── README.md
```

## Run the cleaning script

From the project folder:

```bash
python3 clean_college_scorecard.py
```

If your system uses `python` instead of `python3`:

```bash
python clean_college_scorecard.py
```

The current script uses Python's built-in CSV tools, so no extra packages are required.

## What the script cleans

### Institution-level data

The script keeps institutions that award Bachelor's degrees or higher and selects only the variables needed for the project.

Important fields include:

- `UNITID`
- Institution name
- City
- State
- Sector/control
- Undergraduate enrollment
- Net price
- Completion rate
- Median debt
- 5-year median earnings
- 10-year median earnings
- Latitude
- Longitude

### Field-of-study data

For the current prototype, the script keeps Bachelor's-level programs only:

```text
CREDLEV = 3
```

Important fields include:

- `UNITID`
- Institution name
- State
- Sector
- CIP code
- Field of study
- Credential level
- Credential description
- Completer count
- Program median debt
- Program median 5-year earnings

## How the two datasets are connected

Both datasets already contain the common institution identifier:

```text
UNITID
```

The script uses `UNITID` to connect program-level rows back to their parent institution.

Conceptually:

```text
Institution-Level Data
        |
      UNITID
        |
        v
Field-of-Study Data
```

One institution can have many program rows.

Example:

```text
College A
UNITID = 123456

├── Computer Science
├── Engineering
├── Business
└── Psychology
```

The cleaned institution and program datasets remain separate, but selected institution-level metrics are also copied into the program table to make D3 tooltips and drill-down comparisons easier.

## Missing and suppressed values

College Scorecard contains values such as:

```text
NA
PS
PrivacySuppressed
```

The script converts these to blank/missing values.

They are **never converted to zero**.

For example:

```text
Program earnings = PS
```

does not mean:

```text
Program earnings = $0
```

This preserves the meaning of missing and privacy-suppressed data.

## Net price handling

College Scorecard stores public and private net price in different columns.

The script uses:

```text
NPT4_PUB
```

for public institutions and:

```text
NPT4_PRIV
```

for private institutions.

The result is stored in a single cleaned column:

```text
net_price
```

## Earnings measure

The main institution-level earnings metric is:

```text
MD_EARN_WNE_5YR
```

The field-of-study earnings metric is:

```text
EARN_MDN_5YR
```

Using 5-year earnings at both levels keeps institution-level and program-level comparisons more consistent.

The institution dataset also keeps the 10-year earnings value as an optional reference field.

## Output files

Running the cleaning script creates four CSV files.

### `institutions_clean.csv`

Full cleaned institution-level dataset.

Use this when you need all cleaned institutions, including rows with some missing visualization metrics.

### `institutions_visualizable.csv`

Contains only institutions with all four core metrics available:

- Net price
- Completion rate
- Median debt
- 5-year median earnings

Use this for the main institution-level visualizations.

### `programs_bachelors_clean.csv`

Cleaned Bachelor's-level field-of-study data.

Some rows may still have missing program debt or earnings.

### `programs_bachelors_visualizable.csv`

Contains only Bachelor's-level program rows where both:

- Program median debt
- Program median 5-year earnings

are available.

Use this for the field-of-study debt-vs-earnings visualization.

> **Known issue:** the `sector` column in the program files currently reads `Other/Unknown` for every row, because the field-of-study file stores `CONTROL` as text rather than the numeric codes the script expects. The website is not affected: it takes each program's sector from the institution file through `UNITID`. To fix the CSVs, map the text values in `clean_college_scorecard.py` (or fall back to the institution's sector) and re-run the script.

## Which file to use for each visualization

### Plot 1 — The big picture (scatterplot matrix)

Use:

```text
institutions_visualizable.csv
```

Main metrics:

- `net_price`
- `median_debt`
- `completion_rate`
- `median_earnings_5yr`

Each point represents one institution.

### Plot 2 — Zoom in on one trade-off (focused scatterplot)

Use:

```text
institutions_visualizable.csv
```

Example metric pairs:

```text
Net Price vs. Earnings
Debt vs. Earnings
Net Price vs. Completion
```

This view can also calculate the Pareto frontier for the selected pair of metrics.

### Plot 3 — Compare your shortlist (aligned dot plot)

Use:

```text
institutions_visualizable.csv
```

Compare selected colleges using:

- Net price
- Median debt
- Completion rate
- Median earnings

Peer medians or distributions can also be calculated from this file.

### Plot 4 — Check your major (field-of-study scatterplot)

Use:

```text
programs_bachelors_visualizable.csv
```

Main fields:

- `program_median_debt`
- `program_median_earnings_5yr`
- `field_of_study`
- `institution_name`

Use `UNITID` to connect the selected college from the institution-level views to its program-level records.

## Scope

The field-of-study plot covers **bachelor's-level** majors only. Net price and earnings are institution-wide figures for undergraduates. To add master's or doctoral programs later, change the `CREDLEV` filter in `clean_college_scorecard.py` and re-run it.

## Git / GitHub notes

Do **not** commit:

```text
Most-Recent-Cohorts-Institution.csv
Most-Recent-Cohorts-Field-of-Study.csv
```

They are too large for normal GitHub storage.

The `.gitignore` should contain:

```gitignore
.DS_Store
Most-Recent-Cohorts-Institution.csv
Most-Recent-Cohorts-Field-of-Study.csv
```

The following project files can be committed:

```text
clean_college_scorecard.py
institutions_clean.csv
institutions_visualizable.csv
programs_bachelors_clean.csv
programs_bachelors_visualizable.csv
README.md
index.html
style.css
main.js
config.js
state.js
splom.js
focused.js
compare.js
fields.js
tour.js
story.js
serve.py
```

If any generated CSV becomes too large, keep the smaller visualization-ready outputs in the repository and regenerate the larger cleaned files locally. Keep `institutions_clean.csv`, though: the field-of-study view uses it to look up college details.

## How a teammate reproduces the data

1. Clone the repository.
2. Download the two raw College Scorecard files.
3. Place them beside `clean_college_scorecard.py`.
4. Run:

```bash
python3 clean_college_scorecard.py
```

5. Confirm the four cleaned CSV files are generated.
6. Start the app with `python serve.py 8123` (see [Run the prototype](#run-the-prototype)).

## Data pipeline summary

```text
College Scorecard Raw Data
            |
            v
 clean_college_scorecard.py
            |
            +-----------------------------+
            |                             |
            v                             v
 Institution-Level Data          Field-of-Study Data
            |                             |
            v                             v
institutions_visualizable.csv    programs_bachelors_visualizable.csv
            |                             |
            v                             v
Scatterplot Matrix               Field-of-Study Drill-Down
Focused Trade-Off Plot
Pinned College Comparison
```

The key idea is that the raw College Scorecard data is reduced to only the variables required by the visualizations, missing and suppressed values are handled correctly, and institution-level and program-level records remain connected through `UNITID`.
