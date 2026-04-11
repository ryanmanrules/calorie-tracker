import { useState } from "react";
import { lsGet, lsSet, todayKey } from "../utils/storage";
import { MC } from "../utils/constants";

// Glucose reading types shown in the log entry form
const READING_TYPES = ["Fasting", "Post-meal (1hr)", "Post-meal (2hr)", "Bedtime"];

// Normal ranges in mg/dL for color coding
const RANGES = {
  Fasting:          { low: 70, high: 100 },
  "Post-meal (1hr)": { low: 70, high: 180 },
  "Post-meal (2hr)": { low: 70, high: 140 },
  Bedtime:          { low: 100, high: 140 },
};

// eAG to A1C conversion — standard formula used by ADA
// A1C = (eAG + 46.7) / 28.7
const estimateA1C = (avgGlucose) => ((avgGlucose + 46.7) / 28.7).toFixed(1);

const readingColor = (type, value) => {
  const range = RANGES[type];
  if (!range) return "#fff";
  if (value < range.low)  return "#60a5fa"; // low — blue
  if (value > range.high) return "#ef4444"; // high — red
  return "#22c55e";                          // in range — green
};

const loadGlucoseLog = () => lsGet("ct_glucose", []);
const saveGlucoseLog = (log) => lsSet("ct_glucose", log);

let nextGlucoseId = 1;

