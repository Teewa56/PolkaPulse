import { useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { polkaPulseCore } from "@/lib/contracts";
import { useCallback } from "react";

export function useWithdraw() {
    const { address } = useAccount();
    const { writeContractAsync, data: hash, isPending, error: writeError, reset } = useWriteContract();

    const { isLoading: isConfirming, isSuccess, error: receiptError } = useWaitForTransactionReceipt({
        hash,
        query: { enabled: !!hash },
    });

    const withdraw = useCallback(
        async (shares: bigint) => {
        if (!address) throw new Error("Wallet not connected");
        if (shares === 0n)    throw new Error("Share amount must be greater than zero");

        return writeContractAsync({
            ...polkaPulseCore,
            functionName: "withdraw",
            args:         [shares],
        });
        },
        [address, writeContractAsync]
    );

    return {
        withdraw,
        hash,
        isPending:    isPending || isConfirming,
        isSuccess,
        error:        writeError ?? receiptError,
        reset,
    };
}