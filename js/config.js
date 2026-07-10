

const ORE_RPC_CONFIG = {
  HELIUS_API_KEY: "bf8e76d6-d2b3-4567-a1aa-b9869b8fdad9",
  get RPC_URL() {
    return `https://mainnet.helius-rpc.com/?api-key=${this.HELIUS_API_KEY}`;
  },
  REFRESH_INTERVAL_MS: 20000, // 20 seconds
};
