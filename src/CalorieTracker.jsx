import { useState, useRef, useEffect } from "react";
import MiniCalendar from "./components/MiniCalendar";
import GoalsPanel   from "./components/GoalsPanel";
import FoodLog      from "./components/FoodLog";
import SearchPanel     from "./components/SearchPanel";
import DiabetesPanel  from "./components/DiabetesPanel";
import WeightPanel     from "./components/WeightPanel";
import { MC, DEFAULT_GOALS } from "./utils/constants";
import { lsGet, lsSet, todayKey, toDateKey, loadDay, saveDay } from "./utils/storage";

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
  const [mealTime, setMealTime]     = useState(() => {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return "Morning";
    if (h >= 12 && h < 17) return "Afternoon";
    if (h >= 17) return "Evening";
    return "Evening"; // midnight–5am
  });
  const [diabetesMode, setDiabetesMode] = useState(() => lsGet("ct_diabetes_mode", false));
  const [logKey, setLogKey] = useState(0);
  const calRef = useRef(null);

  const isToday = dateKey === todayKey();
  const BUDGET  = goals.calories || 2300;

  // consecutive days with at least one entry, ending today
  const streak = (() => {
    let count = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      const dk = toDateKey(d);
      const hasData = dk === dateKey ? items.length > 0 : loadDay(dk).length > 0;
      if (!hasData) break;
      count++;
    }
    return count;
  })();

  // last 7 days for the adherence dots
  const weekDots = (() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today); d.setDate(today.getDate() - (6 - i));
      const dk = toDateKey(d);
      const hasData = dk === dateKey ? items.length > 0 : loadDay(dk).length > 0;
      return { dk, hasData, isToday: 6 - i === 0 };
    });
  })();

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

  // Switch to today if the date rolls over while the app is open
  useEffect(() => {
    const handler = () => {
      if (!document.hidden && dateKey !== todayKey()) switchDay(todayKey());
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [dateKey]);

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

  const netCarbs  = Math.max(0, totals.carbs - totals.fiber);
  const remaining = BUDGET - totals.calories;
  const pct       = Math.min((totals.calories / BUDGET) * 100, 100);
  const barColor  = pct < 70 ? "#22c55e" : pct < 90 ? "#f97316" : "#ef4444";
  const dayComplete = items.length > 0 && totals.calories >= BUDGET * 0.75 && totals.calories <= BUDGET * 1.05;

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

  // 7-day average net carbs for the current meal time slot — used in plan mode
  const weeklyMealAvg = (() => {
    const days = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayItems = loadDay(key).filter((it) => it.time === mealTime);
      if (dayItems.length) {
        const net = dayItems.reduce((acc, it) => acc + Math.max(0, (it.carbs || 0) - (it.fiber || 0)), 0);
        days.push(net);
      }
    }
    return days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null;
  })();

  const addItem = (item) => {
    setItems((prev) => [...prev, { id: nextId++, ...item }]);
    setLogKey((k) => k + 1);
  };

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

  const card = {
    background: "#242430",
    border: dayComplete ? "1px solid #22c55e55" : "1px solid #2e2e3a",
    borderRadius: 16, padding: "20px", marginBottom: 20,
    boxShadow: dayComplete ? "0 0 0 1px #22c55e22, 0 4px 24px #22c55e18" : "none",
    transition: "border 0.4s ease, box-shadow 0.4s ease",
    position: "relative",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#242430", color: "#e8e8e8", fontFamily: "'DM Mono', 'Courier New', monospace", padding: "32px 20px", maxWidth: 580, margin: "0 auto" }}>
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
        @keyframes cal-pop {
          0%   { transform: scale(1); }
          45%  { transform: scale(1.08); }
          100% { transform: scale(1); }
        }
        .cal-pop { animation: cal-pop 350ms cubic-bezier(0.34, 1.56, 0.64, 1); display: inline-block; }
        .dot-glow { box-shadow: 0 0 0 2px #18181f, 0 0 0 3.5px #22c55e88; }
      `}</style>

      {/* date display + streak */}
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
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
        {streak >= 1 && (
          <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 800, color: "#f97316", lineHeight: 1 }}>{streak}</div>
            <div style={{ fontSize: 9, color: "#777", letterSpacing: 2, marginTop: 2 }}>DAY STREAK</div>
          </div>
        )}
      </div>

      {/* weekly adherence dots */}
      <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 20 }}>
        {weekDots.map(({ dk, hasData, isToday: isTodayDot }) => (
          <button key={dk} onClick={() => switchDay(dk)} title={dk}
            className={isTodayDot ? "dot-glow" : ""}
            style={{ width: 10, height: 10, borderRadius: "50%", border: "none", padding: 0, cursor: "pointer",
              background: hasData ? "#22c55e" : "#2e2e3a",
              opacity: hasData ? 1 : 0.45,
              transition: "background 0.3s ease",
            }}
          />
        ))}
      </div>

      {/* calorie totals + macro progress */}
      <div style={card}>
        {dayComplete && (
          <div style={{ position: "absolute", top: 14, right: 16, fontSize: 9, letterSpacing: 2, color: "#22c55e", background: "#22c55e18", border: "1px solid #22c55e44", borderRadius: 6, padding: "3px 7px" }}>
            ✓ ON TRACK
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14, paddingTop: dayComplete ? 22 : 0, transition: "padding-top 0.4s ease" }}>
          <div>
            <div key={logKey} className={logKey > 0 ? "cal-pop" : ""} style={{ fontFamily: "'Syne', sans-serif", fontSize: 42, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{totals.calories.toLocaleString()}</div>
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
              {label === "CARBS" && diabetesMode ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: 18, fontWeight: 500, color: met === null ? color : goalColor(met) }}>{val}g</span>
                    <span style={{ fontSize: 18, fontWeight: 500, color: met === null ? MC.carbs : goalColor(met) }}>{netCarbs}g</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 2 }}>
                    <div style={{ fontSize: 9, color: "#fff", letterSpacing: 2, whiteSpace: "nowrap" }}>{label}</div>
                    <div style={{ fontSize: 9, color: "#555", whiteSpace: "nowrap" }}>|</div>
                    <div style={{ fontSize: 9, color: "#fff", letterSpacing: 2, whiteSpace: "nowrap" }}>NET CARBS</div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: 18, fontWeight: 500, color: met === null ? color : goalColor(met) }}>{val}g</span>
                    {goal != null && <span style={{ fontSize: 10, color: goalColor(met) }}>/ {goal}g</span>}
                  </div>
                  <div style={{ fontSize: 9, color: "#fff", letterSpacing: 2, marginTop: 2 }}>{label}</div>
                </>
              )}
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
      {true ? (
        <SearchPanel mealTime={mealTime} setMealTime={setMealTime} onAdd={addItem} diabetesMode={diabetesMode} weeklyMealAvg={weeklyMealAvg} todayNetCarbs={netCarbs} />
      ) : (
        <div style={{ fontSize: 12, color: "#777", textAlign: "center", padding: "12px 0" }}>
          Viewing past day — <span onClick={() => switchDay(todayKey())} style={{ color: MC.calories, cursor: "pointer" }}>go to today</span> to add entries.
        </div>
      )}

      {/* weight tracking + insights (hidden in diabetes mode — DiabetesPanel covers weight there) */}
      {!diabetesMode && <WeightPanel dateKey={dateKey} calorieGoal={BUDGET} />}

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
        {diabetesMode && <DiabetesPanel netCarbs={netCarbs} allItems={items.map((i) => ({ ...i, date: dateKey }))} dateKey={dateKey} />}
      </div>

      <div style={{ fontSize: 10, color: "#777", textAlign: "center", letterSpacing: 1, marginTop: 8 }}>
        USDA FOODDATA CENTRAL
      </div>
    </div>
  );
}
