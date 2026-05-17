# Kirkwood Spring Fling 5K — Analytics Dashboard

Interactive multi-year results dashboard for the [Kirkwood Spring Fling 5K](https://runsignup.com/race/results/31048).

**Live site:** https://emilyaustin.github.io/kirkwood-5k-dashboard

## What it shows

- **Participation trends** — total finishers and gender breakdown by year
- **Is the race getting faster?** — overall podium times and field-wide median/mean times by year
- **Who's running?** — age group distribution and age group podium trends (interactive by bracket)

## Fetch / refresh data

Requires Python 3 (no dependencies beyond stdlib):

```bash
cd kirkwood-5k-dashboard
python3 fetch_data.py
```

This pulls results for all available years from the RunSignUp API and writes `data.json`. Re-run whenever you want updated data (e.g. after a new race). Expect it to take ~2–3 minutes.

## Run locally

Because `index.html` loads `data.json` via `fetch()`, you need a local HTTP server:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploy to GitHub Pages

1. Create a repo on GitHub (e.g. `kirkwood-5k-dashboard`)
2. Push this directory to the `main` branch
3. In repo Settings → Pages → Source, select **GitHub Actions**
4. The workflow in `.github/workflows/pages.yml` will deploy on every push to `main`

The workflow runs `fetch_data.py` automatically during deployment — `data.json` is generated in CI and is not stored in the repository.
