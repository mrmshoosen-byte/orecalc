// ============================================================
// OreCalc — Configuration
// ============================================================
// Paste your Helius API key below. Get a free one at helius.dev.
// This key will be visible to anyone who views the page source —
// that's fine for a free-tier key (worst case someone burns your
// free quota), but never put a paid/rate-limited key here without
// a server-side proxy in front of it.

const ORE_RPC_CONFIG = {
  HELIUS_API_KEY: "PASTE_YOUR_HELIUS_API_KEY_HERE",
  get RPC_URL() {
    return `https://mainnet.helius-rpc.com/?api-key=${this.HELIUS_API_KEY}`;
  },
  REFRESH_INTERVAL_MS: 20000, // 20 seconds
};
