// ============================================================
// OreCalc — Protocol math (v2)
// Formulas derived directly from regolith-labs/ore:
//   - program/src/reset.rs   (fee + reward distribution on round reset)
//   - api/src/consts.rs      (ADMIN_FEE_BPS = 100 -> 1%)
// Anything not confirmed directly in source is marked CONFIG below
// and can be edited in one place if Regolith's live values differ.
// ============================================================

const ORE_CONFIG = {
  SQUARES: 25,                // 5x5 board
  ADMIN_FEE: 0.01,            // 1%, flat, informational (paid from the round separately — see reset.rs)
  WINNINGS_ADMIN_FEE: 0.01,   // 1%, applied to the losing-tiles pool
  VAULT_FEE: 0.10,            // 10%, applied to the losing-tiles pool after its own admin fee
  SPLIT_ODDS: 0.5,            // confirmed in reset.rs comment: 1-in-2 odds the ORE bonus is split vs solo
  BONUS_ORE_PER_ROUND: 1,     // ORE bonus at stake each round
  MOTHERLODE_PER_ROUND: 0.2,  // ORE added to the Motherlode pool per round
  // NOT directly confirmed in the source files we could pull (the relevant
  // file is marked "// TODO Integrate admin fee" as of this build) — sourced
  // from community/media reporting. Update here if the real figure differs.
  MOTHERLODE_TRIGGER_ODDS: 1 / 625,
};

function fmt(n, decimals = 4) {
  if (!isFinite(n)) return "—";
  return n.toFixed(decimals);
}
function pct(n, decimals = 2) {
  if (!isFinite(n)) return "—";
  return (n * 100).toFixed(decimals) + "%";
}

// ------------------------------------------------------------
// Shared fee cascade — mirrors reset.rs exactly.
// L = the pool contributed by every tile that did NOT win.
// ------------------------------------------------------------
function feeCascade(L) {
  const winningsAdminFee = L * ORE_CONFIG.WINNINGS_ADMIN_FEE;
  const winningsAfterAdmin = L - winningsAdminFee;
  const vaultAmount = winningsAfterAdmin * ORE_CONFIG.VAULT_FEE;
  const finalWinnings = winningsAfterAdmin - vaultAmount;
  return { winningsAdminFee, vaultAmount, finalWinnings };
}

// ------------------------------------------------------------
// 1) SOLO CHANCE
// Explicitly conditional: the headline number assumes the tile you're
// on IS the winning tile. The chance that's even true (1/25) is shown
// as separate, added context — not folded into the main figure.
// ------------------------------------------------------------
function calcSoloChance(yourStake, tileTotal) {
  const blockWinProb = 1 / ORE_CONFIG.SQUARES;
  const yourShare = tileTotal > 0 ? yourStake / tileTotal : 0;

  // Main stat: given your tile wins, chance YOU are the solo recipient
  const soloChanceIfWin = ORE_CONFIG.SPLIT_ODDS * yourShare;

  // Added context: the unconditional, full picture
  const unconditionalChance = blockWinProb * soloChanceIfWin;

  return {
    blockWinProb,
    yourShare,
    soloChanceIfWin,
    unconditionalChance,
  };
}

// ------------------------------------------------------------
// 2) SOL REWARDS  (multi-tile)
//   Y  = your SOL staked on EACH tile you cover (same amount per tile)
//   N  = number of tiles you're covering (out of 25)
//   O  = average SOL staked by OTHER people on a tile (excl. you), assumed
//        roughly uniform across all 25 tiles — this is your only real
//        unknown, since you can't see other players' full positions live.
// ------------------------------------------------------------
function calcSolRewards(yourStakePerTile, numTiles, tileTotal) {
  const Y = yourStakePerTile;
  const N = Math.min(Math.max(Math.round(numTiles), 0), ORE_CONFIG.SQUARES);
  const W = tileTotal; // total deployed on a tile you cover (including you), if it's the winner
  const O = Math.max(W - Y, 0); // average OTHER-only stake per tile, derived, used for the 25-N tiles you don't cover

  const totalInvested = N * Y;
  const T = N * Y + ORE_CONFIG.SQUARES * O; // total deployed across the whole round
  const L = Math.max(T - W, 0); // pool from all non-winning tiles

  const totalAdminFee = T * ORE_CONFIG.ADMIN_FEE; // informational — see reset.rs note
  const { winningsAdminFee, vaultAmount, finalWinnings } = feeCascade(L);

  const yourShare = W > 0 ? Y / W : 0;
  const yourWinningsShare = finalWinnings * yourShare;

  const ifWinReturn = Y + yourWinningsShare; // you keep your own stake on the winning tile + your cut
  const ifWinNet = ifWinReturn - totalInvested; // net vs. everything you put across all N tiles
  const ifLoseNet = -totalInvested; // if the winner isn't one of your tiles, all N*Y is forfeited

  const winProb = N / ORE_CONFIG.SQUARES;
  const expectedNet = winProb * ifWinNet + (1 - winProb) * ifLoseNet;
  const expectedNetPct = totalInvested > 0 ? expectedNet / totalInvested : 0;

  return {
    totalInvested,
    winProb,
    ifWinReturn,
    ifWinNet,
    ifLoseNet,
    expectedNet,
    expectedNetPct,
    totalAdminFee,
    winningsAdminFee,
    vaultAmount,
    finalWinnings,
  };
}

