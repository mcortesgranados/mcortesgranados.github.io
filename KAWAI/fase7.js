const phase7Form = document.querySelector("[data-phase7-check]");
const phase7Score = document.querySelector("[data-phase7-score]");
const phase7Message = document.querySelector("[data-phase7-message]");
const phase7Bar = document.querySelector("[data-phase7-bar]");

function updatePhase7Score() {
  if (!phase7Form || !phase7Score || !phase7Message || !phase7Bar) return;

  const checks = [...phase7Form.querySelectorAll('input[type="checkbox"]')];
  const checked = checks.filter((check) => check.checked).length;
  const total = checks.length || 1;
  const percentage = Math.round((checked / total) * 100);

  phase7Score.textContent = `${checked}/${total}`;
  phase7Bar.style.width = `${percentage}%`;

  phase7Form.dataset.status = checked >= 17 ? "ready" : checked >= 11 ? "caution" : "stop";

  if (checked >= 17) {
    phase7Message.textContent = "Puede avanzar: el pedido piloto, calidad, documentos, recepción, inventario, fotos, empaque y lanzamiento están controlados.";
    return;
  }

  if (checked >= 11) {
    phase7Message.textContent = "Puede seguir con cautela: la operación está armada, pero faltan controles críticos de calidad, documentos, inventario o lanzamiento.";
    return;
  }

  phase7Message.textContent = "No conviene avanzar: falta cerrar pedido, control de calidad, documentos, recepción, inventario, fotos propias, empaque local y plan de lanzamiento.";
}

phase7Form?.addEventListener("change", updatePhase7Score);
updatePhase7Score();
