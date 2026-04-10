import { useState, useRef, useEffect } from "react";

const USDA_KEY = import.meta.env.VITE_USDA_API_KEY;
const USDA_URL = "https://api.nal.usda.gov/fdc/v1";
const GROUPS = ["Morning", "Afternoon", "Evening", "Snack"];
const MAX_RECENTS = 10;
let nextId = 1;

const toDateKey = (d) => d.toISOString().slice(0, 10);
const todayKey = () => toDateKey(new Date());

const lsGet = (key, fallback) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const lsSet = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch { } };

const loadDay = (key) => lsGet(`ct_day_${key}`, []);
const saveDay = (key, items) => lsSet(`ct_day_${key}`, items);

const DEFAULT_GOALS = { calories: 2300, protein: null, carbsMax: null, fatMax: null, fiberMin: null };

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
        fiber: find("fiber"),
    };
}

function extractServings(searchResult, detail) {
    const options = [];
    const seen = new Set();
    const addOption = (label, grams) => {
        const key = String(grams);
        if (!seen.has(key)) { seen.add(key); options.push({ label, grams }); }
    };
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

const MC = { protein: "#60a5fa", carbs: "#f59e0b", fat: "#f97316", calories: "#22c55e", fiber: "#a37c3c" };

const formatDisplay = (dateKey) => {
    const [y, m, d] = dateKey.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }).toUpperCase();
};

