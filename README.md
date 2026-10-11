# Nutrient Tracker

A simple web app for tracking what you eat, including macros **and** micronutrients
(vitamins, minerals, fatty acids, amino acids…). Everything is metric: grams, millilitres,
kcal and kJ.

## Food databases

| Source | What it covers | How it's used |
|---|---|---|
| **McCance and Widdowson's CoFID 2021** (official UK data, OHID) | ~2,900 UK foods: raw and cooked ingredients, dishes. Up to ~250 nutrients per food. | Bundled in `data/cofid.js` and searched in the browser; no key needed. |
| **Open Food Facts** | UK supermarket and branded products, with label nutrition (often only label nutrients). | Searched live; no key needed. |
| **USDA FoodData Central** | US foods, very detailed lab data. | Searched live; optional free API key. |

When you pick a food, its full nutrient profile is saved to your personal library, so
it's instantly available (even offline) next time.

`data/cofid.js` is generated from the gov.uk spreadsheet by the **Build UK food data
(CoFID)** workflow in the Actions tab (`scripts/fetch_cofid.py`, `scripts/build_cofid.py`).
Re-run it if a new CoFID edition is published.

## Features

- **Diary**: log foods by meal and day in grams or the food's own portions (servings,
  packs, pieces). Calories (kcal and kJ), protein, carbs and fat are shown against your
  targets, plus a vitamin/mineral/fat panel showing % of daily target. Nutrients over
  their limit (salt, saturated fat, sugars…) are flagged. "Copy previous day" is there
  for repeat meals.
- **Search & deep dive**: each food shows how much of your daily targets it covers and a
  full nutrient table, for your chosen amount or per 100 g.
- **My foods**: your saved foods, plus custom foods you enter from a nutrition label.
- **Trends**: calories per day and average nutrient intake over 7–90 days, with a list
  of nutrients you're consistently low on.
- **Settings**: target presets (UK label Reference Intakes, UK adult man/woman RNIs, or US
  values), tweak any target, and export/import a backup.

All data stays in your browser (localStorage).

## Running it

It's plain HTML/CSS/JS with no build step:

- Open `index.html` directly in your browser, **or**
- serve the folder: `python3 -m http.server 8000`, then open http://localhost:8000, **or**
- use the hosted version at https://pocoyo-roe.github.io/diet-and-health/ (GitHub Pages, deployed from this repo's default branch).

## USDA API key (optional)

Only needed for the US datasets. Without a key the app uses the shared `DEMO_KEY`, which only allows a few requests per
hour. Get your own free key at https://fdc.nal.usda.gov/api-key-signup and paste it
into the app's own **Settings** tab → *USDA API key* (not GitHub's settings). It is stored only in
your browser, so enter it once on each device you use. Never commit the key to this repo — the
repo and site are public.

## Notes on the data

- CoFID and USDA whole foods have the most complete micronutrient data; branded products
  (Open Food Facts, USDA Branded) usually only list what's on the label.
  The diary notes when some logged foods have no data for a nutrient, since the
  true total may then be higher than shown.
- Targets are general reference values for adults, not personalised medical advice.

## Data licences

- CoFID: Contains public sector information licensed under the Open Government Licence v3.0.
- Open Food Facts: Open Database License (ODbL).
- USDA FoodData Central: public domain (CC0).
