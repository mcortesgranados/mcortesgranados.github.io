const phase9Form = document.querySelector("[data-phase9-check]");
const phase9Score = document.querySelector("[data-phase9-score]");
const phase9Message = document.querySelector("[data-phase9-message]");
const phase9Bar = document.querySelector("[data-phase9-bar]");

function updatePhase9Score() {
  if (!phase9Form || !phase9Score || !phase9Message || !phase9Bar) return;

  const checks = [...phase9Form.querySelectorAll('input[type="checkbox"]')];
  const checked = checks.filter((check) => check.checked).length;
  const total = checks.length || 1;
  const percentage = Math.round((checked / total) * 100);

  phase9Score.textContent = `${checked}/${total}`;
  phase9Bar.style.width = `${percentage}%`;

  phase9Form.dataset.status = checked >= 17 ? "ready" : checked >= 11 ? "caution" : "stop";

  if (checked >= 17) {
    phase9Message.textContent = "Puede avanzar: ganadores, lentos, precios, combos y segundo pedido ya están decididos con datos de venta real.";
    return;
  }

  if (checked >= 11) {
    phase9Message.textContent = "Puede seguir con cautela: hay lectura del piloto, pero falta cerrar reorden, liquidación, precios o caja para el segundo pedido.";
    return;
  }

  phase9Message.textContent = "No conviene avanzar: falta medir sell-through, margen real, inventario lento, precios, combos, proveedor y segundo pedido.";
}

phase9Form?.addEventListener("change", updatePhase9Score);
updatePhase9Score();