function MiniCalendar({ current, onChange, onClose }) {
    const [y, m] = current.split("-").map(Number);
    const [viewYear, setViewYear] = useState(y);
    const [viewMonth, setViewMonth] = useState(m - 1);
    const today = todayKey();
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysIn = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells = Array(firstDay).fill(null).concat(Array.from({ length: daysIn }, (_, i) => i + 1));
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const prevMonth = () => { if (viewMonth === 0) { setViewYear(v => v - 1); setViewMonth(11); } else setViewMonth(m => m - 1); };
    const nextMonth = () => {
        const nm = viewMonth === 11 ? 0 : viewMonth + 1;
        const ny = viewMonth === 11 ? viewYear + 1 : viewYear;
        const now = new Date();
        if (ny > now.getFullYear() || (ny === now.getFullYear() && nm > now.getMonth())) return;
        if (viewMonth === 11) { setViewYear(v => v + 1); setViewMonth(0); } else setViewMonth(m => m + 1);
    };
    const selectDay = (day) => {
        if (!day) return;
        const key = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        if (key > today) return;
        onChange(key);
        onClose();
    };

    return (
        <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 100, background: "#242430", border: "1px solid #2e2e3a", borderRadius: 14, padding: 16, marginTop: 6, width: 260, boxShadow: "0 8px 32px #000a" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <button onClick={prevMonth} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: 16 }}>‹</button>
                <span style={{ fontSize: 12, color: "#fff", letterSpacing: 1 }}>{monthNames[viewMonth]} {viewYear}</span>
                <button onClick={nextMonth} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: 16 }}>›</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
                {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                    <div key={i} style={{ textAlign: "center", fontSize: 9, color: "#777", padding: "2px 0" }}>{d}</div>
                ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
                {cells.map((day, i) => {
                    if (!day) return <div key={i} />;
                    const key = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const isCur = key === current;
                    const isToday = key === today;
                    const isFuture = key > today;
                    const hasData = loadDay(key).length > 0;
                    return (
                        <div key={i} onClick={() => !isFuture && selectDay(day)} style={{
                            textAlign: "center", fontSize: 11, padding: "5px 2px", borderRadius: 6,
                            cursor: isFuture ? "default" : "pointer",
                            background: isCur ? "#f97316" : isToday ? "#2e2e3a" : "none",
                            color: isFuture ? "#444" : isCur ? "#fff" : isToday ? "#fff" : "#bbb",
                            fontWeight: isCur || isToday ? 600 : 400,
                        }}>
                            {day}
                            {hasData && !isCur && <div style={{ width: 3, height: 3, borderRadius: "50%", background: MC.calories, margin: "1px auto 0" }} />}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// Goals collapsible panel
function GoalsPanel({ goals, onChange }) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(goals);

    const field = (label, key, placeholder, color) => (
        <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color, letterSpacing: 2, marginBottom: 4 }}>{label}</div>
            <input
                type="number"
                placeholder={placeholder}
                value={draft[key] ?? ""}
                onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value === "" ? null : Number(e.target.value) }))}
                style={{ width: "100%", background: "#18181f", border: "1px solid #2e2e3a", borderRadius: 8, padding: "8px 12px", color: "#e8e8e8", fontSize: 13, fontFamily: "inherit", outline: "none" }}
            />
        </div>
    );

    const save = () => { onChange(draft); lsSet("ct_goals", draft); setOpen(false); };

    return (
        <div style={{ background: "#242430", border: "1px solid #2e2e3a", borderRadius: 16, marginBottom: 20, overflow: "hidden" }}>
            <button onClick={() => setOpen((v) => !v)} style={{
                width: "100%", background: "none", border: "none", padding: "14px 20px",
                display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer",
            }}>
                <span style={{ fontSize: 10, letterSpacing: 3, color: "#fff" }}>GOALS & BUDGET</span>
                <span style={{ fontSize: 12, color: "#777", transition: "transform 0.2s", display: "inline-block", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
            </button>

            {open && (
                <div style={{ padding: "0 20px 20px" }}>
                    <div style={{ borderTop: "1px solid #2e2e3a", marginBottom: 16 }} />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
                        <div style={{ gridColumn: "1 / -1" }}>{field("CALORIE BUDGET", "calories", "e.g. 2300", MC.calories)}</div>
                        {field("PROTEIN GOAL (min g)", "protein", "optional", MC.protein)}
                        {field("CARBS LIMIT (max g)", "carbsMax", "optional", MC.carbs)}
                        {field("FAT LIMIT (max g)", "fatMax", "optional", MC.fat)}
                        {field("FIBER GOAL (min g)", "fiberMin", "optional", MC.fiber)}
                    </div>
                    <button onClick={save} style={{ width: "100%", background: "#f97316", border: "none", borderRadius: 8, padding: "10px", color: "#fff", fontSize: 13, cursor: "pointer", marginTop: 4 }}>
                        Save Goals
                    </button>
                </div>
            )}
        </div>
    );
}

export default function CalorieTracker() {
    const [goals, setGoals] = useState(() => lsGet("ct_goals", DEFAULT_GOALS));
    const [dateKey, setDateKey] = useState(todayKey);
    const [items, setItems] = useState(() => loadDay(todayKey()));
    const [showCal, setShowCal] = useState(false);
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
    const [recents, setRecents] = useState(() => lsGet("ct_recents", []));
    const [favorites, setFavorites] = useState(() => lsGet("ct_favorites", []));
    const searchTimeout = useRef(null);
    const calRef = useRef(null);

    const isToday = dateKey === todayKey();
    const BUDGET = goals.calories || 2300;

    useEffect(() => { saveDay(dateKey, items); }, [items, dateKey]);

    const switchDay = (key) => { setDateKey(key); setItems(loadDay(key)); setShowCal(false); setQuery(""); setResults([]); };

    useEffect(() => {
        const handler = (e) => { if (calRef.current && !calRef.current.contains(e.target)) setShowCal(false); };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const totals = items.reduce(
        (acc, i) => ({
            calories: acc.calories + (i.calories || 0),
            protein: acc.protein + (i.protein || 0),
            fat: acc.fat + (i.fat || 0),
            carbs: acc.carbs + (i.carbs || 0),
            fiber: acc.fiber + (i.fiber || 0),
        }),
        { calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 }
    );

    const remaining = BUDGET - totals.calories;
    const pct = Math.min((totals.calories / BUDGET) * 100, 100);
    const barColor = pct < 70 ? "#22c55e" : pct < 90 ? "#f97316" : "#ef4444";

    // Goal status helpers
    const metMin = (val, goal) => goal == null ? null : val >= goal;   // protein, fiber — want to meet or exceed
    const metMax = (val, goal) => goal == null ? null : val <= goal;   // carbs, fat — want to stay under
    const goalColor = (met) => met == null ? "#888" : met ? "#22c55e" : "#ef4444";

    useEffect(() => {
        if (!query.trim()) { setResults([]); setSearchErr(""); return; }
        clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(async () => {
            setSearching(true); setSearchErr("");
            try {
                const res = await fetch(`${USDA_URL}/foods/search?query=${encodeURIComponent(query)}&pageSize=6&api_key=${USDA_KEY}`);
                const data = await res.json();
                setResults(data.foods || []);
            } catch { setSearchErr("Search failed. Check your connection."); }
            finally { setSearching(false); }
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

    useEffect(() => { results.forEach((food) => fetchDetail(food.fdcId)); }, [results]);

    const saveToRecents = (food, nutrients) => {
        const entry = { fdcId: food.fdcId, description: food.description, nutrients, searchResult: food };
        setRecents((prev) => {
            const updated = [entry, ...prev.filter((r) => r.fdcId !== food.fdcId)].slice(0, MAX_RECENTS);
            lsSet("ct_recents", updated);
            return updated;
        });
    };

    const toggleFavorite = (fdcId) => {
        setFavorites((prev) => {
            const isFav = prev.some((f) => f.fdcId === fdcId);
            const recent = recents.find((r) => r.fdcId === fdcId);
            const updated = isFav ? prev.filter((f) => f.fdcId !== fdcId) : recent ? [recent, ...prev] : prev;
            lsSet("ct_favorites", updated);
            return updated;
        });
    };

    const buildItemFromStored = (stored) => ({
        id: nextId++, name: stored.description, time: mealTime,
        calories: Math.round(stored.nutrients.calories),
        protein: Math.round(stored.nutrients.protein),
        fat: Math.round(stored.nutrients.fat),
        carbs: Math.round(stored.nutrients.carbs),
        fiber: Math.round(stored.nutrients.fiber || 0),
        grams: 100, serving: "100g",
    });

    const addFromResult = (food) => {
        const detail = detailCache[food.fdcId] || food;
        const servings = extractServings(food, detail);
        const choiceIdx = servingChoice[food.fdcId] ?? 0;
        const chosen = servings[choiceIdx];
        const qty = parseFloat(quantity[food.fdcId]) || 1;
        const grams = chosen.grams === null ? parseFloat(customGrams[food.fdcId]) || 100 : chosen.grams * qty;
        const n = extractNutrients(detail.foodNutrients || food.foodNutrients || []);
        const scale = grams / 100;

        setItems((prev) => [...prev, {
            id: nextId++,
            name: food.description,
            time: mealTime,
            calories: Math.round(n.calories * scale),
            protein: Math.round(n.protein * scale),
            fat: Math.round(n.fat * scale),
            carbs: Math.round(n.carbs * scale),
            fiber: Math.round(n.fiber * scale),
            grams: Math.round(grams),
            serving: chosen.grams === null ? `${Math.round(grams)}g` : qty !== 1 ? `${qty}x ${chosen.label}` : chosen.label,
        }]);

        saveToRecents(food, n);
        setQuery(""); setResults([]); setServingChoice({}); setQuantity({}); setCustomGrams({});
    };

    const removeItem = (id) => setItems((prev) => prev.filter((i) => i.id !== id));
    const saveEdit = (id) => {
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, calories: parseInt(editCals) || i.calories } : i)));
        setEditId(null);
    };

    const card = { background: "#242430", border: "1px solid #2e2e3a", borderRadius: 16, padding: "20px", marginBottom: 20 };
    const inputStyle = { width: "100%", background: "#18181f", border: "1px solid #2e2e3a", borderRadius: 8, padding: "10px 12px", color: "#e8e8e8", fontSize: 13, fontFamily: "inherit", outline: "none" };

    const MacroLine = ({ protein, carbs, fat, fiber, serving }) => (
        <div style={{ fontSize: 10, marginTop: 2 }}>
            {serving && <span style={{ color: "#fff" }}>{serving} &nbsp;·&nbsp; </span>}
            <span style={{ color: MC.protein }}>P:{protein}g</span>
            <span style={{ color: "#888" }}> &nbsp;·&nbsp; </span>
            <span style={{ color: MC.carbs }}>C:{carbs}g</span>
            <span style={{ color: "#888" }}> &nbsp;·&nbsp; </span>
            <span style={{ color: MC.fat }}>F:{fat}g</span>
            <span style={{ color: "#888" }}> &nbsp;·&nbsp; </span><span style={{ color: MC.fiber }}>Fi:{fiber}g</span>
        </div>
    );

    const favIds = new Set(favorites.map((f) => f.fdcId));
    const recentNonFavs = recents.filter((r) => !favIds.has(r.fdcId));
    const storedList = [...favorites, ...recentNonFavs];
    const showStored = storedList.length > 0 && !query.trim();

    // Macro pills config
    const macroPills = [
        { label: "PROTEIN", val: totals.protein, goal: goals.protein, color: MC.protein, met: metMin(totals.protein, goals.protein) },
        { label: "CARBS", val: totals.carbs, goal: goals.carbsMax, color: MC.carbs, met: metMax(totals.carbs, goals.carbsMax) },
        { label: "FAT", val: totals.fat, goal: goals.fatMax, color: MC.fat, met: metMax(totals.fat, goals.fatMax) },
        { label: "FIBER", val: totals.fiber, goal: goals.fiberMin, color: MC.fiber, met: metMin(totals.fiber, goals.fiberMin) },
    ];

    return (
        <div style={{ minHeight: "100vh", background: "#18181f", color: "#e8e8e8", fontFamily: "'DM Mono', 'Courier New', monospace", padding: "32px 20px", maxWidth: 580, margin: "0 auto" }}>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; }
        .row:hover { background: #282835 !important; }
        .del-btn { opacity: 0; transition: opacity 0.15s; }
        .row:hover .del-btn { opacity: 1; }
        .result-row { transition: background 0.15s; }
        .result-row:hover { background: #282835 !important; }
        .stored-row:hover { background: #282835 !important; }
        .star-btn { opacity: 0.65; transition: opacity 0.15s, color 0.15s; cursor: pointer; background: none; border: none; font-size: 17.6px; padding: 0 4px; color: #777; }
        .star-btn:hover { opacity: 1; }
        .star-btn.active { opacity: 1; color: #f59e0b; }
        .date-btn:hover { background: #2a2a38 !important; }
        input::placeholder { color: #777; }
        select option { background: #242430; }
      `}</style>

            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 28, fontWeight: 800, letterSpacing: -1, color: "#fff" }}>TODAY'S INTAKE</div>
                <div style={{ position: "relative", display: "inline-block" }} ref={calRef}>
                    <button className="date-btn" onClick={() => setShowCal((v) => !v)} style={{ background: "none", border: "none", padding: "4px 0", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 11, color: "#fff", letterSpacing: 2 }}>{formatDisplay(dateKey)}</span>
                        <span style={{ fontSize: 10, color: "#777" }}>▾</span>
                    </button>
                    {!isToday && (
                        <button onClick={() => switchDay(todayKey())} style={{ marginLeft: 8, background: "#242430", border: "1px solid #2e2e3a", borderRadius: 6, padding: "2px 8px", color: MC.calories, fontSize: 10, cursor: "pointer" }}>Today</button>
                    )}
                    {showCal && <MiniCalendar current={dateKey} onChange={switchDay} onClose={() => setShowCal(false)} />}
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
                <div style={{ background: "#2e2e3a", borderRadius: 6, height: 8, overflow: "hidden", marginBottom: 18 }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 6, transition: "width 0.4s ease, background 0.4s ease" }} />
                </div>

                {/* Macro pills */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {macroPills.map(({ label, val, goal, color, met }) => (
                        <div key={label} style={{ background: "#18181f", borderRadius: 10, padding: "10px 12px", border: met === null ? "1px solid transparent" : `1px solid ${goalColor(met)}33` }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                                <span style={{ fontSize: 18, fontWeight: 500, color: met === null ? color : goalColor(met) }}>{val}g</span>
                                {goal != null && <span style={{ fontSize: 10, color: goalColor(met) }}>/ {goal}g</span>}
                            </div>
                            <div style={{ fontSize: 9, color: "#fff", letterSpacing: 2, marginTop: 2 }}>{label}</div>
                            {goal != null && (
                                <div style={{ marginTop: 6, background: "#2e2e3a", borderRadius: 4, height: 3, overflow: "hidden" }}>
                                    <div style={{ height: "100%", width: `${Math.min((val / goal) * 100, 100)}%`, background: goalColor(met), borderRadius: 4, transition: "width 0.4s ease" }} />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Goals Panel */}
            <GoalsPanel goals={goals} onChange={setGoals} />

            {/* Food Log */}
            <div style={{ marginBottom: 20 }}>
                {GROUPS.map((group) => {
                    const groupItems = items.filter((i) => i.time === group);
                    if (!groupItems.length) return null;
                    return (
                        <div key={group} style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 10, letterSpacing: 3, color: "#fff", marginBottom: 8 }}>{group.toUpperCase()}</div>
                            {groupItems.map((item) => (
                                <div key={item.id} className="row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 10, background: "#18181f", marginBottom: 4, transition: "background 0.15s" }}>
                                    <div style={{ flex: 1, paddingRight: 12 }}>
                                        <div style={{ fontSize: 13, color: "#fff" }}>{item.name}</div>
                                        <MacroLine protein={item.protein} carbs={item.carbs} fat={item.fat} fiber={item.fiber || 0} serving={item.serving} />
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        {editId === item.id ? (
                                            <div style={{ display: "flex", gap: 6 }}>
                                                <input type="number" value={editCals} onChange={(e) => setEditCals(e.target.value)}
                                                    style={{ width: 70, background: "#2e2e3a", border: "1px solid #f97316", borderRadius: 6, padding: "2px 8px", color: "#fff", fontSize: 13, outline: "none" }} autoFocus />
                                                <button onClick={() => saveEdit(item.id)} style={{ background: "#f97316", border: "none", borderRadius: 6, padding: "2px 10px", color: "#fff", fontSize: 12, cursor: "pointer" }}>OK</button>
                                                <button onClick={() => setEditId(null)} style={{ background: "#2e2e3a", border: "none", borderRadius: 6, padding: "2px 8px", color: "#aaa", fontSize: 12, cursor: "pointer" }}>✕</button>
                                            </div>
                                        ) : (
                                            <span onClick={() => { setEditId(item.id); setEditCals(item.calories); }}
                                                style={{ fontSize: 14, fontWeight: 500, color: MC.fat, cursor: "pointer", minWidth: 40, textAlign: "right" }} title="Click to edit">
                                                {item.calories}
                                            </span>
                                        )}
                                        <span style={{ fontSize: 11, color: "#666" }}>kcal</span>
                                        <button className="del-btn" onClick={() => removeItem(item.id)} style={{ background: "none", border: "none", color: "#777", cursor: "pointer", fontSize: 14, padding: "0 2px" }}>✕</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    );
                })}
                {items.length === 0 && <div style={{ fontSize: 12, color: "#666", textAlign: "center", padding: "20px 0" }}>No entries for this day.</div>}
            </div>

            {/* Search Panel */}
            {isToday ? (
                <div style={card}>
                    <div style={{ fontSize: 10, letterSpacing: 3, color: "#fff", marginBottom: 14 }}>SEARCH FOOD — USDA DATABASE</div>
                    <select value={mealTime} onChange={(e) => setMealTime(e.target.value)} style={{ ...inputStyle, marginBottom: 10, cursor: "pointer" }}>
                        {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
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
                                        {showLabel && <div style={{ fontSize: 9, letterSpacing: 2, color: "#777", padding: "8px 12px 4px", borderTop: favorites.length ? "1px solid #28283a" : "none" }}>RECENTS</div>}
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
                                                <button onClick={() => setItems((prev) => [...prev, buildItemFromStored(stored)])}
                                                    style={{ background: "#f97316", border: "none", borderRadius: 8, padding: "4px 12px", color: "#fff", fontSize: 11, cursor: "pointer" }}>Add</button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {results.length > 0 && (
                        <div style={{ background: "#18181f", border: "1px solid #2a2a38", borderRadius: 10, overflow: "hidden", marginTop: 8 }}>
                            {results.map((food) => {
                                const detail = detailCache[food.fdcId] || food;
                                const servings = extractServings(food, detail);
                                const choiceIdx = servingChoice[food.fdcId] ?? 0;
                                const chosen = servings[choiceIdx];
                                const isCustom = chosen.grams === null;
                                const n = extractNutrients(detail.foodNutrients || food.foodNutrients || []);
                                return (
                                    <div key={food.fdcId} className="result-row" style={{ padding: "12px", borderBottom: "1px solid #28283a" }}>
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
                                            <span style={{ color: "#888" }}> &nbsp;·&nbsp; </span><span style={{ color: MC.fiber }}>Fi:{Math.round(n.fiber)}g</span>
                                        </div>
                                        <select value={choiceIdx} onChange={(e) => setServingChoice((prev) => ({ ...prev, [food.fdcId]: parseInt(e.target.value) }))}
                                            style={{ ...inputStyle, marginBottom: 8, fontSize: 11, padding: "6px 10px", cursor: "pointer" }}>
                                            {servings.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
                                        </select>
                                        <div style={{ display: "flex", gap: 6 }}>
                                            {isCustom ? (
                                                <input type="number" placeholder="Enter grams" value={customGrams[food.fdcId] || ""}
                                                    onChange={(e) => setCustomGrams((prev) => ({ ...prev, [food.fdcId]: e.target.value }))}
                                                    style={{ ...inputStyle, fontSize: 11, padding: "6px 10px" }} />
                                            ) : (
                                                <input type="number" placeholder="Qty (default 1)" value={quantity[food.fdcId] || ""}
                                                    onChange={(e) => setQuantity((prev) => ({ ...prev, [food.fdcId]: e.target.value }))}
                                                    style={{ ...inputStyle, fontSize: 11, padding: "6px 10px" }} />
                                            )}
                                            <button onClick={() => addFromResult(food)} style={{ background: "#f97316", border: "none", borderRadius: 8, padding: "6px 16px", color: "#fff", fontSize: 12, cursor: "pointer", flexShrink: 0 }}>Add</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            ) : (
                <div style={{ fontSize: 12, color: "#777", textAlign: "center", padding: "12px 0" }}>
                    Viewing past day — <span onClick={() => switchDay(todayKey())} style={{ color: MC.calories, cursor: "pointer" }}>go to today</span> to add entries.
                </div>
            )}

            <div style={{ fontSize: 10, color: "#777", textAlign: "center", letterSpacing: 1, marginTop: 8 }}>
                USDA FOODDATA CENTRAL &nbsp;·&nbsp; TAP ORANGE NUMBERS TO EDIT
            </div>
        </div>
    );
}