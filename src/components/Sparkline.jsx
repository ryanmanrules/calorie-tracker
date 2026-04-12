export default function Sparkline({ data, color }) {
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
