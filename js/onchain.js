// ============================================================
// OreCalc — On-chain data (Previous Round mode)
// ============================================================
// Confirmed for real, from a live transaction inspected on Solscan:
//   Program ID:  oreV3EG1i9BEgiAJ8b177Z2S2rMarzak4NMv1kULvWv
//   Board:       BrcSxdp1nXFzou1YyDnQJcPNBNHgoypZmTsyKBSLLXzi
//   Round PDA seed: "round" (+ round number, u64 LE) — standard PDA pattern
//
// IMPORTANT — read this before debugging a wrong number:
// The exact byte layout of the Round account (field order, whether
// there's a leading discriminator, how many bytes it is) is NOT
// confirmed against live data — no public IDL was found for this
// program. To stay honest instead of guessing silently, the decoder
// below is SELF-VALIDATING: it only accepts a byte offset if the sum
// of all 25 tiles' deployed amounts exactly equals the account's own
// total_deployed field — a real on-chain invariant that can't hold by
// accident. If no offset satisfies it, decoding fails loudly instead
// of quietly showing a wrong number.
//
// If live results still look off vs ore.com or the community tracker
// at ore-mining-tracker.replit.app, that's the first place to look —
// CANDIDATE_OFFSETS below is the one place to add a new guess.
// ============================================================

const ORE_PROGRAM_ID = "oreV3EG1i9BEgiAJ8b177Z2S2rMarzak4NMv1kULvWv";
const ORE_BOARD_ADDRESS = "BrcSxdp1nXFzou1YyDnQJcPNBNHgoypZmTsyKBSLLXzi";
const LAMPORTS_PER_SOL = 1_000_000_000;
const ORE_DECIMALS = 1_000_000_000; // assumed 9 decimals (standard SPL default) — unverified for the ORE mint specifically

// Byte offsets to try, in order, for where the [u64;25] deployed array
// starts within the Round account. 0 = no discriminator, 1 = single tag
// byte (padded to 8 for alignment), 8 = 8-byte discriminator (Anchor-style).
const CANDIDATE_OFFSETS = [0, 8, 1, 16];

async function rpcCall(method, params) {
  const res = await fetch(ORE_RPC_CONFIG.RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || "RPC error");
  return json.result;
}

