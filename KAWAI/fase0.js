const phase0Form = document.querySelector("[data-phase0-check]");
const phase0Score = document.querySelector("[data-phase0-score]");
const phase0Message = document.querySelector("[data-phase0-message]");
const phase0Bar = document.querySelector("[data-phase0-bar]");

function updatePhase0Score() {
  if (!phase0Form || !phase0Score || !phase0Message || !phase0Bar) return;

  const checks = [...phase0Form.querySelectorAll('input[type="checkbox"]')];
  const checked = checks.filter((check) => check.checked).length;
  const total = checks.length || 1;
  const percentage = Math.round((checked / total) * 100);

  phase0Score.textContent = `${checked}/${total}`;
  phase0Bar.style.width = `${percentage}%`;

  phase0Form.dataset.status = checked >= 10 ? "ready" : checked >= 7 ? "caution" : "stop";

  if (checked >= 10) {
    phase0Message.textContent = "Puede avanzar a la siguiente fase: ya hay suficiente claridad estratégica para investigar competidores, formalización y proveedores.";
    return;
  }

  if (checked >= 7) {
    phase0Message.textContent = "Puede seguir, pero con ajustes: faltan decisiones críticas antes de comprometer inventario o importación.";
    return;
  }

  phase0Message.textContent = "Todavía no conviene avanzar: primero hay que cerrar foco, cliente, presupuesto, riesgo y promesa de valor.";
}

phase0Form?.addEventListener("change", updatePhase0Score);
updatePhase0Score();
