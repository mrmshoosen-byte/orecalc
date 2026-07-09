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

// Self-validating Round decoder. Tries each candidate offset for where
// deployed[25] begins, and only accepts it if sum(deployed) exactly
// equals the total_deployed field found immediately after the array —
// a real invariant, not a guess.
function decodeRoundBytes(bytes) {
  for (const offset of CANDIDATE_OFFSETS) {
    const arrayStart = offset;
    const arrayBytes = 25 * 8;
    const totalOffset = arrayStart + arrayBytes;
    const winningSquareOffset = totalOffset + 8;

    if (winningSquareOffset + 1 > bytes.length) continue;

    const deployed = [];
    let sum = 0n;
    for (let i = 0; i < 25; i++) {
      const v = readU64LE(bytes, arrayStart + i * 8);
      deployed.push(v);
      sum += v;
    }
    const totalDeployed = readU64LE(bytes, totalOffset);

    if (sum === totalDeployed && totalDeployed > 0n) {
      const winningSquare = bytes[winningSquareOffset];
      if (winningSquare >= 0 && winningSquare < 25) {
        // Found a self-consistent layout.
        let motherlode = null;
        const motherlodeOffset = winningSquareOffset + 8; // best-effort, unverified
        if (motherlodeOffset + 8 <= bytes.length) {
          motherlode = readU64LE(bytes, motherlodeOffset);
        }
        return { deployed, totalDeployed, winningSquare, motherlode, offsetUsed: offset };
      }
    }
  }
  return null; // nothing validated — caller should fall back to manual
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
  if (!decoded) {
    const debugErr = new Error("Could not confidently decode previous round data — layout unverified");
    debugErr.debugInfo = {
      pda,
      roundNumber: previousRoundNumber.toString(),
      byteLength: bytes.length,
      hexDump: bytesToHex(bytes.slice(0, 120)),
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
