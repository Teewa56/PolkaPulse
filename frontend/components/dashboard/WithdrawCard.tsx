"use client";
import { useState } from "react";
import { useAccount } from "wagmi";
import { useWithdraw } from "@/hooks/useWithdraw";
import { useppDOTBalance } from "@/hooks/useppDOTBalance";
import { useExchangeRate } from "@/hooks/useExchangeRate";
import { Card, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { parseDOT, formatDOT, formatRate } from "@/lib/utils";

export function WithdrawCard() {
  const { address, isConnected } = useAccount();
  const { rate } = useExchangeRate();
  const { shares: maxShares } = useppDOTBalance(address);
  const { withdraw, isPending, isSuccess, error, reset } = useWithdraw();

  const [amount, setAmount] = useState("");
  const [txError, setTxError] = useState<string | null>(null);

  const sharesBig = parseDOT(amount);
  const PRECISION = 10n ** 18n;
  const dotOut    = rate > 0n && sharesBig > 0n
    ? (sharesBig * rate) / PRECISION
    : 0n;

  const handleWithdraw = async () => {
    setTxError(null);
    try {
      await withdraw(sharesBig);
      setAmount("");
    } catch (e: any) {
      setTxError(e?.message ?? "Transaction failed");
    }
  };

  return (
    <Card>
      <CardHeader
        label="Withdraw"
        right={<Badge color="green">ppDOT → DOT</Badge>}
      />
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        <Input
          label="ppDOT Shares"
          value={amount}
          onChange={v => { setAmount(v); reset(); setTxError(null); }}
          suffix="ppDOT"
          maxLabel={maxShares > 0n ? formatDOT(maxShares, 4) : undefined}
          onMax={() => setAmount(formatDOT(maxShares, 6).replace(/,/g, ""))}
          disabled={isPending}
        />

        <div style={{
          background: "var(--bg)", border: "1px solid var(--border)",
          borderRadius: 3, padding: "10px 12px",
        }}>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: "var(--muted)", marginBottom: 3, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            You receive
          </div>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, color: "var(--green)" }}>
            {dotOut > 0n ? formatDOT(dotOut, 6) : "—"} DOT
          </div>
        </div>

        {txError && (
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "#FF4466" }}>
            ✕ {txError}
          </div>
        )}
        {isSuccess && (
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "var(--green)" }}>
            ✓ Withdrawal confirmed
          </div>
        )}

        <Button
          variant="outline"
          onClick={handleWithdraw}
          loading={isPending}
          disabled={!isConnected || sharesBig === 0n || sharesBig > maxShares}
        >
          {!isConnected ? "Connect Wallet" : "Withdraw"}
        </Button>
      </div>
    </Card>
  );
}