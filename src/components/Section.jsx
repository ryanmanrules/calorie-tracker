import { useState } from "react";

const C = {
    warn: "#f97316",
    muted: "#777",
    border: "#2e2e3a",
    card: "#242430",
    deep: "#18181f",
};

export default function Section({ title, subtitle, detail, children, accentColor }) {
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
