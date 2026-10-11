/* UI: diary, search + food deep dive, saved foods, trends and settings. */
(function () {
  'use strict';

  const { NUTRIENTS, BY_KEY, GROUPS, PRESETS, DEEP_GROUPS, trackedPer100, deepGroupOf } = Nutrients;
  const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
  const STD_PORTIONS = [
    { label: 'g', grams: 1 },
    { label: 'oz (28.35 g)', grams: 28.3495 },
    { label: '100 g', grams: 100 },
  ];

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function fmt(n, unit) {
    if (n == null || isNaN(n)) return '—';
    const a = Math.abs(n);
    const d = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 1 : a >= 0.1 ? 2 : a === 0 ? 0 : 3;
    const s = Number(n.toFixed(d)).toLocaleString();
    return unit ? `${s} ${unit}` : s;
  }

  function pad(n) { return String(n).padStart(2, '0'); }
  function dateStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function addDays(s, n) { const d = parseDate(s); d.setDate(d.getDate() + n); return dateStr(d); }
  function today() { return dateStr(new Date()); }
  function prettyDate(s) {
    return parseDate(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function guessMeal() {
    const h = new Date().getHours();
    return h < 11 ? 'Breakfast' : h < 15 ? 'Lunch' : h < 21 ? 'Dinner' : 'Snacks';
  }

  function targets() { return Store.state.settings.targets || {}; }

  let toastTimer;
  function toast(msg) {
    let el = $('#toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'tooltip';
      el.style.cssText = 'left:50%;bottom:24px;transform:translateX(-50%);font-size:14px;padding:10px 16px';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
  }

  // ---------- App state & routing ----------
  const ui = {
    view: 'diary',
    date: today(),
    pendingMeal: null,
    search: { query: '', ds: 'whole', page: 1, totalPages: 0, totalHits: 0, results: [], loading: false, error: '' },
  };

  function show(view) {
    ui.view = view;
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
    if (location.hash !== '#' + view) history.replaceState(null, '', '#' + view);
    render();
  }

  function render() {
    ({ diary: renderDiary, search: renderSearch, library: renderLibrary, trends: renderTrends, settings: renderSettings })[ui.view]();
  }

  // ---------- Totals ----------
  function computeTotals(entries) {
    const totals = {}, missing = {};
    NUTRIENTS.forEach((d) => { totals[d.key] = 0; missing[d.key] = 0; });
    let count = 0;
    for (const e of entries) {
      const food = Store.getFood(e.foodId);
      if (!food) continue;
      count++;
      const t = trackedPer100(food);
      const f = e.grams / 100;
      for (const d of NUTRIENTS) {
        if (t[d.key] == null) missing[d.key]++;
        else totals[d.key] += t[d.key] * f;
      }
    }
    return { totals, missing, count };
  }

  function statusFor(def, pct, opts) {
    if (pct == null) return '';
    if (def.limit) return pct > 100 ? '<span class="flag over">▲ Over limit</span>' : '';
    if (pct >= 100) return '<span class="flag ok">✓ Met</span>';
    if (opts && opts.flagLow && pct < 50) return '<span class="flag low">▼ Low</span>';
    return '';
  }

  function nutrientRow(def, amount, target, opts) {
    opts = opts || {};
    const pct = target ? (amount / target) * 100 : null;
    const width = pct == null ? 0 : Math.min(100, pct);
    const over = def.limit && pct > 100;
    if (opts.count && opts.missing === opts.count) {
      return `<div class="nrow">
        <div class="nname">${esc(def.name)}<div class="detail">No data in today’s foods</div></div>
        <div class="bar"></div><div class="pct num muted">—</div></div>`;
    }
    const miss = opts.missing
      ? `<span class="warnnote" title="These foods have no USDA data for ${esc(def.name)}, so the real total may be higher.">· no data for ${opts.missing} of ${opts.count} food${opts.count === 1 ? '' : 's'}</span>`
      : '';
    return `<div class="nrow">
      <div class="nname">${esc(def.name)}
        <div class="detail num">${fmt(amount, def.unit)}${target ? ` / ${fmt(target, def.unit)}${def.limit ? ' limit' : ''}` : ''} ${statusFor(def, pct, opts)} ${miss}</div>
      </div>
      <div class="bar" role="img" aria-label="${esc(def.name)} ${pct == null ? 'no target' : Math.round(pct) + '% of target'}">
        <span class="${over ? 'fill-over' : 'fill-accent'}" style="width:${width}%"></span>
      </div>
      <div class="pct num">${pct == null ? '' : Math.round(pct) + '%'}</div>
    </div>`;
  }

  // ---------- Diary ----------
  function renderDiary() {
    $('#diary-date').value = ui.date;
    const entries = Store.dayEntries(ui.date);
    const { totals, missing, count } = computeTotals(entries);
    const tg = targets();

    // Summary
    const kcal = totals.energy, kcalT = tg.energy || 0;
    const kcalPct = kcalT ? (kcal / kcalT) * 100 : 0;
    const left = kcalT - kcal;
    const macroE = { protein: totals.protein * 4, carbs: totals.carbs * 4, fat: totals.fat * 9 };
    const macroSum = macroE.protein + macroE.carbs + macroE.fat;
    const macro = (key, cls) => {
      const d = BY_KEY[key], t = tg[key];
      const pct = t ? Math.min(100, (totals[key] / t) * 100) : 0;
      return `<div class="macro">
        <div class="label"><span><span class="swatch ${cls}"></span>${d.name}</span><span class="num">${t ? Math.round((totals[key] / t) * 100) + '%' : ''}</span></div>
        <div class="val num">${fmt(totals[key])}<span class="muted small"> / ${fmt(t || 0)} g</span></div>
        <div class="bar"><span class="${cls}" style="width:${pct}%"></span></div>
      </div>`;
    };
    $('#summary').innerHTML = `
      <div class="cal-head">
        <div class="hero num">${fmt(kcal)} <small>of ${fmt(kcalT)} kcal</small></div>
        <div class="muted num">${left >= 0 ? `${fmt(left)} kcal left` : `<span class="flag over">▲ ${fmt(-left)} kcal over</span>`}</div>
      </div>
      <div class="bar big" role="img" aria-label="${Math.round(kcalPct)}% of calorie target"><span class="${kcalPct > 100 ? 'fill-over' : 'fill-accent'}" style="width:${Math.min(100, kcalPct)}%"></span></div>
      <div class="macro-grid">${macro('protein', 'fill-protein')}${macro('carbs', 'fill-carbs')}${macro('fat', 'fill-fat')}</div>
      ${macroSum > 0 ? `<div class="split">
        <div class="small muted">Calories from macros</div>
        <div class="bar" style="margin-top:4px">
          <span class="fill-protein" style="width:${(macroE.protein / macroSum) * 100}%" title="Protein"></span>
          <span class="fill-carbs" style="width:${(macroE.carbs / macroSum) * 100}%" title="Carbs"></span>
          <span class="fill-fat" style="width:${(macroE.fat / macroSum) * 100}%" title="Fat"></span>
        </div>
        <div class="legend num">
          <span><span class="swatch fill-protein"></span>Protein ${Math.round((macroE.protein / macroSum) * 100)}%</span>
          <span><span class="swatch fill-carbs"></span>Carbs ${Math.round((macroE.carbs / macroSum) * 100)}%</span>
          <span><span class="swatch fill-fat"></span>Fat ${Math.round((macroE.fat / macroSum) * 100)}%</span>
        </div></div>` : ''}`;

    // Meals
    $('#meals').innerHTML = MEALS.map((meal) => {
      const list = entries.filter((e) => e.meal === meal);
      const mealKcal = list.reduce((s, e) => {
        const f = Store.getFood(e.foodId);
        const v = f && trackedPer100(f).energy;
        return s + (v ? (v * e.grams) / 100 : 0);
      }, 0);
      const rows = list.map((e) => {
        const f = Store.getFood(e.foodId);
        if (!f) {
          return `<div class="entry"><div class="name"><div class="title muted">(deleted food)</div></div><div></div>
            <button class="btn ghost small" data-remove="${e.id}" aria-label="Remove">✕</button></div>`;
        }
        const t = trackedPer100(f), k = e.grams / 100;
        const p = (v) => (v == null ? '—' : fmt(v * k));
        return `<div class="entry">
          <div class="name" data-edit="${e.id}">
            <div class="title">${esc(f.name)}</div>
            <div class="sub num">${fmt(e.qty)} × ${esc(e.portionLabel)} · ${fmt(e.grams)} g · P ${p(t.protein)} · C ${p(t.carbs)} · F ${p(t.fat)}</div>
          </div>
          <div class="kcal num">${t.energy == null ? '—' : fmt(t.energy * k)}</div>
          <button class="btn ghost small" data-remove="${e.id}" aria-label="Remove">✕</button>
        </div>`;
      }).join('');
      return `<div class="card">
        <div class="meal-head"><h2>${meal} <span class="muted small num">${list.length ? fmt(mealKcal) + ' kcal' : ''}</span></h2>
          <button class="btn small" data-add-meal="${meal}">+ Add food</button></div>
        ${rows || '<div class="empty">Nothing logged yet.</div>'}
      </div>`;
    }).join('');

    // Micronutrients
    const groupHtml = GROUPS.map((g) => {
      const defs = NUTRIENTS.filter((d) => d.group === g.id);
      const rows = defs
        .filter((d) => tg[d.key] || totals[d.key] > 0)
        .map((d) => nutrientRow(d, totals[d.key], tg[d.key], { missing: missing[d.key], count }))
        .join('');
      return rows ? `<h3>${g.label}</h3>${rows}` : '';
    }).join('');
    $('#micros').innerHTML = `<h2>Nutrients for ${esc(prettyDate(ui.date))}</h2>
      ${count ? '' : '<p class="small muted">Log some food to see your vitamin and mineral intake against your daily targets.</p>'}
      ${groupHtml}`;
  }

  function onDiaryClick(ev) {
    const add = ev.target.closest('[data-add-meal]');
    if (add) { ui.pendingMeal = add.dataset.addMeal; show('search'); $('#search-q').focus(); return; }
    const rm = ev.target.closest('[data-remove]');
    if (rm) { Store.removeEntry(ui.date, rm.dataset.remove); renderDiary(); return; }
    const ed = ev.target.closest('[data-edit]');
    if (ed) {
      const entry = Store.dayEntries(ui.date).find((e) => e.id === ed.dataset.edit);
      const food = entry && Store.getFood(entry.foodId);
      if (food) openFood({ food, entry });
    }
  }

  function copyPreviousDay() {
    const prev = Store.dayEntries(addDays(ui.date, -1));
    if (!prev.length) { toast('Nothing logged on the previous day.'); return; }
    if (Store.dayEntries(ui.date).length && !confirm('Add the previous day’s foods to this day as well?')) return;
    prev.forEach((e) => {
      const copy = Object.assign({}, e);
      delete copy.id;
      Store.addEntry(ui.date, copy);
    });
    toast(`Copied ${prev.length} item${prev.length === 1 ? '' : 's'}.`);
    renderDiary();
  }

  // ---------- Search ----------
  function renderSearch() {
    const s = ui.search;
    const hint = ui.pendingMeal ? `Adding to <b>${esc(ui.pendingMeal)}</b> on ${esc(prettyDate(ui.date))}. ` : '';
    $('#search-hint').innerHTML = hint + 'Results come from USDA FoodData Central. Pick a food to download its full nutrient breakdown (100+ nutrients for whole foods) into your library.';
    const box = $('#search-results');
    if (!s.query && !s.results.length) { box.innerHTML = ''; return; }
    let html = '';
    if (s.results.length) {
      html += `<div class="card list">${s.results.map((r, i) => {
        const t = trackedPer100(r);
        const saved = Store.getFood('fdc:' + r.fdcId);
        return `<div class="result" data-result="${i}" tabindex="0" role="button">
          <div>
            <div class="title">${esc(r.name)}</div>
            <div class="sub">${saved ? '<span class="chip saved">✓ Saved</span>' : ''}<span class="chip">${esc(r.dataType)}</span>${esc(r.brand || r.category || '')}</div>
          </div>
          <div class="macros num"><b>${fmt(t.energy)}</b> kcal / 100 g<br>P ${fmt(t.protein)} · C ${fmt(t.carbs)} · F ${fmt(t.fat)}</div>
        </div>`;
      }).join('')}</div>`;
    }
    if (s.loading) html += '<p class="center muted">Searching…</p>';
    else if (s.error) html += `<p class="center error">${esc(s.error)}</p>`;
    else if (!s.results.length) html += '<p class="center muted">No foods found. Try a simpler term or another dataset.</p>';
    else {
      html += `<p class="center muted small">${s.results.length} of ${s.totalHits.toLocaleString()} results</p>`;
      if (s.page < s.totalPages) html += '<p class="center"><button class="btn" id="load-more">Load more</button></p>';
    }
    box.innerHTML = html;
  }

  async function runSearch(more) {
    const s = ui.search;
    if (!more) {
      s.query = $('#search-q').value.trim();
      s.ds = $('#search-ds').value;
      s.page = 1;
      s.results = [];
    } else {
      s.page++;
    }
    if (!s.query) return;
    s.loading = true; s.error = '';
    renderSearch();
    try {
      const res = await Api.search(s.query, s.ds, s.page);
      s.results = s.results.concat(res.foods);
      s.totalPages = res.totalPages;
      s.totalHits = res.totalHits;
    } catch (e) {
      s.error = e.message;
      if (more) s.page--;
    }
    s.loading = false;
    renderSearch();
  }

  // ---------- Food dialog (deep dive + add / edit) ----------
  const dlg = { food: null, entry: null, per100: false };

  async function openFood(opts) {
    const dialog = $('#food-dialog');
    const body = $('#food-dialog-body');
    dlg.entry = opts.entry || null;
    dlg.per100 = false;
    if (!dialog.open) dialog.showModal();

    let food = opts.food;
    if (!food && opts.fdcId) {
      food = Store.getFood('fdc:' + opts.fdcId);
      if (!food) {
        body.innerHTML = `<div class="dialog-head"><h2>${esc(opts.name || 'Loading…')}</h2><button class="btn ghost" data-close>✕</button></div>
          <p class="muted">Downloading full nutrient profile from USDA…</p>`;
        try {
          food = await Api.getFood(opts.fdcId);
          Store.putFood(food);
          if (ui.view === 'search') renderSearch();
        } catch (e) {
          body.innerHTML = `<div class="dialog-head"><h2>${esc(opts.name || 'Food')}</h2><button class="btn ghost" data-close>✕</button></div>
            <p class="error">${esc(e.message)}</p><button class="btn" id="retry">Try again</button>`;
          $('#retry').onclick = () => openFood(opts);
          return;
        }
      }
    }
    dlg.food = food;
    renderFoodDialog();
  }

  function portionsFor(food) {
    return (food.portions || []).concat(STD_PORTIONS);
  }

  function renderFoodDialog() {
    const food = dlg.food, entry = dlg.entry;
    const portions = portionsFor(food);
    let pIdx = 0, qty = 1;
    if (entry) {
      const i = portions.findIndex((p) => p.label === entry.portionLabel);
      if (i >= 0) { pIdx = i; qty = entry.qty; } else { pIdx = portions.length - 3; qty = entry.grams; }
    } else if (!(food.portions || []).length) {
      pIdx = portions.length - 3; qty = 100;
    }
    const meal = entry ? entry.meal : ui.pendingMeal || guessMeal();
    const link = food.fdcId ? `<a href="https://fdc.nal.usda.gov/food-details/${encodeURIComponent(food.fdcId)}/nutrients" target="_blank" rel="noopener">View on USDA</a>` : '';
    const nCount = Object.keys(food.nutrients || {}).length;

    $('#food-dialog-body').innerHTML = `
      <div class="dialog-head">
        <div>
          <h2>${esc(food.name)}</h2>
          <div class="small muted">${food.brand ? esc(food.brand) + ' · ' : ''}<span class="chip">${esc(food.dataType || food.source)}</span>${food.category ? esc(food.category) + ' · ' : ''}${nCount} nutrients ${link ? '· ' + link : ''}</div>
        </div>
        <button class="btn ghost" data-close aria-label="Close">✕</button>
      </div>
      <form class="addbox" id="add-form">
        <label>Amount<input type="number" id="f-qty" min="0" step="any" value="${qty}" required></label>
        <label>Unit<select id="f-portion">${portions.map((p, i) => `<option value="${i}" ${i === pIdx ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select></label>
        <label>Meal<select id="f-meal">${MEALS.map((m) => `<option ${m === meal ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
        <label>Date<input type="date" id="f-date" value="${entry ? ui.date : ui.date}" ${entry ? 'disabled' : ''}></label>
        <button class="btn primary" type="submit">${entry ? 'Save changes' : 'Add to diary'}</button>
      </form>
      <div id="food-detail"></div>`;
    $('#add-form').onsubmit = submitFood;
    $('#f-qty').oninput = renderFoodDetail;
    $('#f-portion').onchange = renderFoodDetail;
    renderFoodDetail();
  }

  function selectedGrams() {
    const portions = portionsFor(dlg.food);
    const p = portions[Number($('#f-portion').value)] || STD_PORTIONS[0];
    const qty = parseFloat($('#f-qty').value) || 0;
    return { qty, portion: p, grams: qty * p.grams };
  }

  function renderFoodDetail() {
    const food = dlg.food;
    const { grams } = selectedGrams();
    const g = dlg.per100 ? 100 : grams;
    const k = g / 100;
    const t = trackedPer100(food);
    const tg = targets();
    const v = (key) => (t[key] == null ? null : t[key] * k);

    const coverage = GROUPS.map((grp) => {
      const rows = NUTRIENTS.filter((d) => d.group === grp.id && t[d.key] != null)
        .map((d) => nutrientRow(d, v(d.key), tg[d.key])).join('');
      return rows ? `<h3>${grp.label}</h3>${rows}` : '';
    }).join('');

    const groups = {};
    Object.entries(food.nutrients || {}).forEach(([num, n]) => {
      (groups[deepGroupOf(num)] = groups[deepGroupOf(num)] || []).push(Object.assign({ num }, n));
    });
    const deep = DEEP_GROUPS.filter((dg) => groups[dg.id]).map((dg) => {
      const rows = groups[dg.id]
        .sort((a, b) => (a.rank || 1e9) - (b.rank || 1e9) || parseFloat(a.num) - parseFloat(b.num))
        .map((n) => `<tr><td>${esc(n.name)}</td><td class="r">${fmt(n.amount * k)}</td><td>${esc(n.unit)}</td></tr>`).join('');
      return `<details ${dg.id === 'proximates' ? 'open' : ''}><summary>${dg.label} (${groups[dg.id].length})</summary>
        <table class="ntable"><thead><tr><th>Nutrient</th><th class="r">Amount</th><th>Unit</th></tr></thead><tbody>${rows}</tbody></table></details>`;
    }).join('');

    $('#food-detail').innerHTML = `
      <div class="row" style="justify-content:space-between">
        <span class="small muted num">Showing values for ${fmt(g)} g</span>
        <span class="toggle"><button type="button" data-per="amt" class="${dlg.per100 ? '' : 'on'}">Selected amount</button><button type="button" data-per="100" class="${dlg.per100 ? 'on' : ''}">Per 100 g</button></span>
      </div>
      <div class="quick num">
        <div><b>${fmt(v('energy'))}</b><span>kcal</span></div>
        <div><b>${fmt(v('protein'))} g</b><span>Protein</span></div>
        <div><b>${fmt(v('carbs'))} g</b><span>Carbs</span></div>
        <div><b>${fmt(v('fat'))} g</b><span>Fat</span></div>
      </div>
      <details open><summary>Daily target coverage</summary>${coverage || '<p class="muted small">No tracked nutrients in this food’s data.</p>'}</details>
      <h3>Full nutrient breakdown</h3>
      ${deep || '<p class="muted small">No detailed nutrient data.</p>'}
      ${food.ingredients ? `<details><summary>Ingredients</summary><p class="small">${esc(food.ingredients)}</p></details>` : ''}
      <p class="small muted">Source: ${esc(food.source || '')}${food.fetchedAt ? ' · downloaded ' + new Date(food.fetchedAt).toLocaleDateString() : ''}. Nutrients that a food’s data doesn’t include are not counted.</p>`;
  }

  function submitFood(ev) {
    ev.preventDefault();
    const { qty, portion, grams } = selectedGrams();
    if (!(grams > 0)) { toast('Enter an amount greater than zero.'); return; }
    const meal = $('#f-meal').value;
    const data = { foodId: dlg.food.id, meal, qty, portionLabel: portion.label, portionGrams: portion.grams, grams };
    if (!Store.getFood(dlg.food.id)) Store.putFood(dlg.food);
    if (dlg.entry) {
      Store.updateEntry(ui.date, dlg.entry.id, data);
      toast('Entry updated.');
    } else {
      const date = $('#f-date').value || ui.date;
      Store.addEntry(date, data);
      ui.date = date;
      toast(`Added to ${meal}${date === today() ? '' : ' on ' + prettyDate(date)}.`);
    }
    $('#food-dialog').close();
    if (ui.pendingMeal || dlg.entry) { ui.pendingMeal = null; show('diary'); } else render();
  }

  // ---------- Library ----------
  function renderLibrary() {
    const q = $('#lib-filter').value.trim().toLowerCase();
    const foods = Object.values(Store.state.foods)
      .filter((f) => !q || (f.name + ' ' + (f.brand || '')).toLowerCase().includes(q))
      .sort((a, b) => (b.lastUsed || b.fetchedAt || 0) - (a.lastUsed || a.fetchedAt || 0));
    if (!foods.length) {
      $('#library-list').innerHTML = `<p class="center muted">${q ? 'No saved foods match.' : 'Foods you open from Search are saved here with their full nutrient data, so you can reuse them offline.'}</p>`;
      return;
    }
    $('#library-list').innerHTML = `<div class="card list">${foods.map((f) => {
      const t = trackedPer100(f);
      const custom = f.id.startsWith('custom:');
      return `<div class="result" data-food="${esc(f.id)}">
        <div>
          <div class="title">${esc(f.name)}</div>
          <div class="sub"><span class="chip">${esc(custom ? 'Custom' : f.dataType || '')}</span>${esc(f.brand || f.category || '')} · ${Object.keys(f.nutrients || {}).length} nutrients</div>
        </div>
        <div class="macros num"><b>${fmt(t.energy)}</b> kcal / 100 g<br>
          ${custom ? `<button class="btn small" data-edit-custom="${esc(f.id)}">Edit</button> ` : ''}<button class="btn small danger" data-delete="${esc(f.id)}">Delete</button></div>
      </div>`;
    }).join('')}</div>`;
  }

  function onLibraryClick(ev) {
    const del = ev.target.closest('[data-delete]');
    if (del) {
      ev.stopPropagation();
      const id = del.dataset.delete;
      const msg = Store.isFoodUsed(id)
        ? 'This food is used in your diary. Deleting it removes its nutrients from those days. Delete anyway?'
        : 'Delete this food from your library?';
      if (confirm(msg)) { Store.deleteFood(id); renderLibrary(); }
      return;
    }
    const edit = ev.target.closest('[data-edit-custom]');
    if (edit) { ev.stopPropagation(); openCustom(Store.getFood(edit.dataset.editCustom)); return; }
    const row = ev.target.closest('[data-food]');
    if (row) openFood({ food: Store.getFood(row.dataset.food) });
  }

  // ---------- Custom food ----------
  function openCustom(existing) {
    const serving = existing && existing.portions && existing.portions[0];
    const sGrams = serving ? serving.grams : 100;
    const t = existing ? trackedPer100(existing) : {};
    const val = (key) => (existing && t[key] != null ? +(t[key] * sGrams / 100).toFixed(3) : '');
    const field = (d) => `<label>${esc(d.name)} (${d.unit})<input type="number" step="any" min="0" name="n_${d.key}" value="${val(d.key)}"></label>`;
    const main = ['energy', 'protein', 'carbs', 'fat', 'fiber', 'sugars', 'satFat', 'sodium'];
    $('#custom-form').innerHTML = `
      <div class="dialog-head"><h2>${existing ? 'Edit' : 'New'} custom food</h2><button class="btn ghost" type="button" data-close aria-label="Close">✕</button></div>
      <p class="small muted">Enter values from a nutrition label, per serving. Leave unknown nutrients blank.</p>
      <div class="form-grid">
        <label>Name<input name="name" required value="${esc(existing ? existing.name : '')}"></label>
        <label>Brand (optional)<input name="brand" value="${esc(existing ? existing.brand : '')}"></label>
        <label>Serving name<input name="sname" value="${esc(serving ? serving.label.replace(/ \([\d.]+ g\)$/, '') : '1 serving')}"></label>
        <label>Serving size (g)<input name="sgrams" type="number" step="any" min="0.1" required value="${sGrams}"></label>
      </div>
      <h3>Per serving</h3>
      <div class="form-grid">${main.map((k) => field(BY_KEY[k])).join('')}</div>
      <details><summary>Vitamins, minerals & more</summary>
        <div class="form-grid">${NUTRIENTS.filter((d) => !main.includes(d.key)).map(field).join('')}</div>
      </details>
      <div class="row" style="justify-content:flex-end;margin-top:16px">
        <button class="btn" type="button" data-close>Cancel</button>
        <button class="btn primary" type="submit">Save food</button>
      </div>`;
    const form = $('#custom-form');
    form.onsubmit = (ev) => {
      ev.preventDefault();
      const fd = new FormData(form);
      const grams = parseFloat(fd.get('sgrams'));
      if (!(grams > 0)) return;
      const nutrients = {};
      for (const d of NUTRIENTS) {
        const raw = fd.get('n_' + d.key);
        if (raw === '' || raw == null) continue;
        const num = typeof d.nums[0] === 'string' ? d.nums[0] : d.nums[0].num;
        nutrients[num] = { name: d.name, unit: d.unit, amount: (parseFloat(raw) / grams) * 100 };
      }
      const sname = String(fd.get('sname') || '1 serving').trim() || '1 serving';
      const food = {
        id: existing ? existing.id : 'custom:' + Date.now().toString(36),
        source: 'Custom food',
        dataType: 'Custom',
        name: String(fd.get('name')).trim(),
        brand: String(fd.get('brand') || '').trim(),
        nutrients,
        portions: [{ label: `${sname} (${+grams.toFixed(1)} g)`, grams }],
        fetchedAt: existing ? existing.fetchedAt : Date.now(),
        lastUsed: existing ? existing.lastUsed : Date.now(),
      };
      Store.putFood(food);
      $('#custom-dialog').close();
      toast('Custom food saved.');
      render();
    };
    $('#custom-dialog').showModal();
  }

  // ---------- Trends ----------
  function renderTrends() {
    const n = Number($('#trend-range').value);
    const end = today();
    const days = [];
    for (let i = n - 1; i >= 0; i--) {
      const date = addDays(end, -i);
      const entries = Store.dayEntries(date);
      days.push({ date, entries, ...computeTotals(entries) });
    }
    const logged = days.filter((d) => d.count > 0);
    const tg = targets();

    $('#trend-chart').innerHTML = `<h2>Calories per day</h2>${calorieChart(days, tg.energy)}`;

    if (!logged.length) {
      $('#trend-table').innerHTML = '<p class="muted">No days logged in this range yet.</p>';
      return;
    }
    const avg = {};
    NUTRIENTS.forEach((d) => { avg[d.key] = logged.reduce((s, day) => s + day.totals[d.key], 0) / logged.length; });

    const low = NUTRIENTS.filter((d) => !d.limit && tg[d.key] && avg[d.key] / tg[d.key] < 0.7)
      .sort((a, b) => avg[a.key] / tg[a.key] - avg[b.key] / tg[b.key]);
    const over = NUTRIENTS.filter((d) => d.limit && tg[d.key] && avg[d.key] > tg[d.key]);
    const chips = (list, cls, icon) => list.map((d) => `<span class="chip"><span class="flag ${cls}">${icon}</span> ${esc(d.name)} ${Math.round((avg[d.key] / tg[d.key]) * 100)}%</span>`).join(' ');

    const groups = [{ id: 'macro', label: 'Macronutrients' }].concat(GROUPS).map((g) => {
      const rows = NUTRIENTS.filter((d) => d.group === g.id && (tg[d.key] || avg[d.key] > 0))
        .map((d) => nutrientRow(d, avg[d.key], tg[d.key], { flagLow: true })).join('');
      return rows ? `<h3>${g.label}</h3>${rows}` : '';
    }).join('');

    $('#trend-table').innerHTML = `<h2>Daily average over ${logged.length} logged day${logged.length === 1 ? '' : 's'}</h2>
      ${low.length ? `<p class="small"><b>Consistently low (&lt;70% of target):</b><br>${chips(low, 'low', '▼')}</p>` : '<p class="small"><span class="flag ok">✓</span> No nutrients averaging under 70% of target.</p>'}
      ${over.length ? `<p class="small"><b>Over limit on average:</b><br>${chips(over, 'over', '▲')}</p>` : ''}
      <p class="small muted">Low readings can also mean the foods you logged lack USDA data for that nutrient (common for branded foods).</p>
      ${groups}`;
  }

  function calorieChart(days, target) {
    const W = 720, H = 220, m = { t: 12, r: 12, b: 26, l: 40 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const max = Math.max(target || 0, ...days.map((d) => d.totals.energy)) * 1.1 || 2000;
    const step = niceStep(max / 4);
    const yMax = Math.ceil(max / step) * step;
    const y = (v) => m.t + ih - (v / yMax) * ih;
    const bw = iw / days.length;
    const barW = Math.max(2, Math.min(36, bw - 2));
    const labelEvery = Math.ceil(days.length / 10);
    let grid = '';
    for (let v = 0; v <= yMax; v += step) {
      grid += `<g class="grid"><line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"></line></g>
        <g class="axis"><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${v.toLocaleString()}</text></g>`;
    }
    const cols = days.map((d, i) => {
      const x = m.l + i * bw + (bw - barW) / 2;
      const v = d.totals.energy;
      const h = (v / yMax) * ih;
      const r = Math.min(4, barW / 2, h);
      const top = y(v);
      const base = m.t + ih;
      const path = h > 0
        ? `<path class="bar-mark" style="fill:var(--accent)" d="M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${base} Z"></path>`
        : '';
      const label = i % labelEvery === 0 || i === days.length - 1
        ? `<text x="${m.l + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle">${parseDate(d.date).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}</text>` : '';
      const tip = `${prettyDate(d.date)}: ${d.count ? fmt(v) + ' kcal' : 'nothing logged'}${target && d.count ? ` (${Math.round((v / target) * 100)}% of target)` : ''}`;
      return `<g class="col">${path}<rect class="hit" x="${m.l + i * bw}" y="${m.t}" width="${bw}" height="${ih}" data-tip="${esc(tip)}"></rect><g class="axis">${label}</g></g>`;
    }).join('');
    const tline = target
      ? `<line class="target" x1="${m.l}" x2="${W - m.r}" y1="${y(target)}" y2="${y(target)}"></line>
         <text class="target-label" x="${W - m.r}" y="${y(target) - 5}" text-anchor="end">Target ${fmt(target)} kcal</text>` : '';
    const table = days.map((d) => `<tr><td>${esc(prettyDate(d.date))}</td><td class="r">${d.count ? fmt(d.totals.energy) : '—'}</td></tr>`).join('');
    return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart of calories per day">${grid}${cols}${tline}</svg></div>
      <details><summary class="small">Show as table</summary><table class="ntable"><thead><tr><th>Day</th><th class="r">kcal</th></tr></thead><tbody>${table}</tbody></table></details>`;
  }

  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  }

  function onChartHover(ev) {
    const tip = $('#tooltip');
    const hit = ev.target.closest && ev.target.closest('[data-tip]');
    if (!hit) { tip.hidden = true; return; }
    tip.textContent = hit.dataset.tip;
    tip.hidden = false;
    const x = Math.min(ev.clientX + 12, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = x + 'px';
    tip.style.top = (ev.clientY - tip.offsetHeight - 10) + 'px';
  }

  // ---------- Settings ----------
  function renderSettings() {
    const s = Store.state.settings;
    $('#api-key').value = s.apiKey || '';
    $('#preset').innerHTML = Object.entries(PRESETS).map(([id, p]) => `<option value="${id}" ${id === s.preset ? 'selected' : ''}>${esc(p.label)}</option>`).join('');
    const groups = [{ id: 'macro', label: 'Macronutrients' }].concat(GROUPS);
    $('#targets').innerHTML = groups.map((g) => `<h3>${g.label}</h3><div class="targets-grid">${
      NUTRIENTS.filter((d) => d.group === g.id).map((d) => `<label><span>${esc(d.name)}${d.limit ? ' <span class="muted small">limit</span>' : ''}</span>
        <input type="number" min="0" step="any" data-target="${d.key}" value="${s.targets[d.key] != null ? s.targets[d.key] : ''}" placeholder="none">
        <span class="muted small">${d.unit}</span></label>`).join('')
    }</div>`).join('');
  }

  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- Wiring ----------
  function init() {
    $$('.tab').forEach((t) => t.addEventListener('click', () => show(t.dataset.view)));

    $('#prev-day').onclick = () => { ui.date = addDays(ui.date, -1); renderDiary(); };
    $('#next-day').onclick = () => { ui.date = addDays(ui.date, 1); renderDiary(); };
    $('#today-btn').onclick = () => { ui.date = today(); renderDiary(); };
    $('#diary-date').onchange = (e) => { if (e.target.value) { ui.date = e.target.value; renderDiary(); } };
    $('#copy-prev').onclick = copyPreviousDay;
    $('#view-diary').addEventListener('click', onDiaryClick);

    $('#search-ds').innerHTML = Object.entries(Api.DATASETS).map(([id, d]) => `<option value="${id}">${esc(d.label)}</option>`).join('');
    $('#search-form').onsubmit = (e) => { e.preventDefault(); runSearch(false); };
    $('#search-results').addEventListener('click', (e) => {
      if (e.target.id === 'load-more') { runSearch(true); return; }
      const r = e.target.closest('[data-result]');
      if (r) { const f = ui.search.results[Number(r.dataset.result)]; openFood({ fdcId: f.fdcId, name: f.name }); }
    });
    $('#search-results').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.matches('[data-result]')) e.target.click();
    });

    $('#lib-filter').oninput = renderLibrary;
    $('#library-list').addEventListener('click', onLibraryClick);
    $('#new-custom').onclick = () => openCustom(null);

    $('#trend-range').onchange = renderTrends;
    $('#trend-chart').addEventListener('mousemove', onChartHover);
    $('#trend-chart').addEventListener('mouseleave', () => { $('#tooltip').hidden = true; });

    $('#save-key').onclick = () => { Store.state.settings.apiKey = $('#api-key').value.trim(); Store.saveSettings(); toast('API key saved.'); };
    $('#apply-preset').onclick = () => {
      const id = $('#preset').value;
      Store.state.settings.preset = id;
      Store.state.settings.targets = Object.assign({}, PRESETS[id].targets);
      Store.saveSettings();
      renderSettings();
      toast('Targets updated.');
    };
    $('#targets').addEventListener('change', (e) => {
      const key = e.target.dataset.target;
      if (!key) return;
      const v = parseFloat(e.target.value);
      if (isNaN(v) || v <= 0) delete Store.state.settings.targets[key];
      else Store.state.settings.targets[key] = v;
      Store.saveSettings();
    });
    $('#export').onclick = () => download(`nutrient-tracker-backup-${today()}.json`, Store.exportJSON());
    $('#import').onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      file.text().then((text) => {
        if (!confirm('Replace all current data with this backup?')) return;
        Store.importJSON(text);
        toast('Backup imported.');
        renderSettings();
      }).catch((err) => alert('Import failed: ' + err.message)).finally(() => { e.target.value = ''; });
    };
    $('#clear').onclick = () => {
      if (confirm('Delete your whole diary, saved foods and settings? This cannot be undone.')) {
        Store.clearAll(); renderSettings(); toast('All data deleted.');
      }
    };

    // Close buttons inside dialogs, and click-outside to close.
    $$('dialog').forEach((d) => {
      d.addEventListener('click', (e) => {
        if (e.target === d || e.target.closest('[data-close]')) d.close();
        const per = e.target.closest('[data-per]');
        if (per) { dlg.per100 = per.dataset.per === '100'; renderFoodDetail(); }
      });
    });

    const start = location.hash.slice(1);
    show(['diary', 'search', 'library', 'trends', 'settings'].includes(start) ? start : 'diary');
  }

  init();
})();
