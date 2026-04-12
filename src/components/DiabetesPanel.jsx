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

const loadGlucose = () => lsGet("ct_glucose", []);
const saveGlucose = (log) => lsSet("ct_glucose", log);
const loadInsulin = () => lsGet("ct_insulin", []);
const saveInsulin = (log) => lsSet("ct_insulin", log);
const loadWeight = () => lsGet("ct_weight", []);
const saveWeight = (log) => lsSet("ct_weight", log);

// helper to read a day's food from localStorage
const getDayFood = (dk) => {
    try { const v = localStorage.getItem(`ct_day_${dk}`); return v ? JSON.parse(v) : []; }
    catch { return []; }
};

let gId = 1;
let iId = 1;
let wId = 1;

const glucoseColor = (type, value) => {
    const ranges = {
        Fasting: { low: 80, high: 130 },
        "Post-meal (1hr)": { low: 80, high: 180 },
        "Post-meal (2hr)": { low: 80, high: 140 },
        Bedtime: { low: 100, high: 140 },
    };
    const r = ranges[type];
    if (!r) return "#fff";
    if (value < r.low) return C.blue;
    if (value > r.high) return C.danger;
    return C.good;
};

// expandable section — subtitle always visible, tap INFO for detail
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
            <div style={{ padding: "0 14px 14px" }}>{children}</div>
        </div>
    );
}

// mini sparkline for weight trend
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

// analyze yesterday's data to surface patterns relevant to weight change
function analyzeWeightChange(weightLog, glucoseLog, insulinLog, dateKey) {
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

    // sanity check — 5+ lbs in one day is almost certainly a logging error
    if (delta !== null && Math.abs(delta) >= 5) {
        warnings.push({
            color: "#f59e0b",
            text: `A ${Math.abs(delta).toFixed(1)} lb ${delta > 0 ? "gain" : "loss"} in one day is outside the normal range (1–5 lbs of daily fluctuation is typical). This may be a logging error — double check both entries.`,
        });
    }

    const recentWeights = weightLog.filter((w) => w.date !== dateKey).slice(0, 7).map((w) => w.value);
    const avgWeight = recentWeights.length ? recentWeights.reduce((a, b) => a + b, 0) / recentWeights.length : null;
    const gained = avgWeight !== null && todayWeight > avgWeight + 0.3;
    const lost = avgWeight !== null && todayWeight < avgWeight - 0.3;

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

    const yInsulin = insulinLog.filter((r) => r.date === yKey);
    const yBolus = yInsulin.filter((r) => r.type === "Bolus").reduce((a, r) => a + r.dose, 0);
    const recentBolus = [];
    for (let d = 2; d <= 8; d++) {
        const dt = new Date(viewDate); dt.setDate(dt.getDate() - d);
        const dk = dt.toISOString().slice(0, 10);
        const di = insulinLog.filter((r) => r.date === dk && r.type === "Bolus");
        if (di.length) recentBolus.push(di.reduce((a, r) => a + r.dose, 0));
    }
    const avgBolus = recentBolus.length ? recentBolus.reduce((a, b) => a + b, 0) / recentBolus.length : null;

    const yGlucose = glucoseLog.filter((r) => r.date === yKey);
    const lowCount = yGlucose.filter((r) => {
        const floors = { Fasting: 80, "Post-meal (1hr)": 80, "Post-meal (2hr)": 80, Bedtime: 100 };
        return r.value < (floors[r.type] || 80);
    }).length;

    if (!gained && !lost) return { warnings, insights };

    if (gained) {
        if (avgNetCarbs !== null && carbExcess > 10) {
            insights.push({ color: C.warn, text: `Net carbs yesterday (${yNetCarbs}g) were ${Math.round(carbExcess)}g above your recent average. Each extra gram of carbs stores ~3.5g of water — this could account for roughly ${estimatedWater} lbs of today's reading. This is water weight, not fat.` });
        }
        if (avgBolus !== null && yBolus > avgBolus * 1.25) {
            insights.push({ color: C.warn, text: `Total bolus yesterday (${yBolus}u) was above your recent average (${avgBolus.toFixed(1)}u). Higher insulin levels can promote water retention and fat storage.` });
        }
        if (lowCount >= 2) {
            insights.push({ color: C.warn, text: `You logged ${lowCount} low glucose readings yesterday. Recovery carbs from lows add unplanned carbs and can spike insulin, contributing to temporary water retention.` });
        }
        const dayDeltaAbs = delta !== null ? Math.abs(delta) : 0;
        if (dayDeltaAbs < 5) {
            insights.push({ color: C.blue, text: "Note: gaining 1–5 lbs overnight is almost always water weight, not fat. True fat gain requires a sustained calorie surplus over weeks. Look at your 7-day trend, not single-day changes." });
        }
        if (!insights.length) {
            insights.push({ color: C.muted, text: "No clear pattern from yesterday's data. Daily fluctuations of 1–3 lbs are normal and usually reflect water balance, not fat change." });
        }
    }

    if (lost) {
        if (avgNetCarbs !== null && yNetCarbs < avgNetCarbs * 0.8) {
            insights.push({ color: C.good, text: `Net carbs yesterday (${yNetCarbs}g) were below your recent average (${Math.round(avgNetCarbs)}g) — lower carb intake reduces glycogen-bound water, which shows up as weight loss on the scale.` });
        } else {
            insights.push({ color: C.good, text: `Down from your 7-day average${avgNetCarbs !== null && yNetCarbs <= avgNetCarbs ? " — consistent carb intake is helping keep insulin and water retention stable." : "."}` });
        }
    }

    return { warnings, insights };
}

