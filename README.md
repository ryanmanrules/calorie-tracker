# Calorie Tracker

A fast, mobile-first PWA for daily calorie and macro tracking. Built for personal use with an optional T1D (Type 1 Diabetes) mode that surfaces clinically-informed insulin and dosing guidance.

**[Open the app](https://ryanmanrules.github.io/calorie-tracker/)**

## Features

**Core**
- Daily calorie and macro tracking (protein, carbs, fat, fiber)
- USDA FoodData Central search — whole foods and branded items
- Manual entry for foods not in the database
- Meal time slots (Morning / Afternoon / Evening / Snack)
- Editable calorie budget and macro targets
- Favorites and recents pop-out modals for quick logging
- Meal planner — stage a meal before committing it to the log
- Date navigation with a 7-day adherence dot strip and logging streak
- All data stored locally — no account required

**Weight**
- Daily weight logging with 7-day sparkline trend
- Automatic insights: carb/water weight correlation, calorie deficit analysis, protein adequacy, fiber intake

**Diabetes Mode (T1D)**
- Glucose and insulin logging (bolus, basal, correction)
- Net carbs display (carbs minus fiber) alongside total carbs
- Per-meal carb breakdown with stacked history chart
- Inline dosing tips when adding food, based on peer-reviewed clinical thresholds:
  - Split bolus guidance for high fat + carb combos (pizza effect)
  - Pre-bolus timing for fast-absorbing carbs
  - Dawn phenomenon awareness at breakfast
  - Bedtime glucose check reminders for late high-fat meals
  - Cumulative daily carb context

## Tech Stack

- **React 19** + **Vite**
- Deployed on **GitHub Pages** as a PWA (installable on iOS and Android)
- **USDA FoodData Central API** for food search
- `localStorage` for all data — fully offline after first load, no backend

## Local Development

```bash
npm install
```

Create a `.env` file in the project root:
```
VITE_USDA_API_KEY=your_key_here
```

Get a free API key at [fdc.nal.usda.gov](https://fdc.nal.usda.gov/api-guide.html).

```bash
npm run dev      # starts dev server at localhost:5173
npm run build    # production build
npm run deploy   # build + push to gh-pages (deploys live site)
```

## Data & Privacy

All data is stored in your browser's `localStorage`. Nothing is sent to any server — the only external request is to the USDA API when searching for food. Clearing your browser data will erase your log.
