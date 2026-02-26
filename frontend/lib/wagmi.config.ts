import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { defineChain } from "viem";
import { ASSET_HUB_CHAIN_ID } from "@/constants";

export const assetHubWestend = defineChain({
    id:          ASSET_HUB_CHAIN_ID,
    name:        "Asset Hub Westend",
    nativeCurrency: { name: "WND", symbol: "WND", decimals: 18 },
    rpcUrls: {
        default:    { http: ["https://westend-asset-hub-eth-rpc.polkadot.io"] },
        public:     { http: ["https://westend-asset-hub-eth-rpc.polkadot.io"] },
    },
    blockExplorers: {
        default: { name: "Subscan", url: "https://assethub-westend.subscan.io" },
    },
    testnet: true,
});

export const assetHubPolkadot = defineChain({
    id:          420420420,
    name:        "Asset Hub Polkadot",
    nativeCurrency: { name: "DOT", symbol: "DOT", decimals: 18 },
    rpcUrls: {
        default:    { http: ["https://polkadot-asset-hub-rpc.polkadot.io"] },
        public:     { http: ["https://polkadot-asset-hub-rpc.polkadot.io"] },
    },
    blockExplorers: {
        default: { name: "Subscan", url: "https://assethub-polkadot.subscan.io" },
    },
});

export const wagmiConfig = getDefaultConfig({
    appName:    "PolkaPulse",
    projectId:  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "",
    chains:     [assetHubWestend, assetHubPolkadot],
    ssr:        true,
});