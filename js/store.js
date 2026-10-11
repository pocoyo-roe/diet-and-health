/* Persistence in localStorage: settings, the downloaded food library and the diary log. */
(function () {
  'use strict';

  const KEYS = { settings: 'dt.settings', foods: 'dt.foods', log: 'dt.log' };

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('Could not save', key, e);
      alert('Could not save data: browser storage is full or unavailable.');
      return false;
    }
  }

  const defaultSettings = () => ({
    apiKey: '',
    preset: 'fda',
    targets: Object.assign({}, Nutrients.PRESETS.fda.targets),
  });

  const state = {
    settings: Object.assign(defaultSettings(), load(KEYS.settings, {})),
    foods: load(KEYS.foods, {}),
    log: load(KEYS.log, {}),
  };

  const Store = {
    state,
    saveSettings() { save(KEYS.settings, state.settings); },
    saveFoods() { save(KEYS.foods, state.foods); },
    saveLog() { save(KEYS.log, state.log); },

    getFood(id) { return state.foods[id] || null; },
    putFood(food) { state.foods[food.id] = food; this.saveFoods(); },
    deleteFood(id) { delete state.foods[id]; this.saveFoods(); },
    isFoodUsed(id) {
      return Object.values(state.log).some((day) => day.some((e) => e.foodId === id));
    },

    dayEntries(date) { return state.log[date] || []; },
    addEntry(date, entry) {
      entry.id = entry.id || 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      (state.log[date] = state.log[date] || []).push(entry);
      const food = state.foods[entry.foodId];
      if (food) { food.lastUsed = Date.now(); this.saveFoods(); }
      this.saveLog();
      return entry;
    },
    updateEntry(date, id, patch) {
      const e = this.dayEntries(date).find((x) => x.id === id);
      if (e) { Object.assign(e, patch); this.saveLog(); }
    },
    removeEntry(date, id) {
      const list = this.dayEntries(date).filter((x) => x.id !== id);
      if (list.length) state.log[date] = list; else delete state.log[date];
      this.saveLog();
    },

    exportJSON() {
      return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ...state }, null, 2);
    },
    importJSON(text) {
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object' || !data.foods || !data.log) {
        throw new Error('Not a valid backup file.');
      }
      state.settings = Object.assign(defaultSettings(), data.settings || {});
      state.foods = data.foods;
      state.log = data.log;
      this.saveSettings(); this.saveFoods(); this.saveLog();
    },
    clearAll() {
      state.settings = defaultSettings();
      state.foods = {};
      state.log = {};
      this.saveSettings(); this.saveFoods(); this.saveLog();
    },
  };

  window.Store = Store;
})();
