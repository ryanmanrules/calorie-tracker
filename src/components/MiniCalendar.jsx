import { useState } from "react";
import { todayKey, loadDay } from "../utils/storage";
import { MC } from "../utils/constants";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function MiniCalendar({ current, onChange, onClose }) {
  const [y, m]  = current.split("-").map(Number);
  const [viewYear, setViewYear]   = useState(y);
  const [viewMonth, setViewMonth] = useState(m - 1);

  const today    = todayKey();
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysIn   = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells    = Array(firstDay).fill(null).concat(Array.from({ length: daysIn }, (_, i) => i + 1));

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear((v) => v - 1); setViewMonth(11); }
    else setViewMonth((v) => v - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear((v) => v + 1); setViewMonth(0); }
    else setViewMonth((v) => v + 1);
  };

  const selectDay = (day) => {
    if (!day) return;
    const key = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    onChange(key);
    onClose();
  };

  return (
    <div style={{
      position: "absolute", top: "100%", left: 0, zIndex: 100,
      background: "#242430", border: "1px solid #2e2e3a", borderRadius: 14,
      padding: 16, marginTop: 6, width: 260, boxShadow: "0 8px 32px #000a",
    }}>
      {/* month nav */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <button onClick={prevMonth} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: 16 }}>‹</button>
        <span style={{ fontSize: 12, color: "#fff", letterSpacing: 1 }}>{MONTH_NAMES[viewMonth]} {viewYear}</span>
        <button onClick={nextMonth} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: 16 }}>›</button>
      </div>

      {/* day headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
        {["S","M","T","W","T","F","S"].map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 9, color: "#777", padding: "2px 0" }}>{d}</div>
        ))}
      </div>

      {/* day cells — all selectable */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const key     = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isCur   = key === current;
          const isToday = key === today;
          const hasData = loadDay(key).length > 0;
          return (
            <div key={i} onClick={() => selectDay(day)} style={{
              textAlign: "center", fontSize: 11, padding: "5px 2px", borderRadius: 6,
              cursor: "pointer",
              background: isCur ? "#f97316" : isToday ? "#2e2e3a" : "none",
              color: isCur ? "#fff" : isToday ? "#fff" : "#bbb",
              fontWeight: isCur || isToday ? 600 : 400,
            }}>
              {day}
              {hasData && !isCur && (
                <div style={{ width: 3, height: 3, borderRadius: "50%", background: MC.calories, margin: "1px auto 0" }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
