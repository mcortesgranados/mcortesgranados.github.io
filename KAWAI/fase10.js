const phase10Form = document.querySelector("[data-phase10-check]");
const phase10Score = document.querySelector("[data-phase10-score]");
const phase10Message = document.querySelector("[data-phase10-message]");
const phase10Bar = document.querySelector("[data-phase10-bar]");

function updatePhase10Score() {
  if (!phase10Form || !phase10Score || !phase10Message || !phase10Bar) return;

  const checks = [...phase10Form.querySelectorAll('input[type="checkbox"]')];
  const checked = checks.filter((check) => check.checked).length;
  const total = checks.length || 1;
  const percentage = Math.round((checked / total) * 100);

  phase10Score.textContent = `${checked}/${total}`;
  phase10Bar.style.width = `${percentage}%`;

  phase10Form.dataset.status = checked >= 17 ? "ready" : checked >= 11 ? "caution" : "stop";

  if (checked >= 17) {
    phase10Message.textContent = "Puede avanzar: la escala tiene evidencia, caja, operación, canal, proveedor, margen y límites de riesgo documentados.";
    return;
  }

  if (checked >= 11) {
    phase10Message.textContent = "Puede seguir con cautela: hay señales de escala, pero faltan controles de caja, operación, canal, proveedor o margen.";
    return;
  }

  phase10Message.textContent = "No conviene escalar: faltan evidencia de ventas, margen real, operación estable, caja, proveedores, canales y plan de riesgo.";
}

phase10Form?.addEventListener("change", updatePhase10Score);
updatePhase10Score();
