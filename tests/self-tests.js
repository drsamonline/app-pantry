#!/usr/bin/env node
/* self-tests — Pantry. No framework, no dependencies.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * (c) 2026 Dr Sohil Momin
 *
 * The Larder spec's "done means" is countable and is counted here:
 *
 *   "an item added with a past date appears at the top of the 'use first' list, and a
 *    reload keeps it."
 *
 * Both specs' must-nots are named tests, including Palate's: an ingredient that matches
 * nothing is reported, never substituted for a near-miss, and no recipe is invented.
 *
 *   node tests/self-tests.js
 */
"use strict";

var fs = require("fs");
var path = require("path");

var ROOT = path.join(__dirname, "..");
var L = require(path.join(ROOT, "docs", "play", "larder-core.js"));

var passed = 0;
var failed = [];
var group = "";

function section(n) { group = n; }
function ok(name, cond, detail) { if (cond) { passed++; return; } failed.push(group + " :: " + name + (detail ? " — " + detail : "")); }
function eq(name, a, b) { ok(name, a === b, "expected " + JSON.stringify(b) + ", got " + JSON.stringify(a)); }
function read(f) { return fs.readFileSync(path.join(ROOT, f), "utf8"); }

var TODAY = L.parseDate("25/11/2026");

function item(name, qty, unit, expires, place) {
  return L.validateItem({ name: name, qty: qty, unit: unit || "kg", expires: expires || "", place: place || "pantry" });
}

/* ================================================ the spec's own "done means" */

section("done means — a past date goes to the top, and a reload keeps it");
var items = [];
items.push(item("rice", 2, "kg", "30/12/2026").item);
items.push(item("milk", 0.5, "L", "20/11/2026").item);   /* 5 days ago */
items.push(item("curd", 1, "kg", "26/11/2026").item);
items.push(item("atta", 5, "kg", "").item);              /* no date */

var order = L.useFirst(items, TODAY);
eq("the past-dated item is first", order[0].item.name, "milk");
eq("and it is marked past", order[0].state, "past");
eq("with a negative days-left", order[0].daysLeft, -5);
eq("the soonest future date comes next", order[1].item.name, "curd");
eq("an item with no date goes last", order[order.length - 1].item.name, "atta");
eq("no date is its own state", order[order.length - 1].state, "no date");

var reloaded = L.parseState(L.serializeState({ items: items, extras: [], constraints: [] }));
eq("the pantry survives a save and a reload", reloaded.ok, true);
eq("every item survives", reloaded.items.length, 4);
eq("the past-dated item is still first after the reload", L.useFirst(reloaded.items, TODAY)[0].item.name, "milk");
eq("and it is still marked past", L.useFirst(reloaded.items, TODAY)[0].state, "past");
eq("the date survives as a date", reloaded.items.filter(function (i) { return i.name === "milk"; })[0].expires, "20/11/2026");

section("done means — the shopping list is built from what is gone");
var gone = L.parseState(L.serializeState({ items: items, extras: [] })).items;
gone.forEach(function (it) { if (it.name === "milk") it.qty = 0; });
var shop = L.shoppingList(gone, []);
eq("a finished item reaches the shopping list", shop.length, 1);
eq("it is the finished one", shop[0].name, "milk");
eq("and it says why it is there", shop[0].because, "finished");
eq("an item still in stock is not on the list", shop.filter(function (s) { return s.name === "rice"; }).length, 0);
var withExtra = L.shoppingList(gone, [{ name: "salt", unit: "pack" }]);
eq("something added by hand is on the list too", withExtra.filter(function (s) { return s.name === "salt"; }).length, 1);

/* ============================================================ must-nots */

section("must-not — an item with no name, or a quantity that is not a number");
var noName = L.validateItem({ qty: 1, unit: "kg" });
eq("an item with no name is refused", noName.ok, false);
eq("and the name field is named", noName.field, "name");
var badQty = L.validateItem({ name: "rice", qty: "two", unit: "kg" });
eq("a non-numeric quantity is refused", badQty.ok, false);
eq("and the qty field is named", badQty.field, "qty");
eq("a negative quantity is refused", L.validateItem({ name: "rice", qty: -1, unit: "kg" }).field, "qty");
eq("a missing unit is refused", L.validateItem({ name: "rice", qty: 1 }).field, "unit");
eq("a unit this app does not know is refused", L.validateItem({ name: "rice", qty: 1, unit: "handful" }).field, "unit");
eq("a date that is not dd/mm/yyyy is refused", L.validateItem({ name: "rice", qty: 1, unit: "kg", expires: "2026-12-01" }).field, "expires");
eq("an impossible date is refused", L.validateItem({ name: "rice", qty: 1, unit: "kg", expires: "31/02/2026" }).ok, false);
var pastOk = L.validateItem({ name: "milk", qty: 1, unit: "L", expires: "01/01/2020" });
eq("a date in the past is ACCEPTED — it is the mechanic, not an error", pastOk.ok, true);

