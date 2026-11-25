# Pantry

What you have, what goes first, what to buy. **Expiry is not a column here — it is the order the
app works in.**

- **Demo (the app itself):** https://drsamonline.github.io/app-pantry/play/index.html
- **Landing page:** https://drsamonline.github.io/app-pantry/
- **Plan row:** #5 of 37 in `drsamonline/forge` → `QUEUE/PLAN.json`
- **Specs absorbed:** `app-larder` (lead), `app-palate`
- **Licence:** PolyForm Noncommercial 1.0.0

## Status

| | |
|---|---|
| **Built** | Inventory (name, quantity, unit, place, expiry) with every refusal naming its field; a "use first" order where a past date sorts to the top; a shopping list built from what is finished; bulk paste with bad lines listed; nine locked rules (four allergies, Jain, no onion-garlic, two fasts, diabetic); a bundled twelve-dish index matched strictly against the pantry; a "why this fits your rules" note; Markdown export; corruption reported, never reset. |
| **Release** | Windows EXE, Android APK and Linux binary, built from this source by `app-builder` in CI, attached to the rolling release: [app-latest](https://github.com/drsamonline/app-pantry/releases/tag/app-latest) |
| **Not built** | **Reading ingredients from a photo** — that needs an on-device vision model and this build ships none. **Any model or key** — the dish list is fixed, small and offline; the Palate prompt's LLM path is deliberately not built, because the house rule forbids a runtime network call. A packaged EXE / APK release. |
| **Untested** | The service worker and install prompt (jsdom implements neither), and the app on a real phone with a real pantry of 60+ items — the ordering is tested, the feel of a long list is not. |

## The Larder spec's "done means", counted

> "an item added with a past date appears at the top of the 'use first' list, and a reload keeps it."

Both halves are asserted in `tests/self-tests.js` and again through the page in
`tests/ui-tests.js`:

- `useFirst(items, today)[0].item.name === "milk"` with `state === "past"` and `daysLeft === -5`;
- after `serializeState` → `parseState`, the same item is still first and still marked past;
- on the page, a reload from the saved state shows five rows with the past-dated one still at the top.

## The two must-nots that shaped the build

**"It must not become a recipe app."** The dishes are a fixed list of twelve in
`larder-core.js`. There is no generator, no composer, no model, no key, no endpoint — all
asserted. `filterRecipes` can only *remove* dishes from that list, never add one.

**"An ingredient that matches nothing says so, rather than substituting a near-miss."**
Matching is exact on the normalised name. With "tomato ketchup" in the pantry, Palak paneer
still reports `tomato` missing and says *"Nothing was substituted"*. A substitution is offered
only for a **missing** item, from a fixed table, and the app says plainly when it has none
rather than inventing one.

## Rules, and what they are not

Nine rules can be locked: milk, gluten, nut and soy allergies; Jain (no onion, garlic or root
vegetables); no onion-garlic; Ekadashi fast (no grains or pulses); Navratri fast (no grains, no
onion or garlic); diabetic-friendly (no sugar or jaggery).

A dish that breaks a locked rule is not offered at all, and the app names the rule it broke.
The "why this fits" note ends by saying it is **not a nutritional or medical judgement** — it
checked the rules you set, nothing else. For anything medical, ask the professional who knows you.

## When things go wrong

| Case | Behaviour |
|---|---|
| **Bad input** | No name → refused, field named. Quantity that is not a number → refused, `qty` named. Unknown unit or place → refused. A date that is not dd/mm/yyyy → refused. **A past date is accepted** and goes to the top of use-first. |
| **No network** | Nothing changes; the inventory, the list and the dishes are on the device. |
| **Storage full or unavailable** | The item is not added, the failure is announced, and it does not reach the shopping list. |
| **Corrupt saved state** | Reported, offered for export, and never reset — because an empty pantry would also silently empty the shopping list built from it. |

## Tests

```bash
npm test                      # all three suites
node tests/self-tests.js      # engine — 84 assertions
node tests/ui-tests.js        # the page in jsdom — 41 assertions (needs the dev-only jsdom)
node tests/page-smoke.js      # every local src/href resolves, nothing off-origin
```

Mutation-tested four ways on 25/11/2026: sorting a past date last (6 failures), accepting a
non-numeric quantity (2), treating an absent ingredient as present (4), and resetting a corrupt
pantry (3) each turned the suite red; restored, 84/84.

## Layout

```
docs/index.html            landing page
docs/play/index.html       the app (Pantry and Cook tabs)
docs/play/app.js           DOM wiring: the form, the list, the chips, the dishes
docs/play/larder-core.js   the engine — validation, ordering, rules, matching, storage
docs/play/web-kit.js       vendored kit (unmodified)
docs/play/export-kit.js    vendored kit (unmodified)
docs/play/sw.js            cache-only service worker
tests/self-tests.js        engine suite (84)
tests/ui-tests.js          page suite (41, jsdom)
tests/page-smoke.js        shape on disk
PAGES.json                 landing = docs/index.html, app = docs/play/index.html
```

## Where the spec was silent, and what was chosen

- **Units are a fixed list** (kg, g, L, ml, pack, dozen, bunch, piece) rather than free text:
  "handful" is refused, because a pantry you cannot compare is not an inventory.
- **The shopping list never guesses.** It holds finished items and what you added by hand. It
  does not add "what you would need to cook something" — that would be the app having opinions
  about your week.
- **Substitutions are for missing items only**, from a fixed table of eight, and several carry
  their own caveat ("not for a soy allergy", "not for an Ekadashi fast") so a substitution
  cannot quietly break a rule you locked.
- **Twelve dishes, not fifty.** Each one is matched strictly, so a long list would mostly show
  what you cannot cook.

## What is not built, and why

**Photo → ingredients.** The Palate prompt asks for on-device vision to list what it sees. That
needs a vision model shipped in the app; this build ships none, so the app does not offer the
feature and does not pretend to. The manual add and the bulk paste are the honest v1 — and the
spec's own mechanic (expiry first, list from what is gone) does not depend on the camera.

**The LLM and the key.** The prompt asks for a bring-your-own-key model. The house rules say no
runtime network call, ever. The offline degradation path the prompt itself describes — a bundled
index filtered by your constraints — is therefore the only path, not the fallback.
