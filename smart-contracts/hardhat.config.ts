import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ignition";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
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
            chainId: 31337,
        },
        localhost: {
            url: "http://127.0.0.1:8545",
        },
        assetHub: {
            url: process.env.ASSET_HUB_RPC || "",
            accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
            chainId: 420420421,
        },
        assetHubMainnet: {
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

    gasReporter: {
        enabled: process.env.REPORT_GAS === "true",
        currency: "USD",
        outputFile: "gas-report.txt",
        noColors: true,
    },

    typechain: {
        outDir: "typechain-types",
        target: "ethers-v6",
    },
};

export default config;