section("must-not — it must not become a recipe app");
var core = read("docs/play/larder-core.js");
ok("must_not_become_a_recipe_app: every suggestion comes from the bundled index",
  L.RECIPES.every(function (r) { return L.recipeById(r.id) === r; }));
ok("must_not_become_a_recipe_app: the filter can only remove, never add",
  L.filterRecipes([]).kept.length === L.RECIPES.length &&
  L.filterRecipes(["jain"]).kept.length < L.RECIPES.length);
ok("must_not_become_a_recipe_app: no recipe is generated, composed or fetched",
  !/generateRecipe|inventRecipe|composeRecipe|\bfetch\s*\(/.test(core));
ok("must_not_become_a_recipe_app: there is no model, key or endpoint",
  !/\b(apiKey|api_key|endpoint|llm|gpt|openai)\b/i.test(core));
ok("must_not_become_a_recipe_app: it knows what you have, not what you should cook",
  /knows what you have/.test(read("README.md")) || /not a recipe generator/i.test(read("docs/play/index.html")));

section("must-not — an ingredient that matches nothing is reported, not substituted");
var pantry = [item("tomato ketchup", 1, "pack").item, item("palak", 1, "bunch").item, item("paneer", 200, "g").item,
  item("onion", 1, "kg").item, item("garlic", 1, "pack").item, item("salt", 1, "pack").item, item("oil", 1, "L").item];
var palak = L.recipeById("r-palak-paneer");
var match = L.matchRecipe(palak, pantry);
eq("a dish is not cookable while an ingredient is absent", match.canCook, false);
ok("the absent ingredient is named", match.missing.indexOf("tomato") >= 0, match.missing.join(","));
ok("a near-miss in the pantry is NOT used as the ingredient",
  match.present.filter(function (p) { return p.ingredient === "tomato"; }).length === 0);
ok("the app says nothing was substituted", /Nothing was substituted/.test(match.says), match.says);
var subs = L.substitutionsFor(["curd", "dragonfruit"]);
ok("a known missing ingredient gets a fixed substitution", /lemon juice/.test(subs[0].says), subs[0].says);
ok("an unknown one gets no invented substitution", /will not invent one/.test(subs[1].says), subs[1].says);

section("must-not — a locked rule is not negotiable");
var jain = L.filterRecipes(["jain"]);
ok("Jain removes every dish with onion, garlic or a root vegetable",
  jain.excluded.every(function (e) { return e.hits.length > 0; }));
ok("and keeps only dishes that break nothing",
  jain.kept.every(function (r) { return L.recipeForbiddenBy(r, ["jain"]).length === 0; }));
ok("an excluded dish is not offered as cookable",
  L.cookable(pantry, ["jain"]).ready.every(function (m) { return L.recipeForbiddenBy(m.recipe, ["jain"]).length === 0; }));
ok("the reason names the rule, not just the ingredient",
  /Jain/.test(L.whyFits(L.recipeById("r-sabudana"), ["jain"])), L.whyFits(L.recipeById("r-sabudana"), ["jain"]));
ok("an allergy rule removes milk dishes", L.filterRecipes(["allergy-milk"]).excluded.some(function (e) { return e.recipe.id === "r-curd-rice"; }));
ok("a fasting rule removes grain dishes",
  ["r-dal-rice", "r-khado", "r-poha"].every(function (id) {
    if (!L.recipeById(id)) return true;
    return L.filterRecipes(["fast-ekadashi"]).excluded.some(function (e) { return e.recipe.id === id; });
  }));
ok("a fasting rule keeps the sabudana dish, which has no grain",
  L.filterRecipes(["fast-ekadashi"]).kept.some(function (r) { return r.id === "r-sabudana"; }));
ok("the fit note refuses to be a medical judgement", /not a nutritional or medical judgement/.test(L.whyFits(L.recipeById("r-khichdi"), ["jain"])), L.whyFits(L.recipeById("r-khichdi"), ["jain"]));

section("must-not — a corrupt pantry is never silently reset");
var bad = L.parseState("{ not json");
eq("a corrupt pantry is reported", bad.ok, false);
ok("the reason says it was not reset", /not reset/.test(bad.reason), bad.reason);
ok("and says why: the shopping list would empty too", /shopping list/.test(bad.reason), bad.reason);
eq("the raw text is kept for export", bad.raw, "{ not json");
eq("a pantry with no items list is refused", L.parseState('{"a":1}').ok, false);
eq("an empty save is reported, not guessed at", L.parseState("").ok, false);

section("must-not — a bulk paste is read line by line, and bad lines are listed");
var bulk = L.parseBulk("2 kg rice\n1 L milk\nnonsense line\n500 g dal");
eq("the readable lines are added", bulk.items.length, 3);
eq("the unreadable line is listed by number", bulk.problems.length, 1);
eq("with its line number", bulk.problems[0].line, 3);
ok("and it is not dropped silently", /listed rather than dropped/.test(bulk.reason), bulk.reason);
eq("a line with a bad unit is refused with the reason", L.parseBulk("2 handful rice").problems.length, 1);
eq("nothing to read is refused", L.parseBulk("   ").ok, false);

/* ================================================== the other mechanics */

section("mechanic — the order is expiry, then name");
var mixed = [item("b", 1, "kg", "01/12/2026").item, item("a", 1, "kg", "01/12/2026").item, item("c", 1, "kg", "26/11/2026").item];
eq("the same date falls back to the name", L.useFirst(mixed, TODAY).map(function (r) { return r.item.name; }).join(""), "cab");
eq("today counts as today", L.useFirst([item("x", 1, "kg", "25/11/2026").item], TODAY)[0].state, "today");
eq("three days away counts as soon", L.useFirst([item("x", 1, "kg", "28/11/2026").item], TODAY)[0].state, "soon");

section("failure case — storage full or unavailable");
var thrown = L.exportFile("pantry", { items: items, extras: [], todayMs: TODAY }, { when: "25/11/2026" }, function () {
  var e = new Error("quota"); e.name = "QuotaExceededError"; throw e;
});
eq("a failed write is reported as failed", thrown.ok, false);
ok("a failed write says the file was not written", /not written/.test(thrown.reason), thrown.reason);
ok("a failed write names the cause", /storage is full/.test(thrown.reason));
eq("no writer means no file", L.exportFile("pantry", {}, {}, null).ok, false);

section("failure case — no network");
["docs/play/larder-core.js", "docs/play/app.js", "docs/play/sw.js", "docs/play/web-kit.js", "docs/play/export-kit.js"].forEach(function (f) {
  var src = read(f);
  ok("no fetch call in " + f, !/\bfetch\s*\(/.test(src));
  ok("no XHR/WebSocket/beacon in " + f, !/XMLHttpRequest|WebSocket|sendBeacon|EventSource/.test(src));
});
ok("the page forbids connections in its CSP", /connect-src 'none'/.test(read("docs/play/index.html")));

section("export — the pantry as it stands");
var md = L.pantryMarkdown(gone, [{ name: "salt", unit: "pack" }], TODAY, "25/11/2026");
ok("the export lists the items", /milk/.test(md) && /rice/.test(md));
ok("the export carries the state of each item", /past/.test(md));
ok("the export carries the shopping list", /Shopping list/.test(md) && /salt/.test(md));

section("shape — every script the page loads exists beside it");
var page = read("docs/play/index.html");
var srcs = (page.match(/<script[^>]+src="([^"]+)"/g) || []).map(function (t) { return t.replace(/.*src="([^"]+)"/, "$1"); });
srcs.forEach(function (s) {
  ok("script src resolves: " + s, fs.existsSync(path.join(ROOT, "docs", "play", s.replace(/^\.\//, ""))));
});
ok("the landing page exists", fs.existsSync(path.join(ROOT, "docs", "index.html")));
ok("the page manifest exists", fs.existsSync(path.join(ROOT, "PAGES.json")));

/* ============================================================== summary */

var total = passed + failed.length;
if (!total) { console.error("self-tests: 0 assertions ran. That is a failure, not a pass."); process.exit(1); }
if (failed.length) {
  console.error("self-tests: " + passed + "/" + total + " passed, " + failed.length + " FAILED");
  failed.forEach(function (f) { console.error("  FAIL " + f); });
  process.exit(1);
}
console.log("self-tests: " + passed + "/" + total + " assertions passed");
