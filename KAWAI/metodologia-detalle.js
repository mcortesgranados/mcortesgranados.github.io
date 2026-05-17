const detailData = window.kawaiiCompetitorMethodologies;
const methodKey = document.body.dataset.methodKey;
const method = detailData?.methods?.[methodKey];
const order = detailData?.order || [];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderCards(items) {
  return items
    .map(
      (item) => `
        <article>
          <span aria-hidden="true">${item.emoji || "✨"}</span>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.text)}</p>
        </article>
      `
    )
    .join("");
}

function renderFindings(items) {
  return items
    .map(
      (item) => `
        <li>
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.text)}</span>
        </li>
      `
    )
    .join("");
}

function renderTable(table) {
  if (!table) return "";

  const headers = table.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const rows = table.rows
    .map(
      (row) => `
        <tr>
          ${row.map((cell, index) => `<td data-label="${escapeHtml(table.headers[index] || "")}">${escapeHtml(cell)}</td>`).join("")}
        </tr>
      `
    )
    .join("");

  return `
    <div class="method-table-wrap">
      <table class="method-table">
        <thead><tr>${headers}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderActions(actions) {
  return actions.map((action) => `<li>${escapeHtml(action)}</li>`).join("");
}

function renderSources(sources) {
  return sources
    .map(
      (source) => `
        <article>
          <a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.label)}</a>
          <p>${escapeHtml(source.note)}</p>
        </article>
      `
    )
    .join("");
}

function renderMethodNav() {
  return order
    .map((key) => {
      const item = detailData.methods[key];
      const isActive = key === methodKey ? " is-active" : "";
      return `<a class="${isActive}" href="${item.file}"><span>${item.emoji}</span>${escapeHtml(item.shortTitle)}</a>`;
    })
    .join("");
}

function renderPager() {
  const index = order.indexOf(methodKey);
  const previous = detailData.methods[order[(index - 1 + order.length) % order.length]];
  const next = detailData.methods[order[(index + 1) % order.length]];

  return `
    <a href="${previous.file}">← ${escapeHtml(previous.shortTitle)}</a>
    <a href="analisis-competencia.html">Volver al analisis competitivo</a>
    <a href="${next.file}">${escapeHtml(next.shortTitle)} →</a>
  `;
}

function renderPage() {
  if (!method) {
    document.querySelector("[data-method-root]").innerHTML = `
      <section class="method-detail-hero">
        <div>
          <p class="eyebrow">Metodologia no encontrada</p>
          <h1>No se encontro este entregable</h1>
          <p>Vuelve al analisis competitivo para elegir una metodologia disponible.</p>
        </div>
      </section>
    `;
    return;
  }

  document.title = `${method.title} | Entregable competitivo kawaii`;

  document.querySelector("[data-method-root]").innerHTML = `
    <section class="method-detail-hero">
      <div>
        <p class="eyebrow">Metodologia ${method.number}</p>
        <h1>${escapeHtml(method.title)}</h1>
        <p>${escapeHtml(method.subtitle)}</p>
      </div>
      <aside>
        <span aria-hidden="true">${method.emoji}</span>
        <h2>Pregunta aplicada</h2>
        <p>${escapeHtml(method.question)}</p>
      </aside>
    </section>

    <nav class="method-page-nav" aria-label="Metodologias competitivas">
      ${renderMethodNav()}
    </nav>

    <section class="method-detail-section">
      <div class="method-heading">
        <span>01</span>
        <div>
          <h2>Alcance competitivo</h2>
          <p>Lectura aplicada a competidores visibles en Bogota, Colombia y sustitutos internacionales.</p>
        </div>
      </div>
      <div class="method-scope-grid">${renderCards(method.scope)}</div>
    </section>

    <section class="method-detail-section">
      <div class="method-heading">
        <span>02</span>
        <div>
          <h2>Hallazgos clave</h2>
          <p>Interpretacion inicial con base en competidores locales, marketplaces y sustitutos de bajo precio.</p>
        </div>
      </div>
      <ol class="method-finding-list">${renderFindings(method.findings)}</ol>
    </section>

    <section class="method-deliverable-panel">
      <div class="method-heading">
        <span>03</span>
        <div>
          <h2>${escapeHtml(method.subtitle.replace("Entregable: ", ""))}</h2>
          <p>Entregable practico para tomar decisiones de entrada, surtido, posicionamiento y abastecimiento.</p>
        </div>
      </div>
      ${renderTable(method.table)}
    </section>

    <section class="method-action-panel">
      <div>
        <h2>Acciones recomendadas</h2>
        <p>Pasos inmediatos para convertir el analisis en decisiones del proyecto.</p>
      </div>
      <ol>${renderActions(method.actions)}</ol>
    </section>

    <section class="method-source-panel">
      <h2>Fuentes publicas usadas como referencia competitiva</h2>
      <div>${renderSources(detailData.commonSources)}</div>
    </section>

    <nav class="method-pager" aria-label="Navegacion entre entregables">
      ${renderPager()}
    </nav>
  `;
}

renderPage();
