import { useState, useEffect, useRef } from "react";
import { GROUPS, MC, MAX_RECENTS } from "../utils/constants";
import { lsGet, lsSet } from "../utils/storage";
import { extractNutrients, extractServings } from "../utils/nutrients";

const USDA_KEY = import.meta.env.VITE_USDA_API_KEY;
const USDA_URL = "https://api.nal.usda.gov/fdc/v1";

// mode can be "search" | "manual" | "plan"
const MODES = { SEARCH: "search", MANUAL: "manual", PLAN: "plan" };

const smallInput = {
  width: "100%", background: "#18181f", border: "1px solid #2e2e3a",
  borderRadius: 8, padding: "7px 10px", color: "#e8e8e8",
  fontSize: 11, fontFamily: "inherit", outline: "none",
};

// T1D-specific per-item guidance based on peer-reviewed clinical thresholds.
// Tone: helpful coaching, not restriction — always suggests a strategy.
function getT1DWarnings(scaledN, mealTime, todayNetCarbs) {
  const tips = [];
  const net = Math.max(0, (scaledN.carbs || 0) - (scaledN.fiber || 0));
  if (net < 10) return tips;

  // 1. High net carbs — dosing error risk scales with carb load
  if (net >= 75) {
    tips.push({ level: "high", label: "DOSING TIP", text: `${Math.round(net)}g net carbs is a large bolus load — small miscalculations have a bigger impact at this size. Pre-bolusing 10–15 min early and checking at the 1-hr mark can help keep the peak in range.` });
  } else if (net >= 45) {
    tips.push({ level: "warn", label: "DOSING TIP", text: `${Math.round(net)}g net carbs — worth double-checking your I:C ratio for this meal. Pre-bolusing 10–15 min before eating gives insulin a head start on the glucose curve.` });
  }

  // 2. High carb + high fat — "pizza effect", delays glucose peak 2–5 hrs (Diabetes Care 2013/2020)
  if (net >= 20 && (scaledN.fat || 0) >= 25) {
    tips.push({ level: "warn", label: "SPLIT BOLUS TIP", text: `High carb + fat combo (${Math.round(scaledN.fat)}g fat) slows digestion so glucose peaks 2–5 hrs after eating instead of right away. Taking part of your bolus now and the rest 1–2 hrs later can match this curve much better.` });
  }

  // 3. Fast-absorbing carbs — ADA: <5g fiber = no meaningful absorption slow-down
  if (net >= 15 && (scaledN.fiber || 0) < 3) {
    tips.push({ level: "warn", label: "PRE-BOLUS TIP", text: `Low fiber means these carbs hit the bloodstream quickly — blood sugar can peak within 30–60 min. Dosing 15–20 min before eating (instead of at the meal) gives insulin time to keep up.` });
  }

  // 4. Dawn phenomenon — morning cortisol + growth hormone cause 20–50% higher insulin resistance (StatPearls)
  if (mealTime === "Morning" && net >= 30) {
    tips.push({ level: "info", label: "BREAKFAST TIP", text: `Morning hormones make the same carbs raise blood sugar more than they would at lunch. If your post-breakfast numbers run high, a slightly higher I:C ratio at breakfast is worth testing with your care team.` });
  }

  // 5. Evening/snack high fat+carb — peak glucose shifts to 11pm–4am sleep window (Diabetes Care 2013)
  if ((mealTime === "Evening" || mealTime === "Snack") && (scaledN.fat || 0) >= 20 && net >= 20) {
    tips.push({ level: "warn", label: "BEDTIME CHECK", text: `High carb + fat (${Math.round(scaledN.fat)}g fat) in the evening tends to peak during sleep. A glucose check before bed — and a small correction if needed — can help you stay in range overnight.` });
  }

  // 6. Daily cumulative — above 130g/day bolus insulin demand rises significantly (Lancet 2023)
  if (typeof todayNetCarbs === "number" && todayNetCarbs >= 30 && (todayNetCarbs + net) > 130) {
    tips.push({ level: "info", label: "DAILY CONTEXT", text: `This would put you at ~${Math.round(todayNetCarbs + net)}g net carbs today. If remaining meals lean protein and fat-heavy instead of carb-heavy, you can keep total insulin demand lower for the rest of the day.` });
  }

  return tips;
}

