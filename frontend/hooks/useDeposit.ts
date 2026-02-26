import { useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { polkaPulseCore } from "@/lib/contracts";
import { MIN_DEPOSIT } from "@/constants";
import { useCallback } from "react";

export function useDeposit() {
  const { address } = useAccount();
  const { writeContractAsync, data: hash, isPending, error: writeError, reset } = useWriteContract();

  const { isLoading: isConfirming, isSuccess, error: receiptError } = useWaitForTransactionReceipt({
    hash,
    query: { enabled: !!hash },
  });

  const deposit = useCallback(
    async (amount: bigint) => {
      if (!address) throw new Error("Wallet not connected");
      if (amount < MIN_DEPOSIT) throw new Error("Amount below minimum (0.001 DOT)");

      return writeContractAsync({
        ...polkaPulseCore,
        functionName: "deposit",
        args:         [amount],
      });
    },
    [address, writeContractAsync]
  );

  return {
    deposit,
    hash,
    isPending:    isPending || isConfirming,
    isSuccess,
    error:        writeError ?? receiptError,
    reset,
  };
}