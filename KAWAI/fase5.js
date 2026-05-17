const phase5Form = document.querySelector("[data-phase5-check]");
const phase5Score = document.querySelector("[data-phase5-score]");
const phase5Message = document.querySelector("[data-phase5-message]");
const phase5Bar = document.querySelector("[data-phase5-bar]");

function updatePhase5Score() {
  if (!phase5Form || !phase5Score || !phase5Message || !phase5Bar) return;

  const checks = [...phase5Form.querySelectorAll('input[type="checkbox"]')];
  const checked = checks.filter((check) => check.checked).length;
  const total = checks.length || 1;
  const percentage = Math.round((checked / total) * 100);

  phase5Score.textContent = `${checked}/${total}`;
  phase5Bar.style.width = `${percentage}%`;

  phase5Form.dataset.status = checked >= 17 ? "ready" : checked >= 11 ? "caution" : "stop";

  if (checked >= 17) {
    phase5Message.textContent = "Puede avanzar: ya existe expediente de proveedores, muestras validadas, condiciones claras, pago protegido y backup operativo.";
    return;
  }

  if (checked >= 11) {
    phase5Message.textContent = "Puede seguir con cautela: hay avance, pero faltan validaciones críticas de muestra, contrato, licencia, pago o proveedor alterno.";
    return;
  }

  phase5Message.textContent = "No conviene avanzar: falta buscar, comparar, pedir muestras, validar calidad, confirmar MOQ, pagos, licencias y respaldo.";
}

phase5Form?.addEventListener("change", updatePhase5Score);
updatePhase5Score();
