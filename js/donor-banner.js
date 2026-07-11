// ============================================================
// OreCalc — Donor banner (sitewide, injected above the nav)
// ============================================================

let donorRotateIndex = 0;
let donorRotateTimer = null;

function buildDonorBanner() {
  if (!Array.isArray(FEATURED_DONORS) || FEATURED_DONORS.length === 0) return;

  const bar = document.createElement("div");
  bar.className = "donor-banner";
  bar.innerHTML = `
    <a href="${getDonationsUrl()}" class="donor-banner__inner">
      <span class="donor-banner__dot"></span>
      <span class="donor-banner__text" id="donor-banner-text"></span>
      <span class="donor-banner__cta">Support this tool &rarr;</span>
    </a>
  `;
  document.body.insertBefore(bar, document.body.firstChild);

  renderDonorEntry();
  if (FEATURED_DONORS.length > 1) {
    donorRotateTimer = setInterval(() => {
      donorRotateIndex = (donorRotateIndex + 1) % FEATURED_DONORS.length;
      renderDonorEntry();
    }, 6000);
  }
}

function renderDonorEntry() {
  const el = document.getElementById("donor-banner-text");
  if (!el) return;
  const entry = FEATURED_DONORS[donorRotateIndex];
  el.style.opacity = "0";
  setTimeout(() => {
    el.textContent = entry.name + " — \u201c" + entry.message + "\u201d";
    el.style.opacity = "1";
  }, 250);
}

// Works whether the current page is index.html or donations.html,
// without needing to hardcode a path per page.
function getDonationsUrl() {
  return location.pathname.includes("donations.html") ? "#" : "donations.html";
}

document.addEventListener("DOMContentLoaded", buildDonorBanner);
