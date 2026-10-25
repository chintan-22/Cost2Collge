import csv
from pathlib import Path

INST_FILE = Path("Most-Recent-Cohorts-Institution.csv")
PROGRAM_FILE = Path("Most-Recent-Cohorts-Field-of-Study.csv")

MISSING = {"", "NA", "N/A", "NULL", "PS", "PrivacySuppressed", "nan", "None"}

def clean_num(v):
    if v is None:
        return ""
    s = str(v).strip()
    if s in MISSING:
        return ""
    try:
        x = float(s)
        return str(int(x)) if x.is_integer() else str(x)
    except ValueError:
        return ""

def clean_text(v):
    if v is None:
        return ""
    s = str(v).strip()
    return "" if s in MISSING else s

def control_label(v):
    return {
        "1": "Public",
        "2": "Private nonprofit",
        "3": "Private for-profit"
    }.get(str(v).strip(), "Other/Unknown")

# -----------------------------
# 1) Institution-level dataset
# -----------------------------
institutions = []

with INST_FILE.open(newline="", encoding="utf-8-sig") as f:
    reader = csv.DictReader(f)

    for r in reader:
        # Current prototype focuses on institutions awarding bachelor's or higher.
        if clean_text(r.get("HIGHDEG")) not in {"3", "4"}:
            continue

        control = clean_text(r.get("CONTROL"))

        # College Scorecard stores public/private net price in separate columns.
        net_price = r.get("NPT4_PUB") if control == "1" else r.get("NPT4_PRIV")

        row = {
            "UNITID": clean_text(r.get("UNITID")),
            "institution_name": clean_text(r.get("INSTNM")),
            "city": clean_text(r.get("CITY")),
            "state": clean_text(r.get("STABBR")),
            "control_code": control,
            "sector": control_label(control),
            "predominant_degree": clean_text(r.get("PREDDEG")),
            "highest_degree": clean_text(r.get("HIGHDEG")),
            "undergrad_enrollment": clean_num(r.get("UGDS")),
            "net_price": clean_num(net_price),
            "completion_rate": clean_num(r.get("C150_4")),
            "median_debt": clean_num(r.get("GRAD_DEBT_MDN")),
            # Main earnings measure used by the visualizations:
            "median_earnings_5yr": clean_num(r.get("MD_EARN_WNE_5YR")),
            # Optional reference measure:
            "median_earnings_10yr": clean_num(r.get("MD_EARN_WNE_P10")),
            "latitude": clean_num(r.get("LATITUDE")),
            "longitude": clean_num(r.get("LONGITUDE")),
        }

        core_metrics = [
            "net_price",
            "completion_rate",
            "median_debt",
            "median_earnings_5yr"
        ]

        row["complete_core_metrics"] = (
            "1" if all(row[x] != "" for x in core_metrics) else "0"
        )

        institutions.append(row)

institution_fields = list(institutions[0].keys())

with open("institutions_clean.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=institution_fields)
    writer.writeheader()
    writer.writerows(institutions)

# Complete-case file for scatterplot matrix / trade-off / aligned comparison.
institutions_visualizable = [
    r for r in institutions if r["complete_core_metrics"] == "1"
]

with open("institutions_visualizable.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=institution_fields)
    writer.writeheader()
    writer.writerows(institutions_visualizable)

# Lookup for linking field-of-study rows to institution metadata.
institution_lookup = {
    r["UNITID"]: r
    for r in institutions
    if r["UNITID"]
}

# --------------------------------
# 2) Field-of-study / program data
# --------------------------------
programs = []

with PROGRAM_FILE.open(newline="", encoding="utf-8-sig") as f:
    reader = csv.DictReader(f)

    for r in reader:
        # Current finalized PPT scope: Bachelor's programs first.
        if clean_text(r.get("CREDLEV")) != "3":
            continue

        unitid = clean_text(r.get("UNITID"))
        inst = institution_lookup.get(unitid, {})

        row = {
            "UNITID": unitid,
            "institution_name": (
                clean_text(r.get("INSTNM"))
                or inst.get("institution_name", "")
            ),
            "state": inst.get("state", ""),
            "sector": (
                control_label(clean_text(r.get("CONTROL")))
                if clean_text(r.get("CONTROL"))
                else inst.get("sector", "")
            ),
            "CIPCODE": clean_text(r.get("CIPCODE")),
            "field_of_study": clean_text(r.get("CIPDESC")),
            "credential_level": clean_text(r.get("CREDLEV")),
            "credential_description": clean_text(r.get("CREDDESC")),
            "completer_count_1": clean_num(r.get("IPEDSCOUNT1")),
            "completer_count_2": clean_num(r.get("IPEDSCOUNT2")),
            "program_median_debt": clean_num(r.get("DEBT_ALL_STGP_ANY_MDN")),
            "program_median_earnings_5yr": clean_num(r.get("EARN_MDN_5YR")),

            # Institution metrics copied into the program table for easier D3 tooltips
            # and college-vs-program comparisons.
            "institution_net_price": inst.get("net_price", ""),
            "institution_completion_rate": inst.get("completion_rate", ""),
            "institution_median_debt": inst.get("median_debt", ""),
            "institution_median_earnings_5yr": inst.get(
                "median_earnings_5yr", ""
            ),
        }

        row["has_program_debt"] = (
            "1" if row["program_median_debt"] != "" else "0"
        )
        row["has_program_earnings"] = (
            "1" if row["program_median_earnings_5yr"] != "" else "0"
        )
        row["visualizable_program"] = (
            "1"
            if row["has_program_debt"] == "1"
            and row["has_program_earnings"] == "1"
            else "0"
        )

        programs.append(row)

program_fields = list(programs[0].keys())

with open("programs_bachelors_clean.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=program_fields)
    writer.writeheader()
    writer.writerows(programs)

# Complete program rows for the debt-vs-earnings field-of-study scatterplot.
programs_visualizable = [
    r for r in programs if r["visualizable_program"] == "1"
]

with open("programs_bachelors_visualizable.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=program_fields)
    writer.writeheader()
    writer.writerows(programs_visualizable)

print("Institution rows:", len(institutions))
print("Institution visualization rows:", len(institutions_visualizable))
print("Bachelor's program rows:", len(programs))
print("Program visualization rows:", len(programs_visualizable))
