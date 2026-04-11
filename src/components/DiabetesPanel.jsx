import { useState } from "react";
import { lsGet, lsSet } from "../utils/storage";

// colour tokens local to this panel
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

let gId = 1;
let iId = 1;

// colour-code a glucose reading against standard T1D targets
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
function Section({ title, subtitle, detail, children }) {
    const [open, setOpen] = useState(false);
    return (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 12, overflow: "hidden" }}>
            <div style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, letterSpacing: 2, color: "#fff" }}>{title}</div>
                        <div style={{ fontSize: 10, color: C.muted, marginTop: 3, lineHeight: 1.5 }}>{subtitle}</div>
                    </div>
                    <button
                        onClick={() => setOpen((v) => !v)}
                        style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 8px", color: C.muted, fontSize: 9, cursor: "pointer", letterSpacing: 1, marginLeft: 10, flexShrink: 0 }}
                    >
                        {open ? "LESS" : "INFO"}
                    </button>
                </div>
                {open && (
                    <div style={{ marginTop: 10, padding: "10px 12px", background: C.deep, borderRadius: 8, fontSize: 11, color: "#aaa", lineHeight: 1.7 }}>
                        {detail}
                    </div>
                )}
            </div>
            <div style={{ padding: "0 14px 14px" }}>{children}</div>
        </div>
    );
}

