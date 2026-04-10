import { useState, useRef, useEffect } from "react";

const BUDGET = 2300;
const USDA_KEY = import.meta.env.VITE_USDA_API_KEY;
const USDA_URL = "https://api.nal.usda.gov/fdc/v1";
const GROUPS = ["Morning", "Afternoon", "Evening", "Snack"];
let nextId = 1;

function extractNutrients(foodNutrients) {
    const find = (name) => {
        const match = foodNutrients.find((n) =>
            (n.nutrientName || n.nutrient?.name || "").toLowerCase().includes(name)
        );
        return parseFloat(match?.value ?? match?.amount ?? 0) || 0;
    };
    return {
        calories: find("energy") || find("calor"),
        protein: find("protein"),
        fat: find("total lipid") || find("fat"),
        carbs: find("carbohydrate"),
    };
}

// Build serving options - searchResult has branded fields, detail has foodPortions
function extractServings(searchResult, detail) {
    const options = [];
    const seen = new Set();

    const addOption = (label, grams) => {
        const key = String(grams);
        if (!seen.has(key)) { seen.add(key); options.push({ label, grams }); }
    };

    // Check both search result and detail for branded serving fields
    [searchResult, detail].forEach((src) => {
        if (src?.servingSize) {
            const unit = (src.servingSizeUnit || "").toLowerCase();
            const grams = (unit === "g" || unit === "gram" || unit === "") ? src.servingSize : null;
            if (grams) {
                const label = src.householdServingFullText
                    ? `${src.householdServingFullText} (${grams}g)`
                    : `1 serving (${grams}g)`;
                addOption(label, grams);
            }
        }
    });

    // Foundation / SR foods: foodPortions array from detail
    if (detail?.foodPortions?.length) {
        detail.foodPortions.forEach((p) => {
            const grams = p.gramWeight;
            const desc = p.modifier || p.measureUnit?.name || "serving";
            const amt = p.amount ?? 1;
            if (grams) addOption(`${amt} ${desc} (${grams}g)`, grams);
        });
    }

    options.push({ label: "Custom (enter grams)", grams: null });
    return options;
}

// Macro color map
const MC = { protein: "#60a5fa", carbs: "#f59e0b", fat: "#f97316", calories: "#22c55e" };

