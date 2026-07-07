// ============================================================
// OreCalc — Ambient VFX & interaction
// ============================================================

// ---- Build the animated 5x5 grid (used in hero + mini-icons) ----
function buildHeroGrid() {
  const container = document.getElementById("hero-grid");
  if (!container) return;

  const size = 25;
  const cells = [];
  for (let i = 0; i < size; i++) {
    const cell = document.createElement("div");
    cell.style.cssText = `
      width: clamp(28px, 4.2vw, 46px);
      height: clamp(28px, 4.2vw, 46px);
      border: 1px solid var(--line);
      background: var(--charcoal);
      transition: background 0.6s ease, box-shadow 0.6s ease;
    `;
    cells.push(cell);
    container.appendChild(cell);
  }

  // Simulate live "rounds": randomly light up a winning square, then reset.
  function runRound() {
    const winner = Math.floor(Math.random() * size);
    // light up 2-4 random "active" squares (miners deploying)
    const activeCount = 2 + Math.floor(Math.random() * 3);
    const active = new Set([winner]);
    while (active.size < activeCount) {
      active.add(Math.floor(Math.random() * size));
    }
    active.forEach((idx) => {
      cells[idx].style.background = "var(--gray-700)";
    });
    cells[winner].style.background = "var(--white)";
    cells[winner].style.boxShadow = "0 0 18px var(--glow-strong)";

    setTimeout(() => {
      cells.forEach((c) => {
        c.style.background = "var(--charcoal)";
        c.style.boxShadow = "none";
      });
    }, 900);
  }

  runRound();
  setInterval(runRound, 2200);
}

// ---- Mini grid icons per calculator section (custom, non-generic) ----
function buildMiniGrids() {
  document.querySelectorAll(".mini-grid").forEach((grid) => {
    const pattern = grid.dataset.pattern; // comma list of "on" indices, 0-24
    const onSet = new Set((pattern || "").split(",").map((n) => parseInt(n, 10)));
    for (let i = 0; i < 25; i++) {
      const span = document.createElement("span");
      if (onSet.has(i)) span.classList.add("on");
      grid.appendChild(span);
    }
  });
}

// ---- Scroll reveal ----
function initReveal() {
  const els = document.querySelectorAll(".reveal");
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );
  els.forEach((el) => io.observe(el));
}

// ---- Nav background intensity on scroll ----
function initNavScroll() {
  const nav = document.querySelector(".nav");
  if (!nav) return;
  window.addEventListener("scroll", () => {
    if (window.scrollY > 40) {
      nav.style.background = "rgba(0,0,0,0.92)";
    } else {
      nav.style.background = "rgba(0,0,0,0.72)";
    }
  });
}

// ---- Count-up animation for stat values ----
function animateValue(el, endValue, decimals = 4, suffix = "") {
  const duration = 700;
  const start = performance.now();
  const startValue = 0;
  function frame(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = startValue + (endValue - startValue) * eased;
    el.textContent = current.toFixed(decimals) + suffix;
    if (progress < 1) requestAnimationFrame(frame);
    else el.textContent = endValue.toFixed(decimals) + suffix;
  }
  requestAnimationFrame(frame);
}

document.addEventListener("DOMContentLoaded", () => {
  buildHeroGrid();
  buildMiniGrids();
  initReveal();
  initNavScroll();

  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
});
