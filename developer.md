# Calorie Tracker — Developer Context

## Project Overview
React/Vite PWA deployed on GitHub Pages at `/calorie-tracker/`. Single-user daily food and macro tracker with an optional T1D (Type 1 Diabetes) mode that adds glucose/insulin logging, per-meal carb breakdowns, and clinically-informed dosing tips. All data is stored in `localStorage` — no backend.

## Commands
```bash
npm run dev       # local dev server (port 5173)
npm run build     # production build → dist/
npm run deploy    # builds then pushes dist/ to gh-pages branch (live site)
git push          # push source to master (does NOT deploy — run deploy separately)
```

## Architecture

```
src/
  CalorieTracker.jsx     # Root component — all top-level state, layout
  components/
    SearchPanel.jsx      # USDA food search, manual entry, meal planner, favorites/recents modals
    FoodLog.jsx          # Grouped food log (read/edit/delete entries)
    DiabetesPanel.jsx    # T1D mode — glucose/insulin/weight logging, carb patterns, insights
    WeightPanel.jsx      # Standard weight tracking and 7-day insights
    GoalsPanel.jsx       # Collapsible macro goal editor
    MiniCalendar.jsx     # Date picker — all dates selectable (past and future)
    Sparkline.jsx        # Shared SVG sparkline component (used by Weight + Diabetes panels)
    Section.jsx          # Shared collapsible info section component
  utils/
    constants.js         # MC (macro colors), GROUPS (meal slots), DEFAULT_GOALS, MAX_RECENTS
    storage.js           # lsGet/lsSet wrappers, loadDay/saveDay, todayKey/toDateKey
    nutrients.js         # extractNutrients() and extractServings() from USDA API response
```

## LocalStorage Schema

| Key | Type | Description |
|-----|------|-------------|
| `ct_day_YYYY-MM-DD` | `FoodItem[]` | All food entries for a given day |
| `ct_goals` | `Goals` | Calorie budget + macro targets |
| `ct_recents` | `StoredFood[]` | Last 10 unique foods added (bumped on re-add) |
| `ct_favorites` | `StoredFood[]` | User-starred foods |
| `ct_diabetes_mode` | `boolean` | Whether diabetes mode is enabled |
| `ct_glucose` | `GlucoseReading[]` | All-time glucose log |
| `ct_insulin` | `InsulinDose[]` | All-time insulin log |
| `ct_weight` | `WeightEntry[]` | All-time weight log (most recent first) |

### Key Types
```js
// FoodItem — stored per-day
{ id, name, time, calories, protein, fat, carbs, fiber, sugar, grams, serving }

// StoredFood — recents and favorites
{ fdcId, description, nutrients: { calories, protein, fat, carbs, fiber, sugar }, searchResult }

// GlucoseReading
{ id, date, type, value, note }  // type: "Fasting" | "Post-meal (1hr)" | "Post-meal (2hr)" | "Bedtime"

// InsulinDose
{ id, date, type, dose, note }   // type: "Bolus" | "Basal" | "Correction"

// WeightEntry
{ id, date, value }              // value in lbs
```

## Data Flow

1. `CalorieTracker` owns `items` (today's food) and `dateKey`
2. `addItem(item)` appends to items; `useEffect` auto-persists via `saveDay`
3. `SearchPanel` calls `onAdd(item)` which maps to `addItem`
4. Switching dates via `MiniCalendar` calls `switchDay(key)` → loads that day from localStorage
5. `DiabetesPanel` reads food data for past days directly via `loadDay(dk)` (read-only)

## USDA FoodData Central API
- Base URL: `https://api.nal.usda.gov/fdc/v1`
- API key in `.env` as `VITE_USDA_API_KEY`
- Search uses **POST** `/foods/search` with JSON body (not GET query params)
- `dataType` filter: `["Branded"]` = whole foods, `["Foundation","SR Legacy"]` = branded, `[]` = all
- Detail fetch: GET `/food/{fdcId}` for full nutrient list and serving info

## T1D Mode — Clinical Logic

All tips in `getT1DWarnings()` (SearchPanel.jsx) are sourced from peer-reviewed literature:

| Tip | Threshold | Source |
|-----|-----------|--------|
| High carb dosing tip | ≥45g net carbs | General ADA guidance |
| Split bolus (pizza effect) | ≥20g net + ≥25g fat | Diabetes Care 2013/2020 |
| Pre-bolus (fast carbs) | ≥15g net + <3g fiber | ADA fiber guidance |
| Dawn phenomenon | Morning + ≥30g net | StatPearls |
| Bedtime check | Evening/Snack + ≥20g fat + ≥20g net | Diabetes Care 2013 |
| Daily context | Cumulative >130g net | Lancet 2023 |

Tone is coaching/suggestive — always offers a concrete strategy, never just warns.

## Component Patterns

- **Inline styles only** (no CSS modules) — single exception is `App.css` for hover animations
- **Global CSS** injected via `<style>` tag in `CalorieTracker` for `:hover` states and animations
- **`Section` and `Sparkline`** are shared between `DiabetesPanel` and `WeightPanel`
- `diabetesMode` hides `WeightPanel` (DiabetesPanel includes its own weight tracking)

## Git / Deploy Workflow
- Source lives on `master`, deployed build on `gh-pages`
- Dev server runs from git worktree at `.claude/worktrees/silly-pasteur`
- After editing in worktree, changes must be committed to `master` before deploying
- `npm run deploy` = `npm run build` + `gh-pages -d dist` (all-in-one)