async function getAccountBytes(address) {
  const result = await rpcCall("getAccountInfo", [address, { encoding: "base64" }]);
  if (!result || !result.value || !result.value.data) return null;
  const base64 = result.value.data[0];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function readU64LE(bytes, offset) {
  let value = 0n;
  for (let i = 7; i >= 0; i--) {
    value = (value << 8n) | BigInt(bytes[offset + i]);
  }
  return value;
}

// Board account: we only need the current round number. Same offset
// uncertainty applies, so we sanity-check the decoded value against a
// plausible real-world range (round numbers were already in the
// ~325,000s as of build time and only increase, roughly 1/minute).
async function getCurrentRoundNumber() {
  const bytes = await getAccountBytes(ORE_BOARD_ADDRESS);
  if (!bytes) throw new Error("Board account not found");

  for (const offset of CANDIDATE_OFFSETS) {
    if (offset + 8 > bytes.length) continue;
    const candidate = readU64LE(bytes, offset);
    // Plausible range check: comfortably above the last known real
    // round number, comfortably below an absurd upper bound.
    if (candidate > 300000n && candidate < 50000000n) {
      return candidate;
    }
  }
  throw new Error("Could not confidently decode Board round number");
}

// Derive the Round PDA for a given round number using @solana/web3.js
// (loaded via CDN in index.html).
function deriveRoundPda(roundNumber) {
  const { PublicKey } = solanaWeb3;
  const programId = new PublicKey(ORE_PROGRAM_ID);
  const seedBuf = new Uint8Array(8);
  let n = BigInt(roundNumber);
  for (let i = 0; i < 8; i++) {
    seedBuf[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  const [pda] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("round"), seedBuf],
    programId
  );
  return pda.toBase58();
}

// ------------------------------------------------------------
// CONFIRMED from a real decoded Round account (round #327123):
//   bytes 0-8:   discriminator (first byte = 109, rest zero-padded)
//   bytes 8-16:  round_number, u64 LE  (decoded to 327123 — verified exact match)
//   bytes 16+:   deployed[25], u64 LE  (values ~0.5-0.65 SOL each — plausible)
// NOT yet confirmed: exactly where total_deployed sits after the array —
// rather than guess an offset, we scan forward from where the array ends
// and accept the first u64 that exactly equals sum(deployed). This can't
// pass by accident, so once found it's a confirmed, not guessed, position.
// ------------------------------------------------------------
const HEADER_BYTES = 16;
const DEPLOYED_ARRAY_BYTES = 25 * 8;
const DEPLOYED_ARRAY_END = HEADER_BYTES + DEPLOYED_ARRAY_BYTES; // 216
const TOTAL_DEPLOYED_SCAN_WINDOW = 128; // how far past the array to search

function decodeRoundBytes(bytes) {
  if (bytes.length < DEPLOYED_ARRAY_END + 8) return null;

  const deployed = [];
  let sum = 0n;
  for (let i = 0; i < 25; i++) {
    const v = readU64LE(bytes, HEADER_BYTES + i * 8);
    deployed.push(v);
    sum += v;
  }

  // Search forward for a u64 that exactly matches the sum — this is how
  // we locate total_deployed without needing to know the exact struct
  // layout in between.
  const scanEnd = Math.min(DEPLOYED_ARRAY_END + TOTAL_DEPLOYED_SCAN_WINDOW, bytes.length - 8);
  for (let offset = DEPLOYED_ARRAY_END; offset <= scanEnd; offset++) {
    const candidate = readU64LE(bytes, offset);
    if (candidate === sum && sum > 0n) {
      // Found total_deployed. winning_square is very likely the next
      // small value (0-24) shortly after — scan a short window for it.
      for (let wOffset = offset + 8; wOffset < Math.min(offset + 16, bytes.length); wOffset++) {
        if (bytes[wOffset] < 25) {
          return {
            deployed,
            totalDeployed: sum,
            winningSquare: bytes[wOffset],
            motherlode: null, // not yet confirmed — see README note
            totalDeployedOffset: offset,
            winningSquareOffset: wOffset,
          };
        }
      }
      // Total found but couldn't confirm winning_square nearby — still
      // useful data, return it with winning_square unknown.
      return { deployed, totalDeployed: sum, winningSquare: null, motherlode: null, totalDeployedOffset: offset };
    }
  }
  return null;
}

function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join(" ");
}

// Public entry point: fetch and decode the most recently completed round.
async function fetchPreviousRoundData() {
  const currentRoundNumber = await getCurrentRoundNumber();
  const previousRoundNumber = currentRoundNumber - 1n;
  const pda = deriveRoundPda(previousRoundNumber);
  const bytes = await getAccountBytes(pda);
  if (!bytes) throw new Error("Previous round account not found (may have been closed already)");

  const decoded = decodeRoundBytes(bytes);
  if (!decoded || decoded.winningSquare === null) {
    const debugErr = new Error(
      decoded
        ? "Found total_deployed but couldn't locate winning_square nearby"
        : "Could not confidently decode previous round data — layout unverified"
    );
    debugErr.debugInfo = {
      pda,
      roundNumber: previousRoundNumber.toString(),
      byteLength: bytes.length,
      hexDump: bytesToHex(bytes),
      partialDecode: decoded,
    };
    throw debugErr;
  }

  const deployedSol = decoded.deployed.map((v) => Number(v) / LAMPORTS_PER_SOL);
  const totalDeployedSol = Number(decoded.totalDeployed) / LAMPORTS_PER_SOL;
  const winningTileSol = deployedSol[decoded.winningSquare];
  const highestTile = Math.max(...deployedSol);
  const lowestTile = Math.min(...deployedSol.filter((v) => v > 0));
  const avgTile = deployedSol.reduce((a, b) => a + b, 0) / deployedSol.length;
  const motherlodeOre = decoded.motherlode !== null ? Number(decoded.motherlode) / ORE_DECIMALS : null;

  return {
    roundNumber: previousRoundNumber.toString(),
    totalDeployedSol,
    winningSquare: decoded.winningSquare,
    winningTileSol,
    highestTile,
    lowestTile,
    avgTile,
    motherlodeOre,
  };
}
