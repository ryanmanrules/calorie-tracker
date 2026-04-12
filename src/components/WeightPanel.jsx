import { useState } from "react";
import { lsGet, lsSet } from "../utils/storage";

const C = {
    good: "#22c55e",
    warn: "#f97316",
    danger: "#ef4444",
    blue: "#60a5fa",
    muted: "#777",
    border: "#2e2e3a",
    card: "#242430",
    deep: "#18181f",
};

const loadWeight = () => lsGet("ct_weight", []);
const saveWeight = (log) => lsSet("ct_weight", log);

const getDayFood = (dk) => {
    try { const v = localStorage.getItem(`ct_day_${dk}`); return v ? JSON.parse(v) : []; }
    catch { return []; }
};

let wId = 1;

function Sparkline({ data, color }) {
    if (data.length < 2) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const w = 120, h = 32, pad = 4;
    const points = data.map((v, i) => {
        const x = pad + (i / (data.length - 1)) * (w - pad * 2);
        const y = pad + ((max - v) / range) * (h - pad * 2);
        return `${x},${y}`;
    }).join(" ");
    return (
        <svg width={w} height={h} style={{ display: "block" }}>
            <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
            {data.map((v, i) => {
                const x = pad + (i / (data.length - 1)) * (w - pad * 2);
                const y = pad + ((max - v) / range) * (h - pad * 2);
                return i === data.length - 1 ? <circle key={i} cx={x} cy={y} r="2.5" fill={color} /> : null;
            })}
        </svg>
    );
}

function Section({ title, subtitle, detail, children, accentColor }) {
    const [open, setOpen] = useState(false);
    return (
        <div style={{ background: C.card, border: `1px solid ${accentColor || C.border}22`, borderRadius: 12, marginBottom: 12, overflow: "hidden" }}>
            <div style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, letterSpacing: 2, color: accentColor || "#fff" }}>{title}</div>
                        {subtitle && <div style={{ fontSize: 10, color: C.muted, marginTop: 3, lineHeight: 1.5 }}>{subtitle}</div>}
                    </div>
                    {detail && (
                        <button onClick={() => setOpen((v) => !v)}
                            style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 8px", color: C.muted, fontSize: 9, cursor: "pointer", letterSpacing: 1, marginLeft: 10, flexShrink: 0 }}>
                            {open ? "LESS" : "INFO"}
                        </button>
                    )}
                </div>
                {open && detail && (
                    <div style={{ marginTop: 10, padding: "10px 12px", background: C.deep, borderRadius: 8, fontSize: 11, color: "#aaa", lineHeight: 1.7 }}>
                        {detail}
                    </div>
                )}
            </div>
            {children && <div style={{ padding: "0 14px 14px" }}>{children}</div>}
        </div>
    );
}

