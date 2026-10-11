# Nutrient Tracker

A simple web app for tracking what you eat, including macros **and** micronutrients
(vitamins, minerals, fatty acids, amino acids…).

There is no big food database bundled in. Instead, you search the free
[USDA FoodData Central](https://fdc.nal.usda.gov/) database, and when you pick a food the
app downloads its **full nutrient profile** (often 100+ nutrients for whole foods) and
saves it to your personal library, so it's instantly available (even offline) next time.

## Features

- **Diary**: log foods by meal and day, with amounts in grams, ounces or the food's own
  portions (cups, slices, servings…). Calories, protein, carbs and fat are shown against
  your targets, plus a vitamin/mineral/fat panel showing % of daily target. Nutrients over
  their limit (sodium, saturated fat, added sugar…) are flagged. "Copy previous day" is
  there for repeat meals.
- **Search & deep dive**: search whole foods (USDA lab data), mixed dishes (FNDDS) or
  branded products. Each food shows how much of your daily targets it covers and a full
  nutrient table grouped into macros, sugars, vitamins, minerals, fatty acids and amino
  acids, for your chosen amount or per 100 g.
- **My foods**: your downloaded foods, plus custom foods you enter from a nutrition label.
- **Trends**: calories per day and average nutrient intake over 7–90 days, with a list
  of nutrients you're consistently low on.
- **Settings**: choose target presets (FDA Daily Values, adult man or adult woman RDAs),
  tweak any target, and export/import a backup.

All data stays in your browser (localStorage). Nothing is sent anywhere except search
requests to the USDA API.

## Running it

It's plain HTML/CSS/JS with no build step:

- Open `index.html` directly in your browser, **or**
- serve the folder: `python3 -m http.server 8000`, then open http://localhost:8000, **or**
- publish it with GitHub Pages (Settings → Pages → deploy from branch) to use it on your phone.

## USDA API key

Without a key the app uses the shared `DEMO_KEY`, which only allows a few requests per
hour. Get your own free key at https://fdc.nal.usda.gov/api-key-signup and paste it
into **Settings → USDA API key** (it is stored only in your browser).

## Notes on the data

- USDA data quality varies by dataset: *Foundation* and *SR Legacy* foods have the most
  complete micronutrient data; branded foods usually only list what's on the label.
  The diary notes when some logged foods have no data for a nutrient, since the
  true total may then be higher than shown.
- Targets are general reference values for adults, not personalised medical advice.