export default function DiabetesPanel({ netCarbs }) {
    const [glucoseLog, setGlucoseLog] = useState(loadGlucose);
    const [insulinLog, setInsulinLog] = useState(loadInsulin);
    const [gType, setGType] = useState("Fasting");
    const [gValue, setGValue] = useState("");
    const [gNote, setGNote] = useState("");
    const [iType, setIType] = useState("Bolus");
    const [iDose, setIDose] = useState("");
    const [iNote, setINote] = useState("");

    const today = new Date().toISOString().slice(0, 10);
    const todayGlucose = glucoseLog.filter((r) => r.date === today);
    const todayInsulin = insulinLog.filter((r) => r.date === today);
    const totalBolus = todayInsulin.filter((r) => r.type === "Bolus").reduce((a, r) => a + r.dose, 0);
    const totalBasal = todayInsulin.filter((r) => r.type === "Basal").reduce((a, r) => a + r.dose, 0);

    const logGlucose = () => {
        if (!gValue) return;
        const entry = { id: gId++, date: today, type: gType, value: parseInt(gValue), note: gNote.trim(), time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) };
        const updated = [entry, ...glucoseLog];
        setGlucoseLog(updated); saveGlucose(updated);
        setGValue(""); setGNote("");
    };

    const logInsulin = () => {
        if (!iDose) return;
        const entry = { id: iId++, date: today, type: iType, dose: parseFloat(iDose), note: iNote.trim(), time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) };
        const updated = [entry, ...insulinLog];
        setInsulinLog(updated); saveInsulin(updated);
        setIDose(""); setINote("");
    };

    const removeGlucose = (id) => { const u = glucoseLog.filter((r) => r.id !== id); setGlucoseLog(u); saveGlucose(u); };
    const removeInsulin = (id) => { const u = insulinLog.filter((r) => r.id !== id); setInsulinLog(u); saveInsulin(u); };

    const input = { width: "100%", background: C.deep, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", color: "#e8e8e8", fontSize: 12, fontFamily: "inherit", outline: "none" };
    const logBtn = { background: "#f97316", border: "none", borderRadius: 8, padding: "7px 14px", color: "#fff", fontSize: 12, cursor: "pointer", flexShrink: 0 };
    const row = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", borderRadius: 8, background: C.deep, marginBottom: 4 };

    return (
        <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, letterSpacing: 3, color: "#fff", marginBottom: 12 }}>DIABETES MODE</div>

            {/* Net carbs */}
            <Section
                title="NET CARBS TODAY"
                subtitle="Total carbs minus fiber — the carbs that actually raise blood sugar."
                detail={
                    <>
                        <strong style={{ color: "#fff" }}>Why it matters for weight:</strong> In T1D, carbs drive insulin demand. Higher insulin doses promote fat storage and make weight loss harder. Keeping net carbs consistent helps stabilize doses and gives your body a better chance to lose weight steadily.
                        <br /><br />
                        <strong style={{ color: C.good }}>Helps:</strong> Lower, consistent net carbs → more predictable blood sugar → lower insulin doses → easier weight management.
                        <br />
                        <strong style={{ color: C.danger }}>Hurts:</strong> High or erratic carb intake → blood sugar spikes → higher correction doses → more insulin → harder to lose weight.
                    </>
                }
            >
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 28, fontWeight: 600, color: netCarbs > 150 ? C.warn : C.good }}>{netCarbs}g</span>
                    <span style={{ fontSize: 11, color: C.muted }}>net carbs</span>
                </div>
            </Section>

            {/* Blood glucose */}
            <Section
                title="BLOOD GLUCOSE"
                subtitle="Log readings to spot patterns. Green = in range · Red = high · Blue = low."
                detail={
                    <>
                        <strong style={{ color: "#fff" }}>Target ranges (ADA guidelines):</strong>
                        <br />Fasting: 80–130 mg/dL &nbsp;·&nbsp; Post-meal (1hr): under 180 &nbsp;·&nbsp; Post-meal (2hr): under 140 &nbsp;·&nbsp; Bedtime: 100–140
                        <br /><br />
                        <strong style={{ color: C.danger }}>Consistently high:</strong> Causes fatigue, hunger, and requires more insulin — all of which work against weight loss.
                        <br /><br />
                        <strong style={{ color: C.blue }}>Consistently low:</strong> Forces extra carb intake to recover, disrupts calorie control, and can cause rebound highs.
                        <br /><br />
                        <strong style={{ color: C.good }}>In range:</strong> Stable glucose means less corrective insulin and more predictable energy — the best environment for weight management.
                    </>
                }
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
                {todayGlucose.length === 0 ? (
                    <div style={{ fontSize: 11, color: "#444", textAlign: "center", padding: "6px 0" }}>No readings today.</div>
                ) : todayGlucose.map((r) => (
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
                ))}
            </Section>

            {/* Insulin log */}
            <Section
                title="INSULIN LOG"
                subtitle={`Today — Bolus: ${totalBolus}u · Basal: ${totalBasal}u`}
                detail={
                    <>
                        <strong style={{ color: "#fff" }}>Bolus (mealtime):</strong> Taken to cover carbs and correct highs. Dose size is directly tied to carb intake — another reason consistent net carbs helps.
                        <br /><br />
                        <strong style={{ color: "#fff" }}>Basal (background):</strong> Keeps blood sugar stable between meals and overnight. Usually set by your care team.
                        <br /><br />
                        <strong style={{ color: C.danger }}>Weight impact:</strong> Insulin is anabolic — it promotes fat storage. This doesn't mean take less than prescribed, but reducing carb intake (and therefore bolus needs) is one of the most effective levers for T1D weight management.
                        <br /><br />
                        <strong style={{ color: C.good }}>Goal:</strong> Smaller, consistent bolus doses through stable carb intake — never skip insulin, which is extremely dangerous.
                    </>
                }
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
                <input placeholder="Note (optional — e.g. before dinner, correction)" value={iNote} onChange={(e) => setINote(e.target.value)} style={{ ...input, marginBottom: 8 }} />
                {todayInsulin.length === 0 ? (
                    <div style={{ fontSize: 11, color: "#444", textAlign: "center", padding: "6px 0" }}>No doses logged today.</div>
                ) : todayInsulin.map((r) => (
                    <div key={r.id} className="row" style={row}>
                        <div>
                            <span style={{ fontSize: 11, color: "#ccc" }}>{r.type}</span>
                            <span style={{ fontSize: 10, color: "#555", marginLeft: 6 }}>{r.time}</span>
                            {r.note && <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>{r.note}</div>}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 15, fontWeight: 500, color: r.type === "Bolus" ? "#f97316" : C.blue }}>{r.dose}u</span>
                            <button className="del-btn" onClick={() => removeInsulin(r.id)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 13 }}>✕</button>
                        </div>
                    </div>
                ))}
            </Section>

            {/* General T1D guidance */}
            <Section
                title="T1D & WEIGHT MANAGEMENT"
                subtitle="Key principles for losing weight with Type 1 diabetes. Tap INFO to read."
                detail={
                    <>
                        <strong style={{ color: C.good }}>What helps:</strong>
                        <br />• Consistent carb intake day to day — reduces insulin variability
                        <br />• Higher protein — promotes satiety without raising blood sugar much
                        <br />• More fiber — slows glucose absorption, reduces post-meal spikes
                        <br />• Eating at regular times — makes dosing more predictable
                        <br />• Moderate activity — improves insulin sensitivity over time
                        <br /><br />
                        <strong style={{ color: C.danger }}>What hurts:</strong>
                        <br />• Skipping insulin to lose weight — extremely dangerous, causes serious complications
                        <br />• High-carb meals with large bolus doses — spikes and crashes promote fat storage
                        <br />• Frequent lows — forces extra carb intake and disrupts calorie targets
                        <br />• Inconsistent meal timing — makes blood sugar and doses harder to predict
                        <br /><br />
                        <strong style={{ color: "#fff" }}>Important:</strong> Always work with your care team before making significant diet changes. This app is a tracking tool, not medical advice.
                    </>
                }
            >
                <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
                    Tap INFO above for key T1D weight management principles.
                </div>
            </Section>
        </div>
    );
}