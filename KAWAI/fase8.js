const phase8Form = document.querySelector("[data-phase8-check]");
const phase8Score = document.querySelector("[data-phase8-score]");
const phase8Message = document.querySelector("[data-phase8-message]");
const phase8Bar = document.querySelector("[data-phase8-bar]");

function updatePhase8Score() {
  if (!phase8Form || !phase8Score || !phase8Message || !phase8Bar) return;

  const checks = [...phase8Form.querySelectorAll('input[type="checkbox"]')];
  const checked = checks.filter((check) => check.checked).length;
  const total = checks.length || 1;
  const percentage = Math.round((checked / total) * 100);

  phase8Score.textContent = `${checked}/${total}`;
  phase8Bar.style.width = `${percentage}%`;

  phase8Form.dataset.status = checked >= 17 ? "ready" : checked >= 11 ? "caution" : "stop";

  if (checked >= 17) {
    phase8Message.textContent = "Puede avanzar: los canales, ventas reales, atención, marketplace, pop-up y tablero de KPIs ya están operando con datos.";
    return;
  }

  if (checked >= 11) {
    phase8Message.textContent = "Puede seguir con cautela: ya hay lanzamiento, pero faltan piezas clave de conversión, medición, atención o decisión de reorden.";
    return;
  }

  phase8Message.textContent = "No conviene avanzar: faltan canales activos, WhatsApp, publicaciones, marketplace, pop-up, ventas reales y KPIs mínimos.";
}

phase8Form?.addEventListener("change", updatePhase8Score);
updatePhase8Score();
