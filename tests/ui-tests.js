#!/usr/bin/env node
/* ui-tests — the Pantry page in a real DOM (jsdom).
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * (c) 2026 Dr Sohil Momin
 *
 * The engine has its own suite, including the spec's countable done-means. This one
 * proves the page is wired to it: an item with a past date lands at the top of use-first
 * and is still there after a reload; a bad quantity is refused with the field named; a
 * finished item reaches the shopping list; a locked rule removes a dish and says which
 * rule it broke; and a corrupt pantry is reported instead of being reset.
 *
 *   npm install --no-save jsdom && node tests/ui-tests.js
 */
"use strict";

var fs = require("fs");
var path = require("path");
var { JSDOM } = require("jsdom");

var ROOT = path.join(__dirname, "..");
var PLAY = path.join(ROOT, "docs", "play");
var PAGE = path.join(PLAY, "index.html");

var passed = 0;
var failed = [];
function ok(name, cond, detail) { if (cond) { passed++; return; } failed.push(name + (detail ? " — " + detail : "")); }
function eq(name, a, b) { ok(name, a === b, "expected " + JSON.stringify(b) + ", got " + JSON.stringify(a)); }

function build(seed) {
  var html = fs.readFileSync(PAGE, "utf8");
  var dom = new JSDOM(html, { url: "https://example.test/play/index.html", runScripts: "outside-only", pretendToBeVisual: true });
  var w = dom.window;
  if (seed) Object.keys(seed).forEach(function (k) { w.localStorage.setItem(k, seed[k]); });
  w.URL.createObjectURL = function () { return "blob:x"; };
  w.URL.revokeObjectURL = function () {};
  w.HTMLAnchorElement.prototype.click = function () {};
  ["web-kit.js", "export-kit.js", "larder-core.js", "app.js"].forEach(function (f) {
    w.eval(fs.readFileSync(path.join(PLAY, f), "utf8"));
  });
  return dom;
}

function addItem(w, d, name, qty, unit, expires) {
  d.getElementById("iName").value = name;
  d.getElementById("iQty").value = qty;
  d.getElementById("iUnit").value = unit;
  d.getElementById("iExpires").value = expires || "";
  d.getElementById("iAdd").click();
}

var dom = build(null);
var w = dom.window;
var d = w.document;
var $ = function (id) { return d.getElementById(id); };

ok("the engine loaded into the page", !!w.LarderCore);
ok("the units are filled in", $("iUnit").options.length >= 8);
eq("the pantry starts empty", d.querySelectorAll("#ufTable tbody tr").length, 0);

/* -------------------------------------------------- done means, on screen */

addItem(w, d, "rice", "2", "kg", "30/12/2026");
addItem(w, d, "milk", "0.5", "L", "20/11/2026");
var statusAfterPastDate = $("status").textContent;
addItem(w, d, "atta", "5", "kg", "");

var rows = d.querySelectorAll("#ufTable tbody tr");
eq("three items are listed", rows.length, 3);
ok("the past-dated item is the first row", /milk/.test(rows[0].textContent), rows[0].textContent);
ok("and it is marked past", /past by/.test(rows[0].textContent), rows[0].textContent);
ok("the row carries the past class", rows[0].className === "past", rows[0].className);
ok("an item with no date is last", /atta/.test(rows[2].textContent), rows[2].textContent);
ok("the app says a past date is the mechanic, not an error", /that is the mechanic, not an error/.test(statusAfterPastDate),
  statusAfterPastDate);

/* ------------------------------------------------------------- refusals */

addItem(w, d, "", "1", "kg", "");
ok("an item with no name is refused", /name field is empty/.test($("status").textContent), $("status").textContent);
eq("nothing was added", d.querySelectorAll("#ufTable tbody tr").length, 3);

addItem(w, d, "dal", "two", "kg", "");
ok("a non-numeric quantity is refused", /not a number/.test($("status").textContent), $("status").textContent);
eq("still nothing was added", d.querySelectorAll("#ufTable tbody tr").length, 3);

addItem(w, d, "dal", "1", "kg", "2026-12-01");
ok("a badly formatted date is refused", /not a date in dd\/mm\/yyyy/.test($("status").textContent), $("status").textContent);

/* ------------------------------------------------------------ bulk paste */

$("bulk").value = "500 g dal\n2 handful rice\n1 L curd";
$("bulkAdd").click();
ok("the readable lines are added", d.querySelectorAll("#ufTable tbody tr").length, 5);
ok("the unreadable line is named by number", /line 2/.test($("status").textContent), $("status").textContent);
ok("and the failure is a warning, not a silent drop", /could not be read/.test($("status").textContent), $("status").textContent);

/* --------------------------------------------------------- shopping list */

