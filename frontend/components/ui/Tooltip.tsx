"use client";
import { useState, type ReactNode } from "react";

interface TooltipProps {
  content:  string;
  children: ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  return (
    <span
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span style={{
          position: "absolute", bottom: "calc(100% + 6px)", left: "50%",
          transform: "translateX(-50%)", whiteSpace: "nowrap",
          background: "var(--surface2)", border: "1px solid var(--border)",
          borderRadius: 3, padding: "4px 8px", zIndex: 50,
          fontFamily: "'IBM Plex Mono',monospace", fontSize: 10,
          color: "var(--text)", pointerEvents: "none",
        }}>
          {content}
        </span>
      )}
    </span>
  );
}