export const GROUPS      = ["Morning", "Afternoon", "Evening", "Snack"];
export const MAX_RECENTS = 10;

// null means the user hasn't set that goal yet — pills render without a target
export const DEFAULT_GOALS = {
  calories: 2300,
  protein:  null,
  carbsMax: null,
  fatMax:   null,
  fiberMin: null,
};

// Shared color tokens — keeps macro colors consistent across pills, log rows, and search results
export const MC = {
  protein:  "#60a5fa",
  carbs:    "#f59e0b",
  fat:      "#f97316",
  calories: "#22c55e",
  fiber:    "#a37c3c",
};
