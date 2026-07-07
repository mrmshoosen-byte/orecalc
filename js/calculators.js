// ============================================================
// OreCalc — Protocol math
// Formulas derived directly from regolith-labs/ore:
//   - program/src/reset.rs   (fee + reward distribution on round reset)
//   - api/src/consts.rs      (ADMIN_FEE_BPS = 100 -> 1%)
// Anything not confirmed directly in source is marked CONFIG below
// and can be edited in one place if Regolith's live values differ.
// ============================================================

const ORE_CONFIG = {
  SQUARES: 25,                // 5x5 board
  ADMIN_FEE: 0.01,            // 1%, applied to total round deployed
  WINNINGS_ADMIN_FEE: 0.01,   // 1%, applied again specifically to the losing-square pool
  VAULT_FEE: 0.10,            // 10%, applied to the losing-square pool after its admin fee
  SPLIT_ODDS: 0.5,            // confirmed in reset.rs comment: 1-in-2 odds the ORE bonus is split vs solo
  BONUS_ORE_PER_ROUND: 1,     // ORE bonus at stake each round
  MOTHERLODE_PER_ROUND: 0.2,  // ORE added to the Motherlode pool per round
  // NOT directly confirmed in the source files we could pull (repo fee logic
  // is marked "// TODO Integrate admin fee" as of this build) — sourced from
  // community/media reporting. Update here if Regolith publishes the exact figure.
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
// 1) SOLO CHANCE
// P(this block wins) = 1/25
// P(bonus this round is a solo drop, not split) = 1/2
// P(you specifically are the recipient | solo & block wins) = your stake / total stake on block
// ------------------------------------------------------------
function calcSoloChance(yourStake, blockTotal) {
  const blockWinProb = 1 / ORE_CONFIG.SQUARES;
  const yourShare = blockTotal > 0 ? yourStake / blockTotal : 0;
  const soloWinProb = blockWinProb * ORE_CONFIG.SPLIT_ODDS * yourShare;
  return {
    blockWinProb,
    yourShare,
    soloWinProb,
  };
}

// ------------------------------------------------------------
// 2) SOL REWARDS  (mirrors reset.rs step by step)
//   T = total SOL deployed across the whole round (all 25 blocks)
//   W = total SOL deployed on the winning block
//   Y = your SOL on the winning block
// ------------------------------------------------------------
function calcSolRewards(yourStake, blockTotal, totalDeployed) {
  const T = totalDeployed;
  const W = blockTotal;
  const Y = yourStake;
  const L = Math.max(T - W, 0); // pool from the 24 losing blocks

  const totalAdminFee = T * ORE_CONFIG.ADMIN_FEE;
  const winningsAdminFee = L * ORE_CONFIG.WINNINGS_ADMIN_FEE;
  const winningsAfterAdmin = L - winningsAdminFee;
  const vaultAmount = winningsAfterAdmin * ORE_CONFIG.VAULT_FEE;
  const finalWinnings = winningsAfterAdmin - vaultAmount;

  const yourShare = W > 0 ? Y / W : 0;
  const yourWinningsShare = finalWinnings * yourShare;
  const yourTotalReturn = Y + yourWinningsShare; // your own stake is retained + your cut of winnings
  const netGain = yourTotalReturn - Y;
  const netPct = Y > 0 ? netGain / Y : 0;

  return {
    L,
    totalAdminFee,
    winningsAdminFee,
    vaultAmount,
    finalWinnings,
    yourWinningsShare,
    yourTotalReturn,
    netGain,
    netPct,
    blockWinProb: 1 / ORE_CONFIG.SQUARES,
  };
}

// ------------------------------------------------------------
// 3) ORE (SPL) REWARDS
// Expected ORE per round = P(block wins) * yourShare * BONUS_ORE
// (identical in expectation whether the round resolves solo or split,
//  since a proportional lottery and a proportional split have the same EV —
//  they differ in variance, not expected value)
// ------------------------------------------------------------
function calcOreRewards(yourStake, blockTotal) {
  const blockWinProb = 1 / ORE_CONFIG.SQUARES;
  const yourShare = blockTotal > 0 ? yourStake / blockTotal : 0;
  const expectedOrePerRound = blockWinProb * yourShare * ORE_CONFIG.BONUS_ORE_PER_ROUND;
  return {
    blockWinProb,
    yourShare,
    expectedOrePerRound,
    soloOdds: ORE_CONFIG.SPLIT_ODDS,
    splitOdds: 1 - ORE_CONFIG.SPLIT_ODDS,
  };
}

// ------------------------------------------------------------
// 4) MOTHERLODE
//   N = number of rounds you plan to mine
//   Y, W = your stake / total stake on the block you mine (assumed steady across rounds)
//   P0 = current known pool size (ORE), optional
// Payout, when it triggers, is distributed by stake proportion in that
// round's winning block (per your confirmed rule) — not a separate lottery.
// ------------------------------------------------------------
function calcMotherlode(yourStake, blockTotal, rounds, mlAmount) {
  const perRoundTrigger = ORE_CONFIG.MOTHERLODE_TRIGGER_ODDS;
  const blockWinProb = 1 / ORE_CONFIG.SQUARES;
  const yourShare = blockTotal > 0 ? yourStake / blockTotal : 0;

  // Probability the pool triggers at all within N rounds
  const triggerProbWithinN = 1 - Math.pow(1 - perRoundTrigger, rounds);

  // Probability that YOU are on the winning block on the specific round it triggers
  const perRoundHitAndWin = perRoundTrigger * blockWinProb;
  const yourHitProbWithinN = 1 - Math.pow(1 - perRoundHitAndWin, rounds);

  // Direct answer to "what would I actually get" — no probability weighting,
  // just: if the Motherlode hits at this exact size, and I'm on the winning
  // block with this stake share, here's my cut.
  const yourPayoutIfHit = mlAmount * yourShare;

  // Probability-weighted expected value across the whole session, for context.
  const expectedPayout = yourHitProbWithinN * mlAmount * yourShare;

  return {
    triggerProbWithinN,
    yourHitProbWithinN,
    yourPayoutIfHit,
    expectedPayout,
    yourShare,
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
    document.getElementById("solo-out-personal").textContent = pct(r.soloWinProb, 3);
    document.getElementById("solo-out-block").textContent = pct(r.blockWinProb, 2);
    document.getElementById("solo-out-share").textContent = pct(r.yourShare, 2);
  });

  // --- SOL Rewards ---
  wireCalculator("form-sol", calcSolRewards, (r) => {
    const returnEl = document.getElementById("sol-out-return");
    const netEl = document.getElementById("sol-out-net");
    returnEl.textContent = fmt(r.yourTotalReturn, 4) + " SOL";
    netEl.textContent = (r.netGain >= 0 ? "+" : "") + fmt(r.netGain, 4) + " SOL  (" + (r.netPct >= 0 ? "+" : "") + pct(r.netPct, 2) + ")";
    netEl.classList.toggle("neg", r.netGain < 0);
    document.getElementById("sol-fee-admin").textContent = fmt(r.totalAdminFee, 4) + " SOL";
    document.getElementById("sol-fee-wadmin").textContent = fmt(r.winningsAdminFee, 4) + " SOL";
    document.getElementById("sol-fee-vault").textContent = fmt(r.vaultAmount, 4) + " SOL";
    document.getElementById("sol-fee-final").textContent = fmt(r.finalWinnings, 4) + " SOL";
    document.getElementById("sol-out-blockwin").textContent = pct(r.blockWinProb, 2);
  });

  // --- ORE Rewards ---
  wireCalculator("form-ore", calcOreRewards, (r) => {
    document.getElementById("ore-out-expected").textContent = fmt(r.expectedOrePerRound, 6) + " ORE / round";
    document.getElementById("ore-out-solo").textContent = pct(r.soloOdds, 0);
    document.getElementById("ore-out-split").textContent = pct(r.splitOdds, 0);
  });

  // --- Motherlode ---
  wireCalculator("form-motherlode", calcMotherlode, (r) => {
    document.getElementById("ml-out-payout-direct").textContent = fmt(r.yourPayoutIfHit, 4) + " ORE";
    document.getElementById("ml-out-trigger").textContent = pct(r.triggerProbWithinN, 3);
    document.getElementById("ml-out-yourhit").textContent = pct(r.yourHitProbWithinN, 5);
    document.getElementById("ml-out-payout").textContent = fmt(r.expectedPayout, 6) + " ORE (probability-weighted)";
  });
});
