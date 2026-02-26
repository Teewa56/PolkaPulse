import { formatUnits, parseUnits } from "viem";
import { DOT_DECIMALS, BPS_DENOMINATOR } from "@/constants";
import { formatDistanceToNow } from "date-fns";

// ─── DOT Formatting ───────────────────────────────────────────────────────────

export function formatDOT(value: bigint, digits = 4): string {
  const formatted = formatUnits(value, DOT_DECIMALS);
  const num = parseFloat(formatted);
  if (num === 0) return "0";
  if (num < 0.0001) return "< 0.0001";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatDOTCompact(value: bigint): string {
  const num = parseFloat(formatUnits(value, DOT_DECIMALS));
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000)     return `${(num / 1_000).toFixed(2)}K`;
  return num.toFixed(2);
}

export function formatRate(rate: bigint, digits = 8): string {
  return parseFloat(formatUnits(rate, DOT_DECIMALS)).toFixed(digits);
}

export function parseDOT(value: string): bigint {
  try { return parseUnits(value, DOT_DECIMALS); }
  catch { return 0n; }
}

// ─── BPS / APY ────────────────────────────────────────────────────────────────

export function bpsToPercent(bps: number | bigint, digits = 2): string {
  const n = typeof bps === "bigint" ? Number(bps) : bps;
  return (n / 100).toFixed(digits) + "%";
}

export function percentToBps(pct: number): number {
  return Math.round(pct * 100);
}

// ─── Timestamps ───────────────────────────────────────────────────────────────

export function timeAgo(timestamp: number): string {
  return formatDistanceToNow(new Date(timestamp * 1000), { addSuffix: true });
}

export function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// ─── Countdown ───────────────────────────────────────────────────────────────

export function formatCountdown(seconds: number): { h: string; m: string; s: string } {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return {
    h: String(h).padStart(2, "0"),
    m: String(m).padStart(2, "0"),
    s: String(s).padStart(2, "0"),
  };
}

// ─── Address ─────────────────────────────────────────────────────────────────

export function truncateAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ─── Misc ────────────────────────────────────────────────────────────────────

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function isZeroAddress(addr: string): boolean {
  return !addr || addr === "0x" || addr === "0x0000000000000000000000000000000000000000";
}