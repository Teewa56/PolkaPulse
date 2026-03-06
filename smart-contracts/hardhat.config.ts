import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { defineConfig } from "hardhat/config";
import dotenv from 'dotenv';
dotenv.config();

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.20",
        settings: {
          evmVersion: "shanghai",
          optimizer: { enabled: true, runs: 200 },
        },
      },
      production: {
        version: "0.8.20",
        settings: {
          evmVersion: "shanghai",
          optimizer: { enabled: true, runs: 200 },
        },
      },
    },
  },
  networks: {
    polkadotHubTestnet: {
      type: "http",
      chainType: "l1",
      url: `${process.env.ASSET_HUB_RPC}`,
      chainId: 420420417,
      accounts: [`${process.env.PRIVATE_KEY}`],
    },
  },
});