export default function CalorieTracker() {
    const [items, setItems] = useState([]);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [searchErr, setSearchErr] = useState("");
    const [mealTime, setMealTime] = useState("Morning");
    const [editId, setEditId] = useState(null);
    const [editCals, setEditCals] = useState("");
    const [servingChoice, setServingChoice] = useState({});
    const [quantity, setQuantity] = useState({});
    const [customGrams, setCustomGrams] = useState({});
    const [detailCache, setDetailCache] = useState({});
    const searchTimeout = useRef(null);

    const totals = items.reduce(
        (acc, i) => ({
            calories: acc.calories + (i.calories || 0),
            protein: acc.protein + (i.protein || 0),
            fat: acc.fat + (i.fat || 0),
            carbs: acc.carbs + (i.carbs || 0),
        }),
        { calories: 0, protein: 0, fat: 0, carbs: 0 }
    );

    const remaining = BUDGET - totals.calories;
    const pct = Math.min((totals.calories / BUDGET) * 100, 100);
    const barColor = pct < 70 ? "#22c55e" : pct < 90 ? "#f97316" : "#ef4444";

    useEffect(() => {
        if (!query.trim()) { setResults([]); setSearchErr(""); return; }
        clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(async () => {
            setSearching(true);
            setSearchErr("");
            try {
                const res = await fetch(`${USDA_URL}/foods/search?query=${encodeURIComponent(query)}&pageSize=6&api_key=${USDA_KEY}`);
                const data = await res.json();
                setResults(data.foods || []);
            } catch {
                setSearchErr("Search failed. Check your connection.");
            } finally {
                setSearching(false);
            }
        }, 500);
    }, [query]);

    const fetchDetail = async (fdcId) => {
        if (detailCache[fdcId]) return detailCache[fdcId];
        try {
            const res = await fetch(`${USDA_URL}/food/${fdcId}?api_key=${USDA_KEY}`);
            const data = await res.json();
            setDetailCache((prev) => ({ ...prev, [fdcId]: data }));
            return data;
        } catch { return null; }
    };

    useEffect(() => {
        results.forEach((food) => fetchDetail(food.fdcId));
    }, [results]);

    const addFromResult = (food) => {
        const detail = detailCache[food.fdcId] || food;
        const servings = extractServings(food, detail);
        const choiceIdx = servingChoice[food.fdcId] ?? 0;
        const chosen = servings[choiceIdx];
        const qty = parseFloat(quantity[food.fdcId]) || 1;
        const grams = chosen.grams === null
            ? parseFloat(customGrams[food.fdcId]) || 100
            : chosen.grams * qty;

        const n = extractNutrients(detail.foodNutrients || food.foodNutrients || []);
        const scale = grams / 100;

        setItems((prev) => [
            ...prev,
            {
                id: nextId++,
                name: food.description,
                time: mealTime,
                calories: Math.round(n.calories * scale),
                protein: Math.round(n.protein * scale),
                fat: Math.round(n.fat * scale),
                carbs: Math.round(n.carbs * scale),
                grams: Math.round(grams),
                serving: chosen.grams === null
                    ? `${Math.round(grams)}g`
                    : qty !== 1 ? `${qty}x ${chosen.label}` : chosen.label,
            },
        ]);

        setQuery("");
        setResults([]);
        setServingChoice({});
        setQuantity({});
        setCustomGrams({});
    };

    const removeItem = (id) => setItems((prev) => prev.filter((i) => i.id !== id));
    const saveEdit = (id) => {
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, calories: parseInt(editCals) || i.calories } : i)));
        setEditId(null);
    };

    const card = { background: "#16161a", border: "1px solid #222", borderRadius: 16, padding: "20px", marginBottom: 20 };
    const inputStyle = { width: "100%", background: "#0f0f11", border: "1px solid #2a2a2a", borderRadius: 8, padding: "10px 12px", color: "#e8e8e8", fontSize: 13, fontFamily: "inherit", outline: "none" };

    // Inline macro display used in log rows and search results
    const MacroLine = ({ protein, carbs, fat, serving }) => (
        <div style={{ fontSize: 10, marginTop: 2 }}>
            {serving && <span style={{ color: "#fff" }}>{serving} &nbsp;·&nbsp; </span>}
            <span style={{ color: MC.protein }}>P:{protein}g</span>
            <span style={{ color: "#555" }}> &nbsp;·&nbsp; </span>
            <span style={{ color: MC.carbs }}>C:{carbs}g</span>
            <span style={{ color: "#555" }}> &nbsp;·&nbsp; </span>
            <span style={{ color: MC.fat }}>F:{fat}g</span>
        </div>
    );

    return (
        <div style={{ minHeight: "100vh", background: "#0f0f11", color: "#e8e8e8", fontFamily: "'DM Mono', 'Courier New', monospace", padding: "32px 20px", maxWidth: 580, margin: "0 auto" }}>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; }
        .row:hover { background: #1c1c22 !important; }
        .del-btn { opacity: 0; transition: opacity 0.15s; }
        .row:hover .del-btn { opacity: 1; }
        .result-row { transition: background 0.15s; }
        .result-row:hover { background: #1a1a22 !important; }
        input::placeholder { color: #444; }
        select option { background: #16161a; }
      `}</style>

            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 28, fontWeight: 800, letterSpacing: -1, color: "#fff" }}>TODAY'S INTAKE</div>
                <div style={{ fontSize: 11, color: "#fff", marginTop: 4, letterSpacing: 2 }}>
                    {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }).toUpperCase()}
                </div>
            </div>

            {/* Summary */}
            <div style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 }}>
                    <div>
                        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 42, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{totals.calories.toLocaleString()}</div>
                        <div style={{ fontSize: 11, color: "#fff", letterSpacing: 2, marginTop: 4 }}>CALORIES</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 20, fontWeight: 500, color: remaining >= 0 ? MC.calories : "#ef4444" }}>
                            {remaining >= 0 ? `${remaining.toLocaleString()} left` : `${Math.abs(remaining)} over`}
                        </div>
                        <div style={{ fontSize: 11, color: "#fff", letterSpacing: 2 }}>OF {BUDGET.toLocaleString()} BUDGET</div>
                    </div>
                </div>
                <div style={{ background: "#222", borderRadius: 6, height: 8, overflow: "hidden", marginBottom: 18 }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 6, transition: "width 0.4s ease, background 0.4s ease" }} />
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                    {[
                        { label: "PROTEIN", val: totals.protein, color: MC.protein },
                        { label: "CARBS", val: totals.carbs, color: MC.carbs },
                        { label: "FAT", val: totals.fat, color: MC.fat },
                    ].map(({ label, val, color }) => (
                        <div key={label} style={{ flex: 1, background: "#0f0f11", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
                            <div style={{ fontSize: 18, fontWeight: 500, color }}>{val}g</div>
                            <div style={{ fontSize: 9, color: "#fff", letterSpacing: 2, marginTop: 2 }}>{label}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Food Log */}
            <div style={{ marginBottom: 20 }}>
                {GROUPS.map((group) => {
                    const groupItems = items.filter((i) => i.time === group);
                    if (!groupItems.length) return null;
                    return (
                        <div key={group} style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 10, letterSpacing: 3, color: "#fff", marginBottom: 8 }}>{group.toUpperCase()}</div>
                            {groupItems.map((item) => (
                                <div key={item.id} className="row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 10, background: "#0f0f11", marginBottom: 4, transition: "background 0.15s" }}>
                                    <div style={{ flex: 1, paddingRight: 12 }}>
                                        <div style={{ fontSize: 13, color: "#fff" }}>{item.name}</div>
                                        <MacroLine protein={item.protein} carbs={item.carbs} fat={item.fat} serving={item.serving} />
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        {editId === item.id ? (
                                            <div style={{ display: "flex", gap: 6 }}>
                                                <input type="number" value={editCals} onChange={(e) => setEditCals(e.target.value)}
                                                    style={{ width: 70, background: "#222", border: "1px solid #f97316", borderRadius: 6, padding: "2px 8px", color: "#fff", fontSize: 13, outline: "none" }} autoFocus />
                                                <button onClick={() => saveEdit(item.id)} style={{ background: "#f97316", border: "none", borderRadius: 6, padding: "2px 10px", color: "#fff", fontSize: 12, cursor: "pointer" }}>OK</button>
                                                <button onClick={() => setEditId(null)} style={{ background: "#333", border: "none", borderRadius: 6, padding: "2px 8px", color: "#aaa", fontSize: 12, cursor: "pointer" }}>✕</button>
                                            </div>
                                        ) : (
                                            <span onClick={() => { setEditId(item.id); setEditCals(item.calories); }}
                                                style={{ fontSize: 14, fontWeight: 500, color: MC.fat, cursor: "pointer", minWidth: 40, textAlign: "right" }} title="Click to edit">
                                                {item.calories}
                                            </span>
                                        )}
                                        <span style={{ fontSize: 11, color: "#333" }}>kcal</span>
                                        <button className="del-btn" onClick={() => removeItem(item.id)} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 14, padding: "0 2px" }}>✕</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    );
                })}
            </div>

            {/* Search Panel */}
            <div style={card}>
                <div style={{ fontSize: 10, letterSpacing: 3, color: "#fff", marginBottom: 14 }}>SEARCH FOOD — USDA DATABASE</div>

                <select value={mealTime} onChange={(e) => setMealTime(e.target.value)} style={{ ...inputStyle, marginBottom: 10, cursor: "pointer" }}>
                    {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>

                <input placeholder="Search food..." value={query} onChange={(e) => setQuery(e.target.value)} style={{ ...inputStyle, marginBottom: 4 }} />

                {searching && <div style={{ fontSize: 11, color: "#fff", padding: "6px 2px" }}>Searching...</div>}
                {searchErr && <div style={{ fontSize: 11, color: "#ef4444", padding: "6px 2px" }}>{searchErr}</div>}

                {results.length > 0 && (
                    <div style={{ background: "#0f0f11", border: "1px solid #1e1e1e", borderRadius: 10, overflow: "hidden", marginTop: 8 }}>
                        {results.map((food) => {
                            const detail = detailCache[food.fdcId] || food;
                            const servings = extractServings(food, detail);
                            const choiceIdx = servingChoice[food.fdcId] ?? 0;
                            const chosen = servings[choiceIdx];
                            const isCustom = chosen.grams === null;
                            const n = extractNutrients(detail.foodNutrients || food.foodNutrients || []);

                            return (
                                <div key={food.fdcId} className="result-row" style={{ padding: "12px", borderBottom: "1px solid #1a1a1f" }}>
                                    <div style={{ fontSize: 12, color: "#fff", marginBottom: 2 }}>{food.description}</div>
                                    <div style={{ fontSize: 10, marginBottom: 10 }}>
                                        <span style={{ color: "#fff" }}>per 100g &nbsp;·&nbsp; </span>
                                        <span style={{ color: MC.calories }}>{Math.round(n.calories)} kcal</span>
                                        <span style={{ color: "#555" }}> &nbsp;·&nbsp; </span>
                                        <span style={{ color: MC.protein }}>P:{Math.round(n.protein)}g</span>
                                        <span style={{ color: "#555" }}> &nbsp;·&nbsp; </span>
                                        <span style={{ color: MC.carbs }}>C:{Math.round(n.carbs)}g</span>
                                        <span style={{ color: "#555" }}> &nbsp;·&nbsp; </span>
                                        <span style={{ color: MC.fat }}>F:{Math.round(n.fat)}g</span>
                                    </div>

                                    <select
                                        value={choiceIdx}
                                        onChange={(e) => setServingChoice((prev) => ({ ...prev, [food.fdcId]: parseInt(e.target.value) }))}
                                        style={{ ...inputStyle, marginBottom: 8, fontSize: 11, padding: "6px 10px", cursor: "pointer" }}
                                    >
                                        {servings.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
                                    </select>

                                    <div style={{ display: "flex", gap: 6 }}>
                                        {isCustom ? (
                                            <input type="number" placeholder="Enter grams"
                                                value={customGrams[food.fdcId] || ""}
                                                onChange={(e) => setCustomGrams((prev) => ({ ...prev, [food.fdcId]: e.target.value }))}
                                                style={{ ...inputStyle, fontSize: 11, padding: "6px 10px" }} />
                                        ) : (
                                            <input type="number" placeholder="Qty (default 1)"
                                                value={quantity[food.fdcId] || ""}
                                                onChange={(e) => setQuantity((prev) => ({ ...prev, [food.fdcId]: e.target.value }))}
                                                style={{ ...inputStyle, fontSize: 11, padding: "6px 10px" }} />
                                        )}
                                        <button onClick={() => addFromResult(food)} style={{ background: "#f97316", border: "none", borderRadius: 8, padding: "6px 16px", color: "#fff", fontSize: 12, cursor: "pointer", flexShrink: 0 }}>
                                            Add
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div style={{ fontSize: 10, color: "#222", textAlign: "center", letterSpacing: 1 }}>
                USDA FOODDATA CENTRAL &nbsp;·&nbsp; TAP ORANGE NUMBERS TO EDIT
            </div>
        </div>
    );
}