// ============================================================
// OreCalc — Mode switch (Manual / Previous Round)
// ============================================================

// Every field, across all four calculators, that represents
// "total deployed on the tile, including you" — these get locked
// and auto-filled together in Previous Round mode.
const TILE_TOTAL_FIELD_IDS = [
  "solo-block-total",
  "sol-tile-total",
  "ore-tile-total",
  "ml-tile-total",
];

let currentMode = "manual";
let pollTimer = null;
let lastRoundNumber = null;

function setTileTotals(value) {
  TILE_TOTAL_FIELD_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = value.toFixed(4);
    el.dispatchEvent(new Event("input"));
  });
}

function lockTileFields(locked) {
  TILE_TOTAL_FIELD_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.readOnly = locked;
    el.classList.toggle("locked", locked);
  });
}

function setSnapshotStatus(text, isError = false) {
  const el = document.getElementById("snapshot-status");
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("error", isError);
}

function renderSnapshot(data) {
  document.getElementById("snapshot-round-number").textContent = "#" + data.roundNumber;
  document.getElementById("snap-winning").querySelector(".snap-value").textContent = data.winningTileSol.toFixed(4) + " SOL";
  document.getElementById("snap-highest").querySelector(".snap-value").textContent = data.highestTile.toFixed(4) + " SOL";
  document.getElementById("snap-lowest").querySelector(".snap-value").textContent = data.lowestTile.toFixed(4) + " SOL";
  document.getElementById("snap-average").querySelector(".snap-value").textContent = data.avgTile.toFixed(4) + " SOL";

  document.getElementById("snap-winning").onclick = () => setTileTotals(data.winningTileSol);
  document.getElementById("snap-highest").onclick = () => setTileTotals(data.highestTile);
  document.getElementById("snap-lowest").onclick = () => setTileTotals(data.lowestTile);
  document.getElementById("snap-average").onclick = () => setTileTotals(data.avgTile);

  // Default selection: the winning tile, since that's the realistic
  // "what actually happened" reference point.
  setTileTotals(data.winningTileSol);
  document.querySelectorAll(".snap-stat").forEach((el) => el.classList.remove("active"));
  document.getElementById("snap-winning").classList.add("active");
}

async function refreshPreviousRound() {
  setSnapshotStatus("Fetching latest completed round…");
  try {
    const data = await fetchPreviousRoundData();
    if (data.roundNumber !== lastRoundNumber) {
      lastRoundNumber = data.roundNumber;
      renderSnapshot(data);
    }
    setSnapshotStatus("Updated just now · refreshes every 20s");
  } catch (err) {
    console.error(err);
    setSnapshotStatus("Couldn't load live data (" + err.message + ") — switch to Manual to keep using the calculators.", true);
  }
}

function startPolling() {
  stopPolling();
  refreshPreviousRound();
  pollTimer = setInterval(refreshPreviousRound, ORE_RPC_CONFIG.REFRESH_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function setMode(mode) {
  currentMode = mode;
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
  const snapshotPanel = document.getElementById("snapshot-panel");

  if (mode === "manual") {
    stopPolling();
    lockTileFields(false);
    if (snapshotPanel) snapshotPanel.style.display = "none";
  } else if (mode === "previous") {
    lockTileFields(true);
    if (snapshotPanel) snapshotPanel.style.display = "";
    startPolling();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });
  setMode("manual"); // default on load
});
