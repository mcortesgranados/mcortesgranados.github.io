const phase3Form = document.querySelector("[data-phase3-check]");
const phase3Score = document.querySelector("[data-phase3-score]");
const phase3Message = document.querySelector("[data-phase3-message]");
const phase3Bar = document.querySelector("[data-phase3-bar]");

function updatePhase3Score() {
  if (!phase3Form || !phase3Score || !phase3Message || !phase3Bar) return;

  const checks = [...phase3Form.querySelectorAll('input[type="checkbox"]')];
  const checked = checks.filter((check) => check.checked).length;
  const total = checks.length || 1;
  const percentage = Math.round((checked / total) * 100);

  phase3Score.textContent = `${checked}/${total}`;
  phase3Bar.style.width = `${percentage}%`;

  phase3Form.dataset.status = checked >= 16 ? "ready" : checked >= 11 ? "caution" : "stop";

  if (checked >= 16) {
    phase3Message.textContent = "Puede avanzar: ya existe evidencia suficiente de cliente, interés, precio, canal y demanda antes de importar.";
    return;
  }

  if (checked >= 11) {
    phase3Message.textContent = "Puede seguir con cautela: hay señales de demanda, pero faltan preventa, lista de espera o conversaciones reales.";
    return;
  }

  phase3Message.textContent = "No conviene avanzar: falta validar cliente, problema, deseo, precio, canales y disposición real de compra.";
}

phase3Form?.addEventListener("change", updatePhase3Score);
updatePhase3Score();
