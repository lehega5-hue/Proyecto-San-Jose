const $ = selector => document.querySelector(selector);
const money = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0
});
const percent = value => `${Math.round(value * 100)} %`;
const countText = (value, singular, plural) => `${value} ${value === 1 ? singular : plural}`;

const app = {
  step: 2,
  start: null,
  context: {},
  dataset: null,
  datasetName: "",
  expected: "",
  source: "",
  analysis: null,
  files: [],
  tables: [],
  classified: [],
  semanticMode: "local-fallback",
  semanticPending: false,
  tasks: [false, false, false],
  activePriority: 0,
  feedback: {},
  completed: {
    start: false,
    form: false,
    data: false,
    quality: false,
    priority: false,
    plan: false,
    feedback: false
  }
};

const stepNames = [
  "Bienvenida",
  "Cuéntanos lo esencial",
  "Sube tu información",
  "Calidad de tu información",
  "Lo más importante",
  "Evidencia del hallazgo",
  "Plan sencillo",
  "Seguimiento",
  "Cuéntanos qué pasó",
  "Qué sigue"
];
const stageByStep = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 4, 9: 4, 10: 4 };
const stageNames = [
  "Cuéntanos lo esencial",
  "Sube tu información",
  "Mira qué atender primero",
  "Sigue un plan sencillo"
];

const datasets = {
  detenido: {
    name: "Caso A · Productos almacenados que casi no se venden",
    expected: "Identificar productos con existencias altas y pocas ventas.",
    description: "Hay productos almacenados durante el periodo con muy pocas salidas.",
    sales: [
      ["2026-04-05", "Cafetera clásica", 2, 185000],
      ["2026-04-18", "Licuadora práctica", 7, 142000],
      ["2026-05-02", "Cafetera clásica", 1, 185000],
      ["2026-05-12", "Juego de ollas", 12, 265000],
      ["2026-05-26", "Licuadora práctica", 8, 142000],
      ["2026-06-04", "Vajilla blanca", 1, 198000],
      ["2026-06-15", "Juego de ollas", 15, 265000],
      ["2026-06-28", "Licuadora práctica", 9, 142000],
      ["2026-07-03", "Cafetera clásica", 1, 185000],
      ["2026-07-11", "Juego de ollas", 13, 265000],
      ["2026-07-19", "Licuadora práctica", 8, 142000],
      ["2026-07-25", "Vajilla blanca", 1, 198000]
    ].map(row => ({ fecha: row[0], producto: row[1], cantidad: row[2], precio: row[3] })),
    inventory: [
      ["Cafetera clásica", 64, 128000],
      ["Licuadora práctica", 18, 97000],
      ["Juego de ollas", 16, 181000],
      ["Vajilla blanca", 48, 136000],
      ["Sartén antiadherente", 7, 68000]
    ].map(row => ({ producto: row[0], stock: row[1], costo: row[2] }))
  },
  concentrado: {
    name: "Caso B · Gran parte de las ventas depende de pocos productos",
    expected: "Identificar una dependencia comercial alta.",
    description: "Un producto representa gran parte del valor vendido.",
    sales: [
      ["2026-04-03", "Arroz premium 5 kg", 42, 24500],
      ["2026-04-16", "Arroz premium 5 kg", 48, 24500],
      ["2026-05-01", "Arroz premium 5 kg", 55, 24500],
      ["2026-05-18", "Aceite vegetal 1 L", 8, 11900],
      ["2026-05-27", "Arroz premium 5 kg", 51, 24500],
      ["2026-06-02", "Arroz premium 5 kg", 60, 24500],
      ["2026-06-14", "Café molido 500 g", 4, 18900],
      ["2026-06-29", "Arroz premium 5 kg", 57, 24500],
      ["2026-07-05", "Arroz premium 5 kg", 62, 24500],
      ["2026-07-14", "Azúcar 1 kg", 5, 4800],
      ["2026-07-21", "Arroz premium 5 kg", 58, 24500],
      ["2026-07-27", "Aceite vegetal 1 L", 6, 11900]
    ].map(row => ({ fecha: row[0], producto: row[1], cantidad: row[2], precio: row[3] })),
    inventory: [
      ["Arroz premium 5 kg", 70, 18700],
      ["Aceite vegetal 1 L", 4, 8200],
      ["Café molido 500 g", 22, 13400],
      ["Azúcar 1 kg", 35, 3500]
    ].map(row => ({ producto: row[0], stock: row[1], costo: row[2] }))
  },
  insuficiente: {
    name: "Caso C · Información insuficiente",
    expected: "Detener el análisis y explicar qué información hace falta.",
    description: "Faltan cantidades, productos y valores esenciales.",
    sales: [
      { fecha: "fecha desconocida", producto: "Cuaderno grande", cantidad: "", precio: 8500 },
      { fecha: "2026-07-10", producto: "", cantidad: -3, precio: "sin dato" }
    ],
    inventory: [{ producto: "Cuaderno grande", stock: "", costo: 4200 }]
  }
};

const semanticRoles = {
  sales: {
    fecha: { label: "Fecha de venta", required: true, terms: ["fecha", "fecha venta", "fecha factura", "día", "periodo"] },
    producto: { label: "Producto", required: true, terms: ["producto", "artículo", "descripción", "referencia", "sku", "item", "código producto", "mercancía"] },
    cantidad: { label: "Cantidad vendida", required: true, terms: ["cantidad", "unidades", "und", "cant", "qty", "despacho", "volumen"] },
    precio: { label: "Precio por unidad", required: false, terms: ["precio", "precio venta", "valor unitario", "vr unitario"] },
    valorTotal: { label: "Valor total de venta", required: false, terms: ["valor total", "total venta", "vr neto", "valor neto", "importe", "subtotal", "ingreso"] },
    costo: { label: "Costo", required: false, terms: ["costo", "coste", "valor costo"] }
  },
  inventory: {
    producto: { label: "Producto", required: true, terms: ["producto", "artículo", "descripción", "referencia", "sku", "item", "código producto", "mercancía"] },
    stock: { label: "Existencias disponibles", required: true, terms: ["existencia", "existencias", "stock", "inventario", "saldo", "disponible", "cantidad disponible"] },
    costo: { label: "Costo", required: false, terms: ["costo", "coste", "valor costo"] }
  }
};

const normalize = value => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[._-]/g, " ")
  .replace(/\s+/g, " ")
  .trim();
const safe = value => String(value ?? "").replace(/[&<>'"]/g, character => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "'": "&#39;",
  '"': "&quot;"
})[character]);
const confidenceWeight = confidence => ({ Alta: 3, Media: 2, Baja: 1 }[confidence] || 0);
const confidenceFromRemote = confidence => ({ high: "Alta", medium: "Media", low: "Baja" }[confidence] || "Baja");

function startDemo() {
  $("#welcome-view").classList.add("hidden");
  $("#app-view").classList.remove("hidden");
  app.start = Date.now();
  app.completed.start = true;
  go(2);
}

$("#start-demo").addEventListener("click", startDemo);
$("#restart-button").addEventListener("click", () => location.reload());
$("#test-summary-button").addEventListener("click", showTestSummary);
$(".dialog-close").addEventListener("click", () => $("#test-dialog").close());

