import clsx from "clsx";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "outline" | "ghost";
  size?:    "sm" | "md";
  loading?: boolean;
}

const variantStyles = {
  primary: {
    background: "var(--pink)", color: "#fff",
    border: "1px solid var(--pink)",
  },
  outline: {
    background: "transparent", color: "var(--pink)",
    border: "1px solid rgba(230,0,122,0.4)",
  },
  ghost: {
    background: "var(--surface2)", color: "var(--muted)",
    border: "1px solid var(--border)",
  },
};

export function Button({
  children, variant = "primary", size = "md",
  loading = false, disabled, className, ...props
}: ButtonProps) {
  const s = variantStyles[variant];
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={className}
      style={{
        ...s,
        padding:        size === "sm" ? "5px 12px" : "10px 20px",
        borderRadius:   3,
        fontFamily:     "'IBM Plex Mono',monospace",
        fontSize:       size === "sm" ? 10 : 12,
        fontWeight:     500,
        letterSpacing:  "0.06em",
        textTransform:  "uppercase",
        cursor:         disabled || loading ? "not-allowed" : "pointer",
        opacity:        disabled || loading ? 0.45 : 1,
        transition:     "opacity 0.15s",
        width:          "100%",
        ...props.style,
      }}
    >
      {loading ? "Processing…" : children}
    </button>
  );
}