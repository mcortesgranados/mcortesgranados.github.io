const phase6Form = document.querySelector("[data-phase6-check]");
const phase6Score = document.querySelector("[data-phase6-score]");
const phase6Message = document.querySelector("[data-phase6-message]");
const phase6Bar = document.querySelector("[data-phase6-bar]");
const phase6Calculator = document.querySelector("[data-phase6-calculator]");

const phase6MoneyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0
});

function formatPhase6Money(value) {
  if (!Number.isFinite(value)) return "$0";
  return phase6MoneyFormatter.format(Math.max(0, Math.round(value)));
}

function setPhase6Text(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function updatePhase6Score() {
  if (!phase6Form || !phase6Score || !phase6Message || !phase6Bar) return;

  const checks = [...phase6Form.querySelectorAll('input[type="checkbox"]')];
  const checked = checks.filter((check) => check.checked).length;
  const total = checks.length || 1;
  const percentage = Math.round((checked / total) * 100);

  phase6Score.textContent = `${checked}/${total}`;
  phase6Bar.style.width = `${percentage}%`;

  phase6Form.dataset.status = checked >= 17 ? "ready" : checked >= 11 ? "caution" : "stop";

  if (checked >= 17) {
    phase6Message.textContent = "Puede avanzar: el costo aterrizado, precio mínimo, margen, caja, comisiones y riesgos de devolución ya están modelados.";
    return;
  }

  if (checked >= 11) {
    phase6Message.textContent = "Puede seguir con cautela: hay estructura de costos, pero falta cerrar tributos, TRM, flete, comisiones o precio mínimo por SKU.";
    return;
  }

  phase6Message.textContent = "No conviene avanzar: falta calcular costo total, arancel, IVA, gastos DIAN, empaque, pauta, comisiones, devoluciones y margen.";
}

function updatePhase6Calculator() {
  if (!phase6Calculator) return;

  const data = new FormData(phase6Calculator);
  const units = Math.max(1, Number(data.get("units")) || 1);
  const exchangeRate = Number(data.get("exchangeRate")) || 0;
  const productUsd = Number(data.get("productUsd")) || 0;
  const freightUsd = Number(data.get("freightUsd")) || 0;
  const insuranceUsd = Number(data.get("insuranceUsd")) || 0;
  const dutyRate = Number(data.get("dutyRate")) || 0;
  const vatRate = Number(data.get("vatRate")) || 0;
  const brokerCop = Number(data.get("brokerCop")) || 0;
  const localTransportCop = Number(data.get("localTransportCop")) || 0;
  const packagingCop = Number(data.get("packagingCop")) || 0;
  const adsCop = Number(data.get("adsCop")) || 0;
  const commissionRate = Number(data.get("commissionRate")) || 0;
  const returnsRate = Number(data.get("returnsRate")) || 0;
  const targetMargin = Number(data.get("targetMargin")) || 0;
  const vatRecoverable = data.get("vatRecoverable") === "on";

  const productTotalCop = productUsd * units * exchangeRate;
  const freightTotalCop = (freightUsd + insuranceUsd) * exchangeRate;
  const customsBase = productTotalCop + freightTotalCop;
  const duty = customsBase * (dutyRate / 100);
  const importVat = (customsBase + duty) * (vatRate / 100);
  const fixedImportCost = brokerCop + localTransportCop;
  const cashNeeded = customsBase + duty + importVat + fixedImportCost;
  const economicImportCost = customsBase + duty + (vatRecoverable ? 0 : importVat) + fixedImportCost;
  const landedUnit = economicImportCost / units;
  const cashUnit = cashNeeded / units;
  const commercialUnitCost = landedUnit + packagingCop + adsCop;
  const variableRate = (commissionRate + returnsRate + targetMargin) / 100;
  const minPrice = variableRate >= 0.95 ? 0 : commercialUnitCost / (1 - variableRate);
  const commissionUnit = minPrice * (commissionRate / 100);
  const returnsUnit = minPrice * (returnsRate / 100);
  const profitUnit = minPrice * (targetMargin / 100);

  setPhase6Text("[data-phase6-price]", formatPhase6Money(Math.ceil(minPrice / 100) * 100));
  setPhase6Text("[data-phase6-landed]", formatPhase6Money(landedUnit));
  setPhase6Text("[data-phase6-cash]", formatPhase6Money(cashNeeded));
  setPhase6Text("[data-phase6-cash-unit]", `Caja por unidad: ${formatPhase6Money(cashUnit)}`);
  setPhase6Text("[data-phase6-duty]", formatPhase6Money(duty));
  setPhase6Text("[data-phase6-vat]", formatPhase6Money(importVat));
  setPhase6Text("[data-phase6-commercial-cost]", formatPhase6Money(commercialUnitCost));
  setPhase6Text("[data-phase6-profit]", formatPhase6Money(profitUnit));
  setPhase6Text("[data-phase6-variable]", `${Math.round(variableRate * 100)}%`);
  setPhase6Text("[data-phase6-commission]", formatPhase6Money(commissionUnit));
  setPhase6Text("[data-phase6-returns]", formatPhase6Money(returnsUnit));

  const alert = document.querySelector("[data-phase6-alert]");
  if (!alert) return;

  if (variableRate >= 0.95) {
    alert.textContent = "Alerta: comisiones, devoluciones y margen suman 95% o más. El precio no es viable con esta estructura.";
    return;
  }

  if (minPrice > 0 && commercialUnitCost / minPrice > 0.7) {
    alert.textContent = "Alerta: el costo comercial pesa más de 70% del precio. Hay poco espacio para descuentos, errores o devoluciones.";
    return;
  }

  alert.textContent = vatRecoverable
    ? "Modo IVA descontable: el IVA de importación se muestra como caja requerida, pero no se suma al costo económico unitario."
    : "Modo conservador: el IVA de importación se suma al costo económico unitario. Confirmar tratamiento con contador antes de comprar.";
}

phase6Form?.addEventListener("change", updatePhase6Score);
phase6Calculator?.addEventListener("input", updatePhase6Calculator);
phase6Calculator?.addEventListener("change", updatePhase6Calculator);

updatePhase6Score();
updatePhase6Calculator();
