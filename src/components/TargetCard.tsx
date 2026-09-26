export function TargetCard({
  label,
  value,
  target,
  unit,
}: {
  label: string;
  value: number;
  target: number;
  unit: string;
}) {
  const percent =
    target > 0 ? Math.min(100, Math.max(0, (value / target) * 100)) : 0;
  return (
    <article className="target">
      <div className="spread">
        <h3>{label}</h3>
        <span>{Math.round(percent)}%</span>
      </div>
      <p>
        <strong>{value.toLocaleString()}</strong> / {target.toLocaleString()}{" "}
        {unit}
      </p>
      <progress aria-label={label} value={percent} max={100} />
    </article>
  );
}