export default function DiabetesPanel({ items, dateKey }) {
  const [glucoseLog, setGlucoseLog] = useState(() => loadGlucoseLog());
  const [readingType, setReadingType] = useState("Fasting");
  const [readingValue, setReadingValue] = useState("");
  const [readingNote, setReadingNote] = useState("");

  // Net carbs and sugar derived from today's food log
  const netCarbs = items.reduce((acc, i) => acc + ((i.carbs || 0) - (i.fiber || 0)), 0);
  const totalSugar = items.reduce((acc, i) => acc + (i.sugar || 0), 0);

  // Only show readings for the currently viewed day
  const todayReadings = glucoseLog.filter((r) => r.date === dateKey);

  // A1C estimate uses all readings across all days (needs 90 days ideally)
  const allValues   = glucoseLog.map((r) => r.value);
  const avgGlucose  = allValues.length ? Math.round(allValues.reduce((a, b) => a + b, 0) / allValues.length) : null;
  const a1c         = avgGlucose ? estimateA1C(avgGlucose) : null;

  // Carb distribution — how carbs are spread across meal groups for the day
  const carbsByMeal = ["Morning", "Afternoon", "Evening", "Snack"].map((group) => {
    const groupItems = items.filter((i) => i.time === group);
    const carbs = groupItems.reduce((acc, i) => acc + (i.carbs || 0), 0);
    return { group, carbs };
  }).filter((g) => g.carbs > 0);

  const totalCarbs = items.reduce((acc, i) => acc + (i.carbs || 0), 0);

  const addReading = () => {
    if (!readingValue) return;
    const entry = {
      id:    nextGlucoseId++,
      date:  dateKey,
      type:  readingType,
      value: parseInt(readingValue),
      note:  readingNote.trim(),
      time:  new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    };
    const updated = [entry, ...glucoseLog];
    setGlucoseLog(updated);
    saveGlucoseLog(updated);
    setReadingValue("");
    setReadingNote("");
  };

  const removeReading = (id) => {
    const updated = glucoseLog.filter((r) => r.id !== id);
    setGlucoseLog(updated);
    saveGlucoseLog(updated);
  };

  const card = {
    background: "#242430", border: "1px solid #2e2e3a",
    borderRadius: 12, padding: "14px 16px", marginBottom: 12,
  };

  const inputStyle = {
    width: "100%", background: "#18181f", border: "1px solid #2e2e3a",
    borderRadius: 8, padding: "8px 12px", color: "#e8e8e8",
    fontSize: 13, fontFamily: "inherit", outline: "none",
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 10, letterSpacing: 3, color: "#fff", marginBottom: 14 }}>DIABETES MODE</div>

      {/* Net carbs + sugar summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        <div style={card}>
          <div style={{ fontSize: 20, fontWeight: 500, color: MC.carbs }}>{Math.max(0, Math.round(netCarbs))}g</div>
          <div style={{ fontSize: 9, color: "#fff", letterSpacing: 2, marginTop: 2 }}>NET CARBS</div>
          <div style={{ fontSize: 10, color: "#777", marginTop: 4 }}>carbs minus fiber</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 20, fontWeight: 500, color: "#f472b6" }}>{totalSugar}g</div>
          <div style={{ fontSize: 9, color: "#fff", letterSpacing: 2, marginTop: 2 }}>SUGAR</div>
          <div style={{ fontSize: 10, color: "#777", marginTop: 4 }}>from food log</div>
        </div>
      </div>

      {/* Carb distribution */}
      {carbsByMeal.length > 0 && (
        <div style={{ ...card, marginBottom: 12 }}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: "#fff", marginBottom: 12 }}>CARB DISTRIBUTION</div>
          {carbsByMeal.map(({ group, carbs }) => {
            const pct = totalCarbs > 0 ? (carbs / totalCarbs) * 100 : 0;
            return (
              <div key={group} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: "#ccc" }}>{group}</span>
                  <span style={{ fontSize: 11, color: MC.carbs }}>{carbs}g <span style={{ color: "#666" }}>({Math.round(pct)}%)</span></span>
                </div>
                <div style={{ background: "#2e2e3a", borderRadius: 4, height: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: MC.carbs, borderRadius: 4, transition: "width 0.4s ease" }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Blood glucose log */}
      <div style={card}>
        <div style={{ fontSize: 10, letterSpacing: 2, color: "#fff", marginBottom: 12 }}>BLOOD GLUCOSE LOG</div>

        {/* Entry form */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <select value={readingType} onChange={(e) => setReadingType(e.target.value)}
            style={{ ...inputStyle, cursor: "pointer" }}>
            {READING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              type="number"
              placeholder="mg/dL"
              value={readingValue}
              onChange={(e) => setReadingValue(e.target.value)}
              style={inputStyle}
            />
            <button onClick={addReading} style={{ background: "#f97316", border: "none", borderRadius: 8, padding: "6px 14px", color: "#fff", fontSize: 12, cursor: "pointer", flexShrink: 0 }}>
              Log
            </button>
          </div>
        </div>
        <input
          placeholder="Note (optional — e.g. just woke up, after walk)"
          value={readingNote}
          onChange={(e) => setReadingNote(e.target.value)}
          style={{ ...inputStyle, marginBottom: 12 }}
        />

        {/* Today's readings */}
        {todayReadings.length === 0 ? (
          <div style={{ fontSize: 11, color: "#555", textAlign: "center", padding: "8px 0" }}>No readings logged today.</div>
        ) : (
          todayReadings.map((r) => (
            <div key={r.id} className="row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: 8, background: "#18181f", marginBottom: 4, transition: "background 0.15s" }}>
              <div>
                <div style={{ fontSize: 12, color: "#ccc" }}>{r.type} <span style={{ color: "#555", fontSize: 10 }}>{r.time}</span></div>
                {r.note && <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>{r.note}</div>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 500, color: readingColor(r.type, r.value) }}>{r.value}</span>
                <span style={{ fontSize: 10, color: "#555" }}>mg/dL</span>
                <button className="del-btn" onClick={() => removeReading(r.id)} style={{ background: "none", border: "none", color: "#777", cursor: "pointer", fontSize: 14, padding: "0 2px" }}>✕</button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* A1C estimator */}
      {a1c && (
        <div style={card}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: "#fff", marginBottom: 8 }}>ESTIMATED A1C</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
            <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 36, fontWeight: 800, color: parseFloat(a1c) < 5.7 ? "#22c55e" : parseFloat(a1c) < 6.5 ? "#f97316" : "#ef4444" }}>
              {a1c}%
            </span>
            <span style={{ fontSize: 11, color: "#666" }}>based on {allValues.length} reading{allValues.length !== 1 ? "s" : ""}</span>
          </div>
          <div style={{ fontSize: 10, color: "#555", lineHeight: 1.6 }}>
            This is a rough estimate based on average glucose. Clinical A1C requires a lab test over 90 days. Not a substitute for medical advice.
          </div>
        </div>
      )}
    </div>
  );
}