// ------------------------------------------------------------
// 3) ORE (SPL) REWARDS — split-round scenario
// Headline assumes: this is a split round AND your tile wins.
// Your cut of the 1 ORE bonus is your stake share on that tile.
// ------------------------------------------------------------
function calcOreRewards(yourStakePerTile, numTiles, tileTotal) {
  const Y = yourStakePerTile;
  const N = Math.min(Math.max(Math.round(numTiles), 0), ORE_CONFIG.SQUARES);
  const W = tileTotal; // total deployed on this tile, including you
  const yourShare = W > 0 ? Y / W : 0;
  const winProb = N / ORE_CONFIG.SQUARES;

  const yourSplitShareIfWin = yourShare * ORE_CONFIG.BONUS_ORE_PER_ROUND;
  const expectedOrePerRound = winProb * ORE_CONFIG.SPLIT_ODDS * yourSplitShareIfWin;

  return {
    yourShare,
    winProb,
    yourSplitShareIfWin,
    expectedOrePerRound,
    splitOdds: ORE_CONFIG.SPLIT_ODDS,
  };
}

// ------------------------------------------------------------
// 4) MOTHERLODE — deterministic payout
// Given the pool has already triggered on a round your tile wins,
// here's exactly what you'd get. No trigger-probability guesswork.
// ------------------------------------------------------------
function calcMotherlode(yourStakePerTile, numTiles, tileTotal, mlAmount) {
  const Y = yourStakePerTile;
  const N = Math.min(Math.max(Math.round(numTiles), 0), ORE_CONFIG.SQUARES);
  const W = tileTotal; // total deployed on this tile, including you
  const yourShare = W > 0 ? Y / W : 0;
  const winProb = N / ORE_CONFIG.SQUARES;

  const yourPayoutIfHit = mlAmount * yourShare;

  return {
    yourShare,
    winProb,
    yourPayoutIfHit,
  };
}

// ============================================================
// Wiring: form -> output
// ============================================================
function wireCalculator(formId, computeFn, render) {
  const form = document.getElementById(formId);
  if (!form) return;
  const inputs = form.querySelectorAll("input[type='number']");

  function update() {
    const values = Array.from(inputs).map((i) => parseFloat(i.value) || 0);
    const result = computeFn(...values);
    render(result);
  }

  inputs.forEach((i) => i.addEventListener("input", update));
  update();
}

document.addEventListener("DOMContentLoaded", () => {
  // --- Solo Chance ---
  wireCalculator("form-solo", calcSoloChance, (r) => {
    document.getElementById("solo-out-main").textContent = pct(r.soloChanceIfWin, 2);
    document.getElementById("solo-out-block").textContent = pct(r.blockWinProb, 2);
    document.getElementById("solo-out-share").textContent = pct(r.yourShare, 2);
    document.getElementById("solo-out-full").textContent = pct(r.unconditionalChance, 4);
  });

  // --- SOL Rewards ---
  wireCalculator("form-sol", calcSolRewards, (r) => {
    document.getElementById("sol-out-expected").textContent = (r.expectedNet >= 0 ? "+" : "") + fmt(r.expectedNet, 4) + " SOL";
    document.getElementById("sol-out-expected-pct").textContent = (r.expectedNetPct >= 0 ? "+" : "") + pct(r.expectedNetPct, 2);
    document.getElementById("sol-out-expected").classList.toggle("neg", r.expectedNet < 0);

    document.getElementById("sol-out-winprob").textContent = pct(r.winProb, 2);
    document.getElementById("sol-out-winreturn").textContent = fmt(r.ifWinReturn, 4) + " SOL";
    document.getElementById("sol-out-winnet").textContent = (r.ifWinNet >= 0 ? "+" : "") + fmt(r.ifWinNet, 4) + " SOL";
    document.getElementById("sol-out-losenet").textContent = fmt(r.ifLoseNet, 4) + " SOL";

    document.getElementById("sol-fee-admin").textContent = fmt(r.totalAdminFee, 4) + " SOL";
    document.getElementById("sol-fee-wadmin").textContent = fmt(r.winningsAdminFee, 4) + " SOL";
    document.getElementById("sol-fee-vault").textContent = fmt(r.vaultAmount, 4) + " SOL";
    document.getElementById("sol-fee-final").textContent = fmt(r.finalWinnings, 4) + " SOL";
  });

  // --- ORE Rewards ---
  wireCalculator("form-ore", calcOreRewards, (r) => {
    document.getElementById("ore-out-main").textContent = fmt(r.yourSplitShareIfWin, 6) + " ORE";
    document.getElementById("ore-out-winprob").textContent = pct(r.winProb, 2);
    document.getElementById("ore-out-share").textContent = pct(r.yourShare, 2);
    document.getElementById("ore-out-expected").textContent = fmt(r.expectedOrePerRound, 6) + " ORE / round";
  });

  // --- Motherlode ---
  wireCalculator("form-motherlode", calcMotherlode, (r) => {
    document.getElementById("ml-out-main").textContent = fmt(r.yourPayoutIfHit, 4) + " ORE";
    document.getElementById("ml-out-winprob").textContent = pct(r.winProb, 2);
    document.getElementById("ml-out-share").textContent = pct(r.yourShare, 2);
  });
});
