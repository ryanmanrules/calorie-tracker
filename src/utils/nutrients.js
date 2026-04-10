// USDA uses different field names depending on the data type (branded vs. foundation),
// so we check both nutrientName and nutrient.name and fall back to 0 if missing
export function extractNutrients(foodNutrients) {
  const find = (name) => {
    const match = foodNutrients.find((n) =>
      (n.nutrientName || n.nutrient?.name || "").toLowerCase().includes(name)
    );
    return parseFloat(match?.value ?? match?.amount ?? 0) || 0;
  };
  return {
    calories: find("energy") || find("calor"),
    protein:  find("protein"),
    fat:      find("total lipid") || find("fat"),
    carbs:    find("carbohydrate"),
    fiber:    find("fiber"),
  };
}

// Search results carry household serving text (e.g. "1 waffle"), detail carries foodPortions.
// We check both to get the best serving options without duplicates.
export function extractServings(searchResult, detail) {
  const options = [];
  const seen    = new Set();

  const addOption = (label, grams) => {
    const key = String(grams);
    if (!seen.has(key)) { seen.add(key); options.push({ label, grams }); }
  };

  [searchResult, detail].forEach((src) => {
    if (src?.servingSize) {
      const unit  = (src.servingSizeUnit || "").toLowerCase();
      const grams = (unit === "g" || unit === "gram" || unit === "") ? src.servingSize : null;
      if (grams) {
        const label = src.householdServingFullText
          ? `${src.householdServingFullText} (${grams}g)`
          : `1 serving (${grams}g)`;
        addOption(label, grams);
      }
    }
  });

  if (detail?.foodPortions?.length) {
    detail.foodPortions.forEach((p) => {
      const grams = p.gramWeight;
      const desc  = p.modifier || p.measureUnit?.name || "serving";
      const amt   = p.amount ?? 1;
      if (grams) addOption(`${amt} ${desc} (${grams}g)`, grams);
    });
  }

  options.push({ label: "Custom (enter grams)", grams: null });
  return options;
}
