import { MC } from "../utils/constants";

export default function MacroLine({ protein, carbs, fat, fiber, serving }) {
  return (
    <div style={{ fontSize: 10, marginTop: 2 }}>
      {serving && <span style={{ color: "#fff" }}>{serving} &nbsp;·&nbsp; </span>}
      <span style={{ color: MC.protein }}>P:{protein}g</span>
      <span style={{ color: "#888" }}> &nbsp;·&nbsp; </span>
      <span style={{ color: MC.carbs }}>C:{carbs}g</span>
      <span style={{ color: "#888" }}> &nbsp;·&nbsp; </span>
      <span style={{ color: MC.fat }}>F:{fat}g</span>
      <span style={{ color: "#888" }}> &nbsp;·&nbsp; </span>
      <span style={{ color: MC.fiber }}>Fi:{fiber}g</span>
    </div>
  );
}
