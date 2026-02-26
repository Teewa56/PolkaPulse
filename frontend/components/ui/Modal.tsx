"use client";
import { type ReactNode, useEffect } from "react";

interface ModalProps {
  open:       boolean;
  onClose:    () => void;
  title:      string;
  children:   ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(8,8,9,0.85)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 4, width: "100%", maxWidth: 440, overflow: "hidden",
          animation: "fadeUp 0.2s ease",
        }}
      >
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 16px", borderBottom: "1px solid var(--border)",
          background: "var(--surface2)",
        }}>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "var(--text)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {title}
          </span>
          <button onClick={onClose} style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 16, color: "var(--muted)", background: "none", border: "none", cursor: "pointer" }}>
            ✕
          </button>
        </div>
        <div style={{ padding: 16 }}>{children}</div>
      </div>
    </div>
  );
}