function analyzeWeightChange(weightLog, dateKey) {
    const viewDate = new Date(dateKey + "T12:00:00");
    const yDate = new Date(viewDate); yDate.setDate(yDate.getDate() - 1);
    const yKey = yDate.toISOString().slice(0, 10);

    const warnings = [];
    const insights = [];

    const todayEntry = weightLog.find((w) => w.date === dateKey);
    const yesterdayEntry = weightLog.find((w) => w.date === yKey);
    if (!todayEntry) return { warnings, insights };

    const todayWeight = todayEntry.value;
    const yesterdayWeight = yesterdayEntry?.value ?? null;
    const delta = yesterdayWeight !== null ? todayWeight - yesterdayWeight : null;

    if (delta !== null && Math.abs(delta) >= 5) {
        warnings.push({
            color: "#f59e0b",
            text: `A ${Math.abs(delta).toFixed(1)} lb ${delta > 0 ? "gain" : "loss"} in one day is outside the normal range. This is likely a logging error — double check both entries.`,
        });
    }

    const recentWeights = weightLog.filter((w) => w.date !== dateKey).slice(0, 7).map((w) => w.value);
    const avgWeight = recentWeights.length ? recentWeights.reduce((a, b) => a + b, 0) / recentWeights.length : null;
    const gained = avgWeight !== null && todayWeight > avgWeight + 0.3;
    const lost = avgWeight !== null && todayWeight < avgWeight - 0.3;

    if (!gained && !lost) return { warnings, insights };

    const yFood = getDayFood(yKey);
    const yNetCarbs = yFood.reduce((a, i) => a + Math.max(0, (i.carbs || 0) - (i.fiber || 0)), 0);

    const recentNetCarbs = [];
    for (let d = 2; d <= 8; d++) {
        const dt = new Date(viewDate); dt.setDate(dt.getDate() - d);
        const dk = dt.toISOString().slice(0, 10);
        const df = getDayFood(dk);
        if (df.length) recentNetCarbs.push(df.reduce((a, i) => a + Math.max(0, (i.carbs || 0) - (i.fiber || 0)), 0));
    }
    const avgNetCarbs = recentNetCarbs.length ? recentNetCarbs.reduce((a, b) => a + b, 0) / recentNetCarbs.length : null;
    const carbExcess = avgNetCarbs !== null ? yNetCarbs - avgNetCarbs : 0;
    const estimatedWater = carbExcess > 0 ? parseFloat((carbExcess * 3.5 / 453.6).toFixed(1)) : 0;

    if (gained) {
        if (avgNetCarbs !== null && carbExcess > 10) {
            insights.push({ color: C.warn, text: `Net carbs yesterday (${yNetCarbs}g) were ${Math.round(carbExcess)}g above your recent average. Each extra gram of carbs binds ~3.5g of water — this could account for ~${estimatedWater} lbs of today's reading. This is water weight, not fat.` });
        }
        const dayDeltaAbs = delta !== null ? Math.abs(delta) : 0;
        if (dayDeltaAbs < 5) {
            insights.push({ color: C.blue, text: "Gaining 1–5 lbs overnight is almost always water, not fat. True fat gain requires a sustained calorie surplus over weeks. Focus on your 7-day trend, not single-day changes." });
        }
        if (!insights.length) {
            insights.push({ color: C.muted, text: "No clear pattern from yesterday's data. Daily fluctuations of 1–3 lbs are normal and usually reflect hydration, sodium, or digestion — not fat change." });
        }
    }

    if (lost) {
        if (avgNetCarbs !== null && yNetCarbs < avgNetCarbs * 0.8) {
            insights.push({ color: C.good, text: `Net carbs yesterday (${yNetCarbs}g) were below your recent average (${Math.round(avgNetCarbs)}g) — lower carb intake reduces glycogen-bound water, which shows up as weight loss on the scale.` });
        } else {
            insights.push({ color: C.good, text: "Down from your 7-day average. Consistent calorie intake and hydration are the biggest drivers of a downward trend — keep it up." });
        }
    }

    return { warnings, insights };
}

