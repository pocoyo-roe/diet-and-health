/* Nutrient definitions, daily target presets, and helpers for reading
 * nutrient values out of a stored food (amounts are per 100 g). */
(function () {
  'use strict';

  // `nums` are USDA nutrient numbers, tried in order. An entry may be an
  // object with a `factor` when the source unit cannot be converted
  // generically (e.g. vitamin D in IU -> µg).
  const NUTRIENTS = [
    // Macros
    { key: 'energy', name: 'Calories', unit: 'kcal', group: 'macro', nums: ['208', '958', '957'] },
    { key: 'protein', name: 'Protein', unit: 'g', group: 'macro', nums: ['203'] },
    { key: 'carbs', name: 'Carbohydrates', unit: 'g', group: 'macro', nums: ['205', '205.2'] },
    { key: 'fat', name: 'Total fat', unit: 'g', group: 'macro', nums: ['204', '298'] },

    // Carbohydrate detail
    { key: 'fiber', name: 'Fiber', unit: 'g', group: 'carbs', nums: ['291', '293'] },
    { key: 'sugars', name: 'Total sugars', unit: 'g', group: 'carbs', nums: ['269', '269.3'] },
    { key: 'addedSugars', name: 'Added sugars', unit: 'g', group: 'carbs', nums: ['539'], limit: true },

    // Fats
    { key: 'satFat', name: 'Saturated fat', unit: 'g', group: 'fats', nums: ['606'], limit: true },
    { key: 'transFat', name: 'Trans fat', unit: 'g', group: 'fats', nums: ['605'], limit: true },
    { key: 'mufa', name: 'Monounsaturated fat', unit: 'g', group: 'fats', nums: ['645'] },
    { key: 'pufa', name: 'Polyunsaturated fat', unit: 'g', group: 'fats', nums: ['646'] },
    { key: 'omega3ALA', name: 'Omega-3 (ALA)', unit: 'g', group: 'fats', nums: ['851', '619'] },
    { key: 'epa', name: 'Omega-3 (EPA)', unit: 'g', group: 'fats', nums: ['629'] },
    { key: 'dha', name: 'Omega-3 (DHA)', unit: 'g', group: 'fats', nums: ['621'] },
    { key: 'omega6LA', name: 'Omega-6 (linoleic)', unit: 'g', group: 'fats', nums: ['675', '618'] },
    { key: 'cholesterol', name: 'Cholesterol', unit: 'mg', group: 'fats', nums: ['601'], limit: true },

    // Vitamins
    { key: 'vitA', name: 'Vitamin A (RAE)', unit: 'µg', group: 'vitamins', nums: ['320'] },
    { key: 'vitC', name: 'Vitamin C', unit: 'mg', group: 'vitamins', nums: ['401'] },
    { key: 'vitD', name: 'Vitamin D', unit: 'µg', group: 'vitamins', nums: ['328', { num: '324', factor: 0.025 }] },
    { key: 'vitE', name: 'Vitamin E', unit: 'mg', group: 'vitamins', nums: ['323'] },
    { key: 'vitK', name: 'Vitamin K', unit: 'µg', group: 'vitamins', nums: ['430'] },
    { key: 'thiamin', name: 'Thiamin (B1)', unit: 'mg', group: 'vitamins', nums: ['404'] },
    { key: 'riboflavin', name: 'Riboflavin (B2)', unit: 'mg', group: 'vitamins', nums: ['405'] },
    { key: 'niacin', name: 'Niacin (B3)', unit: 'mg', group: 'vitamins', nums: ['406'] },
    { key: 'pantothenic', name: 'Pantothenic acid (B5)', unit: 'mg', group: 'vitamins', nums: ['410'] },
    { key: 'vitB6', name: 'Vitamin B6', unit: 'mg', group: 'vitamins', nums: ['415'] },
    { key: 'biotin', name: 'Biotin (B7)', unit: 'µg', group: 'vitamins', nums: ['416'] },
    { key: 'folate', name: 'Folate (DFE)', unit: 'µg', group: 'vitamins', nums: ['435', '417'] },
    { key: 'vitB12', name: 'Vitamin B12', unit: 'µg', group: 'vitamins', nums: ['418'] },
    { key: 'choline', name: 'Choline', unit: 'mg', group: 'vitamins', nums: ['421'] },

    // Minerals
    { key: 'calcium', name: 'Calcium', unit: 'mg', group: 'minerals', nums: ['301'] },
    { key: 'iron', name: 'Iron', unit: 'mg', group: 'minerals', nums: ['303'] },
    { key: 'magnesium', name: 'Magnesium', unit: 'mg', group: 'minerals', nums: ['304'] },
    { key: 'phosphorus', name: 'Phosphorus', unit: 'mg', group: 'minerals', nums: ['305'] },
    { key: 'potassium', name: 'Potassium', unit: 'mg', group: 'minerals', nums: ['306'] },
    { key: 'sodium', name: 'Sodium', unit: 'mg', group: 'minerals', nums: ['307'], limit: true },
    { key: 'zinc', name: 'Zinc', unit: 'mg', group: 'minerals', nums: ['309'] },
    { key: 'copper', name: 'Copper', unit: 'mg', group: 'minerals', nums: ['312'] },
    { key: 'manganese', name: 'Manganese', unit: 'mg', group: 'minerals', nums: ['315'] },
    { key: 'selenium', name: 'Selenium', unit: 'µg', group: 'minerals', nums: ['317'] },
    { key: 'iodine', name: 'Iodine', unit: 'µg', group: 'minerals', nums: ['314'] },
    { key: 'fluoride', name: 'Fluoride', unit: 'µg', group: 'minerals', nums: ['313'] },

    // Other
    { key: 'water', name: 'Water', unit: 'g', group: 'other', nums: ['255'] },
    { key: 'caffeine', name: 'Caffeine', unit: 'mg', group: 'other', nums: ['262'], limit: true },
    { key: 'alcohol', name: 'Alcohol', unit: 'g', group: 'other', nums: ['221'], limit: true },
  ];

  const BY_KEY = Object.fromEntries(NUTRIENTS.map((n) => [n.key, n]));

  const GROUPS = [
    { id: 'vitamins', label: 'Vitamins' },
    { id: 'minerals', label: 'Minerals' },
    { id: 'fats', label: 'Fats & fatty acids' },
    { id: 'carbs', label: 'Carbohydrates' },
    { id: 'other', label: 'Other' },
  ];

  // Shared micronutrient targets used by all presets unless overridden.
  const FDA_DV = {
    energy: 2000, protein: 50, carbs: 275, fat: 78,
    fiber: 28, addedSugars: 50,
    satFat: 20, cholesterol: 300, omega3ALA: 1.6, omega6LA: 17,
    vitA: 900, vitC: 90, vitD: 20, vitE: 15, vitK: 120,
    thiamin: 1.2, riboflavin: 1.3, niacin: 16, pantothenic: 5, vitB6: 1.7,
    biotin: 30, folate: 400, vitB12: 2.4, choline: 550,
    calcium: 1300, iron: 18, magnesium: 420, phosphorus: 1250, potassium: 4700,
    sodium: 2300, zinc: 11, copper: 0.9, manganese: 2.3, selenium: 55, iodine: 150,
    caffeine: 400,
  };

  // RDA / AI values for adults aged 19-50 (US National Academies).
  const PRESETS = {
    fda: { label: 'FDA Daily Values (food label)', targets: FDA_DV },
    male: {
      label: 'Adult man, 19–50 (RDA/AI)',
      targets: Object.assign({}, FDA_DV, {
        energy: 2500, protein: 56, carbs: 310, fat: 83, fiber: 38, addedSugars: 62, satFat: 28,
        omega3ALA: 1.6, omega6LA: 17,
        vitA: 900, vitC: 90, vitD: 15, vitE: 15, vitK: 120,
        thiamin: 1.2, riboflavin: 1.3, niacin: 16, vitB6: 1.3, choline: 550,
        calcium: 1000, iron: 8, magnesium: 420, phosphorus: 700, potassium: 3400,
        zinc: 11, manganese: 2.3, fluoride: 4000,
      }),
    },
    female: {
      label: 'Adult woman, 19–50 (RDA/AI)',
      targets: Object.assign({}, FDA_DV, {
        energy: 2000, protein: 46, carbs: 250, fat: 67, fiber: 25, addedSugars: 50, satFat: 22,
        omega3ALA: 1.1, omega6LA: 12,
        vitA: 700, vitC: 75, vitD: 15, vitE: 15, vitK: 90,
        thiamin: 1.1, riboflavin: 1.1, niacin: 14, vitB6: 1.3, choline: 425,
        calcium: 1000, iron: 18, magnesium: 320, phosphorus: 700, potassium: 2600,
        zinc: 8, manganese: 1.8, fluoride: 3000,
      }),
    },
  };

  function normUnit(u) {
    if (!u) return '';
    const s = String(u).trim().toLowerCase();
    if (s === 'ug' || s === 'mcg' || s === 'µg' || s === 'μg') return 'µg';
    return s;
  }

  const MASS = { g: 1, mg: 1e-3, 'µg': 1e-6 };

  function convertUnit(value, from, to) {
    from = normUnit(from); to = normUnit(to);
    if (from === to) return value;
    if (MASS[from] && MASS[to]) return (value * MASS[from]) / MASS[to];
    return null;
  }

  // food.nutrients: { [number]: { name, unit, amount, rank? } } per 100 g
  function valuePer100(food, def) {
    const map = food.nutrients || {};
    for (const entry of def.nums) {
      const num = typeof entry === 'string' ? entry : entry.num;
      const n = map[num];
      if (!n || n.amount == null || isNaN(n.amount)) continue;
      if (typeof entry === 'object' && entry.factor) return n.amount * entry.factor;
      const v = convertUnit(n.amount, n.unit, def.unit);
      if (v != null) return v;
    }
    if (def.key === 'energy') {
      const p = valuePer100(food, BY_KEY.protein);
      const c = valuePer100(food, BY_KEY.carbs);
      const f = valuePer100(food, BY_KEY.fat);
      if (p != null && c != null && f != null) return p * 4 + c * 4 + f * 9;
    }
    return null;
  }

  const cache = new WeakMap();
  // All tracked nutrient values (per 100 g) for a food; null where unknown.
  function trackedPer100(food) {
    let t = cache.get(food);
    if (!t) {
      t = {};
      for (const def of NUTRIENTS) t[def.key] = valuePer100(food, def);
      cache.set(food, t);
    }
    return t;
  }

  // Grouping for the full "deep dive" list of every nutrient USDA returns.
  const DEEP_GROUPS = [
    { id: 'proximates', label: 'Energy & macronutrients' },
    { id: 'sugars', label: 'Sugars & starch' },
    { id: 'vitamins', label: 'Vitamins & related compounds' },
    { id: 'minerals', label: 'Minerals' },
    { id: 'lipids', label: 'Fats, fatty acids & sterols' },
    { id: 'amino', label: 'Amino acids' },
    { id: 'other', label: 'Other compounds' },
  ];

  function deepGroupOf(number) {
    const n = parseFloat(number);
    if (isNaN(n)) return 'other';
    if ((n >= 209 && n < 220) || n === 287) return 'sugars';
    if (n >= 300 && n < 318) return 'minerals';
    if ((n >= 318 && n < 500) || n === 573 || n === 578) return 'vitamins';
    if (n >= 500 && n < 540 && n !== 539) return 'amino';
    if (n === 539) return 'sugars';
    if ((n >= 600 && n < 700) || (n >= 850 && n < 900)) return 'lipids';
    if (n === 221 || n === 262 || n === 263 || n >= 700) return 'other';
    return 'proximates';
  }

  window.Nutrients = {
    NUTRIENTS, BY_KEY, GROUPS, PRESETS, DEEP_GROUPS,
    normUnit, convertUnit, valuePer100, trackedPer100, deepGroupOf,
  };
})();
