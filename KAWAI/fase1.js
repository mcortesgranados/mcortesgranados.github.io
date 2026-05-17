const phase1Form = document.querySelector("[data-phase1-check]");
const phase1Score = document.querySelector("[data-phase1-score]");
const phase1Message = document.querySelector("[data-phase1-message]");
const phase1Bar = document.querySelector("[data-phase1-bar]");

function updatePhase1Score() {
  if (!phase1Form || !phase1Score || !phase1Message || !phase1Bar) return;

  const checks = [...phase1Form.querySelectorAll('input[type="checkbox"]')];
  const checked = checks.filter((check) => check.checked).length;
  const total = checks.length || 1;
  const percentage = Math.round((checked / total) * 100);

  phase1Score.textContent = `${checked}/${total}`;
  phase1Bar.style.width = `${percentage}%`;

  phase1Form.dataset.status = checked >= 13 ? "ready" : checked >= 9 ? "caution" : "stop";

  if (checked >= 13) {
    phase1Message.textContent = "Puede avanzar: la base legal y tributaria está suficientemente ordenada para seguir con competencia, proveedores y costeo.";
    return;
  }

  if (checked >= 9) {
    phase1Message.textContent = "Puede seguir con cautela: faltan cierres legales o tributarios antes de comprar o importar volumen.";
    return;
  }

  phase1Message.textContent = "No conviene avanzar: faltan decisiones de formalización, RUT, marca, facturación, importador o control de licencias.";
}

phase1Form?.addEventListener("change", updatePhase1Score);
updatePhase1Score();