function go(step) {
  app.step = Math.max(1, Math.min(10, step));
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function render() {
  const stage = stageByStep[app.step];
  $("#progress-label").textContent = `Etapa ${stage} de 4 · ${stageNames[stage - 1]}`;
  $("#progress-title").textContent = stepNames[app.step - 1];
  $("#progress-bar").style.width = `${stage / 4 * 100}%`;
  const screens = [welcome, contextScreen, dataScreen, qualityScreen, resultsScreen, evidenceScreen, planScreen, followupScreen, feedbackScreen, nextScreen];
  $("#screen").innerHTML = screens[app.step - 1]();
  $("#screen").focus({ preventScroll: true });
  bindScreen();
}

function nav(back, next, label = "Continuar") {
  return `<div class="actions">
    ${back ? `<button class="button secondary" type="button" data-go="${back}">← Volver</button>` : "<span></span>"}
    <div class="right">${next ? `<button class="button gold" type="button" data-go="${next}">${label} →</button>` : ""}</div>
  </div>`;
}

function welcome() {
  return `<section class="hero-screen"><div><p class="eyebrow">MVP académico</p><h1>Tus datos te muestran qué atender primero.</h1><p>No te damos más datos. Te ayudamos a saber qué hacer con los que ya tienes.</p><button class="button gold" type="button" data-go="2">Empezar análisis →</button></div></section>`;
}

function contextScreen() {
  return `<p class="eyebrow">Cuéntanos lo esencial</p>
    <h1 class="screen-title">Tres preguntas antes de revisar tus datos</h1>
    <p class="screen-intro">Solo usaremos estas respuestas para explicar mejor el resultado. No escribas información personal.</p>
    <form id="context-form" class="panel compact-form">
      <div class="form-grid">
        <label>¿A qué se dedica tu negocio? *
          <select name="actividad" required>
            <option value="">Selecciona</option>
            <option>Tienda o comercio minorista</option>
            <option>Mayorista</option>
            <option>Distribución</option>
            <option>Otro comercio</option>
          </select>
        </label>
        <label>¿Qué te preocupa más hoy? *
          <select name="preocupacion" required>
            <option value="">Selecciona</option>
            <option>Tengo productos que casi no se venden</option>
            <option>A veces me quedo sin productos</option>
            <option>Siento que dependo demasiado de pocos productos</option>
            <option>No sé qué debería atender primero</option>
          </select>
        </label>
        <label>¿Has intentado mejorar este problema antes? *
          <select id="attempt-select" name="intento" required>
            <option value="">Selecciona</option>
            <option value="Sí">Sí</option>
            <option value="No">No</option>
          </select>
        </label>
      </div>
      <div id="result-question" class="conditional hidden">
        <label>¿Cómo te fue? *
          <select name="resultado">
            <option value="">Selecciona</option>
            <option>Mejoró</option>
            <option>Mejoró un poco</option>
            <option>No vi resultados</option>
          </select>
        </label>
      </div>
      <div class="actions">
        <button class="button secondary" id="back-to-welcome" type="button">← Volver</button>
        <button class="button gold" type="submit">Continuar →</button>
      </div>
    </form>`;
}

function dataScreen() {
  const fileList = app.files.length
    ? `<ul class="file-list">${app.files.map(file => `<li><span>${safe(file.name)}</span><small>${formatBytes(file.size)}</small></li>`).join("")}</ul>`
    : "";
  return `<p class="eyebrow">Sube tu información</p>
    <h1 class="screen-title">Usa los archivos que ya tienes</h1>
    <p class="screen-intro">Puedes cargar uno o varios archivos de Excel o CSV. San José revisará automáticamente qué información contienen.</p>
    <div class="truth-strip">No necesitas cambiar los nombres de las columnas ni preparar un archivo especial. Todo se procesa localmente en este navegador.</div>
    <section class="panel unified-upload">
      <h2>Sube la información que ya usas</h2>
      <label id="drop-zone" class="drop-zone">
        <input id="business-files" type="file" multiple accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
        <span class="drop-icon" aria-hidden="true">↑</span>
        <strong>Arrastra tus archivos aquí</strong>
        <span>o selecciona uno o varios archivos</span>
        <small>Excel (.xlsx, .xls) o CSV · máximo 5 MB por archivo</small>
      </label>
      ${fileList}
      <p id="upload-error" class="message error" role="alert"></p>
    </section>
    <div class="case-divider"><span>o prueba un caso ficticio</span></div>
    <div class="choice-grid">
      ${Object.entries(datasets).map(([key, dataset]) => `<button class="choice-card ${app.source === key ? "selected" : ""}" type="button" data-dataset="${key}">
        <span class="case-tag">Datos ficticios</span>
        <strong>${safe(dataset.name)}</strong>
        <span>${safe(dataset.description)}</span>
      </button>`).join("")}
    </div>
    ${app.semanticPending ? interpretationPanel() : nav(2, app.dataset ? 4 : null, "Revisar información")}`;
}

function formatBytes(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function interpretationPanel() {
  const issues = requiredMappingIssues();
  const found = app.classified.map((table, index) => {
    const typeLabel = table.type === "sales" ? "Parece contener ventas" : table.type === "inventory" ? "Parece contener inventario" : "Información adicional";
    return `<li class="found-sheet ${table.type}">
      <div><strong>${safe(table.fileName)}</strong><span>Hoja: ${safe(table.sheetName)}</span></div>
      <div><b>${typeLabel}</b><small>Confianza: ${safe(table.typeConfidence)}</small></div>
    </li>`;
  }).join("");
  const relevant = app.classified
    .map((table, index) => ({ table, index }))
    .filter(item => ["sales", "inventory"].includes(item.table.type));
  const additional = app.classified.filter(table => table.type === "additional");
  return `<section class="panel interpretation-panel">
    <p class="eyebrow">Analista San José · ${app.semanticMode === "remote-ai" ? "interpretación remota" : "motor local de respaldo"}</p>
    <h2>Esto es lo que encontramos</h2>
    <p>Revisamos archivos, hojas, encabezados, tipos de datos y muestras de valores.</p>
    <ul class="found-list">${found}</ul>
    ${additional.length ? `<p class="optional-note">También encontramos ${countText(additional.length, "una hoja", "hojas")} con información adicional. Esta versión de San José se concentra únicamente en ventas e inventario.</p>` : ""}
    <h2>Esto es lo que entendimos</h2>
    <p>Solo pedimos tu intervención cuando una correspondencia no es completamente clara.</p>
    <div class="sheet-mappings">
      ${relevant.map(item => mappingCard(item.table, item.index)).join("")}
    </div>
    <div id="mapping-issues">${issues.map(issue => `<div class="low-stop"><h3>${safe(issue.title)}</h3><p>${safe(issue.message)}</p><small>${safe(issue.help)}</small></div>`).join("")}</div>
    <div class="actions">
      <button class="button secondary" type="button" id="clear-files">Elegir otros archivos</button>
      <button id="confirm-mapping" class="button gold" type="button" ${issues.length ? "disabled" : ""}>Confirmar y analizar →</button>
    </div>
  </section>`;
}

function mappingCard(table, tableIndex) {
  const roles = semanticRoles[table.type];
  return `<article class="mapping-card">
    <header><div><span>${table.type === "sales" ? "Ventas" : "Inventario"}</span><h3>${safe(table.sheetName)}</h3></div><small>${safe(table.fileName)}</small></header>
    ${Object.entries(roles).map(([role, config]) => mappingRow(table, tableIndex, role, config)).join("")}
  </article>`;
}

function mappingRow(table, tableIndex, role, config) {
  const assignment = table.interpretation.assignments[role];
  const options = table.headers.map(header => `<option value="${safe(header)}" ${assignment?.header === header ? "selected" : ""}>${safe(header)}</option>`).join("");
  const needsReview = !assignment || assignment.confidence !== "Alta";
  return `<div class="mapping-row ${needsReview ? "needs-review" : ""}">
    <div class="mapping-found"><span>Interpretación</span><strong>${safe(config.label)}</strong><small>${assignment ? `Columna “${safe(assignment.header)}” · Ejemplo: ${safe(assignment.sample || "sin muestra")}` : "No identificada"}</small></div>
    <div class="mapping-proposal"><span>Confianza</span><strong class="confidence ${(assignment?.confidence || "Baja").toLowerCase()}">${safe(assignment?.confidence || "Baja")}</strong></div>
    <details ${needsReview ? "open" : ""}>
      <summary>${needsReview ? "Confirma o corrige esta interpretación" : "Cambiar interpretación"}</summary>
      <label>Columna correcta
        <select class="mapping-select" data-table="${tableIndex}" data-role="${role}">
          <option value="">No está en esta hoja</option>${options}
        </select>
      </label>
    </details>
  </div>`;
}

function qualityScreen() {
  if (!app.analysis) return missingState();
  app.completed.quality = true;
  const quality = app.analysis.quality;
  return `<p class="eyebrow">Calidad de la información</p>
    <h1 class="screen-title">¿Podemos decirte qué atender primero?</h1>
    <div class="quality-layout">
      <article class="quality-card">
        <span class="level ${quality.level.toLowerCase()}">Calidad ${quality.level}</span>
        <h2>${quality.score}/100</h2>
        <p>${safe(quality.summary)}</p>
        <small>Fuente: ${safe(app.datasetName)}</small>
      </article>
      <section class="panel quality-explanation">
        <h2>Qué encontramos</h2>
        <ul class="check-list">${quality.facts.map(fact => `<li class="${fact.ok ? "" : "problem"}">${safe(fact.text)}</li>`).join("")}</ul>
      </section>
    </div>
    ${quality.level === "BAJA" ? `<div class="low-stop guidance-stop">
      <h2>Todavía no podemos decirte qué atender primero.</h2>
      <h3>Qué hace falta</h3><p>${safe(quality.missing)}</p>
      <h3>Qué puedes hacer</h3><p>${safe(quality.nextStep)}</p>
    </div>${nav(3, null)}` : nav(3, 5, "Ver qué atender primero")}`;
}

function resultsScreen() {
  if (!app.analysis || app.analysis.quality.level === "BAJA") return missingState();
  app.completed.priority = true;
  const [main, second, third] = app.analysis.priorities;
  return `<p class="eyebrow">Lo más importante que encontramos</p>
    <div class="priority-heading">
      <div><h1 class="screen-title">Atiende esto primero</h1><p class="screen-intro">La conclusión aparece primero. Las cifras que la respaldan están justo debajo.</p></div>
      <button id="download-summary" class="button secondary" type="button">Descargar resumen ejecutivo</button>
    </div>
    <article class="main-priority">
      <span class="rank">ATIENDE ESTO PRIMERO</span>
      <h2>${safe(main.title)}</h2>
      <div class="consulting-grid">
        <section><span>Qué ocurrió</span><p>${safe(main.reason)}</p></section>
        <section><span>En qué dato se basa</span><p><strong>${safe(main.evidence)}</strong></p></section>
        <section><span>Por qué importa</span><p>${safe(main.meaning)}</p></section>
        <section><span>Qué puedes hacer</span><p>${safe(main.action)}</p></section>
      </div>
      <div class="priority-actions">
        <button class="button secondary light" type="button" data-priority="0" data-go="6">Ver evidencia</button>
        <button class="button gold" type="button" data-go="7">Crear plan de 3 acciones</button>
      </div>
    </article>
    <div class="secondary-findings">
      ${secondaryFinding("También encontramos", second, 1)}
      ${secondaryFinding("Mantén esto en observación", third, 2)}
    </div>
    <details class="evidence-details"><summary>Ver cifras generales del análisis</summary><div class="stats-grid">${metricCards()}</div></details>
    ${nav(4, null)}`;
}

function secondaryFinding(label, finding, index) {
  if (!finding) return "";
  return `<article class="secondary-finding"><span>${label}</span><h3>${safe(finding.title)}</h3><p>${safe(finding.evidence)}</p><button class="text-link" type="button" data-priority="${index}" data-go="6">Ver detalle →</button></article>`;
}

function evidenceScreen() {
  const finding = app.analysis?.priorities[app.activePriority];
  if (!finding) return missingState();
  return `<p class="eyebrow">Evidencia del hallazgo</p>
    <h1 class="screen-title">${safe(finding.title)}</h1>
    <article class="focus-card"><span>Lo que muestran tus datos</span><h2>${safe(finding.evidence)}</h2></article>
    <div class="consulting-detail">
      <section class="panel"><h2>Qué significa</h2><p>${safe(finding.meaning)}</p></section>
      <section class="panel"><h2>Qué conviene hacer</h2><p>${safe(finding.action)}</p><p><strong>Qué observar:</strong> ${safe(finding.indicator)}</p></section>
    </div>
    <div class="actions"><button class="button secondary" type="button" data-go="5">← Volver al resultado</button>${app.activePriority === 0 ? '<button class="button gold" type="button" data-go="7">Crear plan de 3 acciones →</button>' : ""}</div>`;
}

function planScreen() {
  if (!app.analysis) return missingState();
  app.completed.plan = true;
  return `<p class="eyebrow">Sigue un plan sencillo</p>
    <h1 class="screen-title">Tres acciones. Nada más.</h1>
    <p class="screen-intro">Marca cada acción cuando la completes. El plan responde únicamente al hallazgo principal.</p>
    ${planChecklist()}
    ${nav(6, 8, "Hacer seguimiento")}`;
}

function followupScreen() {
  return `<p class="eyebrow">Seguimiento</p>
    <h1 class="screen-title">Avanza una acción a la vez</h1>
    <p class="screen-intro">Puedes actualizar el plan cuando vuelvas a revisar tus datos.</p>
    ${planChecklist()}
    ${nav(7, 9, "Contarnos qué pasó")}`;
}

function planChecklist() {
  const plan = getPlan();
  const done = app.tasks.filter(Boolean).length;
  return `<div class="plan-progress"><strong id="task-count">${done} de 3</strong><span>acciones completadas</span></div>
    <div class="action-list">${plan.map((item, index) => `<label class="action-check ${app.tasks[index] ? "completed" : ""}">
      <input class="task-check" type="checkbox" data-task="${index}" ${app.tasks[index] ? "checked" : ""}>
      <span class="check-mark" aria-hidden="true"></span>
      <span class="action-copy"><b>${item.when}</b><strong>${safe(item.action)}</strong><small>${safe(item.explain)}</small></span>
    </label>`).join("")}</div>
    <div class="followup-summary"><span>Qué observar</span><strong>${safe(app.analysis.priorities[0].indicator)}</strong></div>`;
}

function feedbackScreen() {
  return `<p class="eyebrow">Cuéntanos qué pasó</p>
    <h1 class="screen-title">Tu experiencia ayuda a revisar qué sigue</h1>
    <form id="feedback-form" class="panel">
      <div class="feedback-grid">
        ${radioQuestion("complete", "¿Pudiste completar el plan?", ["Sí", "Parcialmente", "No"])}
        ${radioQuestion("improved", "¿Notaste alguna mejora?", ["Sí", "Todavía no", "No estoy seguro"])}
      </div>
      <label>Cuéntanos brevemente qué pasó (opcional)<textarea name="comment" rows="4"></textarea></label>
      <div class="actions"><button class="button secondary" type="button" data-go="8">← Volver</button><button class="button gold" type="submit">Guardar y continuar →</button></div>
    </form>`;
}

function radioQuestion(name, label, options) {
  return `<fieldset><legend>${label} *</legend><div class="radio-group">${options.map(option => `<label class="radio-pill"><input type="radio" name="${name}" value="${option}" required><span>${option}</span></label>`).join("")}</div></fieldset>`;
}

function nextScreen() {
  const [main, second] = app.analysis?.priorities || [];
  return `<p class="eyebrow">Qué sigue</p>
    <h1 class="screen-title">Con esta nueva información podemos revisar qué sigue.</h1>
    <div class="continuity-grid">
      <article class="completion"><span>Hallazgo trabajado</span><h2>${safe(main?.title || "Completar la información")}</h2><p>${safe(main?.evidence || "")}</p></article>
      <article class="panel"><span>Progreso del plan</span><h3>${app.tasks.filter(Boolean).length} de 3 acciones</h3><p><strong>Qué observar:</strong> ${safe(main?.indicator || "Por definir")}</p></article>
      <article class="panel"><span>Siguiente hallazgo</span><h3>${safe(second?.title || "Mantener tus datos actualizados")}</h3><p>${safe(second?.evidence || "")}</p></article>
    </div>
    <div class="final-actions">
      <button class="button secondary" type="button" data-go="7">Revisar plan</button>
      <button class="button gold" type="button" data-priority="1" data-go="6">Ver siguiente hallazgo</button>
      <button id="download-summary" class="button secondary" type="button">Descargar resumen ejecutivo</button>
      <button class="text-button" type="button" id="restart-demo">Reiniciar demostración</button>
    </div>`;
}

function missingState() {
  return `<section class="panel"><h1>Primero necesitamos revisar la información.</h1><p>Vuelve al paso anterior para completar lo necesario.</p>${nav(Math.max(2, app.step - 1), null)}</section>`;
}

function bindScreen() {
  document.querySelectorAll("[data-priority]").forEach(button => button.addEventListener("click", () => {
    app.activePriority = Number(button.dataset.priority);
    go(Number(button.dataset.go));
  }));
  document.querySelectorAll("[data-go]:not([data-priority])").forEach(button => button.addEventListener("click", () => go(Number(button.dataset.go))));
  $("#download-summary")?.addEventListener("click", downloadExecutiveSummary);
  $("#restart-demo")?.addEventListener("click", () => location.reload());
  $("#back-to-welcome")?.addEventListener("click", () => location.reload());

  if (app.step === 2) {
    $("#context-form").addEventListener("submit", saveContext);
    $("#attempt-select").addEventListener("change", toggleResultQuestion);
    toggleResultQuestion();
  }
  if (app.step === 3) {
    document.querySelectorAll("[data-dataset]").forEach(button => button.addEventListener("click", () => selectDataset(button.dataset.dataset)));
    $("#business-files")?.addEventListener("change", event => readUploads(event.target.files));
    const dropZone = $("#drop-zone");
    dropZone?.addEventListener("dragover", event => { event.preventDefault(); dropZone.classList.add("dragging"); });
    dropZone?.addEventListener("dragleave", () => dropZone.classList.remove("dragging"));
    dropZone?.addEventListener("drop", event => {
      event.preventDefault();
      dropZone.classList.remove("dragging");
      readUploads(event.dataTransfer.files);
    });
    document.querySelectorAll(".mapping-select").forEach(select => select.addEventListener("change", changeMapping));
    $("#confirm-mapping")?.addEventListener("click", confirmInterpretation);
    $("#clear-files")?.addEventListener("click", resetUploads);
  }
  if ([7, 8].includes(app.step)) document.querySelectorAll(".task-check").forEach(input => input.addEventListener("change", updateTask));
  if (app.step === 9) $("#feedback-form").addEventListener("submit", saveFeedback);
}

function toggleResultQuestion() {
  const visible = $("#attempt-select").value === "Sí";
  $("#result-question").classList.toggle("hidden", !visible);
  $("#result-question select").required = visible;
}

function saveContext(event) {
  event.preventDefault();
  app.context = Object.fromEntries(new FormData(event.currentTarget));
  app.completed.form = true;
  go(3);
}

function selectDataset(key) {
  const dataset = datasets[key];
  app.source = key;
  app.dataset = { sales: dataset.sales, inventory: dataset.inventory };
  app.datasetName = dataset.name;
  app.expected = dataset.expected;
  app.analysis = analyze(app.dataset);
  app.semanticPending = false;
  app.files = [];
  app.classified = [];
  app.completed.data = true;
  render();
}

function resetUploads() {
  app.files = [];
  app.tables = [];
  app.classified = [];
  app.semanticPending = false;
  app.analysis = null;
  app.source = "";
  render();
}

function parseCSV(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) throw new Error("El CSV debe tener encabezados y al menos una fila.");
  const delimiter = lines[0].split(";").length > lines[0].split(",").length ? ";" : ",";
  const parseLine = line => {
    const values = [];
    let current = "", quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === '"') {
        if (quoted && line[index + 1] === '"') { current += '"'; index += 1; }
        else quoted = !quoted;
      } else if (character === delimiter && !quoted) {
        values.push(current.trim());
        current = "";
      } else current += character;
    }
    values.push(current.trim());
    return values;
  };
  return matrixToTable(lines.map(parseLine));
}

