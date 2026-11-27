/* app — the Pantry page. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * (c) 2026 Dr Sohil Momin
 *
 * Wiring only: validation, ordering, the shopping list, the rule filter and the strict
 * matching all live in larder-core.js, which the tests exercise directly.
 */
(function () {
  "use strict";

  var L = window.LarderCore;
  var $ = function (id) { return document.getElementById(id); };

  var K_STATE = "pantry:state";

  var els = {
    status: $("status"),
    iName: $("iName"), iQty: $("iQty"), iUnit: $("iUnit"), iExpires: $("iExpires"), iPlace: $("iPlace"),
    iAdd: $("iAdd"), bulk: $("bulk"), bulkAdd: $("bulkAdd"),
    exportPantry: $("exportPantry"), exportNote: $("exportNote"),
    ufTable: $("ufTable"), ufBody: $("ufTable").querySelector("tbody"), ufCount: $("ufCount"), ufEmpty: $("ufEmpty"),
    shopList: $("shopList"), extraName: $("extraName"), extraAdd: $("extraAdd"),
    constraintChips: $("constraintChips"),
    readyList: $("readyList"), closeList: $("closeList"), lockedList: $("lockedList"),
    closeHead: $("closeHead"), lockedHead: $("lockedHead"), cookEmpty: $("cookEmpty")
  };

  var state = { items: [], extras: [], constraints: [], savedOn: "" };

  /* ------------------------------------------------------------- helpers */

  function todayMs() {
    var d = new Date();
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function today() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear();
  }

  function setStatus(kind, msg) {
    els.status.className = "status show " + kind;
    els.status.textContent = msg;
  }
  function clearStatus() { els.status.className = "status"; els.status.textContent = ""; }

  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function persist() {
    state.savedOn = today();
    try {
      window.localStorage.setItem(K_STATE, L.serializeState(state));
      return true;
    } catch (e) {
      setStatus("warn", "This was not saved: " + (e && e.name === "QuotaExceededError" ? "storage is full" : "storage is unavailable") + ". It stays in this tab only, and it did not reach the shopping list.");
      return false;
    }
  }

  /* --------------------------------------------------------------- items */

  function addItemFromForm() {
    clearStatus();
    var res = L.validateItem({
      name: els.iName.value, qty: els.iQty.value, unit: els.iUnit.value,
      expires: els.iExpires.value, place: els.iPlace.value
    });
    if (!res.ok) {
      setStatus("bad", res.reason);
      var field = { name: els.iName, qty: els.iQty, unit: els.iUnit, expires: els.iExpires, place: els.iPlace }[res.field];
      if (field) field.focus();
      return;
    }
    state.items.push(res.item);
    var saved = persist();
    els.iName.value = "";
    els.iQty.value = "";
    els.iExpires.value = "";
    render();
    if (!saved) return;
    var row = L.useFirst(state.items, todayMs()).filter(function (r) { return r.item.id === res.item.id; })[0];
    setStatus("ok", res.item.name + " added." + (row && row.state === "past"
      ? " Its date is in the past, so it is at the top of use-first — that is the mechanic, not an error."
      : ""));
  }

  function addBulk() {
    clearStatus();
    var res = L.parseBulk(els.bulk.value);
    if (!res.items.length) {
      setStatus("bad", res.reason + (res.problems.length ? " Lines: " + res.problems.map(function (p) { return p.line; }).join(", ") : ""));
      return;
    }
    res.items.forEach(function (it) { state.items.push(it); });
    var saved = persist();
    els.bulk.value = "";
    render();
    if (!saved) return;
    setStatus(res.problems.length ? "warn" : "ok",
      res.items.length + " item(s) added." + (res.problems.length ? " " + res.problems.length + " line(s) could not be read: " +
        res.problems.map(function (p) { return "line " + p.line + " (" + p.reason + ")"; }).join("; ") : ""));
  }

  function removeItem(id) {
    state.items = state.items.filter(function (it) { return it.id !== id; });
    var saved = persist();
    render();
    if (saved) setStatus("ok", "Item removed.");
  }

  function finishItem(id) {
    state.items.forEach(function (it) { if (it.id === id) it.qty = 0; });
    var saved = persist();
    render();
    if (saved) setStatus("ok", "Marked finished. It is now on the shopping list, because the list is built from what is gone.");
  }

  /* ------------------------------------------------------------- render */

  function render() {
    renderUseFirst();
    renderShopping();
    renderConstraints();
    renderCook();
  }

  function renderUseFirst() {
    var rows = L.useFirst(state.items, todayMs());
    els.ufBody.textContent = "";
    els.ufCount.textContent = rows.length ? "· " + rows.length + " item(s), soonest first" : "";
    els.ufEmpty.hidden = rows.length > 0;

    rows.forEach(function (row) {
      var tr = node("tr", row.state === "past" ? "past" : row.state === "today" ? "today" : row.state === "soon" ? "soon" : row.state === "later" ? "later" : "nodate");
      tr.appendChild(node("td", null, row.item.name));
      tr.appendChild(node("td", null, row.item.qty + " " + row.item.unit));
      tr.appendChild(node("td", null, row.item.place));
      tr.appendChild(node("td", null, row.item.expires || "—"));
      var td = node("td");
      var label = row.state === "no date" ? "no date" : row.state === "past" ? "past by " + Math.abs(row.daysLeft) + " d" :
        row.state === "today" ? "today" : row.daysLeft + " d left";
      td.appendChild(node("span", "tag " + (row.state === "past" ? "past" : row.state === "today" || row.state === "soon" ? "soon" : ""), label));
      tr.appendChild(td);
      var actions = node("td");
      var fin = node("button", "small", "Finished");
      fin.addEventListener("click", function () { finishItem(row.item.id); });
      var del = node("button", "small", "Remove");
      del.style.marginLeft = "6px";
      del.addEventListener("click", function () { removeItem(row.item.id); });
      actions.appendChild(fin);
      actions.appendChild(del);
      tr.appendChild(actions);
      els.ufBody.appendChild(tr);
    });
  }

  function renderShopping() {
    var list = L.shoppingList(state.items, state.extras);
    els.shopList.textContent = "";
    if (!list.length) {
      els.shopList.appendChild(node("li", null, "Nothing is finished."));
      return;
    }
    list.forEach(function (s) {
      els.shopList.appendChild(node("li", null, s.name + (s.unit ? " (" + s.unit + ")" : "") + " — " + s.because));
    });
  }

  function renderConstraints() {
    els.constraintChips.textContent = "";
    L.CONSTRAINTS.forEach(function (c) {
      var on = state.constraints.indexOf(c.id) >= 0;
      var lab = node("label", "chip" + (on ? " on" : ""));
      var input = document.createElement("input");
      input.type = "checkbox";
      input.checked = on;
      input.value = c.id;
      input.addEventListener("change", function () {
        if (input.checked) { if (state.constraints.indexOf(c.id) < 0) state.constraints.push(c.id); }
        else state.constraints = state.constraints.filter(function (id) { return id !== c.id; });
        var saved = persist();
        renderConstraints();
        renderCook();
        if (saved) setStatus("ok", c.label + (input.checked ? " is now a locked rule." : " is no longer a rule."));
      });
      lab.appendChild(input);
      lab.appendChild(document.createTextNode(c.label));
      els.constraintChips.appendChild(lab);
    });
  }

  function renderCook() {
    var c = L.cookable(state.items, state.constraints);
    els.readyList.textContent = "";
    els.closeList.textContent = "";
    els.lockedList.textContent = "";
    els.cookEmpty.hidden = c.ready.length > 0;

    c.ready.forEach(function (m) {
      els.readyList.appendChild(dishCard(m, true));
    });
    els.closeHead.hidden = c.close.length === 0;
    c.close.forEach(function (m) {
      els.closeList.appendChild(dishCard(m, false));
    });
    els.lockedHead.hidden = c.excluded.length === 0;
    c.excluded.forEach(function (e) {
      var box = node("div", "dish locked");
      box.appendChild(node("h4", null, e.recipe.name));
      box.appendChild(node("div", "needs", "needs: " + e.recipe.needs.join(", ")));
      box.appendChild(node("div", "why", L.whyFits(e.recipe, state.constraints)));
      els.lockedList.appendChild(box);
    });
  }

  function dishCard(m, ready) {
    var box = node("div", "dish");
    box.appendChild(node("h4", null, m.recipe.name + (ready ? " — you have everything" : "")));
    box.appendChild(node("div", "needs", "needs: " + m.recipe.needs.join(", ")));
    box.appendChild(node("div", "why", m.says));
    if (!ready) {
      var subs = L.substitutionsFor(m.missing);
      subs.forEach(function (s) {
        box.appendChild(node("div", "why", "· " + s.ingredient + ": " + s.says));
      });
    }
    box.appendChild(node("div", "why", L.whyFits(m.recipe, state.constraints)));
    return box;
  }

  /* ------------------------------------------------------------- export */

  function writer(name, text, mime) {
    if (!window.Export || typeof window.Export.save !== "function") throw new Error("the export kit did not load");
    window.Export.save(name, text, mime);
    return true;
  }

  function doExport(what, payload) {
    var out = L.exportFile(what, payload, { when: today() }, writer);
    if (out.ok) {
      els.exportNote.textContent = "Wrote " + out.filename + " (" + out.bytes + " bytes).";
      setStatus("ok", "Wrote " + out.filename + ".");
    } else {
      setStatus("bad", out.reason + ".");
    }
  }

  /* ---------------------------------------------------------------- wire */

  L.UNITS.forEach(function (u) {
    var o = node("option", null, u);
    o.value = u;
    els.iUnit.appendChild(o);
  });
  els.iUnit.value = "kg";
  L.PLACES.forEach(function (p) {
    var o = node("option", null, p);
    o.value = p;
    els.iPlace.appendChild(o);
  });

  els.iAdd.addEventListener("click", addItemFromForm);
  els.bulkAdd.addEventListener("click", addBulk);
  els.extraAdd.addEventListener("click", function () {
    var name = els.extraName.value.trim();
    if (!name) { setStatus("bad", "The shopping list needs a name."); return; }
    state.extras.push({ name: name, unit: "" });
    els.extraName.value = "";
    var saved = persist();
    renderShopping();
    if (saved) setStatus("ok", name + " added to the shopping list by hand.");
  });
  els.exportPantry.addEventListener("click", function () {
    doExport("pantry", { items: state.items, extras: state.extras, todayMs: todayMs() });
  });
  ["pantry", "cook"].forEach(function (name) {
    $("tab-" + name).addEventListener("click", function () {
      ["pantry", "cook"].forEach(function (other) {
        var on = other === name;
        $("tab-" + other).setAttribute("aria-selected", on ? "true" : "false");
        $("panel-" + other).hidden = !on;
      });
    });
  });

  /* ------------------------------------------------------------ start up */

  var raw = null;
  try { raw = window.localStorage.getItem(K_STATE); } catch (e) { raw = null; }
  if (raw) {
    var parsed = L.parseState(raw);
    if (parsed.ok) {
      state.items = parsed.items;
      state.constraints = parsed.constraints;
      state.extras = parsed.extras;
      state.savedOn = parsed.savedOn;
    } else {
      /* Reported, offered for export, never reset: an empty pantry would also empty
       * the shopping list built from it. */
      setStatus("bad", parsed.reason);
      var keep = node("button", "small", "Export the unreadable pantry");
      keep.addEventListener("click", function () { doExport("raw", parsed); });
      els.exportNote.parentNode.insertBefore(keep, els.exportNote);
      var clear = node("button", "small", "Start an empty pantry");
      clear.addEventListener("click", function () {
        try { window.localStorage.removeItem(K_STATE); } catch (e) { /* nothing to remove */ }
        state.items = []; state.extras = []; state.constraints = [];
        render();
        setStatus("ok", "An empty pantry was started, deliberately. The unreadable file is gone.");
      });
      els.exportNote.parentNode.insertBefore(clear, els.exportNote);
    }
  }

  render();
  if (window.Loom && window.Loom.pwa) window.Loom.pwa.register("sw.js");
})();
