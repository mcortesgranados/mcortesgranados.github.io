const phase2Form = document.querySelector("[data-phase2-check]");
const phase2Score = document.querySelector("[data-phase2-score]");
const phase2Message = document.querySelector("[data-phase2-message]");
const phase2Bar = document.querySelector("[data-phase2-bar]");

function updatePhase2Score() {
  if (!phase2Form || !phase2Score || !phase2Message || !phase2Bar) return;

  const checks = [...phase2Form.querySelectorAll('input[type="checkbox"]')];
  const checked = checks.filter((check) => check.checked).length;
  const total = checks.length || 1;
  const percentage = Math.round((checked / total) * 100);

  phase2Score.textContent = `${checked}/${total}`;
  phase2Bar.style.width = `${percentage}%`;

  phase2Form.dataset.status = checked >= 14 ? "ready" : checked >= 10 ? "caution" : "stop";

  if (checked >= 14) {
    phase2Message.textContent = "Puede avanzar: el mapa competitivo, la comparacion de precios, la experiencia de compra y el posicionamiento ya tienen evidencia suficiente.";
    return;
  }

  if (checked >= 10) {
    phase2Message.textContent = "Puede seguir con cautela: existe base competitiva, pero faltan compras simuladas, datos de precio o sintesis de posicionamiento.";
    return;
  }

  phase2Message.textContent = "No conviene avanzar: aun falta mapear competidores, medir precios, observar contenido y probar experiencia real de compra.";
}

phase2Form?.addEventListener("change", updatePhase2Score);
updatePhase2Score();