const WARN_COLORS = { high: "#ef4444", warn: "#f97316", info: "#f59e0b" };

// Defined outside SearchPanel so its identity is stable across re-renders —
// prevents the qty input from unmounting/remounting (and losing focus) on every keystroke.
function ResultRow({ food, onAddFn, scState, setScState, qState, setQState, cgState, setCgState, detailCache, mode, diabetesMode, mealTime, todayNetCarbs }) {
  const detail    = detailCache[food.fdcId] || food;
  const servings  = extractServings(food, detail);
  const choiceIdx = scState[food.fdcId] ?? 0;
  const chosen    = servings[choiceIdx];
  const isCustom  = chosen.grams === null;
  const n         = extractNutrients(detail.foodNutrients || food.foodNutrients || []);

  // scale nutrients to the actual serving being added — warnings react to qty/grams changes
  const rawGrams = isCustom
    ? parseFloat(cgState[food.fdcId] || "100")
    : (chosen.grams || 100) * parseFloat(qState[food.fdcId] || "1");
  const scale    = rawGrams / 100;
  const scaledN  = { carbs: n.carbs * scale, fat: n.fat * scale, fiber: n.fiber * scale };
  const t1dWarnings = diabetesMode ? getT1DWarnings(scaledN, mealTime, todayNetCarbs) : [];

  return (
    <div className="result-row" style={{ padding: "12px", borderBottom: "1px solid #28283a" }}>
      <div style={{ fontSize: 12, color: "#fff", marginBottom: 2 }}>{food.description}</div>
      <div style={{ fontSize: 10, marginBottom: 10 }}>
        <span style={{ color: "#fff" }}>per 100g &nbsp;·&nbsp; </span>
        <span style={{ color: MC.calories }}>{Math.round(n.calories)} kcal</span>
        <span style={{ color: "#888" }}> &nbsp;·&nbsp; </span>
        <span style={{ color: MC.protein }}>P:{Math.round(n.protein)}g</span>
        <span style={{ color: "#888" }}> &nbsp;·&nbsp; </span>
        <span style={{ color: MC.carbs }}>C:{Math.round(n.carbs)}g</span>
        <span style={{ color: "#888" }}> &nbsp;·&nbsp; </span>
        <span style={{ color: MC.fat }}>F:{Math.round(n.fat)}g</span>
        <span style={{ color: "#888" }}> &nbsp;·&nbsp; </span>
        <span style={{ color: MC.fiber }}>Fi:{Math.round(n.fiber)}g</span>
        {diabetesMode && <><span style={{ color: "#888" }}> &nbsp;·&nbsp; </span><span style={{ color: "#f472b6" }}>Su:{Math.round(n.sugar)}g</span></>}
      </div>
      <select value={choiceIdx}
        onChange={(e) => setScState((prev) => ({ ...prev, [food.fdcId]: parseInt(e.target.value) }))}
        style={{ ...smallInput, marginBottom: 8, cursor: "pointer" }}>
        {servings.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
      </select>
      {t1dWarnings.length > 0 && (
        <div style={{ marginBottom: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          {t1dWarnings.map((w, i) => (
            <div key={i} style={{
              padding: "6px 10px",
              background: "#1a1020",
              borderLeft: `3px solid ${WARN_COLORS[w.level]}`,
              borderRadius: "0 6px 6px 0",
            }}>
              <div style={{ fontSize: 9, letterSpacing: 1.5, color: WARN_COLORS[w.level], marginBottom: 2 }}>{w.label}</div>
              <div style={{ fontSize: 10, color: "#bbb", lineHeight: 1.5 }}>{w.text}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        {isCustom ? (
          <input key="amount" type="text" inputMode="decimal" placeholder="Enter grams" value={cgState[food.fdcId] || ""}
            onChange={(e) => setCgState((prev) => ({ ...prev, [food.fdcId]: e.target.value }))}
            style={smallInput} />
        ) : (
          <input key="amount" type="text" inputMode="decimal" placeholder="Qty (default 1)" value={qState[food.fdcId] || ""}
            onChange={(e) => setQState((prev) => ({ ...prev, [food.fdcId]: e.target.value }))}
            style={smallInput} />
        )}
        <button onClick={() => onAddFn(food)}
          style={{ background: "#f97316", border: "none", borderRadius: 8, padding: "6px 16px", color: "#fff", fontSize: 12, cursor: "pointer", flexShrink: 0 }}>
          {mode === MODES.PLAN ? "Plan" : "Add"}
        </button>
      </div>
    </div>
  );
}

let planId = 1;

export default function SearchPanel({ mealTime, setMealTime, onAdd, diabetesMode, weeklyMealAvg, todayNetCarbs }) {
  const [mode, setMode]             = useState(MODES.SEARCH);
  const [query, setQuery]           = useState("");
  const [results, setResults]       = useState([]);
  const [searching, setSearching]   = useState(false);
  const [searchErr, setSearchErr]   = useState("");
  const [manual, setManual]         = useState({ name: "", calories: "", protein: "", carbs: "", fat: "", fiber: "", sugar: "" });
  const [servingChoice, setServingChoice] = useState({});
  const [quantity, setQuantity]           = useState({});
  const [customGrams, setCustomGrams]     = useState({});
  const [detailCache, setDetailCache]     = useState({});
  const [recents, setRecents]             = useState(() => lsGet("ct_recents", []));
  const [favorites, setFavorites]         = useState(() => lsGet("ct_favorites", []));

  // planned meal items — built up before committing to the log
  const [plannedItems, setPlannedItems] = useState([]);
  const [planNote, setPlanNote]         = useState("");
  const [planInsulin, setPlanInsulin]   = useState("");
  const [planManualOpen, setPlanManualOpen] = useState(false);
  const [planManual, setPlanManual]     = useState({ name: "", calories: "", protein: "", carbs: "", fat: "", fiber: "", sugar: "" });

  // search within plan mode
  const [planQuery, setPlanQuery]       = useState("");
  const [planResults, setPlanResults]   = useState([]);
  const [planSearching, setPlanSearching] = useState(false);
  const [planServingChoice, setPlanServingChoice] = useState({});
  const [planQuantity, setPlanQuantity]           = useState({});
  const [planCustomGrams, setPlanCustomGrams]     = useState({});

  const [dataType, setDataType] = useState("Branded");

  const searchTimeout = useRef(null);
  const planTimeout   = useRef(null);

  const inputStyle = {
    width: "100%", background: "#18181f", border: "1px solid #2e2e3a",
    borderRadius: 8, padding: "10px 12px", color: "#e8e8e8",
    fontSize: 13, fontFamily: "inherit", outline: "none",
  };

  // POST body search — unambiguous array format, no query-param encoding issues
  const buildSearchBody = (q, size) => {
    const body = { query: q, pageSize: size };
    if (dataType) body.dataType = dataType.split(",").map((d) => d.trim());
    return body;
  };

  const doSearch = (q, size) =>
    fetch(`${USDA_URL}/foods/search?api_key=${USDA_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildSearchBody(q, size)),
    });

  // ── debounced USDA search (regular mode) ─────────────────────────────────
  useEffect(() => {
    if (!query.trim()) { setResults([]); setSearchErr(""); return; }
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      setSearching(true); setSearchErr("");
      try {
        const res  = await doSearch(query, 6);
        const data = await res.json();
        setResults(data.foods || []);
      } catch { setSearchErr("Search failed. Check your connection."); }
      finally { setSearching(false); }
    }, 500);
  }, [query, dataType]);

  // ── debounced USDA search (plan mode) ────────────────────────────────────
  useEffect(() => {
    if (!planQuery.trim()) { setPlanResults([]); return; }
    clearTimeout(planTimeout.current);
    planTimeout.current = setTimeout(async () => {
      setPlanSearching(true);
      try {
        const res  = await doSearch(planQuery, 5);
        const data = await res.json();
        setPlanResults(data.foods || []);
      } catch {}
      finally { setPlanSearching(false); }
    }, 500);
  }, [planQuery, dataType]);

  const fetchDetail = async (fdcId) => {
    if (detailCache[fdcId]) return detailCache[fdcId];
    try {
      const res  = await fetch(`${USDA_URL}/food/${fdcId}?api_key=${USDA_KEY}`);
      const data = await res.json();
      setDetailCache((prev) => ({ ...prev, [fdcId]: data }));
      return data;
    } catch { return null; }
  };

  useEffect(() => { results.forEach((f) => fetchDetail(f.fdcId)); }, [results]);
  useEffect(() => { planResults.forEach((f) => fetchDetail(f.fdcId)); }, [planResults]);

  // Keep the most recently added foods at the top, bump duplicates instead of stacking
  const saveToRecents = (food, nutrients) => {
    const entry = { fdcId: food.fdcId, description: food.description, nutrients, searchResult: food };
    setRecents((prev) => {
      const updated = [entry, ...prev.filter((r) => r.fdcId !== food.fdcId)].slice(0, MAX_RECENTS);
      lsSet("ct_recents", updated);
      return updated;
    });
  };

  // Stars toggle — if already a favorite remove it, otherwise promote from recents
  const toggleFavorite = (fdcId) => {
    setFavorites((prev) => {
      const isFav   = prev.some((f) => f.fdcId === fdcId);
      const recent  = recents.find((r) => r.fdcId === fdcId);
      const updated = isFav ? prev.filter((f) => f.fdcId !== fdcId) : recent ? [recent, ...prev] : prev;
      lsSet("ct_favorites", updated);
      return updated;
    });
  };

  const clearRecents = () => { setRecents([]); lsSet("ct_recents", []); };

  // ── build item from USDA result ──────────────────────────────────────────
  const buildFromResult = (food, scMap, qMap, cgMap) => {
    const detail    = detailCache[food.fdcId] || food;
    const servings  = extractServings(food, detail);
    const choiceIdx = scMap[food.fdcId] ?? 0;
    const chosen    = servings[choiceIdx];
    const qty       = parseFloat(qMap[food.fdcId]) || 1;
    const grams     = chosen.grams === null
      ? parseFloat(cgMap[food.fdcId]) || 100
      : chosen.grams * qty;
    const n     = extractNutrients(detail.foodNutrients || food.foodNutrients || []);
    const scale = grams / 100;
    return {
      name:     food.description,
      time:     mealTime,
      calories: Math.round(n.calories * scale),
      protein:  Math.round(n.protein  * scale),
      fat:      Math.round(n.fat      * scale),
      carbs:    Math.round(n.carbs    * scale),
      fiber:    Math.round(n.fiber    * scale),
      sugar:    Math.round(n.sugar    * scale),
      grams:    Math.round(grams),
      serving:  chosen.grams === null ? `${Math.round(grams)}g` : qty !== 1 ? `${qty}x ${chosen.label}` : chosen.label,
      _n: n,
      _food: food,
    };
  };

  // ── add to food log (regular search) ─────────────────────────────────────
  const addFromResult = (food) => {
    const item = buildFromResult(food, servingChoice, quantity, customGrams);
    onAdd(item);
    saveToRecents(food, item._n);
    setQuery(""); setResults([]); setServingChoice({}); setQuantity({}); setCustomGrams({});
  };

  const addManual = () => {
    if (!manual.name.trim() || !manual.calories) return;
    onAdd({
      name: manual.name.trim(), time: mealTime,
      calories: parseInt(manual.calories) || 0, protein: parseInt(manual.protein) || 0,
      carbs: parseInt(manual.carbs) || 0, fat: parseInt(manual.fat) || 0,
      fiber: parseInt(manual.fiber) || 0, sugar: parseInt(manual.sugar) || 0,
      grams: null, serving: "manual entry",
    });
    setManual({ name: "", calories: "", protein: "", carbs: "", fat: "", fiber: "", sugar: "" });
  };

  const addFromStored = (stored) => {
    onAdd({
      name: stored.description, time: mealTime,
      calories: Math.round(stored.nutrients.calories), protein: Math.round(stored.nutrients.protein),
      fat: Math.round(stored.nutrients.fat), carbs: Math.round(stored.nutrients.carbs),
      fiber: Math.round(stored.nutrients.fiber || 0), sugar: Math.round(stored.nutrients.sugar || 0),
      grams: 100, serving: "100g",
    });
  };

  // ── plan mode: add to staging area ───────────────────────────────────────
  const addToPlan = (food) => {
    const item = buildFromResult(food, planServingChoice, planQuantity, planCustomGrams);
    setPlannedItems((prev) => [...prev, { ...item, id: planId++ }]);
    setPlanQuery(""); setPlanResults([]); setPlanServingChoice({}); setPlanQuantity({}); setPlanCustomGrams({});
  };

  const addManualToPlan = () => {
    if (!planManual.name.trim() || !planManual.calories) return;
    setPlannedItems((prev) => [...prev, {
      id: planId++,
      name: planManual.name.trim(), time: mealTime,
      calories: parseInt(planManual.calories) || 0, protein: parseInt(planManual.protein) || 0,
      carbs: parseInt(planManual.carbs) || 0, fat: parseInt(planManual.fat) || 0,
      fiber: parseInt(planManual.fiber) || 0, sugar: parseInt(planManual.sugar) || 0,
      grams: null, serving: "manual entry",
    }]);
    setPlanManual({ name: "", calories: "", protein: "", carbs: "", fat: "", fiber: "", sugar: "" });
    setPlanManualOpen(false);
  };

  const removeFromPlan = (id) => setPlannedItems((prev) => prev.filter((i) => i.id !== id));

  // push all planned items to the food log
  const commitPlan = () => {
    if (!plannedItems.length) return;
    plannedItems.forEach((item) => {
      const { id, _n, _food, ...rest } = item;
      onAdd({ ...rest, time: mealTime });
      if (_food && _n) saveToRecents(_food, _n);
    });
    setPlannedItems([]);
    setPlanNote("");
    setPlanInsulin("");
    setPlanQuery("");
    setPlanResults([]);
  };

  // planned meal totals
  const planTotals = plannedItems.reduce(
    (acc, i) => ({ calories: acc.calories + i.calories, protein: acc.protein + i.protein, carbs: acc.carbs + i.carbs, fat: acc.fat + i.fat, fiber: acc.fiber + i.fiber }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  );
  const planNetCarbs = Math.max(0, planTotals.carbs - planTotals.fiber);

  const favIds        = new Set(favorites.map((f) => f.fdcId));
  const recentNonFavs = recents.filter((r) => !favIds.has(r.fdcId));
  const storedList    = [...favorites, ...recentNonFavs];
  const showStored    = mode === MODES.SEARCH && storedList.length > 0 && !query.trim();

  // data type filter toggle style
  const dtBtn = (val) => ({
    background: dataType === val ? "#2e2e3a" : "none",
    border: "1px solid #2e2e3a", borderRadius: 6,
    padding: "3px 9px", color: dataType === val ? "#fff" : "#555",
    fontSize: 9, cursor: "pointer", letterSpacing: 1,
  });

  // mode button style
  const modeBtn = (m) => ({
    background: mode === m ? "#2e2e3a" : "none",
    border: "1px solid #2e2e3a", borderRadius: 6,
    padding: "4px 10px", color: mode === m ? "#fff" : "#777",
    fontSize: 10, cursor: "pointer", letterSpacing: 1,
  });

  return (
    <div style={{ background: "#242430", border: "1px solid #2e2e3a", borderRadius: 16, padding: "20px", marginBottom: 20 }}>

      {/* header + mode toggles */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 10, letterSpacing: 3, color: "#fff" }}>
          {mode === MODES.SEARCH ? "SEARCH FOOD — USDA DATABASE" : mode === MODES.MANUAL ? "MANUAL ENTRY" : "MEAL PLANNER"}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button style={modeBtn(MODES.SEARCH)} onClick={() => { setMode(MODES.SEARCH); setQuery(""); setResults([]); }}>SEARCH</button>
          <button style={modeBtn(MODES.MANUAL)} onClick={() => { setMode(MODES.MANUAL); setQuery(""); setResults([]); }}>MANUAL</button>
          <button style={modeBtn(MODES.PLAN)}   onClick={() => { setMode(MODES.PLAN);   setQuery(""); setResults([]); }}>PLAN</button>
        </div>
      </div>

      {/* meal time selector — shown in all modes */}
      <select value={mealTime} onChange={(e) => setMealTime(e.target.value)} style={{ ...inputStyle, marginBottom: 10, cursor: "pointer" }}>
        {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
      </select>

      {/* ── SEARCH mode ─────────────────────────────────────────────────── */}
      {mode === MODES.SEARCH && (
        <>
          <input placeholder="Search food..." value={query} onChange={(e) => setQuery(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
            <button style={dtBtn("Branded")} onClick={() => setDataType("Branded")}>WHOLE FOODS</button>
            <button style={dtBtn("Foundation,SR Legacy")} onClick={() => setDataType("Foundation,SR Legacy")}>BRANDED</button>
            <button style={dtBtn("")} onClick={() => setDataType("")}>ALL</button>
          </div>
          {searching && <div style={{ fontSize: 11, color: "#fff", padding: "6px 2px" }}>Searching...</div>}
          {searchErr  && <div style={{ fontSize: 11, color: "#ef4444", padding: "6px 2px" }}>{searchErr}</div>}

          {showStored && (
            <div style={{ background: "#18181f", border: "1px solid #2a2a38", borderRadius: 10, overflow: "hidden", marginTop: 8 }}>
              {favorites.length > 0 && <div style={{ fontSize: 9, letterSpacing: 2, color: "#f59e0b", padding: "8px 12px 4px" }}>FAVORITES</div>}
              {storedList.map((stored, idx) => {
                const isFav     = favIds.has(stored.fdcId);
                const showLabel = !isFav && idx === favorites.length;
                return (
                  <div key={stored.fdcId}>
                    {showLabel && (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px 4px", borderTop: favorites.length ? "1px solid #28283a" : "none" }}>
                        <span style={{ fontSize: 9, letterSpacing: 2, color: "#777" }}>RECENTS</span>
                        <button onClick={clearRecents} style={{ background: "none", border: "none", fontSize: 9, color: "#555", cursor: "pointer", letterSpacing: 1 }}>CLEAR</button>
                      </div>
                    )}
                    <div className="stored-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderBottom: "1px solid #28283a", transition: "background 0.15s" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, color: "#fff" }}>{stored.description}</div>
                        <div style={{ fontSize: 10, marginTop: 2 }}>
                          <span style={{ color: MC.calories }}>{Math.round(stored.nutrients.calories)} kcal</span>
                          <span style={{ color: "#888" }}> &nbsp;·&nbsp; </span>
                          <span style={{ color: MC.protein }}>P:{Math.round(stored.nutrients.protein)}g</span>
                          <span style={{ color: "#888" }}> &nbsp;·&nbsp; </span>
                          <span style={{ color: MC.carbs }}>C:{Math.round(stored.nutrients.carbs)}g</span>
                          <span style={{ color: "#888" }}> &nbsp;·&nbsp; </span>
                          <span style={{ color: MC.fat }}>F:{Math.round(stored.nutrients.fat)}g</span>
                          <span style={{ color: "#888" }}> &nbsp;·&nbsp; </span>
                          <span style={{ color: MC.fiber }}>Fi:{Math.round(stored.nutrients.fiber || 0)}g</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <button className={`star-btn${isFav ? " active" : ""}`} onClick={() => toggleFavorite(stored.fdcId)}>★</button>
                        <button onClick={() => addFromStored(stored)} style={{ background: "#f97316", border: "none", borderRadius: 8, padding: "4px 12px", color: "#fff", fontSize: 11, cursor: "pointer" }}>Add</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {results.length > 0 && (
            <div style={{ background: "#18181f", border: "1px solid #2a2a38", borderRadius: 10, overflow: "hidden", marginTop: 8 }}>
              {results.map((food) => (
                <ResultRow key={food.fdcId} food={food} onAddFn={addFromResult}
                  scState={servingChoice}    setScState={setServingChoice}
                  qState={quantity}          setQState={setQuantity}
                  cgState={customGrams}      setCgState={setCustomGrams}
                  detailCache={detailCache}  mode={mode}  diabetesMode={diabetesMode}
                  mealTime={mealTime}        todayNetCarbs={todayNetCarbs} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── MANUAL mode ─────────────────────────────────────────────────── */}
      {mode === MODES.MANUAL && (
        <div>
          <input placeholder="Food name (required)" value={manual.name}
            onChange={(e) => setManual((p) => ({ ...p, name: e.target.value }))}
            style={{ ...inputStyle, marginBottom: 8 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            {[
              { key: "calories", label: "Calories",    color: MC.calories },
              { key: "protein",  label: "Protein (g)", color: MC.protein  },
              { key: "carbs",    label: "Carbs (g)",   color: MC.carbs    },
              { key: "fat",      label: "Fat (g)",     color: MC.fat      },
              { key: "fiber",    label: "Fiber (g)",   color: MC.fiber    },
              { key: "sugar",    label: "Sugar (g)",   color: "#f472b6"   },
            ].map(({ key, label, color }) => (
              <input key={key} type="number" placeholder={label} value={manual[key]}
                onChange={(e) => setManual((p) => ({ ...p, [key]: e.target.value }))}
                style={{ ...inputStyle, borderColor: manual[key] ? color : "#2e2e3a" }} />
            ))}
          </div>
          <button onClick={addManual} style={{ width: "100%", background: "#f97316", border: "none", borderRadius: 8, padding: "10px", color: "#fff", fontSize: 13, cursor: "pointer" }}>
            Add Entry
          </button>
        </div>
      )}

      {/* ── PLAN mode ───────────────────────────────────────────────────── */}
      {mode === MODES.PLAN && (
        <div>
          {/* planned items list */}
          {plannedItems.length > 0 && (
            <div style={{ background: "#18181f", border: "1px solid #2a2a38", borderRadius: 10, overflow: "hidden", marginBottom: 10 }}>
              {/* running totals header */}
              <div style={{ padding: "10px 12px", borderBottom: "1px solid #28283a" }}>
                <div style={{ fontSize: 9, letterSpacing: 2, color: "#777", marginBottom: 6 }}>PLANNED MEAL</div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: MC.calories }}>{planTotals.calories} kcal</span>
                  <span style={{ color: "#555", fontSize: 12 }}>·</span>
                  <span style={{ fontSize: 12, color: MC.protein }}>P:{planTotals.protein}g</span>
                  <span style={{ color: "#555", fontSize: 12 }}>·</span>
                  <span style={{ fontSize: 12, color: MC.carbs }}>C:{planTotals.carbs}g</span>
                  <span style={{ color: "#555", fontSize: 12 }}>·</span>
                  <span style={{ fontSize: 12, color: MC.fat }}>F:{planTotals.fat}g</span>
                  <span style={{ color: "#555", fontSize: 12 }}>·</span>
                  <span style={{ fontSize: 12, color: MC.fiber }}>Fi:{planTotals.fiber}g</span>
                  {diabetesMode && (
                    <>
                      <span style={{ color: "#555", fontSize: 12 }}>·</span>
                      <span style={{ fontSize: 12, color: MC.carbs }}>Net:{planNetCarbs}g</span>
                      {weeklyMealAvg != null && (
                        <span style={{ fontSize: 10, color: "#666", alignSelf: "center" }}>
                          (7-day avg: {weeklyMealAvg}g net)
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* planned items */}
              {plannedItems.map((item) => (
                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid #28283a" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: "#ccc" }}>{item.name}</div>
                    <div style={{ fontSize: 10, color: "#666", marginTop: 1 }}>{item.serving}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: MC.calories }}>{item.calories} kcal</span>
                    {diabetesMode && <span style={{ fontSize: 11, color: MC.carbs }}>{Math.max(0, item.carbs - item.fiber)}g net</span>}
                    <button onClick={() => removeFromPlan(item.id)} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 13 }}>✕</button>
                  </div>
                </div>
              ))}

              {/* insulin note for diabetes mode */}
              {diabetesMode && (
                <div style={{ padding: "10px 12px", borderBottom: "1px solid #28283a" }}>
                  <input type="number" placeholder="Planned insulin dose (units, optional)" value={planInsulin}
                    onChange={(e) => setPlanInsulin(e.target.value)} step="0.5"
                    style={{ ...smallInput }} />
                </div>
              )}

              {/* overall meal tips — diabetes mode, based on full plan totals */}
              {diabetesMode && plannedItems.length > 0 && (() => {
                const mealTips = getT1DWarnings(
                  { carbs: planTotals.carbs, fat: planTotals.fat, fiber: planTotals.fiber },
                  mealTime,
                  todayNetCarbs
                );
                if (!mealTips.length) return null;
                return (
                  <div style={{ padding: "10px 12px", borderBottom: "1px solid #28283a" }}>
                    <div style={{ fontSize: 9, letterSpacing: 2, color: "#777", marginBottom: 8 }}>MEAL TIPS</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {mealTips.map((tip, i) => (
                        <div key={i} style={{
                          padding: "7px 10px",
                          background: "#0e0e18",
                          borderLeft: `3px solid ${WARN_COLORS[tip.level]}`,
                          borderRadius: "0 6px 6px 0",
                        }}>
                          <div style={{ fontSize: 9, letterSpacing: 1.5, color: WARN_COLORS[tip.level], marginBottom: 2 }}>{tip.label}</div>
                          <div style={{ fontSize: 10, color: "#bbb", lineHeight: 1.5 }}>{tip.text}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* note + commit */}
              <div style={{ padding: "10px 12px" }}>
                <input placeholder="Meal note (optional)" value={planNote}
                  onChange={(e) => setPlanNote(e.target.value)}
                  style={{ ...smallInput, marginBottom: 8 }} />
                <button onClick={commitPlan} style={{ width: "100%", background: "#22c55e", border: "none", borderRadius: 8, padding: "10px", color: "#fff", fontSize: 13, cursor: "pointer", fontFamily: "inherit", letterSpacing: 1 }}>
                  COMMIT TO LOG
                </button>
              </div>
            </div>
          )}

          {plannedItems.length === 0 && (
            <div style={{ fontSize: 11, color: "#444", textAlign: "center", padding: "8px 0 12px" }}>
              Search below to build your meal before eating.
            </div>
          )}

          {/* plan search */}
          <input placeholder="Search food to add to plan..." value={planQuery}
            onChange={(e) => setPlanQuery(e.target.value)}
            style={{ ...inputStyle, marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
            <button style={dtBtn("Branded")} onClick={() => setDataType("Branded")}>WHOLE FOODS</button>
            <button style={dtBtn("Foundation,SR Legacy")} onClick={() => setDataType("Foundation,SR Legacy")}>BRANDED</button>
            <button style={dtBtn("")} onClick={() => setDataType("")}>ALL</button>
          </div>
          {planSearching && <div style={{ fontSize: 11, color: "#fff", padding: "6px 2px" }}>Searching...</div>}

          {planResults.length > 0 && (
            <div style={{ background: "#18181f", border: "1px solid #2a2a38", borderRadius: 10, overflow: "hidden", marginTop: 8 }}>
              {planResults.map((food) => (
                <ResultRow key={food.fdcId} food={food} onAddFn={addToPlan}
                  scState={planServingChoice}    setScState={setPlanServingChoice}
                  qState={planQuantity}          setQState={setPlanQuantity}
                  cgState={planCustomGrams}      setCgState={setPlanCustomGrams}
                  detailCache={detailCache}  mode={mode}  diabetesMode={diabetesMode}
                  mealTime={mealTime}        todayNetCarbs={todayNetCarbs} />
              ))}
            </div>
          )}

          {/* manual entry toggle */}
          <button onClick={() => setPlanManualOpen((v) => !v)} style={{
            width: "100%", marginTop: 10, background: "none",
            border: "1px dashed #2e2e3a", borderRadius: 8, padding: "7px",
            color: planManualOpen ? "#fff" : "#555", fontSize: 11,
            cursor: "pointer", fontFamily: "inherit", letterSpacing: 1,
          }}>
            {planManualOpen ? "✕  CANCEL MANUAL ENTRY" : "+ MANUAL ENTRY"}
          </button>

          {planManualOpen && (
            <div style={{ marginTop: 8, background: "#18181f", border: "1px solid #2a2a38", borderRadius: 10, padding: "12px" }}>
              <input placeholder="Food name (required)" value={planManual.name}
                onChange={(e) => setPlanManual((p) => ({ ...p, name: e.target.value }))}
                style={{ ...inputStyle, marginBottom: 8 }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                {[
                  { key: "calories", label: "Calories",    color: MC.calories },
                  { key: "protein",  label: "Protein (g)", color: MC.protein  },
                  { key: "carbs",    label: "Carbs (g)",   color: MC.carbs    },
                  { key: "fat",      label: "Fat (g)",     color: MC.fat      },
                  { key: "fiber",    label: "Fiber (g)",   color: MC.fiber    },
                  { key: "sugar",    label: "Sugar (g)",   color: "#f472b6"   },
                ].map(({ key, label, color }) => (
                  <input key={key} type="number" placeholder={label} value={planManual[key]}
                    onChange={(e) => setPlanManual((p) => ({ ...p, [key]: e.target.value }))}
                    style={{ ...inputStyle, borderColor: planManual[key] ? color : "#2e2e3a" }} />
                ))}
              </div>
              <button onClick={addManualToPlan} style={{ width: "100%", background: "#f97316", border: "none", borderRadius: 8, padding: "10px", color: "#fff", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                ADD TO PLAN
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
