export interface YieldStats {
  totalDOT:       bigint;
  exchangeRate:   bigint;
  apyBps:         number;
  harvestReady:   boolean;
  lastHarvestAt:  bigint;
}

export interface UserPosition {
  ppDOTBalance:   bigint;   // raw shares
  dotValue:       bigint;   // shares × rate
  dotEarned:      bigint;   // dotValue − initial deposit (approximation)
  entryRate:      bigint;   // rate at first deposit (not stored on-chain; estimated)
}

export interface RebaseEvent {
  epoch:      number;
  txHash:     string;
  blockNumber: bigint;
  oldRate:    bigint;
  newRate:    bigint;
  yieldDot:   bigint;
  timestamp:  number;
}

export interface YieldLoopEvent {
  txHash:            string;
  blockNumber:       bigint;
  executor:          string;
  hydraDXAmount:     bigint;
  interlayAmount:    bigint;
  projectedApyBps:   number;
  expectedYieldDot:  bigint;
  timestamp:         number;
}

export interface PartnerParachain {
  parachainId:     number;
  name:            string;
  isActive:        boolean;
  boostedApyBps:   number;
  allocationPct:   number;
}

export interface CoretimeData {
  treasury:           bigint;
  minPurchaseAmount:  bigint;
  coretimeFractionBps: number;
  currentEpoch:       number;
  lastEpochAt:        bigint;
  epochReady:         boolean;
  partners:           PartnerParachain[];
}

export interface DepositParams {
  amount: bigint;
}

export interface WithdrawParams {
  shares: bigint;
}