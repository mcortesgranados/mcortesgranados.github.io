const phase4Form = document.querySelector("[data-phase4-check]");
const phase4Score = document.querySelector("[data-phase4-score]");
const phase4Message = document.querySelector("[data-phase4-message]");
const phase4Bar = document.querySelector("[data-phase4-bar]");

function updatePhase4Score() {
  if (!phase4Form || !phase4Score || !phase4Message || !phase4Bar) return;

  const checks = [...phase4Form.querySelectorAll('input[type="checkbox"]')];
  const checked = checks.filter((check) => check.checked).length;
  const total = checks.length || 1;
  const percentage = Math.round((checked / total) * 100);

  phase4Score.textContent = `${checked}/${total}`;
  phase4Bar.style.width = `${percentage}%`;

  phase4Form.dataset.status = checked >= 16 ? "ready" : checked >= 11 ? "caution" : "stop";

  if (checked >= 16) {
    phase4Message.textContent = "Puede avanzar: el surtido piloto ya tiene foco, prioridades, cantidades, margen, rotación y riesgos controlados.";
    return;
  }

  if (checked >= 11) {
    phase4Message.textContent = "Puede seguir con cautela: el surtido tiene estructura, pero faltan validaciones de margen, riesgo, proveedor o cantidades.";
    return;
  }

  phase4Message.textContent = "No conviene avanzar: falta cerrar SKUs, prioridades, rotación esperada, costo meta, riesgo y regla de compra.";
}

phase4Form?.addEventListener("change", updatePhase4Score);
updatePhase4Score();