function matrixToTable(matrix) {
  const clean = matrix.filter(row => row.some(value => String(value ?? "").trim() !== ""));
  if (clean.length < 2) throw new Error("La hoja debe tener encabezados y al menos una fila de información.");
  const used = {};
  const headers = clean[0].map((value, index) => {
    const base = String(value || `Columna ${index + 1}`).trim();
    used[base] = (used[base] || 0) + 1;
    return used[base] > 1 ? `${base} (${used[base]})` : base;
  });
  return {
    headers,
    rows: clean.slice(1).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])))
  };
}

async function readTabularFile(file) {
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "csv") {
    const table = parseCSV(await file.text());
    return [{ ...table, fileName: file.name, sheetName: "CSV" }];
  }
  if (!["xlsx", "xls"].includes(extension)) throw new Error("Este formato no es compatible.");
  if (typeof XLSX === "undefined") throw new Error("No pudimos iniciar el lector de Excel. Recarga la página.");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const tables = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: false,
      dateNF: "yyyy-mm-dd"
    });
    try {
      const table = matrixToTable(matrix);
      tables.push({ ...table, fileName: file.name, sheetName });
    } catch {
      tables.push({ headers: matrix[0]?.map(String) || [], rows: [], fileName: file.name, sheetName, empty: true });
    }
  }
  if (!tables.length) throw new Error(`${file.name} no contiene hojas que podamos leer.`);
  return tables;
}

