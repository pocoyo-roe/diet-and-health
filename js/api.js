/* USDA FoodData Central client. https://fdc.nal.usda.gov/api-guide */
(function () {
  'use strict';

  const BASE = 'https://api.nal.usda.gov/fdc/v1';

  const DATASETS = {
    whole: { label: 'Whole foods (USDA lab data)', types: ['Foundation', 'SR Legacy'] },
    survey: { label: 'Meals & dishes (FNDDS)', types: ['Survey (FNDDS)'] },
    branded: { label: 'Branded / packaged', types: ['Branded'] },
    all: { label: 'Everything', types: ['Foundation', 'SR Legacy', 'Survey (FNDDS)', 'Branded'] },
  };

  function apiKey() {
    return (Store.state.settings.apiKey || '').trim() || 'DEMO_KEY';
  }

  async function request(path, params) {
    const qs = new URLSearchParams(Object.assign({ api_key: apiKey() }, params || {}));
    let res;
    try {
      res = await fetch(`${BASE}${path}?${qs}`);
    } catch (e) {
      throw new Error('Could not reach the USDA database. Check your internet connection.');
    }
    if (res.status === 429) {
      throw new Error('USDA rate limit reached. The shared DEMO_KEY only allows a few searches per hour — add your own free API key in Settings.');
    }
    if (res.status === 403) {
      throw new Error('The USDA API key was rejected. Check it in Settings.');
    }
    if (!res.ok) throw new Error(`USDA database returned an error (${res.status}).`);
    return res.json();
  }

  async function search(query, dataset, page) {
    const types = (DATASETS[dataset] || DATASETS.whole).types;
    const data = await request('/foods/search', {
      query,
      dataType: types.join(','),
      pageSize: 25,
      pageNumber: page || 1,
    });
    const foods = (data.foods || []).map((f) => {
      const nutrients = {};
      for (const n of f.foodNutrients || []) {
        if (n.nutrientNumber == null || n.value == null) continue;
        nutrients[String(n.nutrientNumber)] = { name: n.nutrientName, unit: Nutrients.normUnit(n.unitName), amount: n.value };
      }
      return {
        fdcId: f.fdcId,
        name: f.description,
        brand: f.brandOwner || f.brandName || '',
        dataType: f.dataType,
        category: f.foodCategory || '',
        nutrients,
      };
    });
    return { foods, totalPages: data.totalPages || 1, totalHits: data.totalHits || 0 };
  }

  function round(n, d) { const p = Math.pow(10, d || 0); return Math.round(n * p) / p; }

  function portionLabel(p) {
    if (p.portionDescription && p.portionDescription !== 'Quantity not specified') return p.portionDescription;
    const unit = p.measureUnit && p.measureUnit.name !== 'undetermined' ? p.measureUnit.name : '';
    return [p.amount != null ? round(p.amount, 2) : '', unit, p.modifier || ''].filter(Boolean).join(' ').trim();
  }

  // Fetch the full record and normalise it into our stored food shape.
  async function getFood(fdcId) {
    const f = await request(`/food/${encodeURIComponent(fdcId)}`);
    const nutrients = {};
    for (const fn of f.foodNutrients || []) {
      const n = fn.nutrient || fn;
      const number = n.number != null ? n.number : fn.nutrientNumber;
      const amount = fn.amount != null ? fn.amount : fn.value;
      if (number == null || amount == null) continue;
      const key = String(number);
      if (nutrients[key]) continue; // keep the first (primary) value
      nutrients[key] = {
        name: n.name || fn.nutrientName,
        unit: Nutrients.normUnit(n.unitName || fn.unitName),
        amount: Number(amount),
        rank: n.rank,
      };
    }

    const portions = [];
    const seen = new Set();
    for (const p of f.foodPortions || []) {
      if (!p.gramWeight) continue;
      const label = portionLabel(p) || 'portion';
      const id = label + '|' + p.gramWeight;
      if (seen.has(id)) continue;
      seen.add(id);
      portions.push({ label: `${label} (${round(p.gramWeight, 1)} g)`, grams: p.gramWeight });
    }
    if (f.servingSize && /^(g|grm|ml|mlt)$/i.test(f.servingSizeUnit || '')) {
      const unit = /^m/i.test(f.servingSizeUnit) ? 'ml' : 'g';
      const house = f.householdServingFullText ? `${f.householdServingFullText}, ` : '';
      portions.unshift({ label: `1 serving (${house}${round(f.servingSize, 1)} ${unit})`, grams: f.servingSize });
    }

    return {
      id: 'fdc:' + f.fdcId,
      source: 'USDA FoodData Central',
      fdcId: f.fdcId,
      name: f.description,
      brand: f.brandOwner || f.brandName || '',
      dataType: f.dataType,
      category: (f.foodCategory && f.foodCategory.description) || f.brandedFoodCategory || '',
      ingredients: f.ingredients || '',
      nutrients,
      portions,
      fetchedAt: Date.now(),
    };
  }

  window.Api = { DATASETS, search, getFood };
})();
