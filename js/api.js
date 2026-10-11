/* Food data sources:
 *  - UK CoFID (McCance & Widdowson), bundled in data/cofid.js and searched locally
 *  - Open Food Facts, UK packaged/supermarket products  https://openfoodfacts.github.io/openfoodfacts-server/api/
 *  - USDA FoodData Central                               https://fdc.nal.usda.gov/api-guide
 * Every source is normalised into the same stored food shape, with nutrient
 * amounts per 100 g keyed by USDA nutrient number where one exists. */
(function () {
  'use strict';

  const FDC_BASE = 'https://api.nal.usda.gov/fdc/v1';
  const OFF_BASE = 'https://world.openfoodfacts.org';

  const DATASETS = {
    uk: { label: 'UK foods – McCance & Widdowson (official UK data)', source: 'cofid' },
    off: { label: 'UK supermarket products (Open Food Facts)', source: 'off' },
    whole: { label: 'US whole foods (USDA)', source: 'usda', types: ['Foundation', 'SR Legacy'] },
    survey: { label: 'US meals & dishes (USDA FNDDS)', source: 'usda', types: ['Survey (FNDDS)'] },
    branded: { label: 'US branded products (USDA)', source: 'usda', types: ['Branded'] },
  };

  const PAGE_SIZE = 25;

  function round(n, d) { const p = Math.pow(10, d || 0); return Math.round(n * p) / p; }

  // ---------- UK CoFID (local) ----------
  let cofidPromise = null;
  function loadCofid() {
    if (window.COFID) return Promise.resolve(window.COFID);
    if (!cofidPromise) {
      cofidPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'data/cofid.js';
        s.onload = () => (window.COFID ? resolve(window.COFID) : reject(new Error('UK food data is empty.')));
        s.onerror = () => { cofidPromise = null; reject(new Error('Could not load the UK food database file (data/cofid.js).')); };
        document.head.appendChild(s);
      });
    }
    return cofidPromise;
  }

  function cofidFood(data, row) {
    const [code, name, flat] = row;
    const nutrients = {};
    for (let i = 0; i < flat.length; i += 2) {
      const [key, nName, unit, group] = data.nutrients[flat[i]];
      nutrients[key] = { name: nName, unit: Nutrients.normUnit(unit), amount: flat[i + 1], rank: flat[i], group };
    }
    return {
      id: 'cofid:' + code,
      source: "McCance and Widdowson's CoFID 2021 (UK)",
      dataType: 'UK CoFID',
      code,
      name,
      brand: '',
      category: '',
      nutrients,
      portions: [],
      fetchedAt: Date.now(),
    };
  }

  async function searchCofid(query, page) {
    const data = await loadCofid();
    const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const hits = [];
    for (const row of data.foods) {
      const n = row[1].toLowerCase();
      if (!words.every((w) => n.includes(w))) continue;
      // Prefer names that start with the first word, then shorter (more generic) names.
      const score = (n.startsWith(words[0]) ? 0 : 1000) + (n.split(',')[0].includes(words[0]) ? 0 : 500) + n.length;
      hits.push([score, row]);
    }
    hits.sort((a, b) => a[0] - b[0]);
    const start = (page - 1) * PAGE_SIZE;
    return {
      foods: hits.slice(start, start + PAGE_SIZE).map(([, row]) => cofidFood(data, row)),
      totalHits: hits.length,
      totalPages: Math.max(1, Math.ceil(hits.length / PAGE_SIZE)),
    };
  }

  async function getCofid(code) {
    const data = await loadCofid();
    const row = data.foods.find((r) => r[0] === code);
    if (!row) throw new Error('Food not found in UK database.');
    return cofidFood(data, row);
  }

  // ---------- Open Food Facts ----------
  // OFF "<key>_100g" values are in grams (energy-kcal in kcal).
  const OFF_MAP = {
    'energy-kcal': ['208', 'kcal'], proteins: ['203', 'g'], carbohydrates: ['205', 'g'], fat: ['204', 'g'],
    fiber: ['291', 'g'], sugars: ['269', 'g'], 'added-sugars': ['539', 'g'], starch: ['209', 'g'],
    'saturated-fat': ['606', 'g'], 'trans-fat': ['605', 'g'], 'monounsaturated-fat': ['645', 'g'],
    'polyunsaturated-fat': ['646', 'g'], cholesterol: ['601', 'g'], salt: ['salt', 'g'], sodium: ['307', 'g'],
    'alpha-linolenic-acid': ['851', 'g'], 'eicosapentaenoic-acid': ['629', 'g'], 'docosahexaenoic-acid': ['621', 'g'],
    'linoleic-acid': ['675', 'g'], 'omega-3-fat': ['omega3', 'g'], 'omega-6-fat': ['omega6', 'g'],
    'vitamin-a': ['320', 'g'], 'vitamin-d': ['328', 'g'], 'vitamin-e': ['323', 'g'], 'vitamin-k': ['430', 'g'],
    'vitamin-c': ['401', 'g'], 'vitamin-b1': ['404', 'g'], 'vitamin-b2': ['405', 'g'], 'vitamin-pp': ['406', 'g'],
    'vitamin-b6': ['415', 'g'], 'vitamin-b9': ['435', 'g'], folates: ['417', 'g'], 'vitamin-b12': ['418', 'g'],
    biotin: ['416', 'g'], 'pantothenic-acid': ['410', 'g'], choline: ['421', 'g'],
    calcium: ['301', 'g'], phosphorus: ['305', 'g'], iron: ['303', 'g'], magnesium: ['304', 'g'], zinc: ['309', 'g'],
    copper: ['312', 'g'], manganese: ['315', 'g'], fluoride: ['313', 'g'], selenium: ['317', 'g'], iodine: ['314', 'g'],
    potassium: ['306', 'g'], chloride: ['chloride', 'g'], caffeine: ['262', 'g'],
  };
  // Display units for the deep-dive table.
  const OFF_DISPLAY = {
    '601': 'mg', '307': 'mg', '320': 'µg', '328': 'µg', '323': 'mg', '430': 'µg', '401': 'mg', '404': 'mg',
    '405': 'mg', '406': 'mg', '415': 'mg', '435': 'µg', '417': 'µg', '418': 'µg', '416': 'µg', '410': 'mg',
    '421': 'mg', '301': 'mg', '305': 'mg', '303': 'mg', '304': 'mg', '309': 'mg', '312': 'mg', '315': 'mg',
    '313': 'µg', '317': 'µg', '314': 'µg', '306': 'mg', chloride: 'mg', '262': 'mg',
  };
  const OFF_FIELDS = 'code,product_name,product_name_en,generic_name,brands,nutriments,serving_quantity,serving_size,product_quantity,quantity,categories,ingredients_text_en,ingredients_text';

  function offNutrients(nm) {
    const out = {};
    nm = nm || {};
    for (const [key, [num, unit]] of Object.entries(OFF_MAP)) {
      const v = nm[key + '_100g'];
      if (v == null || v === '' || isNaN(Number(v))) continue;
      const show = OFF_DISPLAY[num] || unit;
      const name = key.charAt(0).toUpperCase() + key.slice(1).replace(/-/g, ' ');
      out[num] = { name, unit: show, amount: Nutrients.convertUnit(Number(v), unit, show) };
    }
    if (!out['208']) {
      const kj = nm['energy-kj_100g'] != null ? nm['energy-kj_100g'] : nm['energy_100g'];
      if (kj != null && !isNaN(Number(kj))) out['208'] = { name: 'Energy', unit: 'kcal', amount: Number(kj) / 4.184 };
    }
    return out;
  }

  function offFood(p) {
    const portions = [];
    const sq = Number(p.serving_quantity);
    if (sq > 0) portions.push({ label: `1 serving${p.serving_size ? ` (${p.serving_size})` : ` (${round(sq, 1)} g)`}`, grams: sq });
    const pq = Number(p.product_quantity);
    if (pq > 0 && pq <= 5000 && pq !== sq) portions.push({ label: `Whole pack (${p.quantity || round(pq, 1) + ' g'})`, grams: pq });
    return {
      id: 'off:' + p.code,
      source: 'Open Food Facts',
      dataType: 'Open Food Facts',
      code: p.code,
      url: `${OFF_BASE}/product/${encodeURIComponent(p.code)}`,
      name: p.product_name_en || p.product_name || p.generic_name || 'Unnamed product',
      brand: (p.brands || '').split(',')[0].trim(),
      category: (p.categories || '').split(',').pop().trim(),
      ingredients: p.ingredients_text_en || p.ingredients_text || '',
      nutrients: offNutrients(p.nutriments),
      portions,
      fetchedAt: Date.now(),
    };
  }

  async function getJSON(url, errors) {
    let res;
    try {
      res = await fetch(url);
    } catch (e) {
      throw new Error('Could not reach the food database. Check your internet connection.');
    }
    if (errors && errors[res.status]) throw new Error(errors[res.status]);
    if (!res.ok) throw new Error(`The food database returned an error (${res.status}).`);
    return res.json();
  }

  const OFF_ERRORS = { 429: 'Open Food Facts is limiting searches right now (about 10 a minute). Wait a moment and try again.' };

  async function searchOff(query, page) {
    const qs = new URLSearchParams({
      search_terms: query, search_simple: 1, action: 'process', json: 1,
      page_size: PAGE_SIZE, page,
      tagtype_0: 'countries', tag_contains_0: 'contains', tag_0: 'united-kingdom',
      sort_by: 'unique_scans_n', fields: OFF_FIELDS,
    });
    const data = await getJSON(`${OFF_BASE}/cgi/search.pl?${qs}`, OFF_ERRORS);
    const count = Number(data.count) || 0;
    return {
      foods: (data.products || []).filter((p) => p.code).map(offFood),
      totalHits: count,
      totalPages: Math.max(1, Math.ceil(count / PAGE_SIZE)),
    };
  }

  async function getOff(code) {
    const data = await getJSON(`${OFF_BASE}/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`, OFF_ERRORS);
    if (!data.product) throw new Error('Product not found on Open Food Facts.');
    return offFood(Object.assign({ code }, data.product));
  }

  // ---------- USDA FoodData Central ----------
  function apiKey() {
    return (Store.state.settings.apiKey || '').trim() || 'DEMO_KEY';
  }

  function fdc(path, params) {
    const qs = new URLSearchParams(Object.assign({ api_key: apiKey() }, params || {}));
    return getJSON(`${FDC_BASE}${path}?${qs}`, {
      429: 'USDA rate limit reached. The shared DEMO_KEY only allows a few searches per hour — add your own free API key in Settings.',
      403: 'The USDA API key was rejected. Check it in Settings.',
    });
  }

  async function searchUsda(query, types, page) {
    const data = await fdc('/foods/search', { query, dataType: types.join(','), pageSize: PAGE_SIZE, pageNumber: page });
    const foods = (data.foods || []).map((f) => {
      const nutrients = {};
      for (const n of f.foodNutrients || []) {
        if (n.nutrientNumber == null || n.value == null) continue;
        nutrients[String(n.nutrientNumber)] = { name: n.nutrientName, unit: Nutrients.normUnit(n.unitName), amount: n.value };
      }
      return {
        id: 'fdc:' + f.fdcId,
        name: f.description,
        brand: f.brandOwner || f.brandName || '',
        dataType: f.dataType,
        category: f.foodCategory || '',
        nutrients,
      };
    });
    return { foods, totalPages: data.totalPages || 1, totalHits: data.totalHits || 0 };
  }

  function usdaPortionLabel(p) {
    if (p.portionDescription && p.portionDescription !== 'Quantity not specified') return p.portionDescription;
    const unit = p.measureUnit && p.measureUnit.name !== 'undetermined' ? p.measureUnit.name : '';
    return [p.amount != null ? round(p.amount, 2) : '', unit, p.modifier || ''].filter(Boolean).join(' ').trim();
  }

  async function getUsda(fdcId) {
    const f = await fdc(`/food/${encodeURIComponent(fdcId)}`);
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
      const label = Nutrients.metricPortion(usdaPortionLabel(p) || 'portion');
      if (!label) continue;
      const id = label + '|' + p.gramWeight;
      if (seen.has(id)) continue;
      seen.add(id);
      portions.push({ label: `${label} (${round(p.gramWeight, 1)} g)`, grams: p.gramWeight });
    }
    if (f.servingSize && /^(g|grm|ml|mlt)$/i.test(f.servingSizeUnit || '')) {
      const unit = /^m/i.test(f.servingSizeUnit) ? 'ml' : 'g';
      const house = f.householdServingFullText && Nutrients.metricPortion(f.householdServingFullText);
      portions.unshift({ label: `1 serving (${house ? house + ', ' : ''}${round(f.servingSize, 1)} ${unit})`, grams: f.servingSize });
    }

    return {
      id: 'fdc:' + f.fdcId,
      source: 'USDA FoodData Central',
      fdcId: f.fdcId,
      url: `https://fdc.nal.usda.gov/food-details/${encodeURIComponent(f.fdcId)}/nutrients`,
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

  // ---------- Public API ----------
  async function search(query, dataset, page) {
    const ds = DATASETS[dataset] || DATASETS.uk;
    page = page || 1;
    if (ds.source === 'cofid') return searchCofid(query, page);
    if (ds.source === 'off') return searchOff(query, page);
    return searchUsda(query, ds.types, page);
  }

  // id is "<source>:<code>" as produced by search().
  function getFood(id) {
    const i = id.indexOf(':');
    const type = id.slice(0, i), code = id.slice(i + 1);
    if (type === 'cofid') return getCofid(code);
    if (type === 'off') return getOff(code);
    return getUsda(code);
  }

  window.Api = { DATASETS, search, getFood, loadCofid };
})();