var milkRow = Array.prototype.filter.call(d.querySelectorAll("#ufTable tbody tr"), function (tr) { return /milk/.test(tr.textContent); })[0];
var finished = Array.prototype.filter.call(milkRow.querySelectorAll("button"), function (b) { return /Finished/.test(b.textContent); })[0];
finished.click();
ok("a finished item reaches the shopping list", /milk/.test($("shopList").textContent), $("shopList").textContent);
ok("and it says why", /finished/.test($("shopList").textContent), $("shopList").textContent);

$("extraName").value = "salt";
$("extraAdd").click();
ok("something added by hand is on the list", /salt/.test($("shopList").textContent), $("shopList").textContent);

/* ------------------------------------------------------------------ reload */

var saved = w.localStorage.getItem("pantry:state");
ok("the pantry was written to the device", !!saved);

var dom2 = build({ "pantry:state": saved });
var d2 = dom2.window.document;
var rows2 = d2.querySelectorAll("#ufTable tbody tr");
eq("the reload keeps every item", rows2.length, 5);
ok("and the past-dated item is still first", /milk/.test(rows2[0].textContent), rows2[0].textContent);
ok("the shopping list survives the reload", /milk/.test(d2.getElementById("shopList").textContent), d2.getElementById("shopList").textContent);

/* -------------------------------------------------------------- the cook */

$("tab-cook").click();
eq("the cook panel shows", $("panel-cook").hidden, false);
ok("every rule is offered as a chip", d.querySelectorAll("#constraintChips .chip").length === w.LarderCore.CONSTRAINTS.length);

var jainChip = Array.prototype.filter.call(d.querySelectorAll("#constraintChips .chip"), function (c) { return /Jain/.test(c.textContent); })[0];
var jainBox = jainChip.querySelector("input");
jainBox.checked = true;
jainBox.dispatchEvent(new w.Event("change", { bubbles: true }));
ok("locking a rule is announced", /locked rule/.test($("status").textContent), $("status").textContent);
ok("a dish that breaks the rule is not offered as ready",
  Array.prototype.every.call(d.querySelectorAll("#readyList .dish"), function (dish) { return !/palak paneer|chana masala|poha/i.test(dish.textContent); }));
ok("and the excluded list says which rule was broken", /breaks your rule/.test($("lockedList").textContent), $("lockedList").textContent);
ok("the locked dish is marked as locked", d.querySelectorAll("#lockedList .dish.locked").length > 0);

/* strict matching, on screen */
var pantry2 = w.LarderCore.parseState(w.localStorage.getItem("pantry:state"));
var palak = w.LarderCore.recipeById("r-palak-paneer");
var m = w.LarderCore.matchRecipe(palak, pantry2.items);
ok("an ingredient that matches nothing is named", m.missing.length > 0 && !m.canCook);
ok("nothing was substituted on screen", /Nothing was substituted/.test(m.says), m.says);

/* ------------------------------------------------------------- export */

$("tab-pantry").click();
$("exportPantry").click();
ok("the export names the file it wrote", /Wrote pantry-\d{4}-\d\d-\d\d\.md/.test($("exportNote").textContent), $("exportNote").textContent);

w.URL.createObjectURL = function () { throw new Error("storage is full"); };
$("exportPantry").click();
ok("a failed export says the file was not written", /not written/.test($("status").textContent), $("status").textContent);
eq("the pantry survives a failed export", d.querySelectorAll("#ufTable tbody tr").length, 5);

/* ------------------------------------------- a corrupt pantry on reload */

var dom3 = build({ "pantry:state": "{ broken pantry" });
var d3 = dom3.window.document;
ok("a corrupt pantry is reported", /not readable JSON/.test(d3.getElementById("status").textContent),
  d3.getElementById("status").textContent);
ok("the reason says it was not reset", /not reset/.test(d3.getElementById("status").textContent));
ok("it offers an export of the unreadable file",
  Array.prototype.some.call(d3.querySelectorAll("button"), function (b) { return /Export the unreadable pantry/.test(b.textContent); }));
ok("and a deliberate empty pantry, not a silent one",
  Array.prototype.some.call(d3.querySelectorAll("button"), function (b) { return /Start an empty pantry/.test(b.textContent); }));
eq("nothing is shown from a corrupt pantry", d3.querySelectorAll("#ufTable tbody tr").length, 0);
ok("a corrupt pantry is not overwritten with an empty one",
  /broken pantry/.test(dom3.window.localStorage.getItem("pantry:state") || ""),
  dom3.window.localStorage.getItem("pantry:state"));

var total = passed + failed.length;
if (!total) { console.error("ui-tests: 0 assertions ran. That is a failure, not a pass."); process.exit(1); }
if (failed.length) {
  console.error("ui-tests: " + passed + "/" + total + " passed, " + failed.length + " FAILED");
  failed.forEach(function (f) { console.error("  FAIL " + f); });
  process.exit(1);
}
console.log("ui-tests: " + passed + "/" + total + " assertions passed");
dom.window.close(); dom2.window.close(); dom3.window.close();
