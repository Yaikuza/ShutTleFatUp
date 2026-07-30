import type { PlayerLevel } from "../domain/types";

export const levelMeta: Record<PlayerLevel, { icon: string; label: string }> = {
  hell: { icon: "🔥", label: "Hell" },
  human: { icon: "🧑", label: "Human" },
  heaven: { icon: "😇", label: "Heaven" }
};

const levelOrder: PlayerLevel[] = ["hell", "human", "heaven"];

export function LevelSlider({
  value,
  onChange
}: {
  value: PlayerLevel;
  onChange: (level: PlayerLevel) => void;
}) {
  const index = levelOrder.indexOf(value);
  return (
    <label className={`level-slider level-${value}`}>
      <span className="level-labels" aria-hidden="true">
        <i>🔥</i><i>🧑</i><i>😇</i>
      </span>
      <input
        type="range"
        min="0"
        max="2"
        step="1"
        value={index}
        aria-label={`ระดับ ${levelMeta[value].label}`}
        onChange={event => onChange(levelOrder[Number(event.target.value)])}
      />
      <b>{levelMeta[value].label}</b>
    </label>
  );
}
