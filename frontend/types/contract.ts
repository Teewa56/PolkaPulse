import type { Abi } from "viem";

export const POLKAPULSE_CORE_ABI = [
  // Views
  { name: "exchangeRate",  type: "function", stateMutability: "view",       inputs: [],                                       outputs: [{ type: "uint256" }] },
  { name: "totalDOT",      type: "function", stateMutability: "view",       inputs: [],                                       outputs: [{ type: "uint256" }] },
  { name: "harvestReady",  type: "function", stateMutability: "view",       inputs: [],                                       outputs: [{ type: "bool"    }] },
  { name: "sharesToDOT",   type: "function", stateMutability: "view",       inputs: [{ name: "shares", type: "uint128" }],    outputs: [{ type: "uint128" }] },
  { name: "dotToShares",   type: "function", stateMutability: "view",       inputs: [{ name: "dot",    type: "uint128" }],    outputs: [{ type: "uint128" }] },
  { name: "paused",        type: "function", stateMutability: "view",       inputs: [],                                       outputs: [{ type: "bool"    }] },
  { name: "protocolFeeBps",type: "function", stateMutability: "view",       inputs: [],                                       outputs: [{ type: "uint32"  }] },
  // Writes
  { name: "deposit",          type: "function", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint128" }],    outputs: [{ name: "shares", type: "uint128" }] },
  { name: "withdraw",         type: "function", stateMutability: "nonpayable", inputs: [{ name: "shares", type: "uint128" }],    outputs: [{ name: "dot",    type: "uint128" }] },
  { name: "executeYieldLoop", type: "function", stateMutability: "nonpayable", inputs: [],                                       outputs: [] },
  // Events
  { name: "Deposited",        type: "event", inputs: [{ name: "user",          type: "address", indexed: true  }, { name: "dotAmount",    type: "uint128", indexed: false }, { name: "sharesIssued", type: "uint128", indexed: false }, { name: "exchangeRate", type: "uint256", indexed: false }] },
  { name: "Withdrawn",        type: "event", inputs: [{ name: "user",          type: "address", indexed: true  }, { name: "sharesBurned", type: "uint128", indexed: false }, { name: "dotReturned",  type: "uint128", indexed: false }, { name: "exchangeRate", type: "uint256", indexed: false }] },
  { name: "Rebased",          type: "event", inputs: [{ name: "oldRate",       type: "uint256", indexed: false }, { name: "newRate",      type: "uint256", indexed: false }, { name: "yieldDot",     type: "uint128", indexed: false }] },
  { name: "YieldLoopExecuted",type: "event", inputs: [{ name: "executor",      type: "address", indexed: true  }, { name: "hydraDXAmount",type: "uint128", indexed: false }, { name: "interlayAmount",type:"uint128", indexed: false }, { name: "projectedApyBps", type: "uint32", indexed: false }, { name: "expectedYieldDot", type: "uint128", indexed: false }] },
] as const satisfies Abi;

export const PPDOT_ABI = [
  { name: "balanceOf",    type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }],          outputs: [{ type: "uint256" }] },
  { name: "sharesOf",     type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }],          outputs: [{ type: "uint256" }] },
  { name: "totalSupply",  type: "function", stateMutability: "view", inputs: [],                                               outputs: [{ type: "uint256" }] },
  { name: "totalShares",  type: "function", stateMutability: "view", inputs: [],                                               outputs: [{ type: "uint256" }] },
  { name: "exchangeRate", type: "function", stateMutability: "view", inputs: [],                                               outputs: [{ type: "uint256" }] },
  { name: "decimals",     type: "function", stateMutability: "view", inputs: [],                                               outputs: [{ type: "uint8"   }] },
  { name: "symbol",       type: "function", stateMutability: "view", inputs: [],                                               outputs: [{ type: "string"  }] },
  { name: "allowance",    type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "approve",      type: "function", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { name: "Rebase",       type: "event", inputs: [{ name: "oldRate", type: "uint256", indexed: false }, { name: "newRate", type: "uint256", indexed: false }, { name: "yieldDot", type: "uint128", indexed: false }] },
] as const satisfies Abi;

export const CORETIME_ARBITRAGE_ABI = [
  { name: "treasury",            type: "function", stateMutability: "view", inputs: [],                                        outputs: [{ type: "uint128" }] },
  { name: "minPurchaseAmount",   type: "function", stateMutability: "view", inputs: [],                                        outputs: [{ type: "uint128" }] },
  { name: "coretimeFractionBps", type: "function", stateMutability: "view", inputs: [],                                        outputs: [{ type: "uint32"  }] },
  { name: "currentEpoch",        type: "function", stateMutability: "view", inputs: [],                                        outputs: [{ type: "uint32"  }] },
  { name: "lastEpochAt",         type: "function", stateMutability: "view", inputs: [],                                        outputs: [{ type: "uint256" }] },
  { name: "epochReady",          type: "function", stateMutability: "view", inputs: [],                                        outputs: [{ type: "bool"    }] },
  { name: "isPartner",           type: "function", stateMutability: "view", inputs: [{ name: "parachainId", type: "uint32" }], outputs: [{ type: "bool"    }] },
  { name: "partnerBoostedApyBps",type: "function", stateMutability: "view", inputs: [{ name: "parachainId", type: "uint32" }], outputs: [{ type: "uint32"  }] },
  { name: "getPartners",         type: "function", stateMutability: "view", inputs: [],                                        outputs: [{ type: "uint32[]"}] },
  { name: "triggerEpoch",        type: "function", stateMutability: "nonpayable", inputs: [],                                  outputs: [] },
  { name: "CoretimePurchased",   type: "event", inputs: [{ name: "epoch", type: "uint32", indexed: true }, { name: "dotSpent", type: "uint128", indexed: false }, { name: "coretimeNFT", type: "uint256", indexed: false }] },
  { name: "CoretimeAssigned",    type: "event", inputs: [{ name: "parachainId", type: "uint32", indexed: true }, { name: "coretimeNFT", type: "uint256", indexed: false }, { name: "boostedApyBps", type: "uint32", indexed: false }] },
] as const satisfies Abi;

export const REWARD_MONITOR_ABI = [
  { name: "harvestReady",    type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "bool"    }] },
  { name: "pendingRewards",  type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint128" }] },
  { name: "rewardThreshold", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint128" }] },
  { name: "lastHarvestAt",   type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const satisfies Abi;