async function readUploads(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  const invalid = files.find(file => !/\.(xlsx|xls|csv)$/i.test(file.name) || file.size > 5 * 1024 * 1024);
  if (invalid) {
    showUploadError(`${invalid.name}: usa Excel o CSV de máximo 5 MB.`);
    return;
  }
  try {
    showUploadError("");
    app.source = "custom";
    app.dataset = null;
    app.analysis = null;
    app.files = files;
    app.tables = (await Promise.all(files.map(readTabularFile))).flat();
    app.classified = [];
    let usedRemote = false;
    for (const table of app.tables) {
      table.profiles = Object.fromEntries(table.headers.map(header => [header, columnProfile(table.rows, header)]));
      const local = localClassifyTable(table);
      const interpreted = await window.AIDataInterpreter.interpret(table, () => local.remote);
      if (interpreted.mode === "remote-ai") usedRemote = true;
      app.classified.push(buildClassifiedTable(table, local, interpreted));
    }
    app.semanticMode = usedRemote ? "remote-ai" : "local-fallback";
    app.semanticPending = true;
    app.datasetName = files.map(file => file.name).join(", ");
    app.expected = "Interpretar las hojas y recomendar solo si existen ventas e inventario suficientes.";
    render();
  } catch (error) {
    showUploadError(error.message);
  }
}

