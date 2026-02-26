export function Spinner({ size = 16, color = "var(--pink)" }: { size?: number; color?: string }) {
  return (
    <span style={{
      display: "inline-block", width: size, height: size,
      border: `2px solid ${color}30`,
      borderTopColor: color,
      borderRadius: "50%",
      animation: "spin 0.8s linear infinite",
    }} />
  );
}