export default function WeightPanel({ dateKey, calorieGoal }) {
    const [weightLog, setWeightLog] = useState(loadWeight);
    const [wValue, setWValue] = useState("");
    const [insightsOpen, setInsightsOpen] = useState(false);

    const today = dateKey;
    const yesterday = (() => {
        const d = new Date(dateKey + "T12:00:00"); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10);
    })();

    // ── weight stats ─────────────────────────────────────────────────────────
    const todayEntry = weightLog.find((w) => w.date === today);
    const recentWeights = weightLog.slice(0, 8);
    const sparkData = recentWeights.map((w) => w.value).reverse();
    const avg7 = recentWeights.length > 1
        ? recentWeights.slice(0, 7).reduce((a, w) => a + w.value, 0) / Math.min(recentWeights.length, 7)
        : null;
    const yesterdayWeight = weightLog.find((w) => w.date === yesterday);
    const weightDelta = todayEntry && yesterdayWeight ? (todayEntry.value - yesterdayWeight.value).toFixed(1) : null;
    const weightTrend = weightDelta === null ? null : parseFloat(weightDelta) > 0.3 ? "up" : parseFloat(weightDelta) < -0.3 ? "down" : "stable";
    const trendColor = weightTrend === "down" ? C.good : weightTrend === "up" ? C.danger : C.muted;
    const trendLabel = weightTrend === "down" ? "▼" : weightTrend === "up" ? "▲" : "—";

    const { warnings: weightWarnings, insights: weightInsights } = todayEntry
        ? analyzeWeightChange(weightLog, dateKey)
        : { warnings: [], insights: [] };

    // ── 7-day calorie trend vs goal ───────────────────────────────────────────
    const calorieTrend = (() => {
        const days = [];
        for (let d = 0; d < 7; d++) {
            const dt = new Date(today + "T12:00:00"); dt.setDate(dt.getDate() - d);
            const dk = dt.toISOString().slice(0, 10);
            const items = getDayFood(dk);
            if (items.length) days.push(items.reduce((a, i) => a + (i.calories || 0), 0));
        }
        return days;
    })();
    const avgCals7 = calorieTrend.length
        ? Math.round(calorieTrend.reduce((a, b) => a + b, 0) / calorieTrend.length)
        : null;
    const avgDeficit = avgCals7 !== null && calorieGoal ? calorieGoal - avgCals7 : null;

    // ── general insights ──────────────────────────────────────────────────────
    const generalInsights = (() => {
        const tips = [];
        const daysWithData = [];
        for (let d = 0; d < 7; d++) {
            const dt = new Date(today + "T12:00:00"); dt.setDate(dt.getDate() - d);
            const dk = dt.toISOString().slice(0, 10);
            const items = getDayFood(dk);
            if (items.length) daysWithData.push({ dk, items });
        }
        if (daysWithData.length < 2) return tips;

        // 1. Calorie deficit/surplus
        if (avgDeficit !== null) {
            if (avgDeficit >= 250 && avgDeficit <= 750) {
                tips.push({ color: C.good, label: "CALORIE DEFICIT", text: `Your 7-day average is ${avgCals7} kcal/day — a ${avgDeficit} kcal/day deficit from your ${calorieGoal} goal. This is a healthy rate of loss (~${(avgDeficit * 7 / 3500).toFixed(1)} lb/week estimated).` });
            } else if (avgDeficit > 750) {
                tips.push({ color: C.warn, label: "LARGE DEFICIT", text: `Your 7-day average is ${avgCals7} kcal/day — a ${avgDeficit} kcal/day deficit. Deficits over 750 kcal/day can increase muscle loss and make the diet hard to sustain. Consider eating a little more.` });
            } else if (avgDeficit < -100) {
                tips.push({ color: C.warn, label: "CALORIE SURPLUS", text: `Your 7-day average is ${avgCals7} kcal/day — ${Math.abs(avgDeficit)} kcal/day over your ${calorieGoal} goal. A consistent surplus leads to fat gain over time.` });
            }
        }

        // 2. Protein adequacy (muscle retention — 0.7g/lb bodyweight is a common target for active cuts)
        if (todayEntry) {
            const avgProtein = (() => {
                let total = 0, count = 0;
                daysWithData.forEach(({ items }) => {
                    const p = items.reduce((a, i) => a + (i.protein || 0), 0);
                    if (p > 0) { total += p; count++; }
                });
                return count ? Math.round(total / count) : null;
            })();
            const proteinTarget = Math.round(todayEntry.value * 0.7);
            if (avgProtein !== null && avgProtein < proteinTarget) {
                tips.push({ color: C.blue, label: "PROTEIN FOR MUSCLE", text: `Your 7-day protein average is ${avgProtein}g/day. At ${todayEntry.value} lbs, a target of ~${proteinTarget}g/day (0.7g/lb) helps preserve muscle during a calorie deficit. Consider adding a protein source to your meals.` });
            } else if (avgProtein !== null && avgProtein >= proteinTarget) {
                tips.push({ color: C.good, label: "PROTEIN ADEQUATE", text: `Your 7-day protein average (${avgProtein}g/day) meets the ~${proteinTarget}g/day target for your weight. Good for maintaining muscle while losing fat.` });
            }
        }

        // 3. Fiber (DRI: 14g per 1,000 kcal)
        const totalCals = daysWithData.reduce((a, { items }) => a + items.reduce((b, i) => b + (i.calories || 0), 0), 0);
        const totalFiber = daysWithData.reduce((a, { items }) => a + items.reduce((b, i) => b + (i.fiber || 0), 0), 0);
        const fiberTarget = (totalCals / 1000) * 14;
        if (totalCals > 500 && totalFiber / Math.max(fiberTarget, 1) < 0.7) {
            tips.push({ color: "#a37c3c", label: "FIBER INTAKE", text: `Your fiber intake this week is below the DRI target of 14g per 1,000 calories. Adequate fiber improves satiety, slows digestion, and supports gut health — all helpful for weight management.` });
        }

        // 4. Calorie consistency
        if (calorieTrend.length >= 4) {
            const mean = calorieTrend.reduce((a, b) => a + b, 0) / calorieTrend.length;
            const stdDev = Math.sqrt(calorieTrend.reduce((a, b) => a + (b - mean) ** 2, 0) / calorieTrend.length);
            if (stdDev > 400) {
                tips.push({ color: C.warn, label: "CALORIE VARIABILITY", text: `Your daily calorie intake varied by ±${Math.round(stdDev)} kcal this week. High day-to-day variability makes it harder to track trends and sustain a deficit. Try to stay within ~200 kcal of your daily target.` });
            }
        }

        return tips;
    })();

    // ── log handler ───────────────────────────────────────────────────────────
    const logWeight = () => {
        if (!wValue) return;
        const val = parseFloat(wValue);
        if (isNaN(val) || val <= 0) return;
        const updated = [{ id: wId++, date: today, value: val }, ...weightLog.filter((w) => w.date !== today)];
        setWeightLog(updated); saveWeight(updated);
        setWValue("");
    };

    const removeWeight = () => {
        const updated = weightLog.filter((w) => w.date !== today);
        setWeightLog(updated); saveWeight(updated);
    };

    const allInsights = [...weightWarnings, ...weightInsights, ...generalInsights];

    return (
        <div style={{ marginTop: 20, background: C.card, border: `1px solid ${C.blue}22`, borderRadius: 12, overflow: "hidden" }}>
            {/* header row */}
            <div style={{ padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, letterSpacing: 2, color: C.blue }}>WEIGHT</div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 3, lineHeight: 1.5 }}>
                        {todayEntry
                            ? `${todayEntry.value} lbs today${weightDelta !== null ? `  ${trendLabel} ${Math.abs(weightDelta)} lb vs yesterday` : ""}${avg7 !== null ? `  ·  ${avg7.toFixed(1)} avg` : ""}`
                            : "Log today's weight to track trends"}
                    </div>
                </div>
                {allInsights.length > 0 && (
                    <button onClick={() => setInsightsOpen(v => !v)} style={{
                        background: insightsOpen ? "#2e2e3a" : "none",
                        border: `1px solid ${C.border}`, borderRadius: 6,
                        padding: "2px 8px", cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 5,
                        flexShrink: 0, marginLeft: 10,
                    }}>
                        <span style={{ fontSize: 9, color: insightsOpen ? "#fff" : C.muted, letterSpacing: 1 }}>
                            {insightsOpen ? "LESS" : `${allInsights.length} INSIGHT${allInsights.length > 1 ? "S" : ""}`}
                        </span>
                        {!insightsOpen && (
                            <span style={{ fontSize: 8, background: C.blue, color: "#000", borderRadius: "50%", width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
                                {allInsights.length}
                            </span>
                        )}
                    </button>
                )}
            </div>

            {/* input + sparkline */}
            <div style={{ padding: "0 14px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <input
                        type="text"
                        inputMode="decimal"
                        placeholder="lbs"
                        value={wValue}
                        onChange={(e) => setWValue(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && logWeight()}
                        style={{ width: 80, background: "#18181f", border: "1px solid #2e2e3a", borderRadius: 8, padding: "6px 10px", color: "#fff", fontSize: 13, outline: "none" }}
                    />
                    <button onClick={logWeight}
                        style={{ background: C.blue + "22", border: `1px solid ${C.blue}44`, borderRadius: 8, padding: "6px 14px", color: C.blue, fontSize: 10, letterSpacing: 1, cursor: "pointer" }}>
                        LOG
                    </button>
                    {todayEntry && (
                        <button onClick={removeWeight}
                            style={{ background: "none", border: "1px solid #2e2e3a", borderRadius: 8, padding: "6px 10px", color: C.muted, fontSize: 10, cursor: "pointer" }}>
                            ✕
                        </button>
                    )}
                </div>
                {todayEntry && sparkData.length >= 2 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Sparkline data={sparkData} color={trendColor} />
                        <span style={{ fontSize: 9, color: trendColor, letterSpacing: 1 }}>
                            {weightTrend === "down" ? "TRENDING DOWN" : weightTrend === "up" ? "TRENDING UP" : "STABLE"}
                        </span>
                    </div>
                )}
            </div>

            {/* expandable insights */}
            {insightsOpen && allInsights.length > 0 && (
                <div style={{ borderTop: `1px solid ${C.border}` }}>
                    {allInsights.map((tip, i) => (
                        <div key={i} style={{
                            padding: "10px 14px",
                            borderBottom: i < allInsights.length - 1 ? `1px solid ${C.border}` : "none",
                        }}>
                            <div style={{ fontSize: 9, letterSpacing: 2, color: tip.color, marginBottom: 4 }}>
                                {tip.label || "INSIGHT"}
                            </div>
                            <div style={{ fontSize: 10, color: "#aaa", lineHeight: 1.7 }}>{tip.text}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
