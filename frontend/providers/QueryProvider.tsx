"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime:            10_000,   // 10 s — on-chain data changes slowly
            gcTime:               60_000,
            refetchInterval:      12_000,   // ~1 block
            retry:                2,
            refetchOnWindowFocus: true,
          },
        },
      })
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}