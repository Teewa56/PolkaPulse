import { ApiPromise, WsProvider } from "@polkadot/api";
import { ASSET_HUB_RPC } from "@/constants";

let _api: ApiPromise | null = null;
let _connecting = false;

export async function getPolkadotApi(): Promise<ApiPromise> {
  if (_api?.isConnected) return _api;
  if (_connecting) {
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (_api?.isConnected) { clearInterval(check); resolve(); }
      }, 100);
    });
    return _api!;
  }
  _connecting = true;
  const provider = new WsProvider(ASSET_HUB_RPC);
  _api = await ApiPromise.create({ provider });
  _connecting = false;
  return _api;
}

export async function getCurrentBlock(): Promise<number> {
  const api = await getPolkadotApi();
  const header = await api.rpc.chain.getHeader();
  return header.number.toNumber();
}

export async function getBlockTimestamp(blockNumber: number): Promise<number> {
  const api = await getPolkadotApi();
  const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
  const ts = await api.query.timestamp.now.at(blockHash);
  return (ts as any).toNumber();
}