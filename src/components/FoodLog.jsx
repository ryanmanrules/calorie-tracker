import { useState } from "react";
import MacroLine from "./MacroLine";
import { GROUPS, MC } from "../utils/constants";

export default function FoodLog({ items, onRemove, onEdit }) {
  const [editId, setEditId]   = useState(null);
  const [editCals, setEditCals] = useState("");

  const startEdit = (item) => {
    setEditId(item.id);
    setEditCals(item.calories);
  };

  const saveEdit = () => {
    onEdit(editId, parseInt(editCals));
    setEditId(null);
  };

  if (items.length === 0) {
    return <div style={{ fontSize: 11, color: "#777", textAlign: "center", padding: "20px 0" }}>No entries for this day.</div>;
  }

  return (
    <div style={{ marginBottom: 20 }}>
      {GROUPS.map((group) => {
        const groupItems = items.filter((i) => i.time === group);
        if (!groupItems.length) return null;
        return (
          <div key={group} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, letterSpacing: 3, color: "#fff", marginBottom: 8 }}>{group.toUpperCase()}</div>
            {groupItems.map((item) => (
              <div key={item.id} className="row" style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 12px", borderRadius: 10, background: "#18181f",
                marginBottom: 4, transition: "background 0.15s",
              }}>
                <div style={{ flex: 1, paddingRight: 12 }}>
                  <div style={{ fontSize: 13, color: "#fff" }}>{item.name}</div>
                  <MacroLine
                    protein={item.protein}
                    carbs={item.carbs}
                    fat={item.fat}
                    fiber={item.fiber || 0}
                    serving={item.serving}
                  />
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {editId === item.id ? (
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        type="number"
                        value={editCals}
                        onChange={(e) => setEditCals(e.target.value)}
                        style={{ width: 70, background: "#2e2e3a", border: "1px solid #f97316", borderRadius: 6, padding: "2px 8px", color: "#fff", fontSize: 13, outline: "none" }}
                        autoFocus
                      />
                      <button onClick={saveEdit} style={{ background: "#f97316", border: "none", borderRadius: 6, padding: "2px 10px", color: "#fff", fontSize: 12, cursor: "pointer" }}>OK</button>
                      <button onClick={() => setEditId(null)} style={{ background: "#2e2e3a", border: "none", borderRadius: 6, padding: "2px 8px", color: "#aaa", fontSize: 12, cursor: "pointer" }}>✕</button>
                    </div>
                  ) : (
                    <span
                      onClick={() => startEdit(item)}
                      style={{ fontSize: 14, fontWeight: 500, color: MC.calories, cursor: "pointer", minWidth: 40, textAlign: "right" }}
                      title="Click to edit"
                    >
                      {item.calories}
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: "#666" }}>kcal</span>
                  <button className="del-btn" onClick={() => onRemove(item.id)} style={{ background: "none", border: "none", color: "#777", cursor: "pointer", fontSize: 14, padding: "0 2px" }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
