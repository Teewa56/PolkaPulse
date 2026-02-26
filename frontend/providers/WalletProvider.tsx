"use client";
import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider }                 from "wagmi";
import { type ReactNode }                from "react";
import { wagmiConfig }                   from "@/lib/wagmi.config";
import { QueryProvider }                 from "./QueryProvider";

export function WalletProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryProvider>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor:          "#E6007A",
            accentColorForeground:"#ffffff",
            borderRadius:         "small",
            fontStack:            "system",
            overlayBlur:          "small",
          })}
          locale="en-US"
        >
          {children}
        </RainbowKitProvider>
      </QueryProvider>
    </WagmiProvider>
  );
}