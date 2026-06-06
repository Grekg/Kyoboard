// pricing js

const toggle = document.getElementById("billingToggle");
const amounts = document.querySelectorAll(".amount");
const periods = document.querySelectorAll(".period");

let isYearly = true;

const prices = {
  monthly: [15, 30, "Custom"],
  yearly: [12, 25, "Custom"],
};

toggle.addEventListener("click", () => {
  isYearly = !isYearly;
  toggle.classList.toggle("active");

  // update prices
  const source = isYearly ? prices.yearly : prices.monthly;

  amounts.forEach((el, index) => {
    if (source[index] !== "Custom") {
      el.textContent = source[index];
    }
  });
});
