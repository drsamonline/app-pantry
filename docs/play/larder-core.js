/* larder-core — the engine behind Pantry.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * (c) 2026 Dr Sohil Momin
 *
 * One job, two faces of it:
 *
 *   the pantry   what you have, how much, and when it goes. EXPIRY drives the order:
 *                what is about to go is at the top, and the shopping list is built from
 *                what is already gone.
 *   the kitchen  a small bundled index of dishes, filtered by constraints you set once
 *                (allergies, Jain, no onion-garlic, fasting days, diabetic) and matched
 *                STRICTLY against what is in the pantry. No near-miss substitution, no
 *                invented recipe, no model, no key, no network.
 *
 * Pure functions: no DOM, no network, no storage. The page does the wiring.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.LarderCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var VERSION = "1.0.0";
  var PLACES = ["pantry", "fridge", "freezer"];
  var UNITS = ["kg", "g", "L", "ml", "pack", "dozen", "bunch", "piece"];

  /* ---------------------------------------------------------------- dates */

  function parseDate(s) {
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s || "").trim());
    if (!m) return null;
    var d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    var dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCDate() !== d || dt.getUTCMonth() !== mo - 1) return null;
    return dt.getTime();
  }

  function fmtDate(ms) {
    var d = new Date(ms);
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return p(d.getUTCDate()) + "/" + p(d.getUTCMonth() + 1) + "/" + d.getUTCFullYear();
  }

  function daysBetween(fromMs, toMs) {
    return Math.round((toMs - fromMs) / 86400000);
  }

  /* ---------------------------------------------------------------- items */

  function normaliseName(s) {
    return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  /* Every refusal names the field. A date in the past is NOT an error: it is the
   * mechanic, and it goes to the top of the use-first list. */
  function validateItem(input) {
    var name = String((input && input.name) || "").trim();
    var qtyRaw = input && input.qty;
    var unit = String((input && input.unit) || "").trim();
    var expires = String((input && input.expires) || "").trim();
    var place = String((input && input.place) || "pantry").trim();

    if (!name) return { ok: false, field: "name", reason: "an item with no name was refused: the name field is empty" };
    var qty = Number(qtyRaw);
    if (qtyRaw === "" || qtyRaw == null || isNaN(qty)) {
      return { ok: false, field: "qty", reason: "the quantity \u201c" + String(qtyRaw) + "\u201d is not a number, so the item was refused" };
    }
    if (qty < 0) return { ok: false, field: "qty", reason: "a negative quantity was refused" };
    if (!unit) return { ok: false, field: "unit", reason: "the unit field is empty \u2014 say kg, g, L, ml, pack, dozen, bunch or piece" };
    if (UNITS.indexOf(unit) < 0) return { ok: false, field: "unit", reason: "\u201c" + unit + "\u201d is not a unit this app understands (" + UNITS.join(", ") + ")" };
    if (expires) {
      if (parseDate(expires) == null) return { ok: false, field: "expires", reason: "\u201c" + expires + "\u201d is not a date in dd/mm/yyyy" };
    }
    if (PLACES.indexOf(place) < 0) return { ok: false, field: "place", reason: "\u201c" + place + "\u201d is not a place this app knows (" + PLACES.join(", ") + ")" };

    return {
      ok: true,
      item: {
        id: "i" + Date.now() + "-" + Math.floor(Math.random() * 1000),
        name: name,
        key: normaliseName(name),
        qty: qty,
        unit: unit,
        expires: expires,
        expiresMs: expires ? parseDate(expires) : null,
        place: place
      }
    };
  }

  /* Bulk paste: "2 kg rice" per line. A line that cannot be read is refused by
   * number, and the readable ones are not silently dropped. */
  function parseBulk(text) {
    var lines = String(text || "").split(/\r?\n/);
    var items = [];
    var problems = [];
    lines.forEach(function (line, i) {
      var t = line.trim();
      if (!t) return;
      var m = /^(\d+(?:\.\d+)?)\s*([A-Za-z]+)\s+(.+)$/.exec(t);
      if (!m) {
        problems.push({ line: i + 1, text: t, reason: "could not read this line \u2014 write it as \u201c2 kg rice\u201d" });
        return;
      }
      var res = validateItem({ name: m[3], qty: m[1], unit: m[2], place: "pantry" });
      if (!res.ok) { problems.push({ line: i + 1, text: t, reason: res.reason }); return; }
      items.push(res.item);
    });
    if (!items.length && !problems.length) {
      return { ok: false, reason: "there was nothing to read \u2014 one item per line, like \u201c2 kg rice\u201d", items: [], problems: [] };
    }
    return { ok: items.length > 0, items: items, problems: problems, reason: problems.length ? problems.length + " line(s) could not be read and were listed rather than dropped" : "" };
  }

  /* ------------------------------------------------------------ use first */

  /* The mechanic: what is about to go is at the top. A past date sorts above
   * everything, most overdue first. Items with no date go last. */
  function useFirst(items, todayMs) {
    var list = (items || []).slice().map(function (it) {
      var days = it.expiresMs == null ? null : daysBetween(todayMs, it.expiresMs);
      return {
        item: it,
        daysLeft: days,
        state: days == null ? "no date" : days < 0 ? "past" : days === 0 ? "today" : days <= 3 ? "soon" : "later"
      };
    });
    list.sort(function (a, b) {
      var ax = a.item.expiresMs, bx = b.item.expiresMs;
      if (ax == null && bx == null) return a.item.name.localeCompare(b.item.name);
      if (ax == null) return 1;
      if (bx == null) return -1;
      if (ax !== bx) return ax - bx;
      return a.item.name.localeCompare(b.item.name);
    });
    return list;
  }

  /* --------------------------------------------------------- shopping list */

  /* Built from what is gone (qty 0), plus anything the person added by hand.
   * Nothing else: a shopping list invented from a recipe you have not decided to
   * cook would be the app having opinions about your week. */
  function shoppingList(items, extras) {
    var gone = (items || []).filter(function (it) { return Number(it.qty) <= 0; }).map(function (it) {
      return { name: it.name, unit: it.unit, because: "finished" };
    });
    var manual = (extras || []).map(function (e) {
      return { name: e.name, unit: e.unit || "", because: "you added it" };
    });
    var seen = {};
    var out = [];
    gone.concat(manual).forEach(function (row) {
      var k = normaliseName(row.name) + "|" + row.unit;
      if (seen[k]) { return; }
      seen[k] = true;
      out.push(row);
    });
    return out;
  }

  /* ------------------------------------------------------------ constraints */

  var CONSTRAINTS = [
    { id: "allergy-milk", label: "No milk", forbids: ["milk", "curd", "paneer", "ghee", "butter", "cream", "khoya"] },
    { id: "allergy-gluten", label: "No gluten", forbids: ["atta", "wheat", "rava", "suji", "maida", "bread", "semolina"] },
    { id: "allergy-nuts", label: "No nuts", forbids: ["peanut", "cashew", "almond", "walnut", "pista", "groundnut"] },
    { id: "allergy-soy", label: "No soy", forbids: ["soy", "soya", "tofu"] },
    { id: "jain", label: "Jain \u2014 no onion, garlic or root vegetables", forbids: ["onion", "garlic", "potato", "carrot", "beetroot", "radish", "ginger"] },
    { id: "no-onion-garlic", label: "No onion or garlic", forbids: ["onion", "garlic"] },
    { id: "fast-ekadashi", label: "Ekadashi fast \u2014 no grains or pulses", forbids: ["rice", "atta", "wheat", "rava", "poha", "bread", "dal", "chana", "rajma", "moong", "toor"] },
    { id: "fast-navratri", label: "Navratri fast \u2014 no grains, no onion or garlic", forbids: ["rice", "atta", "wheat", "rava", "poha", "bread", "onion", "garlic"] },
    { id: "diabetic", label: "Diabetic-friendly \u2014 no sugar or jaggery", forbids: ["sugar", "jaggery", "honey", "gul"] }
  ];

  function constraintById(id) {
    for (var i = 0; i < CONSTRAINTS.length; i++) if (CONSTRAINTS[i].id === id) return CONSTRAINTS[i];
    return null;
  }

  function forbiddenTerms(active) {
    var out = [];
    (active || []).forEach(function (id) {
      var c = constraintById(id);
      if (c) c.forbids.forEach(function (f) { if (out.indexOf(f) < 0) out.push(f); });
    });
    return out;
  }

  /* A fixed, small substitution table. It is a suggestion about a MISSING
   * ingredient, never a claim that a different ingredient is in the pantry. */
  var SUBSTITUTES = {
    "curd": "lemon juice stirred into warm milk",
    "ghee": "any cooking oil",
    "jaggery": "sugar (not for a diabetic profile)",
    "paneer": "firm tofu (not for a soy allergy)",
    "rava": "powdered rice (not for an Ekadashi fast)",
    "poha": "flattened rice is itself the substitute for rice in some fasts \u2014 check your own rule",
    "tamarind": "lemon juice",
    "coconut": "sesame seeds"
  };

  /* --------------------------------------------------------------- recipes */

  /* A BUNDLED index. Every suggestion comes from this list; nothing is generated,
   * composed or fetched. That is the must-not: it knows what you have, it does not
   * invent dinner. */
  var RECIPES = [
    { id: "r-poha", name: "Poha", needs: ["poha", "onion", "peanut", "lemon", "turmeric", "salt", "oil"], serves: 2 },
    { id: "r-khichdi", name: "Moong khichdi", needs: ["rice", "moong", "turmeric", "salt", "ghee", "water"], serves: 2 },
    { id: "r-dal-rice", name: "Dal and rice", needs: ["dal", "rice", "turmeric", "salt", "ghee"], serves: 2 },
    { id: "r-upma", name: "Rava upma", needs: ["rava", "onion", "mustard", "curry leaves", "salt", "oil"], serves: 2 },
    { id: "r-lemon-rice", name: "Lemon rice", needs: ["rice", "lemon", "peanut", "turmeric", "salt", "oil"], serves: 2 },
    { id: "r-curd-rice", name: "Curd rice", needs: ["rice", "curd", "salt", "mustard", "curry leaves"], serves: 2 },
    { id: "r-aloo-sabzi", name: "Aloo sabzi with roti", needs: ["potato", "atta", "onion", "turmeric", "salt", "oil"], serves: 2 },
    { id: "r-palak-paneer", name: "Palak paneer", needs: ["palak", "paneer", "onion", "garlic", "tomato", "salt", "oil"], serves: 2 },
    { id: "r-chana", name: "Chana masala", needs: ["chana", "onion", "tomato", "garlic", "turmeric", "salt", "oil"], serves: 2 },
    { id: "r-pulao", name: "Vegetable pulao", needs: ["rice", "carrot", "peas", "onion", "salt", "ghee"], serves: 2 },
    { id: "r-sukhi-bhaji", name: "Sukhi bhaji (no onion, no garlic)", needs: ["potato", "turmeric", "salt", "oil", "coriander"], serves: 2 },
    { id: "r-sabudana", name: "Sabudana khichdi", needs: ["sabudana", "peanut", "potato", "salt", "ghee", "lemon"], serves: 2 }
  ];

  function recipeById(id) {
    for (var i = 0; i < RECIPES.length; i++) if (RECIPES[i].id === id) return RECIPES[i];
    return null;
  }

  function recipeForbiddenBy(recipe, active) {
    var hits = [];
    recipe.needs.forEach(function (n) {
      var key = normaliseName(n);
      (active || []).forEach(function (id) {
        var c = constraintById(id);
        if (!c) return;
        c.forbids.forEach(function (term) {
          if (key === term || key.indexOf(term) >= 0) {
            hits.push({ ingredient: n, rule: term, ruleId: c.id, label: c.label });
          }
        });
      });
    });
    return hits;
  }

  /* Filtering is the constraint engine: a dish that breaks a locked rule is not
   * offered at all, and the reason is kept so the app can say why. */
  function filterRecipes(active) {
    var kept = [];
    var excluded = [];
    RECIPES.forEach(function (r) {
      var hits = recipeForbiddenBy(r, active);
      if (hits.length) excluded.push({ recipe: r, hits: hits });
      else kept.push(r);
    });
    return { kept: kept, excluded: excluded, active: (active || []).slice() };
  }

  /* Strict matching against the pantry. An ingredient that matches nothing is
   * reported by name; it is never swapped for a near-miss, because a dish you
   * cannot cook is worse than an honest gap. */
  function matchRecipe(recipe, items) {
    var have = {};
    (items || []).forEach(function (it) {
      if (Number(it.qty) <= 0) return;
      have[normaliseName(it.name)] = it;
    });
    var present = [];
    var missing = [];
    recipe.needs.forEach(function (need) {
      var key = normaliseName(need);
      if (have[key]) present.push({ ingredient: need, qty: have[key].qty, unit: have[key].unit });
      else missing.push(need);
    });
    return {
      recipe: recipe,
      present: present,
      missing: missing,
      canCook: missing.length === 0,
      says: missing.length === 0
        ? "Everything for " + recipe.name + " is in the pantry."
        : recipe.name + " needs " + missing.length + " thing(s) you do not have: " + missing.join(", ") + ". Nothing was substituted \u2014 add them, or pick another dish."
    };
  }

  /* What can be cooked right now, from the bundled index, honouring the rules. */
  function cookable(items, active) {
    var filtered = filterRecipes(active);
    var matches = filtered.kept.map(function (r) { return matchRecipe(r, items); });
    return {
      ready: matches.filter(function (m) { return m.canCook; }),
      close: matches.filter(function (m) { return !m.canCook && m.missing.length <= 2; }),
      far: matches.filter(function (m) { return !m.canCook && m.missing.length > 2; }),
      excluded: filtered.excluded,
      active: filtered.active
    };
  }

  /* The "why this fits your rules" note: it names the rules that were checked and
   * found nothing to object to. It never claims a dish is healthy, safe or suitable
   * for a medical condition beyond the rule you set. */
  function whyFits(recipe, active) {
    if (!(active || []).length) {
      return "No rules are set, so nothing was checked. Set your rules once and every dish will be filtered against them.";
    }
    var hits = recipeForbiddenBy(recipe, active);
    if (hits.length) {
      return "This does not fit: " + hits.map(function (h) { return h.ingredient + " breaks your rule \u201c" + h.label + "\u201d"; }).join("; ") + ".";
    }
    var labels = (active || []).map(function (id) { var c = constraintById(id); return c ? c.label : id; });
    return "Checked against your locked rules \u2014 " + labels.join("; ") + " \u2014 and none of this dish's ingredients breaks one. That is all this says: it is not a nutritional or medical judgement.";
  }

  function substitutionsFor(missing) {
    return (missing || []).map(function (m) {
      var key = normaliseName(m);
      return { ingredient: m, substitute: SUBSTITUTES[key] || "", says: SUBSTITUTES[key] ? "You could use " + SUBSTITUTES[key] + " instead." : "This app has no substitution for " + m + ", and will not invent one." };
    });
  }

  /* --------------------------------------------------------------- storage */

  function serializeState(data) {
    return JSON.stringify({
      version: VERSION,
      savedOn: (data && data.savedOn) || "",
      items: ((data && data.items) || []).map(function (it) {
        return { id: it.id, name: it.name, qty: it.qty, unit: it.unit, expires: it.expires, place: it.place };
      }),
      extras: ((data && data.extras) || []).map(function (e) { return { name: e.name, unit: e.unit }; }),
      constraints: ((data && data.constraints) || []).slice()
    }, null, 2);
  }

  /* An unreadable inventory is REPORTED, never reset: an empty pantry would also
   * silently empty the shopping list built from it. */
  function parseState(text) {
    var raw = String(text == null ? "" : text);
    if (!raw.trim()) return { ok: false, reason: "there is no saved pantry", raw: raw };
    var data;
    try { data = JSON.parse(raw); }
    catch (e) {
      return { ok: false, reason: "the saved pantry is not readable JSON. It was not reset: an empty pantry would also empty the shopping list built from it. Export it to keep it, or clear it deliberately.", raw: raw };
    }
    if (!data || !Array.isArray(data.items)) {
      return { ok: false, reason: "the saved pantry has no items list, so it was not used \u2014 and it was not replaced with an empty one.", raw: raw };
    }
    var items = [];
    data.items.forEach(function (it) {
      if (!it || !it.name) return;
      var qty = Number(it.qty);
      items.push({
        id: String(it.id || "i" + items.length),
        name: String(it.name),
        key: normaliseName(it.name),
        qty: isNaN(qty) ? 0 : qty,
        unit: String(it.unit || "piece"),
        expires: String(it.expires || ""),
        expiresMs: parseDate(it.expires),
        place: PLACES.indexOf(it.place) >= 0 ? it.place : "pantry"
      });
    });
    var constraints = Array.isArray(data.constraints) ? data.constraints.filter(function (id) { return !!constraintById(id); }) : [];
    var extras = Array.isArray(data.extras) ? data.extras.filter(function (e) { return e && e.name; }).map(function (e) { return { name: String(e.name), unit: String(e.unit || "") }; }) : [];
    return { ok: true, items: items, constraints: constraints, extras: extras, savedOn: String(data.savedOn || ""), raw: raw };
  }

  /* ---------------------------------------------------------------- export */

  function stamp(when) {
    var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(when || ""));
    return m ? m[3] + "-" + m[2] + "-" + m[1] : "undated";
  }

  function pantryMarkdown(items, extras, todayMs, when) {
    var lines = ["# Pantry", ""];
    if (when) lines.push("Exported " + when + ".");
    lines.push("");
    lines.push("| Item | Quantity | Where | Expires | State |");
    lines.push("|---|---|---|---|---|");
    useFirst(items, todayMs).forEach(function (row) {
      lines.push("| " + row.item.name + " | " + row.item.qty + " " + row.item.unit + " | " + row.item.place +
        " | " + (row.item.expires || "\u2014") + " | " + row.state + (row.daysLeft == null ? "" : " (" + row.daysLeft + " days)") + " |");
    });
    var shop = shoppingList(items, extras);
    lines.push("");
    lines.push("## Shopping list");
    if (!shop.length) lines.push("");
    if (!shop.length) lines.push("Nothing is finished.");
    shop.forEach(function (s) { lines.push("- " + s.name + (s.unit ? " (" + s.unit + ")" : "") + " \u2014 " + s.because); });
    return lines.join("\n");
  }

  function exportFile(what, payload, meta, writer) {
    meta = meta || {};
    if (typeof writer !== "function") return { ok: false, reason: "the file was not written: no writer is available in this browser" };
    var name, body;
    if (what === "pantry") { name = "pantry-" + stamp(meta.when) + ".md"; body = pantryMarkdown(payload.items, payload.extras, payload.todayMs, meta.when); }
    else if (what === "raw") { name = "pantry-unreadable-" + stamp(meta.when) + ".txt"; body = String(payload.raw || ""); }
    else return { ok: false, reason: "nothing was written: unknown export \u201c" + what + "\u201d" };
    try {
      var wrote = writer(name, body, what === "raw" ? "text/plain;charset=utf-8" : "text/markdown;charset=utf-8");
      if (wrote === false) return { ok: false, filename: name, reason: "the file was not written: the browser refused the save" };
      return { ok: true, filename: name, bytes: body.length };
    } catch (e) {
      var why = e && e.name === "QuotaExceededError" ? "storage is full" : (e && e.message ? e.message : "storage is unavailable");
      return { ok: false, filename: name, reason: "the file was not written: " + why };
    }
  }

  return {
    version: VERSION,
    PLACES: PLACES,
    UNITS: UNITS,
    CONSTRAINTS: CONSTRAINTS,
    RECIPES: RECIPES,
    SUBSTITUTES: SUBSTITUTES,
    parseDate: parseDate,
    fmtDate: fmtDate,
    daysBetween: daysBetween,
    normaliseName: normaliseName,
    validateItem: validateItem,
    parseBulk: parseBulk,
    useFirst: useFirst,
    shoppingList: shoppingList,
    constraintById: constraintById,
    forbiddenTerms: forbiddenTerms,
    recipeById: recipeById,
    recipeForbiddenBy: recipeForbiddenBy,
    filterRecipes: filterRecipes,
    matchRecipe: matchRecipe,
    cookable: cookable,
    whyFits: whyFits,
    substitutionsFor: substitutionsFor,
    serializeState: serializeState,
    parseState: parseState,
    pantryMarkdown: pantryMarkdown,
    exportFile: exportFile
  };
});
