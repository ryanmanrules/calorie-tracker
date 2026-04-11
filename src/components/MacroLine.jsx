import { MC } from "../utils/constants";

export default function MacroLine({ protein, carbs, fat, fiber, serving }) {
  return (
    <div style={{ fontSize: 10, marginTop: 2 }}>
      {serving && <span style={{ color: "#777" }}>{serving} &nbsp;·&nbsp; </span>}
      <span style={{ color: MC.protein }}>PRO {protein}g</span>
      <span style={{ color: "#555" }}> &nbsp;·&nbsp; </span>
      <span style={{ color: MC.carbs }}>CARBS {carbs}g</span>
      <span style={{ color: "#555" }}> &nbsp;·&nbsp; </span>
      <span style={{ color: MC.fat }}>FAT {fat}g</span>
      <span style={{ color: "#555" }}> &nbsp;·&nbsp; </span>
      <span style={{ color: MC.fiber }}>FIBER {fiber}g</span>
    </div>
  );
}
