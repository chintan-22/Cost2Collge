# Cost2College — Data Cleaning & Visualization Data Guide

This repository contains the data-cleaning pipeline for the **College Cost, Debt & Outcomes** visualization project.

The preprocessing step converts the large raw U.S. Department of Education College Scorecard files into smaller, visualization-ready CSV files for the D3.js dashboard.

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

## Which file to use for each visualization

### Visualization 1 — Scatterplot Matrix

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

### Visualization 2 — Focused Trade-Off Scatterplot

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

### Visualization 3 — Pinned College Comparison

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

### Visualization 4 — Field-of-Study Drill-Down

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

## Recommended D3 workflow

Load both visualization-ready files:

```javascript
const institutions = await d3.csv("institutions_visualizable.csv");
const programs = await d3.csv("programs_bachelors_visualizable.csv");
```

When a college is selected, use its `UNITID`:

```javascript
const selectedPrograms = programs.filter(
  d => d.UNITID === selectedCollege.UNITID
);
```

This retrieves the program rows belonging to the selected institution.

## Current prototype scope

The current prototype starts with:

```text
Bachelor's-level field-of-study data
```

This matches the current presentation scope.

If the team later decides to add Master's or doctoral program-level analysis, update the `CREDLEV` filter in `clean_college_scorecard.py`.

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
```

If any generated CSV becomes too large, keep the smaller visualization-ready outputs in the repository and regenerate the larger cleaned files locally.

## How a teammate reproduces the data

1. Clone the repository.
2. Download the two raw College Scorecard files.
3. Place them beside `clean_college_scorecard.py`.
4. Run:

```bash
python3 clean_college_scorecard.py
```

5. Confirm the four cleaned CSV files are generated.
6. Use the visualization-ready files for D3 development.

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