export default function DiabetesPanel({ netCarbs, dateKey }) {
    const [glucoseLog, setGlucoseLog] = useState(loadGlucose);
    const [insulinLog, setInsulinLog] = useState(loadInsulin);
    const [weightLog, setWeightLog] = useState(loadWeight);

    const [gType, setGType] = useState("Fasting");
    const [gValue, setGValue] = useState("");
    const [gNote, setGNote] = useState("");
    const [iType, setIType] = useState("Bolus");
    const [iDose, setIDose] = useState("");
    const [iNote, setINote] = useState("");
    const [wValue, setWValue] = useState("");
    const [t1dInsightsOpen, setT1dInsightsOpen] = useState(false);
    const [weightInsightsOpen, setWeightInsightsOpen] = useState(false);

    const today = dateKey;
    const yesterday = (() => { const d = new Date(dateKey + "T12:00:00"); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();

    // ── carb history — last 7 days ───────────────────────────────────────────
    const carbHistory = (() => {
        const days = [];
        for (let d = 0; d < 7; d++) {
            const dt = new Date(today + "T12:00:00"); dt.setDate(dt.getDate() - d);
            const dk = dt.toISOString().slice(0, 10);
            const label = d === 0 ? "Today" : d === 1 ? "Yesterday" : dt.toLocaleDateString("en-US", { weekday: "short" });
            const items = getDayFood(dk);
            const net = items.reduce((a, i) => a + Math.max(0, (i.carbs || 0) - (i.fiber || 0)), 0);
            const cal = items.reduce((a, i) => a + (i.calories || 0), 0);
            days.push({ dk, label, net, cal, hasData: items.length > 0 });
        }
        return days;
    })();

    const daysWithData = carbHistory.filter((d) => d.hasData);
    const avgNetCarbs7 = daysWithData.length > 1
        ? Math.round(daysWithData.slice(1).reduce((a, d) => a + d.net, 0) / (daysWithData.length - 1))
        : null;
    const yesterdayNet = carbHistory[1]?.net ?? null;
    const carbTrend = daysWithData.length >= 3
        ? (() => {
            const half = Math.floor(daysWithData.length / 2);
            const first = daysWithData.slice(half).reduce((a, d) => a + d.net, 0);
            const second = daysWithData.slice(0, half).reduce((a, d) => a + d.net, 0);
            const diff = second - first;
            if (Math.abs(diff) < 10) return "stable";
            return diff > 0 ? "rising" : "falling";
        })()
        : null;
    const carbTrendColor = carbTrend === "falling" ? C.good : carbTrend === "rising" ? C.warn : C.muted;
    const carbTrendLabel = carbTrend === "falling" ? "▼ Trending down" : carbTrend === "rising" ? "▲ Trending up" : "— Stable";

    const carbExcessYday = avgNetCarbs7 !== null && yesterdayNet !== null ? yesterdayNet - avgNetCarbs7 : 0;
    const waterWeightEstimate = carbExcessYday > 0 ? parseFloat((carbExcessYday * 3.5 / 453.6).toFixed(1)) : 0;

    // ── weight stats ─────────────────────────────────────────────────────────
    const todayWeightEntry = weightLog.find((w) => w.date === today);
    const recentWeights = weightLog.slice(0, 8);
    const sparkData = recentWeights.map((w) => w.value).reverse();
    const avg7 = recentWeights.length > 1
        ? recentWeights.slice(0, 7).reduce((a, w) => a + w.value, 0) / Math.min(recentWeights.length, 7)
        : null;
    const yesterdayWeight = weightLog.find((w) => w.date === yesterday);
    const weightDelta = todayWeightEntry && yesterdayWeight ? (todayWeightEntry.value - yesterdayWeight.value).toFixed(1) : null;
    const weightTrend = weightDelta === null ? null : parseFloat(weightDelta) > 0.3 ? "up" : parseFloat(weightDelta) < -0.3 ? "down" : "stable";
    const trendColor = weightTrend === "down" ? C.good : weightTrend === "up" ? C.danger : C.muted;
    const trendLabel = weightTrend === "down" ? "▼" : weightTrend === "up" ? "▲" : "—";

    const { warnings: weightWarnings, insights: weightInsights } = todayWeightEntry
        ? analyzeWeightChange(weightLog, glucoseLog, insulinLog, dateKey)
        : { warnings: [], insights: [] };

    // ── today's glucose + insulin ────────────────────────────────────────────
    const todayGlucose = glucoseLog.filter((r) => r.date === today);
    const todayInsulin = insulinLog.filter((r) => r.date === today);
    const totalBolus = todayInsulin.filter((r) => r.type === "Bolus").reduce((a, r) => a + r.dose, 0);
    const totalBasal = todayInsulin.filter((r) => r.type === "Basal").reduce((a, r) => a + r.dose, 0);

    // ── T1D data-driven insights ─────────────────────────────────────────────
    const t1dInsights = (() => {
        const tips = [];
        if (daysWithData.length < 2) return tips;

        // 1. Carb consistency
        const nets = daysWithData.map((d) => d.net);
        const mean = nets.reduce((a, b) => a + b, 0) / nets.length;
        const stdDev = Math.sqrt(nets.reduce((a, b) => a + (b - mean) ** 2, 0) / nets.length);
        if (stdDev > 30) {
            tips.push({ color: C.warn, label: "CARB VARIABILITY", text: `Your net carb intake varied by ±${Math.round(stdDev)}g this week. High variability makes bolus dosing harder to predict — aim to keep meals within ~20g of your daily target.` });
        } else if (stdDev <= 15 && nets.length >= 4) {
            tips.push({ color: C.good, label: "CARB CONSISTENCY", text: `Your net carb intake has been consistent (±${Math.round(stdDev)}g variance this week). Consistent carbs help keep insulin doses stable and predictable.` });
        }

        // 2. Breakfast carb load
        const morningAvg = (() => {
            const days = [];
            for (let d = 0; d < 7; d++) {
                const dt = new Date(today + "T12:00:00"); dt.setDate(dt.getDate() - d);
                const items = getDayFood(dt.toISOString().slice(0, 10)).filter((i) => i.time === "Morning");
                if (items.length) days.push(items.reduce((a, i) => a + Math.max(0, (i.carbs || 0) - (i.fiber || 0)), 0));
            }
            return days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null;
        })();
        if (morningAvg !== null && morningAvg > 35) {
            tips.push({ color: C.warn, label: "BREAKFAST CARBS", text: `Your morning meals average ${morningAvg}g net carbs. Research shows lower-carb breakfasts (under 30g net) improve blood sugar stability for the rest of the day in T1D — morning insulin sensitivity tends to be lower.` });
        }

        // 3. Fiber-to-calorie ratio (ADA: 14g per 1,000 cal)
        const totalCals = daysWithData.reduce((a, d) => a + d.cal, 0);
        const totalFiber = (() => {
            let f = 0;
            for (let d = 0; d < 7; d++) {
                const dt = new Date(today + "T12:00:00"); dt.setDate(dt.getDate() - d);
                f += getDayFood(dt.toISOString().slice(0, 10)).reduce((a, i) => a + (i.fiber || 0), 0);
            }
            return f;
        })();
        const fiberTarget = (totalCals / 1000) * 14;
        if (totalFiber / Math.max(fiberTarget, 1) < 0.7 && totalCals > 500) {
            tips.push({ color: "#a37c3c", label: "FIBER INTAKE", text: "Your fiber intake this week is below the ADA target of 14g per 1,000 calories. Higher fiber slows glucose absorption, reduces post-meal spikes, and lowers net carbs — all beneficial for T1D management." });
        }

        // 4. Recurring lows at same reading type
        const lowsByMeal = {};
        glucoseLog.forEach((r) => {
            const floors = { Fasting: 80, "Post-meal (1hr)": 80, "Post-meal (2hr)": 80, Bedtime: 100 };
            if (r.value < (floors[r.type] || 80)) lowsByMeal[r.type] = (lowsByMeal[r.type] || 0) + 1;
        });
        const repeatedLow = Object.entries(lowsByMeal).find(([, count]) => count >= 2);
        if (repeatedLow) {
            tips.push({ color: C.blue, label: "RECURRING LOWS", text: `You've had ${repeatedLow[1]} "${repeatedLow[0]}" lows logged. A recurring low at the same reading type often signals a basal or bolus adjustment may be needed — worth flagging to your care team.` });
        }

        // 5. High protein meal (40g+ causes delayed glucose rise)
        const highProtein = (() => {
            for (let d = 0; d < 3; d++) {
                const dt = new Date(today + "T12:00:00"); dt.setDate(dt.getDate() - d);
                const dk = dt.toISOString().slice(0, 10);
                for (const g of ["Morning", "Afternoon", "Evening", "Snack"]) {
                    const p = getDayFood(dk).filter((i) => i.time === g).reduce((a, i) => a + (i.protein || 0), 0);
                    if (p >= 40) return { day: d === 0 ? "today" : d === 1 ? "yesterday" : "2 days ago", meal: g, protein: Math.round(p) };
                }
            }
            return null;
        })();
        if (highProtein) {
            tips.push({ color: C.blue, label: "HIGH PROTEIN MEAL", text: `Your ${highProtein.meal} ${highProtein.day} had ${highProtein.protein}g of protein. High-protein meals (40g+) can cause a delayed blood sugar rise 3–5 hours after eating. A split bolus strategy may help — ask your care team.` });
        }

        return tips;
    })();

    // ── log handlers ─────────────────────────────────────────────────────────
    const logGlucose = () => {
        if (!gValue) return;
        const entry = { id: gId++, date: today, type: gType, value: parseInt(gValue), note: gNote.trim(), time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) };
        const updated = [entry, ...glucoseLog]; setGlucoseLog(updated); saveGlucose(updated);
        setGValue(""); setGNote("");
    };

    const logInsulin = () => {
        if (!iDose) return;
        const entry = { id: iId++, date: today, type: iType, dose: parseFloat(iDose), note: iNote.trim(), time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) };
        const updated = [entry, ...insulinLog]; setInsulinLog(updated); saveInsulin(updated);
        setIDose(""); setINote("");
    };

    const logWeight = () => {
        if (!wValue) return;
        const filtered = weightLog.filter((w) => w.date !== today);
        const entry = { id: wId++, date: today, value: parseFloat(wValue) };
        const updated = [entry, ...filtered]; setWeightLog(updated); saveWeight(updated);
        setWValue("");
    };

    const removeGlucose = (id) => { const u = glucoseLog.filter((r) => r.id !== id); setGlucoseLog(u); saveGlucose(u); };
    const removeInsulin = (id) => { const u = insulinLog.filter((r) => r.id !== id); setInsulinLog(u); saveInsulin(u); };

    const input = { width: "100%", background: C.deep, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", color: "#e8e8e8", fontSize: 12, fontFamily: "inherit", outline: "none" };
    const logBtn = { background: "#f97316", border: "none", borderRadius: 8, padding: "7px 14px", color: "#fff", fontSize: 12, cursor: "pointer", flexShrink: 0 };
    const row = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", borderRadius: 8, background: C.deep, marginBottom: 4 };

    return (
        <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, letterSpacing: 3, color: "#fff", marginBottom: 12 }}>DIABETES MODE</div>

            {/* T1D insights */}
            {t1dInsights.length > 0 && (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 12, overflow: "hidden" }}>
                    <div style={{ padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                            <div style={{ fontSize: 10, letterSpacing: 2, color: "#fff" }}>INSIGHTS</div>
                            <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>Based on your logged data this week.</div>
                        </div>
                        <button onClick={() => setT1dInsightsOpen(v => !v)} style={{
                            background: t1dInsightsOpen ? "#2e2e3a" : "none",
                            border: `1px solid ${C.border}`, borderRadius: 6,
                            padding: "2px 8px", cursor: "pointer",
                            display: "flex", alignItems: "center", gap: 5, flexShrink: 0, marginLeft: 10,
                        }}>
                            <span style={{ fontSize: 9, color: t1dInsightsOpen ? "#fff" : C.muted, letterSpacing: 1 }}>
                                {t1dInsightsOpen ? "LESS" : `${t1dInsights.length} INSIGHT${t1dInsights.length > 1 ? "S" : ""}`}
                            </span>
                            {!t1dInsightsOpen && (
                                <span style={{ fontSize: 8, background: "#60a5fa", color: "#000", borderRadius: "50%", width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
                                    {t1dInsights.length}
                                </span>
                            )}
                        </button>
                    </div>
                    {t1dInsightsOpen && (
                        <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${C.border}` }}>
                            {t1dInsights.map((tip, i) => (
                                <div key={i} style={{ padding: "10px 12px", background: C.deep, borderRadius: 8, borderLeft: `3px solid ${tip.color}`, marginBottom: i < t1dInsights.length - 1 ? 8 : 0, marginTop: i === 0 ? 12 : 0 }}>
                                    <div style={{ fontSize: 9, letterSpacing: 2, color: tip.color, marginBottom: 4 }}>{tip.label}</div>
                                    <div style={{ fontSize: 11, color: "#bbb", lineHeight: 1.6 }}>{tip.text}</div>
                                </div>
                            ))}
                            <div style={{ fontSize: 10, color: "#444", marginTop: 8 }}>Not medical advice — consult your care team before making changes.</div>
                        </div>
                    )}
                </div>
            )}

            {/* Net carbs */}
            <Section title="NET CARBS TODAY" accentColor="#f59e0b"
                subtitle="Total carbs minus fiber — the carbs that actually raise blood sugar."
                detail={<>
                    <strong style={{ color: "#fff" }}>Why it matters for weight:</strong> In T1D, carbs drive insulin demand. Higher insulin doses promote fat storage and make weight loss harder.<br /><br />
                    <strong style={{ color: C.good }}>Helps:</strong> Lower, consistent net carbs → more predictable blood sugar → lower insulin doses → easier weight management.<br />
                    <strong style={{ color: C.danger }}>Hurts:</strong> High or erratic carb intake → blood sugar spikes → higher correction doses → more insulin → harder to lose weight.
                </>}
            >
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 28, fontWeight: 600, color: netCarbs > 150 ? C.warn : C.good }}>{netCarbs}g</span>
                    <span style={{ fontSize: 11, color: C.muted }}>net carbs</span>
                </div>
            </Section>

            {/* Carb pattern */}
            <Section title="CARB PATTERN — LAST 7 DAYS" accentColor={carbTrendColor}
                subtitle={avgNetCarbs7 !== null ? `7-day avg: ${avgNetCarbs7}g net · ${carbTrendLabel}` : "Log a few days of food to see your carb trend."}
                detail={<>
                    <strong style={{ color: "#fff" }}>Why carb patterns matter for T1D weight:</strong> Each gram of net carbs stores 3–4 grams of water as glycogen. A day with 50g more net carbs than usual can add 0.3–0.5 lbs of water weight by the next morning — not fat, but it shows on the scale.<br /><br />
                    <strong style={{ color: C.good }}>Consistent carbs:</strong> Stable day-to-day net carbs → predictable insulin doses → less water retention variability → easier to read your true weight trend.<br /><br />
                    <strong style={{ color: C.warn }}>Rising carbs:</strong> Increasing net carbs → higher bolus needs → more insulin → harder to lose weight even if calories stay the same.
                </>}
            >
                {daysWithData.length > 0 ? (
                    <div style={{ marginTop: 4 }}>
                        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 48, marginBottom: 6 }}>
                            {[...carbHistory].reverse().map((day) => {
                                const max = Math.max(...carbHistory.filter((d) => d.hasData).map((d) => d.net), 1);
                                const pct = day.hasData ? Math.max((day.net / max) * 100, 4) : 0;
                                const color = avgNetCarbs7 !== null && day.net > avgNetCarbs7 * 1.2 ? C.warn
                                    : avgNetCarbs7 !== null && day.net < avgNetCarbs7 * 0.8 ? C.good : "#60a5fa";
                                return (
                                    <div key={day.dk} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                                        <div style={{ fontSize: 9, color: day.net > 0 ? color : "#333" }}>{day.hasData ? day.net : ""}</div>
                                        <div style={{ width: "100%", height: `${pct}%`, background: day.hasData ? color : "#222", borderRadius: "3px 3px 0 0", minHeight: day.hasData ? 4 : 0, transition: "height 0.3s ease" }} />
                                        <div style={{ fontSize: 8, color: "#555", letterSpacing: 0.5 }}>{day.label.slice(0, 3)}</div>
                                    </div>
                                );
                            })}
                        </div>
                        {avgNetCarbs7 !== null && (
                            <div style={{ fontSize: 10, color: C.muted, marginBottom: 6 }}>Avg: <span style={{ color: "#fff" }}>{avgNetCarbs7}g</span> net carbs/day</div>
                        )}
                        {waterWeightEstimate > 0 && (
                            <div style={{ padding: "7px 10px", background: C.deep, borderRadius: 8, borderLeft: `3px solid ${C.warn}`, fontSize: 11, color: "#bbb", lineHeight: 1.6 }}>
                                Yesterday's net carbs ({yesterdayNet}g) were {Math.round(carbExcessYday)}g above your average — this may account for ~{waterWeightEstimate} lbs of water weight on the scale today.
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{ fontSize: 11, color: "#444", textAlign: "center", padding: "6px 0" }}>No food logged yet — add meals to see your carb trend.</div>
                )}
            </Section>

            {/* Daily weight */}
            <Section title="DAILY WEIGHT" accentColor={trendColor !== C.muted ? trendColor : "#fff"}
                subtitle={todayWeightEntry ? `Logged today: ${todayWeightEntry.value} lbs` : "Not logged today — tap to record."}
            >
                {!todayWeightEntry && (
                    <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                        <input type="number" placeholder="lbs" value={wValue} onChange={(e) => setWValue(e.target.value)} step="0.1" style={input} />
                        <button onClick={logWeight} style={logBtn}>Log</button>
                    </div>
                )}
                {todayWeightEntry && (
                    <>
                        <div style={{ display: "flex", gap: 16, alignItems: "flex-end", marginBottom: 10 }}>
                            <div>
                                <div style={{ fontSize: 28, fontWeight: 600, color: "#fff" }}>{todayWeightEntry.value}</div>
                                <div style={{ fontSize: 9, color: C.muted, letterSpacing: 2 }}>LBS TODAY</div>
                            </div>
                            {weightDelta !== null && (
                                <div>
                                    <div style={{ fontSize: 18, fontWeight: 500, color: trendColor }}>{trendLabel} {Math.abs(weightDelta)}</div>
                                    <div style={{ fontSize: 9, color: C.muted, letterSpacing: 2 }}>VS YESTERDAY</div>
                                </div>
                            )}
                            {avg7 && (
                                <div>
                                    <div style={{ fontSize: 18, fontWeight: 500, color: "#aaa" }}>{avg7.toFixed(1)}</div>
                                    <div style={{ fontSize: 9, color: C.muted, letterSpacing: 2 }}>7-DAY AVG</div>
                                </div>
                            )}
                        </div>
                        {sparkData.length >= 2 && <div style={{ marginBottom: 10 }}><Sparkline data={sparkData} color={trendColor} /></div>}
                        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 0 }}>
                            <input type="number" placeholder="Update today's weight" value={wValue} onChange={(e) => setWValue(e.target.value)} step="0.1" style={{ ...input, fontSize: 11 }} />
                            <button onClick={logWeight} style={{ ...logBtn, fontSize: 11, padding: "6px 12px" }}>Update</button>
                            {(weightWarnings.length + weightInsights.length) > 0 && (
                                <button onClick={() => setWeightInsightsOpen(v => !v)} style={{
                                    background: weightInsightsOpen ? "#2e2e3a" : "none",
                                    border: `1px solid ${C.border}`, borderRadius: 6,
                                    padding: "2px 8px", cursor: "pointer",
                                    display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
                                }}>
                                    <span style={{ fontSize: 9, color: weightInsightsOpen ? "#fff" : C.muted, letterSpacing: 1 }}>
                                        {weightInsightsOpen ? "LESS" : "INSIGHTS"}
                                    </span>
                                    {!weightInsightsOpen && (
                                        <span style={{ fontSize: 8, background: "#60a5fa", color: "#000", borderRadius: "50%", width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
                                            {weightWarnings.length + weightInsights.length}
                                        </span>
                                    )}
                                </button>
                            )}
                        </div>
                        {weightInsightsOpen && (
                            <div style={{ marginTop: 10 }}>
                                {weightWarnings.map((w, i) => (
                                    <div key={`w${i}`} style={{ padding: "8px 10px", background: C.deep, borderRadius: 8, borderLeft: `3px solid ${w.color}`, marginBottom: 6 }}>
                                        <div style={{ fontSize: 11, color: "#fff", fontWeight: 500, marginBottom: 2 }}>⚠ Does this look right?</div>
                                        <div style={{ fontSize: 11, color: "#bbb", lineHeight: 1.6 }}>{w.text}</div>
                                    </div>
                                ))}
                                {weightInsights.map((insight, i) => (
                                    <div key={`i${i}`} style={{ padding: "8px 10px", background: C.deep, borderRadius: 8, borderLeft: `3px solid ${insight.color}`, marginBottom: 6 }}>
                                        <div style={{ fontSize: 11, color: "#bbb", lineHeight: 1.6 }}>{insight.text}</div>
                                    </div>
                                ))}
                                <div style={{ fontSize: 10, color: "#444", marginTop: 2 }}>Not medical advice — patterns based on logged data only.</div>
                            </div>
                        )}
                    </>
                )}
            </Section>

            {/* Blood glucose */}
            <Section title="BLOOD GLUCOSE" accentColor={C.blue}
                subtitle="Log readings to spot patterns. Green = in range · Red = high · Blue = low."
                detail={<>
                    <strong style={{ color: "#fff" }}>Target ranges (ADA guidelines):</strong><br />
                    Fasting: 80–130 mg/dL &nbsp;·&nbsp; Post-meal (1hr): under 180 &nbsp;·&nbsp; Post-meal (2hr): under 140 &nbsp;·&nbsp; Bedtime: 100–140<br /><br />
                    <strong style={{ color: C.danger }}>Consistently high:</strong> Causes fatigue, hunger, and requires more insulin — all of which work against weight loss.<br /><br />
                    <strong style={{ color: C.blue }}>Consistently low:</strong> Forces extra carb intake to recover, disrupts calorie control, and can cause rebound highs.<br /><br />
                    <strong style={{ color: C.good }}>In range:</strong> Stable glucose means less corrective insulin — the best environment for weight management.
                </>}
            >
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
                    <select value={gType} onChange={(e) => setGType(e.target.value)} style={{ ...input, cursor: "pointer" }}>
                        {["Fasting", "Post-meal (1hr)", "Post-meal (2hr)", "Bedtime"].map((t) => <option key={t}>{t}</option>)}
                    </select>
                    <div style={{ display: "flex", gap: 6 }}>
                        <input type="number" placeholder="mg/dL" value={gValue} onChange={(e) => setGValue(e.target.value)} style={input} />
                        <button onClick={logGlucose} style={logBtn}>Log</button>
                    </div>
                </div>
                <input placeholder="Note (optional)" value={gNote} onChange={(e) => setGNote(e.target.value)} style={{ ...input, marginBottom: 8 }} />
                {todayGlucose.length === 0
                    ? <div style={{ fontSize: 11, color: "#444", textAlign: "center", padding: "6px 0" }}>No readings today.</div>
                    : todayGlucose.map((r) => (
                        <div key={r.id} className="row" style={row}>
                            <div>
                                <span style={{ fontSize: 11, color: "#ccc" }}>{r.type}</span>
                                <span style={{ fontSize: 10, color: "#555", marginLeft: 6 }}>{r.time}</span>
                                {r.note && <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>{r.note}</div>}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 15, fontWeight: 500, color: glucoseColor(r.type, r.value) }}>{r.value}</span>
                                <span style={{ fontSize: 10, color: "#555" }}>mg/dL</span>
                                <button className="del-btn" onClick={() => removeGlucose(r.id)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 13 }}>✕</button>
                            </div>
                        </div>
                    ))
                }
            </Section>

            {/* Insulin log */}
            <Section title="INSULIN LOG" accentColor={C.warn}
                subtitle={`Today — Bolus: ${totalBolus}u · Basal: ${totalBasal}u`}
                detail={<>
                    <strong style={{ color: "#fff" }}>Bolus (mealtime):</strong> Taken to cover carbs and correct highs. Dose is tied directly to carb intake — consistent net carbs helps keep bolus doses predictable.<br /><br />
                    <strong style={{ color: "#fff" }}>Basal (background):</strong> Keeps blood sugar stable between meals. Usually set by your care team.<br /><br />
                    <strong style={{ color: C.danger }}>Weight impact:</strong> Insulin promotes fat storage. Reducing carb intake (and therefore bolus needs) is one of the most effective weight management levers in T1D — but never skip insulin.
                </>}
            >
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
                    <select value={iType} onChange={(e) => setIType(e.target.value)} style={{ ...input, cursor: "pointer" }}>
                        <option>Bolus</option>
                        <option>Basal</option>
                    </select>
                    <div style={{ display: "flex", gap: 6 }}>
                        <input type="number" placeholder="Units" value={iDose} onChange={(e) => setIDose(e.target.value)} step="0.5" style={input} />
                        <button onClick={logInsulin} style={logBtn}>Log</button>
                    </div>
                </div>
                <input placeholder="Note (optional)" value={iNote} onChange={(e) => setINote(e.target.value)} style={{ ...input, marginBottom: 8 }} />
                {todayInsulin.length === 0
                    ? <div style={{ fontSize: 11, color: "#444", textAlign: "center", padding: "6px 0" }}>No doses logged today.</div>
                    : todayInsulin.map((r) => (
                        <div key={r.id} className="row" style={row}>
                            <div>
                                <span style={{ fontSize: 11, color: "#ccc" }}>{r.type}</span>
                                <span style={{ fontSize: 10, color: "#555", marginLeft: 6 }}>{r.time}</span>
                                {r.note && <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>{r.note}</div>}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 15, fontWeight: 500, color: r.type === "Bolus" ? C.warn : C.blue }}>{r.dose}u</span>
                                <button className="del-btn" onClick={() => removeInsulin(r.id)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 13 }}>✕</button>
                            </div>
                        </div>
                    ))
                }
            </Section>

        </div>
    );
}
