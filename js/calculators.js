// ============================================================
// OreCalc — Protocol math (v2)
// Formulas derived directly from regolith-labs/ore:
//   - program/src/reset.rs   (fee + reward distribution on round reset)
//   - api/src/consts.rs      (ADMIN_FEE_BPS = 100 -> 1%)
// Anything not confirmed directly in source is marked CONFIG below
// and can be edited in one place if Regolith's live values differ.
// ============================================================

const ORE_CONFIG = {
  SQUARES: 25,                 // 5x5 board
  ROUND_ADMIN_FEE: 0.01,       // 1% of the whole round's total deployed — paid from the round's escrow
                                // to the fee collector separately (reset.rs). Confirmed NOT to reduce an
                                // individual miner's own payout — shown as informational only.
  INDIVIDUAL_ADMIN_FEE: 0.01,  // 1% taken off YOUR OWN returned stake specifically, per miner, on claim
                                // (checkpoint.rs: admin_fee = (deployed/100).max(1)). This DOES reduce
                                // what you personally get back — easy to miss, confirmed from source.
  WINNINGS_ADMIN_FEE: 0.01,    // 1%, applied to the losing-tiles pool (reset.rs)
  VAULT_FEE: 0.10,             // 10%, applied to the losing-tiles pool after its own admin fee (reset.rs)
  SPLIT_ODDS: 0.5,             // confirmed in reset.rs comment: 1-in-2 odds the ORE bonus is split vs solo
  BONUS_ORE_PER_ROUND: 1,      // ORE bonus at stake each round (reset.rs: mint_amount, capped near max supply)
  MOTHERLODE_PER_ROUND: 0.2,   // ORE added to the Motherlode pool per round (reset.rs: motherlode_mint_amount)
  ORE_CLAIM_FEE: 0.10,         // 10% taken off ANY ORE (bonus, split, or Motherlode) when you actually claim
                                // it — redistributed to other miners who haven't claimed yet (miner.rs:
                                // claim_ore). Applies whenever treasury.total_unclaimed > 0, which in
                                // practice is essentially always. This was previously missing entirely.
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

  const roundAdminFee = T * ORE_CONFIG.ROUND_ADMIN_FEE; // informational only — paid from the round's
                                                          // escrow to the fee collector; confirmed in
                                                          // checkpoint.rs that this does NOT reduce your
                                                          // individual payout below.
  const { winningsAdminFee, vaultAmount, finalWinnings } = feeCascade(L);

  const yourShare = W > 0 ? Y / W : 0;
  const yourWinningsShare = finalWinnings * yourShare;

  // Your own returned stake on the winning tile also pays its own 1% fee —
  // confirmed in checkpoint.rs: admin_fee = (deployed / 100).max(1 lamport).
  const individualAdminFee = Y * ORE_CONFIG.INDIVIDUAL_ADMIN_FEE;
  const yourKeptStake = Y - individualAdminFee;

  const ifWinReturn = yourKeptStake + yourWinningsShare;
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
    roundAdminFee,
    individualAdminFee,
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

  const grossSplitShareIfWin = yourShare * ORE_CONFIG.BONUS_ORE_PER_ROUND;
  // The 10% claim fee (miner.rs claim_ore) applies when you actually claim —
  // this was missing before, and is the main reason live results ran lower
  // than the calculator.
  const claimFee = grossSplitShareIfWin * ORE_CONFIG.ORE_CLAIM_FEE;
  const netSplitShareIfWin = grossSplitShareIfWin - claimFee;

  const expectedOrePerRoundNet = winProb * ORE_CONFIG.SPLIT_ODDS * netSplitShareIfWin;

  return {
    yourShare,
    winProb,
    grossSplitShareIfWin,
    claimFee,
    netSplitShareIfWin,
    expectedOrePerRoundNet,
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

  const grossPayoutIfHit = mlAmount * yourShare;
  // Same 10% claim fee applies to Motherlode ORE as any other ORE (miner.rs claim_ore).
  const claimFee = grossPayoutIfHit * ORE_CONFIG.ORE_CLAIM_FEE;
  const netPayoutIfHit = grossPayoutIfHit - claimFee;

  return {
    yourShare,
    winProb,
    grossPayoutIfHit,
    claimFee,
    netPayoutIfHit,
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

    document.getElementById("sol-fee-iadmin").textContent = fmt(r.individualAdminFee, 4) + " SOL";
    document.getElementById("sol-fee-wadmin").textContent = fmt(r.winningsAdminFee, 4) + " SOL";
    document.getElementById("sol-fee-vault").textContent = fmt(r.vaultAmount, 4) + " SOL";
    document.getElementById("sol-fee-final").textContent = fmt(r.finalWinnings, 4) + " SOL";
    document.getElementById("sol-fee-radmin").textContent = fmt(r.roundAdminFee, 4) + " SOL";
  });

  // --- ORE Rewards ---
  wireCalculator("form-ore", calcOreRewards, (r) => {
    document.getElementById("ore-out-main").textContent = fmt(r.netSplitShareIfWin, 6) + " ORE";
    document.getElementById("ore-out-winprob").textContent = pct(r.winProb, 2);
    document.getElementById("ore-out-share").textContent = pct(r.yourShare, 2);
    document.getElementById("ore-out-gross").textContent = fmt(r.grossSplitShareIfWin, 6) + " ORE";
    document.getElementById("ore-out-claimfee").textContent = "-" + fmt(r.claimFee, 6) + " ORE";
    document.getElementById("ore-out-expected").textContent = fmt(r.expectedOrePerRoundNet, 6) + " ORE / round";
  });

  // --- Motherlode ---
  wireCalculator("form-motherlode", calcMotherlode, (r) => {
    document.getElementById("ml-out-main").textContent = fmt(r.netPayoutIfHit, 4) + " ORE";
    document.getElementById("ml-out-winprob").textContent = pct(r.winProb, 2);
    document.getElementById("ml-out-share").textContent = pct(r.yourShare, 2);
    document.getElementById("ml-out-gross").textContent = fmt(r.grossPayoutIfHit, 4) + " ORE";
    document.getElementById("ml-out-claimfee").textContent = "-" + fmt(r.claimFee, 4) + " ORE";
  });
});