function showUploadError(message) {
  const element = $("#upload-error");
  if (element) element.textContent = message;
}

function numericValue(value) {
  if (typeof value === "number") return value;
  const cleaned = String(value ?? "").trim()
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  return cleaned !== "" && Number.isFinite(Number(cleaned)) ? Number(cleaned) : NaN;
}

function columnProfile(rows, header) {
  const values = rows.slice(0, 50).map(row => row[header]).filter(value => String(value ?? "").trim() !== "");
  const total = values.length || 1;
  const numeric = values.filter(value => Number.isFinite(numericValue(value))).length / total;
  const dates = values.filter(value => /^\d{4}-\d{1,2}-\d{1,2}/.test(String(value)) || /^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/.test(String(value))).length / total;
  const text = values.filter(value => !Number.isFinite(numericValue(value)) && String(value).length > 1).length / total;
  return { numeric, dates, text, sample: values.slice(0, 3).join(", ") };
}

function semanticScore(header, role, config, profile) {
  const name = normalize(header);
  let score = 0;
  for (const term of config.terms) {
    const normalizedTerm = normalize(term);
    if (name === normalizedTerm) score = Math.max(score, 9);
    else if (name.length >= 3 && normalizedTerm.length >= 3 && (name.includes(normalizedTerm) || normalizedTerm.includes(name))) score = Math.max(score, 6);
    else {
      const overlap = normalizedTerm.split(" ").filter(token => token.length > 2 && name.split(" ").includes(token)).length;
      score = Math.max(score, overlap * 2);
    }
  }
  if (role === "producto" && /(producto|articulo|descripcion|mercancia|referencia|sku)/.test(name)) score += 3;
  if (role === "fecha") score += profile.dates * 6;
  if (["cantidad", "precio", "valorTotal", "costo", "stock"].includes(role)) score += profile.numeric * 3;
  if (role === "producto") score += profile.text * 2;
  return score;
}

