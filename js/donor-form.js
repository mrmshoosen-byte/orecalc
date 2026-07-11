// ============================================================
// OreCalc — Donor message form submission
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("donor-message-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("donor-name").value.trim();
    const message = document.getElementById("donor-message").value.trim();
    const signature = document.getElementById("donor-signature").value.trim();
    const statusEl = document.getElementById("donor-form-status");
    const submitBtn = form.querySelector("button[type='submit']");

    if (!name || !message || !signature) {
      statusEl.textContent = "Please fill in all three fields.";
      statusEl.classList.add("error");
      return;
    }

    if (DONOR_FORM_CONFIG.ACTION_URL.startsWith("PASTE_")) {
      statusEl.textContent = "Form isn't connected yet — check back soon.";
      statusEl.classList.add("error");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting…";

    const body = new URLSearchParams();
    body.append(DONOR_FORM_CONFIG.ENTRY_NAME, name);
    body.append(DONOR_FORM_CONFIG.ENTRY_MESSAGE, message);
    body.append(DONOR_FORM_CONFIG.ENTRY_SIGNATURE, signature);

    try {
      // Google Forms doesn't allow reading the response (no-cors), so we
      // can't confirm success from the response itself — but the request
      // reliably lands in the linked Sheet as long as the entry IDs are
      // correct, which is what matters here.
      await fetch(DONOR_FORM_CONFIG.ACTION_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      statusEl.textContent = "Thanks — your message has been submitted for review.";
      statusEl.classList.remove("error");
      form.reset();
    } catch (err) {
      statusEl.textContent = "Something went wrong. Please try again.";
      statusEl.classList.add("error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit";
    }
  });
});
