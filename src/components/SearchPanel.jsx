import { useState, useEffect, useRef } from "react";
import { GROUPS, MC, MAX_RECENTS } from "../utils/constants";
import { lsGet, lsSet } from "../utils/storage";
import { extractNutrients, extractServings } from "../utils/nutrients";

const USDA_KEY = import.meta.env.VITE_USDA_API_KEY;
const USDA_URL = "https://api.nal.usda.gov/fdc/v1";

// mode can be "search" | "manual" | "plan"
const MODES = { SEARCH: "search", MANUAL: "manual", PLAN: "plan" };

let planId = 1;

export default function SearchPanel({ mealTime, setMealTime, onAdd, diabetesMode, weeklyMealAvg }) {
    const [mode, setMode] = useState(MODES.SEARCH);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [searchErr, setSearchErr] = useState("");
    const [manualMode, setManualMode] = useState(false);
    const [dataFilter, setDataFilter] = useState("All");
    const [manual, setManual] = useState({ name: "", calories: "", protein: "", carbs: "", fat: "", fiber: "", sugar: "" });
    const [servingChoice, setServingChoice] = useState({});
    const [quantity, setQuantity] = useState({});
    const [customGrams, setCustomGrams] = useState({});
    const [detailCache, setDetailCache] = useState({});
    const [recents, setRecents] = useState(() => lsGet("ct_recents", []));
    const [favorites, setFavorites] = useState(() => lsGet("ct_favorites", []));

    // planned meal items — built up before committing to the log
    const [plannedItems, setPlannedItems] = useState([]);
    const [planNote, setPlanNote] = useState("");
    const [planInsulin, setPlanInsulin] = useState("");

    // search within plan mode
    const [planQuery, setPlanQuery] = useState("");
    const [planResults, setPlanResults] = useState([]);
    const [planSearching, setPlanSearching] = useState(false);
    const [planServingChoice, setPlanServingChoice] = useState({});
    const [planQuantity, setPlanQuantity] = useState({});
    const [planCustomGrams, setPlanCustomGrams] = useState({});

    const searchTimeout = useRef(null);
    const planTimeout = useRef(null);

    const inputStyle = {
        width: "100%", background: "#18181f", border: "1px solid #2e2e3a",
        borderRadius: 8, padding: "10px 12px", color: "#e8e8e8",
        fontSize: 13, fontFamily: "inherit", outline: "none",
    };

    const smallInput = { ...inputStyle, fontSize: 11, padding: "7px 10px" };

    // ── debounced USDA search (regular mode) ─────────────────────────────────
    useEffect(() => {
        if (!query.trim()) { setResults([]); setSearchErr(""); return; }
        clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(async () => {
            setSearching(true); setSearchErr("");
            try {
                const dataType = dataFilter === "Branded"
                    ? "Branded"
                    : dataFilter === "Whole Foods"
                        ? "Foundation,SR%20Legacy"
                        : "Branded,Foundation,SR%20Legacy";
                const sortParam = dataFilter === "All"
                    ? "&sortBy=score&sortOrder=desc"
                    : "";
                const res = await fetch(`${USDA_URL}/foods/search?query=${encodeURIComponent(query)}&pageSize=8&dataType=${dataType}${sortParam}&api_key=${USDA_KEY}`);
                const data = await res.json();
                setResults(data.foods || []);
            } catch { setSearchErr("Search failed. Check your connection."); }
            finally { setSearching(false); }
        }, 500);
    }, [query, dataFilter]);

    // ── debounced USDA search (plan mode) ────────────────────────────────────
    useEffect(() => {
        if (!planQuery.trim()) { setPlanResults([]); return; }
        clearTimeout(planTimeout.current);
        planTimeout.current = setTimeout(async () => {
            setPlanSearching(true);
            try {
                const dataType = dataFilter === "Branded"
                    ? "Branded"
                    : dataFilter === "Whole Foods"
                        ? "Foundation,SR%20Legacy"
                        : "Branded,Foundation,SR%20Legacy";
                const res = await fetch(`${USDA_URL}/foods/search?query=${encodeURIComponent(planQuery)}&pageSize=5&dataType=${dataType}&api_key=${USDA_KEY}`);
                const data = await res.json();
                setPlanResults(data.foods || []);
            } catch { }
            finally { setPlanSearching(false); }
        }, 500);
    }, [planQuery, dataFilter]);

    const fetchDetail = async (fdcId) => {
        if (detailCache[fdcId]) return detailCache[fdcId];
        try {
            const res = await fetch(`${USDA_URL}/food/${fdcId}?api_key=${USDA_KEY}`);
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
            const isFav = prev.some((f) => f.fdcId === fdcId);
            const recent = recents.find((r) => r.fdcId === fdcId);
            const updated = isFav ? prev.filter((f) => f.fdcId !== fdcId) : recent ? [recent, ...prev] : prev;
            lsSet("ct_favorites", updated);
            return updated;
        });
    };

    const clearRecents = () => { setRecents([]); lsSet("ct_recents", []); };

    // ── build item from USDA result ──────────────────────────────────────────
    const buildFromResult = (food, scMap, qMap, cgMap) => {
        const detail = detailCache[food.fdcId] || food;
        const servings = extractServings(food, detail);
        const choiceIdx = scMap[food.fdcId] ?? 0;
        const chosen = servings[choiceIdx];
        const qty = parseFloat(qMap[food.fdcId]) || 1;
        const grams = chosen.grams === null
            ? parseFloat(cgMap[food.fdcId]) || 100
            : chosen.grams * qty;
        const n = extractNutrients(detail.foodNutrients || food.foodNutrients || []);
        const scale = grams / 100;
        return {
            name: food.description,
            time: mealTime,
            calories: Math.round(n.calories * scale),
            protein: Math.round(n.protein * scale),
            fat: Math.round(n.fat * scale),
            carbs: Math.round(n.carbs * scale),
            fiber: Math.round(n.fiber * scale),
            sugar: Math.round(n.sugar * scale),
            grams: Math.round(grams),
            serving: chosen.grams === null ? `${Math.round(grams)}g` : qty !== 1 ? `${qty}x ${chosen.label}` : chosen.label,
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

    const favIds = new Set(favorites.map((f) => f.fdcId));
    const recentNonFavs = recents.filter((r) => !favIds.has(r.fdcId));
    const storedList = [...favorites, ...recentNonFavs];
    const showStored = mode === MODES.SEARCH && storedList.length > 0 && !query.trim();

    // mode button style
    const modeBtn = (m) => ({
        background: mode === m ? "#2e2e3a" : "none",
        border: "1px solid #2e2e3a", borderRadius: 6,
        padding: "4px 10px", color: mode === m ? "#fff" : "#777",
        fontSize: 10, cursor: "pointer", letterSpacing: 1,
    });

    // result row renderer — shared between search and plan modes
    const ResultRow = ({ food, onAddFn, scState, setScState, qState, setQState, cgState, setCgState }) => {
        const detail = detailCache[food.fdcId] || food;
        const servings = extractServings(food, detail);
        const choiceIdx = scState[food.fdcId] ?? 0;
        const chosen = servings[choiceIdx];
        const isCustom = chosen.grams === null;
        const n = extractNutrients(detail.foodNutrients || food.foodNutrients || []);
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
                <div style={{ display: "flex", gap: 6 }}>
                    {isCustom ? (
                        <input type="number" placeholder="Enter grams" value={cgState[food.fdcId] || ""}
                            onChange={(e) => setCgState((prev) => ({ ...prev, [food.fdcId]: e.target.value }))}
                            style={smallInput} />
                    ) : (
                        <input type="number" placeholder="Qty (default 1)" value={qState[food.fdcId] || ""}
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
    };

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
                    <button style={modeBtn(MODES.PLAN)} onClick={() => { setMode(MODES.PLAN); setQuery(""); setResults([]); }}>PLAN</button>
                </div>
            </div>

            {/* data type filter — shown in search and plan modes */}
            {mode !== MODES.MANUAL && (
                <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
                    {["All", "Branded", "Whole Foods"].map((f) => (
                        <button key={f} onClick={() => { setDataFilter(f); setResults([]); setPlanResults([]); }} style={{
                            flex: 1, background: dataFilter === f ? "#2e2e3a" : "none",
                            border: "1px solid #2e2e3a", borderRadius: 6, padding: "4px 6px",
                            color: dataFilter === f ? "#fff" : "#666", fontSize: 9,
                            cursor: "pointer", letterSpacing: 1,
                        }}>{f.toUpperCase()}</button>
                    ))}
                </div>
            )}

            {/* meal time selector — shown in all modes */}
            <select value={mealTime} onChange={(e) => setMealTime(e.target.value)} style={{ ...inputStyle, marginBottom: 10, cursor: "pointer" }}>
                {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>

            {/* ── SEARCH mode ─────────────────────────────────────────────────── */}
            {mode === MODES.SEARCH && (
                <>
                    <input placeholder="Search food..." value={query} onChange={(e) => setQuery(e.target.value)} style={{ ...inputStyle, marginBottom: 4 }} />
                    {searching && <div style={{ fontSize: 11, color: "#fff", padding: "6px 2px" }}>Searching...</div>}
                    {searchErr && <div style={{ fontSize: 11, color: "#ef4444", padding: "6px 2px" }}>{searchErr}</div>}

                    {showStored && (
                        <div style={{ background: "#18181f", border: "1px solid #2a2a38", borderRadius: 10, overflow: "hidden", marginTop: 8 }}>
                            {favorites.length > 0 && <div style={{ fontSize: 9, letterSpacing: 2, color: "#f59e0b", padding: "8px 12px 4px" }}>FAVORITES</div>}
                            {storedList.map((stored, idx) => {
                                const isFav = favIds.has(stored.fdcId);
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
                                    scState={servingChoice} setScState={setServingChoice}
                                    qState={quantity} setQState={setQuantity}
                                    cgState={customGrams} setCgState={setCustomGrams} />
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
                            { key: "calories", label: "Calories", color: MC.calories },
                            { key: "protein", label: "Protein (g)", color: MC.protein },
                            { key: "carbs", label: "Carbs (g)", color: MC.carbs },
                            { key: "fat", label: "Fat (g)", color: MC.fat },
                            { key: "fiber", label: "Fiber (g)", color: MC.fiber },
                            { key: "sugar", label: "Sugar (g)", color: "#f472b6" },
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
                                        {diabetesMode && <span style={{ fontSize: 11, color: "#666" }}>({Math.max(0, item.carbs - item.fiber)}g net)</span>}
                                        <button onClick={() => removeFromPlan(item.id)} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 13 }}>✕</button>
                                    </div>
                                </div>
                            ))}

                            {/* insulin note — only in diabetes mode */}
                            {diabetesMode && (
                                <div style={{ padding: "10px 12px", borderBottom: "1px solid #28283a" }}>
                                    <input type="number" placeholder="Planned insulin dose (units, optional)" value={planInsulin}
                                        onChange={(e) => setPlanInsulin(e.target.value)} step="0.5"
                                        style={{ ...smallInput }} />
                                </div>
                            )}

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

                    {/* plan search — above commit so you build the meal first */}
                    <input placeholder="Search food to add to plan..." value={planQuery}
                        onChange={(e) => setPlanQuery(e.target.value)}
                        style={{ ...inputStyle, marginBottom: 4 }} />
                    {planSearching && <div style={{ fontSize: 11, color: "#fff", padding: "6px 2px" }}>Searching...</div>}

                    {plannedItems.length === 0 && (
                        <div style={{ fontSize: 11, color: "#444", textAlign: "center", padding: "8px 0 4px" }}>
                            Build your meal above, then commit when ready.
                        </div>
                    )}

                    {planResults.length > 0 && (
                        <div style={{ background: "#18181f", border: "1px solid #2a2a38", borderRadius: 10, overflow: "hidden", marginTop: 8 }}>
                            {planResults.map((food) => (
                                <ResultRow key={food.fdcId} food={food} onAddFn={addToPlan}
                                    scState={planServingChoice} setScState={setPlanServingChoice}
                                    qState={planQuantity} setQState={setPlanQuantity}
                                    cgState={planCustomGrams} setCgState={setPlanCustomGrams} />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}