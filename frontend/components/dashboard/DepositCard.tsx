"use client";
import { useState } from "react";
import { useAccount } from "wagmi";
import { useDeposit } from "@/hooks/useDeposit";
import { useppDOTBalance } from "@/hooks/useppDOTBalance";
import { useExchangeRate } from "@/hooks/useExchangeRate";
import { Card, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { parseDOT, formatDOT, formatRate } from "@/lib/utils";

export function DepositCard() {
  const { address, isConnected } = useAccount();
  const { rate } = useExchangeRate();
  const { dotValue } = useppDOTBalance(address);
  const { deposit, isPending, isSuccess, error, reset } = useDeposit();

  const [amount, setAmount] = useState("");
  const [txError, setTxError] = useState<string | null>(null);

  const amountBig  = parseDOT(amount);
  const PRECISION  = 10n ** 18n;
  const sharesOut  = rate > 0n && amountBig > 0n
    ? (amountBig * PRECISION) / rate
    : 0n;

  const handleDeposit = async () => {
    setTxError(null);
    try {
      await deposit(amountBig);
      setAmount("");
    } catch (e: any) {
      setTxError(e?.message ?? "Transaction failed");
    }
  };

  return (
    <Card>
      <CardHeader
        label="Deposit DOT"
        right={<Badge color="cyan">Earn Yield</Badge>}
      />
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        <Input
          label="Amount"
          value={amount}
          onChange={v => { setAmount(v); reset(); setTxError(null); }}
          suffix="DOT"
          disabled={isPending}
        />

        {/* Preview */}
        <div style={{
          background: "var(--bg)", border: "1px solid var(--border)",
          borderRadius: 3, padding: "10px 12px",
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
        }}>
          <div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: "var(--muted)", marginBottom: 3, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              You receive
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, color: "var(--cyan)" }}>
              {sharesOut > 0n ? formatDOT(sharesOut, 6) : "—"} ppDOT
            </div>
          </div>
          <div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: "var(--muted)", marginBottom: 3, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Rate
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, color: "var(--text)" }}>
              1 ppDOT = {formatRate(rate, 6)} DOT
            </div>
          </div>
        </div>

        {txError && (
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "#FF4466" }}>
            ✕ {txError}
          </div>
        )}
        {isSuccess && (
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "var(--green)" }}>
            ✓ Deposit confirmed
          </div>
        )}

        <Button
          onClick={handleDeposit}
          loading={isPending}
          disabled={!isConnected || amountBig === 0n}
        >
          {!isConnected ? "Connect Wallet" : "Deposit"}
        </Button>
      </div>
    </Card>
  );
}