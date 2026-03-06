import { defineConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import "@nomicfoundation/hardhat-ignition-viem";
import * as dotenv from "dotenv";

dotenv.config();

const config = defineConfig({
    solidity: {
        version: "0.8.20",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
            viaIR: true,
        },
    },

    networks: {
        hardhat: {
            type: "edr-simulated",
            chainId: 31337,
        },
        localhost: {
            type: "http",
            url: "http://127.0.0.1:8545",
        },
        assetHub: {
            type: "http",
            url: process.env.ASSET_HUB_RPC || "",
            accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
            chainId: 420420421,
        },
        assetHubMainnet: {
            type: "http",
            url: process.env.ASSET_HUB_MAINNET_RPC || "",
            accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
            chainId: 420420420,
        },
    },


    paths: {
        sources:   "./contracts",
        tests:     "./test",
        cache:     "./cache",
        artifacts: "./artifacts",
    },
});

export default config;