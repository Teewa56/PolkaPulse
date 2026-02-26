interface InputProps {
  label:      string;
  value:      string;
  onChange:   (v: string) => void;
  suffix?:    string;
  maxLabel?:  string;
  onMax?:     () => void;
  disabled?:  boolean;
  error?:     string;
}

export function Input({
  label, value, onChange, suffix = "DOT",
  maxLabel, onMax, disabled, error,
}: InputProps) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{
          fontFamily: "'IBM Plex Mono',monospace", fontSize: 10,
          color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase",
        }}>
          {label}
        </span>
        {maxLabel && onMax && (
          <button onClick={onMax} style={{
            fontFamily: "'IBM Plex Mono',monospace", fontSize: 10,
            color: "var(--pink)", cursor: "pointer", background: "none", border: "none",
          }}>
            MAX {maxLabel}
          </button>
        )}
      </div>
      <div style={{
        display: "flex", alignItems: "center",
        background: "var(--surface2)", border: `1px solid ${error ? "#FF4466" : "var(--border)"}`,
        borderRadius: 3, overflow: "hidden",
      }}>
        <input
          type="number"
          min="0"
          step="any"
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          placeholder="0.00"
          style={{
            flex: 1, padding: "10px 12px", background: "transparent",
            fontFamily: "'IBM Plex Mono',monospace", fontSize: 14,
            color: "var(--text)", border: "none",
          }}
        />
        <span style={{
          padding: "0 12px", fontFamily: "'IBM Plex Mono',monospace", fontSize: 11,
          color: "var(--muted)", borderLeft: "1px solid var(--border)",
          background: "var(--bg)", alignSelf: "stretch", display: "flex", alignItems: "center",
        }}>
          {suffix}
        </span>
      </div>
      {error && (
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "#FF4466", marginTop: 4, display: "block" }}>
          {error}
        </span>
      )}
    </div>
  );
}