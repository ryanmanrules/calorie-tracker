import { useState, useRef, useEffect } from "react";
import MiniCalendar from "./components/MiniCalendar";
import GoalsPanel   from "./components/GoalsPanel";
import FoodLog      from "./components/FoodLog";
import SearchPanel     from "./components/SearchPanel";
import DiabetesPanel  from "./components/DiabetesPanel";
import { MC, DEFAULT_GOALS } from "./utils/constants";
import { lsGet, lsSet, todayKey, loadDay, saveDay } from "./utils/storage";

let nextId = 1;

const formatDisplay = (dateKey) => {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d)
    .toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
    .toUpperCase();
};

export default function CalorieTracker() {
  const [goals, setGoals]     = useState(() => lsGet("ct_goals", DEFAULT_GOALS));
  const [dateKey, setDateKey] = useState(todayKey);
  const [items, setItems]     = useState(() => loadDay(todayKey()));
  const [showCal, setShowCal] = useState(false);
  const [mealTime, setMealTime]     = useState("Morning");
  const [diabetesMode, setDiabetesMode] = useState(() => lsGet("ct_diabetes_mode", false));
  const calRef = useRef(null);

  const isToday = dateKey === todayKey();
  const BUDGET  = goals.calories || 2300;

  // Persist the current day's items on every change
  useEffect(() => { saveDay(dateKey, items); }, [items, dateKey]);

  const switchDay = (key) => {
    setDateKey(key);
    setItems(loadDay(key));
    setShowCal(false);
  };

  // Close calendar when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (calRef.current && !calRef.current.contains(e.target)) setShowCal(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const totals = items.reduce(
    (acc, i) => ({
      calories: acc.calories + (i.calories || 0),
      protein:  acc.protein  + (i.protein  || 0),
      fat:      acc.fat      + (i.fat      || 0),
      carbs:    acc.carbs    + (i.carbs    || 0),
      fiber:    acc.fiber    + (i.fiber    || 0),
    }),
    { calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 }
  );

  const remaining = BUDGET - totals.calories;
  const pct       = Math.min((totals.calories / BUDGET) * 100, 100);
  const barColor  = pct < 70 ? "#22c55e" : pct < 90 ? "#f97316" : "#ef4444";

  // Returns null when no goal is set (pill renders in its default color),
  // true/false when there is one so we can drive border and progress bar color
  const metMin    = (val, goal) => goal == null ? null : val >= goal;  // protein, fiber: higher is better
  const metMax    = (val, goal) => goal == null ? null : val <= goal;  // carbs, fat: lower is better
  const goalColor = (met) => met == null ? "#888" : met ? "#22c55e" : "#ef4444";

  // Drive the summary pills from a single array so adding a new macro is one line
  const macroPills = [
    { label: "PROTEIN", val: totals.protein, goal: goals.protein,  color: MC.protein, met: metMin(totals.protein, goals.protein)  },
    { label: "CARBS",   val: totals.carbs,   goal: goals.carbsMax, color: MC.carbs,   met: metMax(totals.carbs,   goals.carbsMax)  },
    { label: "FAT",     val: totals.fat,     goal: goals.fatMax,   color: MC.fat,     met: metMax(totals.fat,     goals.fatMax)    },
    { label: "FIBER",   val: totals.fiber,   goal: goals.fiberMin, color: MC.fiber,   met: metMin(totals.fiber,   goals.fiberMin)  },
  ];

  const addItem = (item) => setItems((prev) => [...prev, { id: nextId++, ...item }]);

  const removeItem = (id) => setItems((prev) => prev.filter((i) => i.id !== id));

  const editItem = (id, calories) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, calories } : i)));
  };

  const toggleDiabetesMode = () => {
    setDiabetesMode((v) => {
      lsSet("ct_diabetes_mode", !v);
      return !v;
    });
  };

  const card = { background: "#242430", border: "1px solid #2e2e3a", borderRadius: 16, padding: "20px", marginBottom: 20 };

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

      {/* date display + calendar toggle */}
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

      {/* calorie totals + macro progress */}
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

        {/* 2x2 grid, color coded against goals when set */}
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

      {/* collapsible goals editor */}
      <GoalsPanel goals={goals} onChange={setGoals} />

      {/* grouped by meal time */}
      <FoodLog items={items} onRemove={removeItem} onEdit={editItem} />

      {/* only shown on today — past days are read-only */}
      {isToday ? (
        <SearchPanel mealTime={mealTime} setMealTime={setMealTime} onAdd={addItem} />
      ) : (
        <div style={{ fontSize: 12, color: "#777", textAlign: "center", padding: "12px 0" }}>
          Viewing past day — <span onClick={() => switchDay(todayKey())} style={{ color: MC.calories, cursor: "pointer" }}>go to today</span> to add entries.
        </div>
      )}

      {/* diabetes mode toggle + panel */}
      <div style={{ borderTop: "1px solid #2e2e3a", paddingTop: 20, marginTop: 8 }}>
        <button
          onClick={toggleDiabetesMode}
          style={{
            width: "100%", background: diabetesMode ? "#2e2e3a" : "none",
            border: "1px solid #2e2e3a", borderRadius: 10, padding: "10px 16px",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            cursor: "pointer", marginBottom: diabetesMode ? 16 : 0,
          }}
        >
          <span style={{ fontSize: 10, letterSpacing: 3, color: "#fff" }}>DIABETES MODE</span>
          <span style={{ fontSize: 10, color: diabetesMode ? "#22c55e" : "#555", letterSpacing: 1 }}>
            {diabetesMode ? "ON" : "OFF"}
          </span>
        </button>
        {diabetesMode && <DiabetesPanel items={items} dateKey={dateKey} />}
      </div>

      <div style={{ fontSize: 10, color: "#777", textAlign: "center", letterSpacing: 1, marginTop: 8 }}>
        USDA FOODDATA CENTRAL
      </div>
    </div>
  );
}
