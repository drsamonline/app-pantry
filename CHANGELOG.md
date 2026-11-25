# Changelog

All notable changes to Pantry are recorded here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Dates: dd/mm/yyyy.

## [Unreleased]

## [1.0.0] — 25/11/2026

### Added
- Inventory: name, quantity, unit, place (pantry/fridge/freezer) and an optional expiry, with
  every refusal naming the field. A past date is accepted on purpose and sorts to the top.
- "Use first": ordered by expiry, past first, most overdue first, undated items last.
- Shopping list built only from what is finished (quantity 0) plus what is added by hand.
- Bulk paste, one item per line, with unreadable lines listed by number rather than dropped.
- Locked rules: milk/gluten/nut/soy allergies, Jain, no onion-garlic, Ekadashi and Navratri
  fasts, diabetic-friendly. A dish that breaks a rule is not offered, and the rule is named.
- A bundled index of twelve dishes, matched STRICTLY against the pantry: a missing ingredient
  is named and never substituted for a near-miss. A fixed substitution table suggests
  alternatives for missing items only, and says when it has none.
- A "why this fits your rules" note that names the rules checked and states that it is not a
  nutritional or medical judgement.
- Corruption handling: an unreadable pantry is reported, offered for export, and never reset —
  an empty pantry would also empty the shopping list built from it.
- PWA shell: manifest, cache-only service worker, icons. Works from `file://`.
- Tests: `tests/self-tests.js` (84 assertions, including the spec's done-means),
  `tests/ui-tests.js` (41, in jsdom), `tests/page-smoke.js`. CI runs all three.

### Not built
- Reading ingredients from a photograph: that needs an on-device vision model, and this build
  ships none. The honest smaller v1 is the manual and bulk-paste paths, which work.
- A model or key of any kind: the dish list is fixed, small and offline. The Palate prompt's
  LLM path is deliberately not built, because the house rule forbids a runtime network call.
- A packaged EXE / APK release: `app-builder` is not reachable from the build environment.
