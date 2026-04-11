import { useState, useEffect, useRef } from "react";
import { GROUPS, MC, MAX_RECENTS } from "../utils/constants";
import { lsGet, lsSet } from "../utils/storage";
import { extractNutrients, extractServings } from "../utils/nutrients";

const USDA_KEY = import.meta.env.VITE_USDA_API_KEY;
const USDA_URL = "https://api.nal.usda.gov/fdc/v1";

export default function SearchPanel({ mealTime, setMealTime, onAdd }) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [searchErr, setSearchErr] = useState("");
    const [manualMode, setManualMode] = useState(false);
    const [manual, setManual] = useState({ name: "", calories: "", protein: "", carbs: "", fat: "", fiber: "", sugar: "" });
    const [servingChoice, setServingChoice] = useState({});
    const [quantity, setQuantity] = useState({});
    const [customGrams, setCustomGrams] = useState({});
    const [detailCache, setDetailCache] = useState({});
    const [recents, setRecents] = useState(() => lsGet("ct_recents", []));
    const [favorites, setFavorites] = useState(() => lsGet("ct_favorites", []));
    const searchTimeout = useRef(null);

    const inputStyle = {
        width: "100%", background: "#18181f", border: "1px solid #2e2e3a",
        borderRadius: 8, padding: "10px 12px", color: "#e8e8e8",
        fontSize: 13, fontFamily: "inherit", outline: "none",
    };

    // Debounced search
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

    // Pull full food detail for serving portion data — cached so we don't re-fetch on re-render
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

    // Keep the most recently added foods at the top, bump duplicates instead of stacking them
    const saveToRecents = (food, nutrients) => {
        const entry = { fdcId: food.fdcId, description: food.description, nutrients, searchResult: food };
        setRecents((prev) => {
            const updated = [entry, ...prev.filter((r) => r.fdcId !== food.fdcId)].slice(0, MAX_RECENTS);
            lsSet("ct_recents", updated);
            return updated;
        });
    };

    // Stars toggle — if the item is already a favorite remove it, otherwise promote from recents
    const toggleFavorite = (fdcId) => {
        setFavorites((prev) => {
            const isFav = prev.some((f) => f.fdcId === fdcId);
            const recent = recents.find((r) => r.fdcId === fdcId);
            const updated = isFav ? prev.filter((f) => f.fdcId !== fdcId) : recent ? [recent, ...prev] : prev;
            lsSet("ct_favorites", updated);
            return updated;
        });
    };

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

        onAdd({
            name: food.description,
            time: mealTime,
            calories: Math.round(n.calories * scale),
            protein: Math.round(n.protein * scale),
            fat: Math.round(n.fat * scale),
            carbs: Math.round(n.carbs * scale),
            fiber: Math.round(n.fiber * scale),
            sugar: Math.round(n.sugar * scale),
            grams: Math.round(grams),
            serving: chosen.grams === null
                ? `${Math.round(grams)}g`
                : qty !== 1 ? `${qty}x ${chosen.label}` : chosen.label,
        });

        saveToRecents(food, n);
        setQuery(""); setResults([]); setServingChoice({}); setQuantity({}); setCustomGrams({});
    };

    const addManual = () => {
        if (!manual.name.trim() || !manual.calories) return;
        onAdd({
            name: manual.name.trim(),
            time: mealTime,
            calories: parseInt(manual.calories) || 0,
            protein: parseInt(manual.protein) || 0,
            carbs: parseInt(manual.carbs) || 0,
            fat: parseInt(manual.fat) || 0,
            fiber: parseInt(manual.fiber) || 0,
            sugar: parseInt(manual.sugar) || 0,
            grams: null,
            serving: "manual entry",
        });
        setManual({ name: "", calories: "", protein: "", carbs: "", fat: "", fiber: "", sugar: "" });
    };

    const addFromStored = (stored) => {
        onAdd({
            name: stored.description,
            time: mealTime,
            calories: Math.round(stored.nutrients.calories),
            protein: Math.round(stored.nutrients.protein),
            fat: Math.round(stored.nutrients.fat),
            carbs: Math.round(stored.nutrients.carbs),
            fiber: Math.round(stored.nutrients.fiber || 0),
            sugar: Math.round(stored.nutrients.sugar || 0),
            grams: 100,
            serving: "100g",
        });
    };

    const favIds = new Set(favorites.map((f) => f.fdcId));
    const recentNonFavs = recents.filter((r) => !favIds.has(r.fdcId));
    const storedList = [...favorites, ...recentNonFavs];
    const showStored = !manualMode && storedList.length > 0 && !query.trim();

    return (
        <div style={{ background: "#242430", border: "1px solid #2e2e3a", borderRadius: 16, padding: "20px", marginBottom: 20 }}>
            {/* header + mode toggle */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 10, letterSpacing: 3, color: "#fff" }}>{manualMode ? "MANUAL ENTRY" : "SEARCH FOOD — USDA DATABASE"}</div>
                <button
                    onClick={() => { setManualMode((v) => !v); setQuery(""); setResults([]); }}
                    style={{ background: "#2e2e3a", border: "none", borderRadius: 6, padding: "4px 10px", color: "#aaa", fontSize: 10, cursor: "pointer", letterSpacing: 1 }}
                >
                    {manualMode ? "SEARCH" : "MANUAL"}
                </button>
            </div>

            <select value={mealTime} onChange={(e) => setMealTime(e.target.value)} style={{ ...inputStyle, marginBottom: 10, cursor: "pointer" }}>
                {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>

            {/* manual entry form */}
            {manualMode ? (
                <div>
                    <input
                        placeholder="Food name (required)"
                        value={manual.name}
                        onChange={(e) => setManual((p) => ({ ...p, name: e.target.value }))}
                        style={{ ...inputStyle, marginBottom: 8 }}
                    />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                        {[
                            { key: "calories", label: "Calories", color: MC.calories },
                            { key: "protein", label: "Protein (g)", color: MC.protein },
                            { key: "carbs", label: "Carbs (g)", color: MC.carbs },
                            { key: "fat", label: "Fat (g)", color: MC.fat },
                            { key: "fiber", label: "Fiber (g)", color: MC.fiber },
                            { key: "sugar", label: "Sugar (g)", color: "#f472b6" },
                        ].map(({ key, label, color }) => (
                            <input
                                key={key}
                                type="number"
                                placeholder={label}
                                value={manual[key]}
                                onChange={(e) => setManual((p) => ({ ...p, [key]: e.target.value }))}
                                style={{ ...inputStyle, borderColor: manual[key] ? color : "#2e2e3a" }}
                            />
                        ))}
                    </div>
                    <button onClick={addManual} style={{ width: "100%", background: "#f97316", border: "none", borderRadius: 8, padding: "10px", color: "#fff", fontSize: 13, cursor: "pointer" }}>
                        Add Entry
                    </button>
                </div>
            ) : (
                <>
                    <input
                        placeholder="Search food..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        style={{ ...inputStyle, marginBottom: 4 }}
                    />
                    {searching && <div style={{ fontSize: 11, color: "#fff", padding: "6px 2px" }}>Searching...</div>}
                    {searchErr && <div style={{ fontSize: 11, color: "#ef4444", padding: "6px 2px" }}>{searchErr}</div>}
                </>
            )}

            {/* favorites + recents */}
            {showStored && (
                <div style={{ background: "#18181f", border: "1px solid #2a2a38", borderRadius: 10, overflow: "hidden", marginTop: 8 }}>
                    {favorites.length > 0 && (
                        <div style={{ fontSize: 9, letterSpacing: 2, color: "#f59e0b", padding: "8px 12px 4px" }}>FAVORITES</div>
                    )}
                    {storedList.map((stored, idx) => {
                        const isFav = favIds.has(stored.fdcId);
                        const showLabel = !isFav && idx === favorites.length;
                        return (
                            <div key={stored.fdcId}>
                                {showLabel && (
                                    <div style={{ fontSize: 9, letterSpacing: 2, color: "#777", padding: "8px 12px 4px", borderTop: favorites.length ? "1px solid #28283a" : "none" }}>RECENTS</div>
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
                                        <button
                                            className={`star-btn${isFav ? " active" : ""}`}
                                            onClick={() => toggleFavorite(stored.fdcId)}
                                        >★</button>
                                        <button
                                            onClick={() => addFromStored(stored)}
                                            style={{ background: "#f97316", border: "none", borderRadius: 8, padding: "4px 12px", color: "#fff", fontSize: 11, cursor: "pointer" }}
                                        >Add</button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* search results */}
            {!manualMode && results.length > 0 && (
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
                                    <span style={{ color: "#888" }}> &nbsp;·&nbsp; </span>
                                    <span style={{ color: MC.fiber }}>Fi:{Math.round(n.fiber)}g</span>
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
                                        <input
                                            type="number"
                                            placeholder="Enter grams"
                                            value={customGrams[food.fdcId] || ""}
                                            onChange={(e) => setCustomGrams((prev) => ({ ...prev, [food.fdcId]: e.target.value }))}
                                            style={{ ...inputStyle, fontSize: 11, padding: "6px 10px" }}
                                        />
                                    ) : (
                                        <input
                                            type="number"
                                            placeholder="Qty (default 1)"
                                            value={quantity[food.fdcId] || ""}
                                            onChange={(e) => setQuantity((prev) => ({ ...prev, [food.fdcId]: e.target.value }))}
                                            style={{ ...inputStyle, fontSize: 11, padding: "6px 10px" }}
                                        />
                                    )}
                                    <button
                                        onClick={() => addFromResult(food)}
                                        style={{ background: "#f97316", border: "none", borderRadius: 8, padding: "6px 16px", color: "#fff", fontSize: 12, cursor: "pointer", flexShrink: 0 }}
                                    >Add</button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
