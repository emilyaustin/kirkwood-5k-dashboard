#!/usr/bin/env python3
"""Fetch Kirkwood Spring Fling 5K results from RunSignUp API and save as data.json."""

import json
import time
import urllib.request
import urllib.error

RACE_ID = 31048
EVENTS = {
    2016: 96929,
    2017: 154583,
    2018: 216816,
    2019: 296173,
    2021: 505980,
    2022: 570205,
    2023: 681186,
    2024: 753025,
    2025: 891758,
    2026: 1038563,
}


def parse_time_to_seconds(time_str):
    if not time_str or not time_str.strip():
        return None
    s = time_str.strip()
    try:
        parts = s.split(':')
        if len(parts) == 2:
            return float(parts[0]) * 60 + float(parts[1])
        elif len(parts) == 3:
            return float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
    except (ValueError, IndexError):
        pass
    return None


def safe_int(val):
    try:
        return int(val) if val else 0
    except (ValueError, TypeError):
        return 0


def ag_bracket(age):
    if not age or age <= 0:
        return ""
    if age <= 12: return "0-12"
    if age <= 19: return "13-19"
    if age <= 29: return "20-29"
    if age <= 39: return "30-39"
    if age <= 49: return "40-49"
    if age <= 59: return "50-59"
    return "60+"


def fetch_page(event_id, page, per_page=100):
    url = (
        f"https://runsignup.com/rest/race/{RACE_ID}/results"
        f"?event_id={event_id}&results_per_page={per_page}&page={page}&format=json"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def infer_gender_from_set_name(name):
    """Return 'M', 'F', or None based on the result set name."""
    n = (name or "").lower()
    if "male" in n and "female" not in n:
        return "M"
    if "female" in n:
        return "F"
    return None


def extract_results(raw, seen_bibs, no_bib_records):
    """Merge one page's results into seen_bibs and no_bib_records.

    seen_bibs maps bib -> raw API record (mutable dicts). Gender upgrades
    are applied in-place so that building flat dicts at the end of the year
    reflects the best available gender for every runner.

    Returns the count of newly seen runners.
    """
    sets = raw.get("individual_results_sets", [])
    if not sets:
        return 0

    new_count = 0

    for rs in sets:
        inferred_gender = infer_gender_from_set_name(rs.get("individual_result_set_name", ""))
        for r in rs.get("results", []):
            bib = r.get("bib")
            gender = (r.get("gender") or "").strip().upper() or inferred_gender or ""
            r["gender"] = gender

            if bib and bib in seen_bibs:
                # Runner already recorded — upgrade gender if we now know it.
                # Modifying seen_bibs[bib] in-place means the upgrade is visible
                # when we build flat dicts after all pages are processed.
                if not seen_bibs[bib].get("gender") and gender:
                    seen_bibs[bib]["gender"] = gender
                continue

            if bib:
                seen_bibs[bib] = r
            else:
                no_bib_records.append(r)
            new_count += 1

    return new_count


def fetch_year(year, event_id):
    seen_bibs = {}       # bib -> raw API record; gender upgrades applied in-place
    no_bib_records = []  # runners without bibs (no deduplication possible)
    page = 1
    first_page = True

    while True:
        try:
            raw = fetch_page(event_id, page)
        except Exception as e:
            print(f"    ERROR on page {page}: {e}")
            break

        if first_page:
            print(f"    Response keys: {list(raw.keys())}")
            first_page = False

        new_count = extract_results(raw, seen_bibs, no_bib_records)
        if new_count == 0:
            print(f"    No new records on page {page} — stopping")
            if page == 1:
                print(f"    Full response: {json.dumps(raw)[:500]}")
            break

        running_total = len(seen_bibs) + len(no_bib_records)
        print(f"    Page {page}: {new_count} new records  (running total: {running_total})")

        if page >= 100:
            break

        page += 1
        time.sleep(0.4)

    # Build flat output dicts after all pages so in-place gender upgrades are reflected.
    all_results = []
    oldest   = {"age": 0,   "year": None}
    youngest = {"age": 999, "year": None}

    for r in list(seen_bibs.values()) + no_bib_records:
        chip_time = (r.get("chip_time") or r.get("clock_time") or "").strip()
        age    = safe_int(r.get("age"))
        gender = r.get("gender") or ""
        place  = safe_int(r.get("place"))

        if 5 <= age < 95:
            if age > oldest["age"]:
                oldest = {"age": age, "year": year}
            if age < youngest["age"]:
                youngest = {"age": age, "year": year}

        all_results.append({
            "place":             place,
            "gender":            gender,
            "age_bracket":       ag_bracket(age),
            "chip_time":         chip_time,
            "chip_time_seconds": parse_time_to_seconds(chip_time),
        })

    return all_results, oldest, youngest


def main():
    all_data = {}
    years = []
    overall_oldest   = {"age": 0,   "year": None}
    overall_youngest = {"age": 999, "year": None}

    for year, event_id in sorted(EVENTS.items()):
        print(f"\nFetching {year}  (event_id={event_id}) ...")
        results, oldest, youngest = fetch_year(year, event_id)
        all_data[str(year)] = results
        years.append(year)
        print(f"  → {len(results)} total finishers in {year}")

        if oldest["age"] > overall_oldest["age"]:
            overall_oldest = oldest
        if youngest["age"] < overall_youngest["age"]:
            overall_youngest = youngest

    output = {
        "race":          "Kirkwood Spring Fling 5K",
        "location":      "Kirkwood, Atlanta, GA",
        "years":         years,
        "oldest_age":    overall_oldest["age"],
        "oldest_year":   overall_oldest["year"],
        "youngest_age":  overall_youngest["age"],
        "youngest_year": overall_youngest["year"],
        "results":       all_data,
    }

    with open("data.json", "w") as f:
        json.dump(output, f, separators=(",", ":"))

    total    = sum(len(v) for v in all_data.values())
    size_kb  = len(json.dumps(output, separators=(",", ":"))) // 1024
    print(f"\nSaved data.json  ({total} total results, ~{size_kb} KB)")


if __name__ == "__main__":
    main()
