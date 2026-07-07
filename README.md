# OreCalc

Unofficial odds & rewards calculator for the ORE protocol (Solana). Static site — no build step, no framework, no wallet connection. Manual inputs only.

## Files
- `index.html` — homepage, all 4 calculators (Solo Chance, SOL Rewards, ORE Rewards, Motherlode)
- `donations.html` — donations page
- `css/style.css` — all styling
- `js/script.js` — grid animation, scroll reveals, nav
- `js/calculators.js` — the actual math (see comments — formulas sourced from `regolith-labs/ore`'s `reset.rs` / `consts.rs`)
- `firebase.json`, `.firebaserc` — Firebase Hosting config

## Before you deploy
1. Open `donations.html`, find `YOUR_SOL_WALLET_ADDRESS_HERE`, replace with your real wallet address.
2. Open `.firebaserc`, replace `YOUR_FIREBASE_PROJECT_ID` with your actual Firebase project ID.

## Deploy to Firebase Hosting

```bash
npm install -g firebase-tools
firebase login
cd orecalc
firebase deploy
```

That's it — no build command needed, it deploys the folder as-is.

## Pushing to GitHub first (optional)

```bash
git init
git add .
git commit -m "OreCalc v1"
git remote add origin https://github.com/YOUR_USERNAME/orecalc.git
git push -u origin main
```

## Updating the math later
Every constant the calculators use lives in one place: the `ORE_CONFIG` object at the top of `js/calculators.js`. If Regolith changes a fee %, the Motherlode odds, or the split odds, that's the only file you need to touch — nothing else references these numbers directly.

The Motherlode trigger odds (1/625) is the one figure we couldn't confirm directly in the on-chain source at build time (the fee/reward file had it marked as still being finalized) — it's sourced from public reporting. Swap it out the moment you have the exact on-chain constant.
