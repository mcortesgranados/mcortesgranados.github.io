const header = document.querySelector("[data-header]");
const menuToggle = document.querySelector(".menu-toggle");
const navLinks = document.querySelector(".nav-links");
const navAnchors = [...document.querySelectorAll(".nav-links a, .quick-access a")];
const pageAnchors = navAnchors.filter((anchor) => anchor.getAttribute("href")?.startsWith("#"));
const calculator = document.querySelector("[data-calculator]");

const moneyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0
});

function closeMenu() {
  document.body.classList.remove("menu-open");
  navLinks?.classList.remove("is-open");
  menuToggle?.setAttribute("aria-expanded", "false");
}

menuToggle?.addEventListener("click", () => {
  const isOpen = navLinks.classList.toggle("is-open");
  document.body.classList.toggle("menu-open", isOpen);
  menuToggle.setAttribute("aria-expanded", String(isOpen));
});

navAnchors.forEach((anchor) => {
  anchor.addEventListener("click", closeMenu);
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeMenu();
});

const sections = pageAnchors
  .map((anchor) => document.querySelector(anchor.getAttribute("href")))
  .filter(Boolean);

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      pageAnchors.forEach((anchor) => {
        anchor.classList.toggle("is-active", anchor.getAttribute("href") === `#${entry.target.id}`);
      });
    });
  },
  { rootMargin: "-35% 0px -55% 0px", threshold: 0 }
);

sections.forEach((section) => observer.observe(section));

function calculatePrice() {
  if (!calculator) return;

  const data = new FormData(calculator);
  const productCost = Number(data.get("productCost")) || 0;
  const landedCost = Number(data.get("landedCost")) || 0;
  const packagingCost = Number(data.get("packagingCost")) || 0;
  const marketingCost = Number(data.get("marketingCost")) || 0;
  const margin = Number(data.get("margin")) || 0;
  const totalCost = productCost + landedCost + packagingCost + marketingCost;
  const price = margin >= 100 ? totalCost : totalCost / (1 - margin / 100);

  document.querySelector("[data-margin-output]").textContent = `${margin}%`;
  document.querySelector("[data-price-output]").textContent = moneyFormatter.format(Math.ceil(price / 100) * 100);
  document.querySelector("[data-cost-output]").textContent = `Costo aterrizado: ${moneyFormatter.format(totalCost)}`;
}

calculator?.addEventListener("input", calculatePrice);
calculatePrice();

window.addEventListener("scroll", () => {
  header?.classList.toggle("is-scrolled", window.scrollY > 12);
}, { passive: true });