function inferInterpretation(table, type) {
  const assignments = {};
  const used = new Set();
  for (const [role, config] of Object.entries(semanticRoles[type])) {
    const ranked = table.headers
      .filter(header => !used.has(header))
      .map(header => ({ header, profile: table.profiles[header] || columnProfile(table.rows, header), score: semanticScore(header, role, config, table.profiles[header] || columnProfile(table.rows, header)) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (!best || best.score < 2) { assignments[role] = null; continue; }
    const confidence = best.score >= 8 ? "Alta" : best.score >= 5 ? "Media" : "Baja";
    if (confidence === "Alta") used.add(best.header);
    assignments[role] = { header: best.header, confidence, score: best.score, sample: best.profile.sample };
  }
  return { headers: table.headers, assignments, rowCount: table.rows.length };
}

function localClassifyTable(table) {
  if (table.empty || !table.rows.length) return {
    type: "additional",
    typeConfidence: "Baja",
    interpretations: {},
    remote: { sheet_type: "additional", confidence: "low", columns: {} }
  };
  const sales = inferInterpretation(table, "sales");
  const inventory = inferInterpretation(table, "inventory");
  const usable = assignment => assignment && assignment.confidence !== "Baja";
  const salesScore = ["fecha", "producto", "cantidad"].filter(role => usable(sales.assignments[role])).length * 3
    + (usable(sales.assignments.precio) || usable(sales.assignments.valorTotal) ? 3 : 0);
  const inventoryScore = ["producto", "stock"].filter(role => usable(inventory.assignments[role])).length * 4;
  const name = normalize(`${table.fileName} ${table.sheetName}`);
  const salesBonus = /(venta|factur|despach|salida)/.test(name) ? 3 : 0;
  const inventoryBonus = /(invent|exist|bodega|stock)/.test(name) ? 3 : 0;
  const additionalName = /(cliente|proveedor|nomina|empleado|impuesto|resumen|contab|cartera)/.test(name);
  let type = "additional";
  let score = 0;
  if (salesScore + salesBonus >= 8 && salesScore + salesBonus > inventoryScore + inventoryBonus) { type = "sales"; score = salesScore + salesBonus; }
  else if (inventoryScore + inventoryBonus >= 7) { type = "inventory"; score = inventoryScore + inventoryBonus; }
  if (additionalName && score < 10) type = "additional";
  const typeConfidence = score >= 10 ? "Alta" : score >= 7 ? "Media" : "Baja";
  const interpretation = type === "sales" ? sales : type === "inventory" ? inventory : null;
  const remoteColumns = interpretation ? Object.fromEntries(Object.entries(interpretation.assignments).filter(([, value]) => value).map(([role, value]) => [remoteRole(role), { source: value.header, confidence: value.confidence.toLowerCase() === "alta" ? "high" : value.confidence.toLowerCase() === "media" ? "medium" : "low" }])) : {};
  return {
    type,
    typeConfidence,
    interpretations: { sales, inventory },
    remote: { sheet_type: type, confidence: typeConfidence.toLowerCase() === "alta" ? "high" : typeConfidence.toLowerCase() === "media" ? "medium" : "low", columns: remoteColumns }
  };
}

function remoteRole(role) {
  return ({ fecha: "date", producto: "product", cantidad: "quantity", precio: "unit_price", valorTotal: "sale_value", stock: "stock", costo: "cost" })[role] || role;
}

function localRole(role) {
  return ({ date: "fecha", product: "producto", quantity: "cantidad", unit_price: "precio", sale_value: "valorTotal", stock: "stock", cost: "costo" })[role] || role;
}

function buildClassifiedTable(table, local, interpreted) {
  const remote = interpreted.result;
  const type = remote.sheet_type === "unknown" ? local.type : remote.sheet_type;
  let interpretation = type === "sales" ? local.interpretations.sales : type === "inventory" ? local.interpretations.inventory : null;
  if (interpreted.mode === "remote-ai" && interpretation) {
    for (const [remoteName, remoteAssignment] of Object.entries(remote.columns)) {
      const role = localRole(remoteName);
      if (!semanticRoles[type][role] || !table.headers.includes(remoteAssignment.source)) continue;
      interpretation.assignments[role] = {
        header: remoteAssignment.source,
        confidence: confidenceFromRemote(remoteAssignment.confidence),
        score: confidenceWeight(confidenceFromRemote(remoteAssignment.confidence)),
        sample: table.profiles[remoteAssignment.source]?.sample || ""
      };
    }
  }
  return {
    ...table,
    type,
    typeConfidence: confidenceFromRemote(remote.confidence),
    interpretation,
    mode: interpreted.mode
  };
}

function requiredMappingIssues() {
  const issues = [];
  const relevant = type => app.classified.filter(table => table.type === type);
  const usable = assignment => assignment && assignment.header && assignment.confidence !== "Baja";
  const completeSales = relevant("sales").filter(table => {
    const assignments = table.interpretation.assignments;
    return usable(assignments.fecha) && usable(assignments.producto) && usable(assignments.cantidad) && (usable(assignments.precio) || usable(assignments.valorTotal));
  });
  const completeInventory = relevant("inventory").filter(table => {
    const assignments = table.interpretation.assignments;
    return usable(assignments.producto) && usable(assignments.stock);
  });
  if (!completeSales.length) issues.push({
    title: "No encontramos ventas suficientes para continuar",
    message: relevant("sales").length ? "Hay una hoja que parece contener ventas, pero falta confirmar fecha, producto, cantidad o valor." : "No encontramos una hoja que podamos reconocer como ventas.",
    help: "Busca una hoja con fecha, producto, unidades vendidas y precio o valor total."
  });
  if (!completeInventory.length) issues.push({
    title: "No encontramos el inventario necesario",
    message: relevant("inventory").length ? "Hay una hoja que parece contener inventario, pero falta confirmar producto o existencias." : "No encontramos una hoja que podamos reconocer como inventario.",
    help: "Busca una hoja con el nombre o referencia del producto y las unidades disponibles."
  });
  return issues;
}

function changeMapping(event) {
  const table = app.classified[Number(event.target.dataset.table)];
  const role = event.target.dataset.role;
  const header = event.target.value;
  table.interpretation.assignments[role] = header ? {
    header,
    confidence: "Alta",
    score: 10,
    sample: table.profiles[header]?.sample || "Confirmada por el usuario"
  } : null;
  render();
}

function confirmInterpretation() {
  const issues = requiredMappingIssues();
  if (issues.length) return;
  const dataset = buildCanonicalDataset();
  app.dataset = dataset;
  app.analysis = analyze(dataset);
  app.semanticPending = false;
  app.completed.data = true;
  go(4);
}

function buildCanonicalDataset() {
  const sales = [], inventory = [];
  for (const table of app.classified) {
    if (!["sales", "inventory"].includes(table.type) || !table.interpretation) continue;
    const assignments = table.interpretation.assignments;
    const value = (row, role) => assignments[role]?.header ? row[assignments[role].header] : "";
    if (table.type === "sales") {
      table.rows.forEach(row => sales.push({
        fecha: value(row, "fecha"),
        producto: value(row, "producto"),
        cantidad: value(row, "cantidad"),
        precio: value(row, "precio"),
        valorTotal: value(row, "valorTotal"),
        costo: value(row, "costo")
      }));
    } else {
      table.rows.forEach(row => inventory.push({
        producto: value(row, "producto"),
        stock: value(row, "stock"),
        costo: value(row, "costo")
      }));
    }
  }
  return { sales, inventory };
}

function analyze(data) {
  const sales = data.sales || [], inventory = data.inventory || [];
  const saleValue = row => Number.isFinite(numericValue(row.valorTotal)) ? numericValue(row.valorTotal) : Number.isFinite(numericValue(row.precio)) && Number.isFinite(numericValue(row.cantidad)) ? numericValue(row.precio) * numericValue(row.cantidad) : NaN;
  const validProductSales = sales.filter(row => String(row.producto || "").trim()).length;
  const validQuantitySales = sales.filter(row => Number.isFinite(numericValue(row.cantidad)) && numericValue(row.cantidad) >= 0).length;
  const validValueSales = sales.filter(row => Number.isFinite(saleValue(row)) && saleValue(row) >= 0).length;
  const validDateSales = sales.filter(row => !Number.isNaN(new Date(row.fecha).getTime())).length;
  const validInventory = inventory.filter(row => row.producto && Number.isFinite(numericValue(row.stock)) && numericValue(row.stock) >= 0).length;
  const essentialTotal = Math.max(1, sales.length * 4 + inventory.length * 2);
  const essentialValid = validProductSales + validQuantitySales + validValueSales + validDateSales + validInventory * 2;
  const completeness = essentialValid / essentialTotal;
  const negativeCount = sales.filter(row => numericValue(row.cantidad) < 0 || saleValue(row) < 0).length + inventory.filter(row => numericValue(row.stock) < 0).length;
  const seen = new Set(), duplicates = new Set();
  sales.forEach(row => {
    const key = `${row.fecha}|${row.producto}|${row.cantidad}|${row.precio}|${row.valorTotal}`;
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  });
  const dates = sales.map(row => new Date(row.fecha)).filter(date => !Number.isNaN(date.getTime()));
  const period = dates.length > 1 ? Math.round((Math.max(...dates) - Math.min(...dates)) / 86400000) : 0;
  const saleProducts = new Set(sales.map(row => String(row.producto || "").trim()).filter(Boolean));
  const inventoryProducts = new Set(inventory.map(row => String(row.producto || "").trim()).filter(Boolean));
  const matches = [...saleProducts].filter(product => inventoryProducts.has(product)).length;
  const relation = saleProducts.size ? matches / saleProducts.size : 0;
  const costRows = inventory.filter(row => Number.isFinite(numericValue(row.costo)) && numericValue(row.costo) >= 0).length;
  const costCoverage = inventory.length ? costRows / inventory.length : 0;
  let score = 100;
  if (sales.length < 5 || inventory.length < 2) score -= 30;
  score -= Math.round((1 - completeness) * 40);
  if (negativeCount) score -= 15;
  if (duplicates.size) score -= 5;
  if (period < 30) score -= 10;
  if (relation < .5) score -= 10;
  score = Math.max(0, Math.min(100, score));
  const level = score >= 80 ? "ALTA" : score >= 55 ? "MEDIA" : "BAJA";
  const facts = [
    { ok: sales.length >= 5, text: `Encontramos ${sales.length} registros de ventas.` },
    { ok: inventory.length >= 2, text: `Encontramos ${inventory.length} productos en inventario.` },
    { ok: completeness >= .9, text: `${percent(completeness)} de los datos esenciales están completos y tienen un formato utilizable.` },
    { ok: relation >= .5, text: `Pudimos relacionar ${percent(relation)} de los productos vendidos con el inventario.` },
    { ok: period >= 30, text: `La información de ventas cubre ${period} días.` },
    { ok: !negativeCount, text: negativeCount ? `Encontramos ${countText(negativeCount, "un valor negativo", "valores negativos")} que conviene revisar.` : "No encontramos cantidades negativas inesperadas." },
    { ok: costCoverage >= .5, text: costCoverage ? `Encontramos costo para ${percent(costCoverage)} del inventario.` : "No encontramos costos; no analizaremos rentabilidad." }
  ];
  const missingParts = [];
  if (validQuantitySales < sales.length) missingParts.push(`${countText(sales.length - validQuantitySales, "venta", "ventas")} sin cantidad válida`);
  if (validProductSales < sales.length) missingParts.push(`${countText(sales.length - validProductSales, "venta", "ventas")} sin producto`);
  if (validValueSales < sales.length) missingParts.push(`${countText(sales.length - validValueSales, "venta", "ventas")} sin valor utilizable`);
  if (validInventory < inventory.length) missingParts.push(`${countText(inventory.length - validInventory, "producto", "productos")} sin existencias válidas`);
  if (sales.length < 5) missingParts.push("más registros de ventas");
  if (inventory.length < 2) missingParts.push("un inventario con al menos dos productos");
  const summary = level === "ALTA"
    ? `Encontramos ${sales.length} ventas, ${inventory.length} productos y ${percent(completeness)} de los datos esenciales completos.`
    : level === "MEDIA"
      ? `Podemos ofrecer una orientación inicial, pero conviene revisar ${missingParts.join(", ") || "algunos datos"}.`
      : "La información todavía no permite comparar ventas e inventario con suficiente confianza.";
  const quality = {
    score,
    level,
    summary,
    facts,
    missing: missingParts.length ? `Necesitamos corregir o completar: ${missingParts.join("; ")}.` : "Necesitamos más registros que permitan comparar ventas e inventario.",
    nextStep: "Busca esas columnas o registros en el archivo que ya utiliza tu negocio, complétalos y vuelve a cargarlo."
  };
  const metrics = calculateMetrics(sales, inventory, period);
  return { quality, metrics, priorities: level === "BAJA" ? [] : prioritize(metrics) };
}

function calculateMetrics(sales, inventory, period) {
  const byProduct = {};
  let revenue = 0, units = 0;
  sales.forEach(row => {
    const quantity = numericValue(row.cantidad);
    const value = Number.isFinite(numericValue(row.valorTotal)) ? numericValue(row.valorTotal) : quantity * numericValue(row.precio);
    if (!row.producto || !Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(value) || value < 0) return;
    revenue += value;
    units += quantity;
    byProduct[row.producto] ||= { units: 0, revenue: 0 };
    byProduct[row.producto].units += quantity;
    byProduct[row.producto].revenue += value;
  });
  const ranked = Object.entries(byProduct).sort((a, b) => b[1].revenue - a[1].revenue);
  const topShare = revenue && ranked[0] ? ranked[0][1].revenue / revenue : 0;
  const inv = inventory.filter(row => row.producto && Number.isFinite(numericValue(row.stock))).map(row => ({
    ...row,
    stock: numericValue(row.stock),
    cost: numericValue(row.costo),
    sold: byProduct[row.producto]?.units || 0
  }));
  const slowItems = inv.filter(row => row.stock >= 20 && row.sold <= 10).sort((a, b) => b.stock - a.stock);
  const slowUnits = slowItems.reduce((sum, row) => sum + row.stock, 0);
  const slowValue = slowItems.reduce((sum, row) => sum + (Number.isFinite(row.cost) ? row.stock * row.cost : 0), 0);
  const slowSales = slowItems.reduce((sum, row) => sum + row.sold, 0);
  const stockout = inv.filter(row => row.stock <= 5 && row.sold > 0).sort((a, b) => b.sold - a.sold)[0];
  return { revenue, units, ranked, topShare, inv, slowItems, slowUnits, slowValue, slowSales, stockout, period, products: inv.length };
}

function prioritize(metrics) {
  const findings = [];
  const concentration = {
    type: "concentration",
    title: `Gran parte de tus ventas depende de ${metrics.ranked[0]?.[0] || "un solo producto"}.`,
    reason: `${metrics.ranked[0]?.[0] || "El producto principal"} representa ${percent(metrics.topShare)} del valor vendido.`,
    evidence: `De ${money.format(metrics.revenue)} vendidos, ${money.format(metrics.ranked[0]?.[1].revenue || 0)} provienen de ese producto.`,
    meaning: "Una caída en ese producto puede afectar una parte importante de las ventas observadas.",
    action: "Comprueba si el patrón continúa y elige dos productos complementarios que puedas ofrecer junto al principal.",
    indicator: "Porcentaje del valor vendido que representa el producto principal."
  };
  const slow = metrics.slowItems.length ? {
    type: "slow",
    title: "Hay productos almacenados que casi no se venden.",
    reason: `${metrics.slowItems.length === 1 ? "Un producto tiene" : `${metrics.slowItems.length} productos tienen`} existencias altas y registraron pocas ventas durante ${metrics.period} días.`,
    evidence: `Suman ${metrics.slowUnits} unidades almacenadas y ${metrics.slowSales} unidades vendidas.${metrics.slowValue ? ` Su costo registrado es ${money.format(metrics.slowValue)}.` : ""}`,
    meaning: "Ese inventario ocupa espacio y puede mantener dinero comprometido sin generar ventas.",
    action: "Revisa esos productos y define cuáles puedes promocionar, vender juntos o dejar de comprar temporalmente.",
    indicator: "Unidades disponibles de los productos almacenados que casi no se venden.",
    items: metrics.slowItems
  } : null;
  const stockout = metrics.stockout ? {
    type: "stockout",
    title: `Podrías quedarte sin ${metrics.stockout.producto}.`,
    reason: "El producto tiene ventas registradas y muy pocas unidades disponibles.",
    evidence: `${metrics.stockout.sold} unidades vendidas y ${metrics.stockout.stock} unidades disponibles.`,
    meaning: "Si continúa vendiéndose al mismo ritmo, podrían aparecer ventas que el negocio no pueda atender.",
    action: "Confirma físicamente las existencias y revisa el siguiente pedido antes de que lleguen a cero.",
    indicator: "Días con el producto disponible sin llegar a cero."
  } : null;
  if (metrics.topShare >= .8) findings.push(concentration);
  if (slow) findings.push(slow);
  if (metrics.topShare >= .6 && metrics.topShare < .8) findings.push(concentration);
  if (stockout) findings.push(stockout);
  const fallbacks = [
    {
      type: "review",
      title: "Hay un producto que merece una revisión comercial.",
      reason: `${metrics.ranked.at(-1)?.[0] || "El producto con menor movimiento"} aportó el menor valor vendido del periodo.`,
      evidence: metrics.ranked.at(-1) ? `Registró ${metrics.ranked.at(-1)[1].units} unidades y ${money.format(metrics.ranked.at(-1)[1].revenue)} vendidos.` : "La comparación disponible es limitada.",
      meaning: "Un producto con poco movimiento puede requerir una decisión de compra, precio, exhibición o registro.",
      action: "Confirma sus ventas y existencias antes de hacer una nueva compra.",
      indicator: "Unidades vendidas del producto con menor movimiento."
    },
    {
      type: "maintain",
      title: "Protege la disponibilidad de lo que más se vende.",
      reason: `${metrics.ranked[0]?.[0] || "El producto principal"} lidera las ventas registradas.`,
      evidence: metrics.ranked[0] ? `${metrics.ranked[0][1].units} unidades y ${money.format(metrics.ranked[0][1].revenue)} vendidos.` : "Se requiere ampliar la información.",
      meaning: "Mantenerlo disponible ayuda a no perder ventas que ya muestran demanda.",
      action: "Revisa sus existencias cada semana y considera el tiempo de entrega del proveedor.",
      indicator: "Unidades disponibles del producto con más ventas."
    },
    {
      type: "data",
      title: "Mantén ventas e inventario actualizados.",
      reason: "Una actualización constante permite comparar cambios con mayor confianza.",
      evidence: `La información disponible cubre ${metrics.period} días.`,
      meaning: "Los registros continuos permiten saber si una acción realmente está funcionando.",
      action: "Actualiza ventas e inventario al menos una vez por semana.",
      indicator: "Semanas actualizadas sin interrupción."
    }
  ];
  for (const fallback of fallbacks) if (findings.length < 3 && !findings.some(item => item.type === fallback.type)) findings.push(fallback);
  return findings.slice(0, 3);
}

function metricCards() {
  const metrics = app.analysis.metrics;
  return `<article class="stat"><span>Valor vendido</span><strong>${money.format(metrics.revenue)}</strong></article>
    <article class="stat"><span>Unidades vendidas</span><strong>${metrics.units}</strong></article>
    <article class="stat"><span>Días revisados</span><strong>${metrics.period}</strong></article>
    <article class="stat"><span>Productos relacionados</span><strong>${metrics.products}</strong></article>`;
}

function getPlan() {
  const finding = app.analysis?.priorities[0];
  if (!finding) return [];
  if (finding.type === "slow") {
    const count = Math.min(10, finding.items?.length || 1);
    return [
      { when: "HOY", action: `Revisa ${count === 1 ? "el producto" : `los ${count} productos`} con más unidades almacenadas y pocas ventas.`, explain: "Confirma físicamente las existencias y las ventas pendientes de registrar." },
      { when: "ESTA SEMANA", action: "Define cuáles puedes promocionar, vender juntos o dejar de comprar temporalmente.", explain: "Cambia una sola decisión por producto para poder observar qué funciona." },
      { when: "EN 14 DÍAS", action: "Comprueba si disminuyeron las existencias de esos productos.", explain: "Compara las unidades disponibles con las registradas hoy." }
    ];
  }
  if (finding.type === "concentration") return [
    { when: "HOY", action: "Confirma cuánto depende la venta del producto principal.", explain: "Revisa si el patrón también aparece en semanas anteriores." },
    { when: "ESTA SEMANA", action: "Elige dos productos complementarios para ofrecer junto al principal.", explain: "Haz una prueba pequeña sin cambiar varias cosas al mismo tiempo." },
    { when: "EN 14 DÍAS", action: "Compara nuevamente cuánto representa el producto principal.", explain: "Observa si otros productos empezaron a aportar más ventas." }
  ];
  if (finding.type === "stockout") return [
    { when: "HOY", action: "Confirma las existencias físicas y los pedidos pendientes.", explain: "Asegúrate de que el registro coincide con la bodega." },
    { when: "ESTA SEMANA", action: "Ajusta el siguiente pedido usando las ventas recientes.", explain: "Considera también cuánto tarda el proveedor en entregar." },
    { when: "EN 14 DÍAS", action: "Comprueba si el producto se mantuvo disponible.", explain: "Registra cualquier día en que no pudiste atender una venta." }
  ];
  return [
    { when: "HOY", action: "Confirma que el dato señalado representa lo que ocurrió.", explain: "Compara el registro con la operación real." },
    { when: "ESTA SEMANA", action: "Prueba una mejora pequeña relacionada con el hallazgo.", explain: "Cambia una sola cosa para observar su efecto." },
    { when: "EN 14 DÍAS", action: "Compara nuevamente el indicador.", explain: finding.indicator }
  ];
}

function updateTask(event) {
  const index = Number(event.target.dataset.task);
  app.tasks[index] = event.target.checked;
  const done = app.tasks.filter(Boolean).length;
  document.querySelectorAll("#task-count").forEach(element => { element.textContent = `${done} de 3`; });
  event.target.closest(".action-check")?.classList.toggle("completed", event.target.checked);
}

function saveFeedback(event) {
  event.preventDefault();
  app.feedback = Object.fromEntries(new FormData(event.currentTarget));
  app.completed.feedback = true;
  go(10);
}

function showTestSummary() {
  const steps = [
    ["Análisis iniciado", app.completed.start],
    ["Contexto completado", app.completed.form],
    ["Información interpretada", app.completed.data],
    ["Calidad evaluada", app.completed.quality],
    ["Hallazgo principal generado", app.completed.priority],
    ["Plan de 3 acciones generado", app.completed.plan],
    ["Avance registrado", app.completed.feedback]
  ];
  const count = steps.filter(([, completed]) => completed).length;
  const elapsed = app.start ? Math.max(1, Math.round((Date.now() - app.start) / 60000)) : 0;
  const obtained = app.analysis?.quality.level === "BAJA" ? "Análisis detenido por información insuficiente" : app.analysis?.priorities[0]?.title || "Sin resultado";
  $("#test-dialog-content").innerHTML = `<p class="eyebrow">Modo demostración</p>
    <h2>Resultados de la prueba</h2>
    <h3>${count}/7 pasos completados exitosamente</h3>
    <div class="step-results">${steps.map(([label, completed]) => `<div class="step-row"><span>${label}</span><b>${completed ? "Completado" : "Pendiente"}</b></div>`).join("")}</div>
    <dl class="test-evidence">
      <div><dt>Dataset</dt><dd>${safe(app.datasetName || "Sin elegir")}</dd></div>
      <div><dt>Resultado esperado</dt><dd>${safe(app.expected || "Sin definir")}</dd></div>
      <div><dt>Resultado obtenido</dt><dd>${safe(obtained)}</dd></div>
      <div><dt>Calidad</dt><dd>${safe(app.analysis?.quality.level || "—")}</dd></div>
      <div><dt>Prioridad</dt><dd>${safe(app.analysis?.priorities[0]?.title || "No generada")}</dd></div>
      <div><dt>Tiempo</dt><dd>${elapsed} min</dd></div>
    </dl>`;
  $("#test-dialog").showModal();
}

function downloadExecutiveSummary() {
  if (!app.analysis || app.analysis.quality.level === "BAJA") return;
  const finding = app.analysis.priorities[0];
  const plan = getPlan();
  const context = Object.entries(app.context).filter(([, value]) => value).map(([key, value]) => `<li><strong>${safe(key)}:</strong> ${safe(value)}</li>`).join("");
  const actions = plan.map(item => `<tr><td>${safe(item.when)}</td><td>${safe(item.action)}</td><td>${safe(finding.indicator)}</td></tr>`).join("");
  const reportHtml = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Resumen ejecutivo · San José</title><style>body{font-family:Arial,sans-serif;color:#1f2937;max-width:900px;margin:40px auto;padding:0 20px;line-height:1.5}h1,h2{font-family:Georgia,serif;color:#011235}header{border-bottom:4px solid #D8A63A;padding-bottom:18px}.tag{color:#9a6500;font-weight:700;text-transform:uppercase;letter-spacing:.08em}section{margin:28px 0}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border-bottom:1px solid #E5E7EB;padding:10px;text-align:left;vertical-align:top}.priority{background:#f8f2e4;border-left:5px solid #D8A63A;padding:20px}button{background:#011235;color:#fff;border:0;padding:12px 18px}@media print{button{display:none}body{margin:15mm;padding:0}}</style></head><body><header><p class="tag">San José · Transformación Estratégica</p><h1>Resumen ejecutivo</h1><p>Tus datos te muestran qué atender primero.</p><small>${new Intl.DateTimeFormat("es-CO", { dateStyle: "long" }).format(new Date())}</small></header><section><h2>Contexto</h2><ul>${context}</ul></section><section><h2>Calidad de la información</h2><p><strong>${app.analysis.quality.level} · ${app.analysis.quality.score}/100</strong></p><p>${safe(app.analysis.quality.summary)}</p></section><section class="priority"><p class="tag">Atiende esto primero</p><h2>${safe(finding.title)}</h2><p>${safe(finding.evidence)}</p><p><strong>Por qué importa:</strong> ${safe(finding.meaning)}</p></section><section><h2>Plan de 3 acciones</h2><table><thead><tr><th>Momento</th><th>Acción</th><th>Qué observar</th></tr></thead><tbody>${actions}</tbody></table></section><section><h2>Limitaciones</h2><ul><li>El análisis se concentra en ventas e inventario.</li><li>Las cifras dependen de la calidad y cobertura de los archivos.</li><li>La IA, cuando está disponible, interpreta; el código determinístico calcula.</li><li>La decisión final corresponde al empresario.</li></ul></section><button onclick="window.print()">Imprimir o guardar como PDF</button></body></html>`;
  const blob = new Blob([reportHtml], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "resumen-ejecutivo-san-jose-v3.html";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
