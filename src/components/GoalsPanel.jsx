import { useState } from "react";
import { MC } from "../utils/constants";
import { lsSet } from "../utils/storage";

// Reusable input row so each goal field is consistently structured
function GoalField({ label, goalKey, placeholder, color, draft, setDraft }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, color, letterSpacing: 2, marginBottom: 4 }}>{label}</div>
      <input
        type="number"
        placeholder={placeholder}
        value={draft[goalKey] ?? ""}
        onChange={(e) => setDraft((prev) => ({
          ...prev,
          [goalKey]: e.target.value === "" ? null : Number(e.target.value),
        }))}
        style={{
          width: "100%", background: "#18181f", border: "1px solid #2e2e3a",
          borderRadius: 8, padding: "8px 12px", color: "#e8e8e8",
          fontSize: 13, fontFamily: "inherit", outline: "none",
        }}
      />
    </div>
  );
}

// Collapsible panel for editing the calorie budget and optional macro targets.
export default function GoalsPanel({ goals, onChange }) {
  const [open, setOpen]   = useState(false);
  const [draft, setDraft] = useState(goals);

  // Persist draft goals to localStorage and propagate to parent state.
  const save = () => {
    onChange(draft);
    lsSet("ct_goals", draft);
    setOpen(false);
  };

  return (
    <div style={{ background: "#242430", border: "1px solid #2e2e3a", borderRadius: 16, marginBottom: 20, overflow: "hidden" }}>
      <button onClick={() => setOpen((v) => !v)} style={{
        width: "100%", background: "none", border: "none", padding: "14px 20px",
        display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer",
      }}>
        <span style={{ fontSize: 10, letterSpacing: 2, color: "#fff" }}>GOALS & BUDGET</span>
        <span style={{
          fontSize: 12, color: "#777", display: "inline-block",
          transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0deg)",
        }}>▾</span>
      </button>

      {open && (
        <div style={{ padding: "0 20px 20px" }}>
          <div style={{ borderTop: "1px solid #2e2e3a", marginBottom: 16 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <GoalField label="CALORIE BUDGET" goalKey="calories" placeholder="e.g. 2300" color={MC.calories} draft={draft} setDraft={setDraft} />
            </div>
            <GoalField label="PROTEIN GOAL (min g)" goalKey="protein"  placeholder="optional" color={MC.protein} draft={draft} setDraft={setDraft} />
            <GoalField label="CARBS LIMIT (max g)"  goalKey="carbsMax" placeholder="optional" color={MC.carbs}   draft={draft} setDraft={setDraft} />
            <GoalField label="FAT LIMIT (max g)"    goalKey="fatMax"   placeholder="optional" color={MC.fat}     draft={draft} setDraft={setDraft} />
            <GoalField label="FIBER GOAL (min g)"   goalKey="fiberMin" placeholder="optional" color={MC.fiber}   draft={draft} setDraft={setDraft} />
          </div>
          <button onClick={save} style={{
            width: "100%", background: "#f97316", border: "none", borderRadius: 8,
            padding: "10px", color: "#fff", fontSize: 13, cursor: "pointer", marginTop: 4,
          }}>
            SAVE GOALS
          </button>
        </div>
      )}
    </div>
  );
}
