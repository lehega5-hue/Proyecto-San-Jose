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
  clarifications: {},
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

let speechRecognition = null;
let speechRestartTimer = null;
let isListening = false;

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
  ejemploVentas: {
    name: "Ejemplo de ventas",
    expected: "Continuar sin inventario y priorizar una caída reciente sostenida.",
    description: "Usa este ejemplo si todavía no tienes un archivo para probar San José.",
    sales: [
      ["2026-01-10", "Producto A", 6, 100000], ["2026-01-20", "Producto B", 4, 100000],
      ["2026-02-10", "Producto A", 6, 100000], ["2026-02-20", "Producto B", 4, 100000],
      ["2026-03-10", "Producto A", 6, 100000], ["2026-03-20", "Producto B", 4, 100000],
      ["2026-04-10", "Producto A", 5, 100000], ["2026-04-20", "Producto B", 3, 100000],
      ["2026-05-10", "Producto A", 5, 100000], ["2026-05-20", "Producto B", 2, 100000],
      ["2026-06-10", "Producto A", 4, 100000], ["2026-06-20", "Producto B", 2, 100000]
    ].map(row => ({ fecha: row[0], producto: row[1], cantidad: row[2], precio: row[3] })),
    inventory: []
  }
};

const semanticRoles = {
  sales: {
    fecha: { label: "Fecha de venta", group: "main", description: "Nos permite revisar cómo cambian las ventas en el tiempo.", terms: ["fecha", "fecha venta", "fecha factura", "día", "periodo"] },
    producto: { label: "Producto / referencia", group: "main", description: "Nos permite saber qué se vendió.", terms: ["producto", "artículo", "descripción", "referencia", "sku", "item", "código producto", "mercancía"] },
    cantidad: { label: "Cantidad vendida", group: "main", measure: true, description: "Permite analizar el volumen vendido.", terms: ["cantidad", "unidades", "und", "cant", "qty", "despacho", "volumen"] },
    valorTotal: { label: "Valor total de la venta", group: "main", measure: true, description: "Permite analizar ingresos.", terms: ["valor total", "total venta", "vr total", "vr tot fac", "vr neto", "valor neto", "importe", "subtotal", "ingreso"] },
    precio: { label: "Precio unitario", group: "additional", description: "Con cantidad, permite calcular el valor total de la venta.", terms: ["precio", "precio venta", "valor unitario", "vr unitario"] },
    costo: { label: "Costo unitario", group: "additional", description: "Ayuda a estimar rentabilidad cuando también hay valor de venta.", terms: ["costo", "coste", "valor costo", "costo unitario"] },
    cliente: { label: "Cliente", group: "additional", terms: ["cliente", "nombre cliente", "nit cliente"] },
    canal: { label: "Canal de venta", group: "additional", terms: ["canal", "canal venta", "tipo venta"] },
    categoria: { label: "Categoría de producto", group: "additional", terms: ["categoría", "familia", "línea producto"] },
    sede: { label: "Sede / punto de venta", group: "additional", terms: ["sede", "punto venta", "tienda", "local"] },
    vendedor: { label: "Vendedor", group: "additional", terms: ["vendedor", "asesor", "comercial"] },
    descuento: { label: "Descuento", group: "additional", terms: ["descuento", "dto", "valor descuento"] },
    factura: { label: "Número de factura", group: "additional", terms: ["factura", "numero factura", "nro factura", "documento"] },
    ciudad: { label: "Ciudad / zona", group: "additional", terms: ["ciudad", "zona", "región", "territorio"] },
    formaPago: { label: "Forma de pago", group: "additional", terms: ["forma pago", "medio pago", "método pago"] }
  },
  inventory: {
    producto: { label: "Producto / referencia", group: "main", description: "Nos permite identificar cada artículo.", terms: ["producto", "artículo", "descripción", "referencia", "sku", "item", "código producto", "mercancía"] },
    stock: { label: "Existencia actual", group: "main", description: "Nos permite saber cuántas unidades hay disponibles.", terms: ["existencia", "existencias", "stock", "inventario", "saldo", "disponible", "cantidad actual"] },
    fechaCorte: { label: "Fecha de inventario", group: "additional", recommended: true, description: "Ayuda a saber a qué momento corresponden las existencias.", terms: ["fecha corte", "fecha inventario", "fecha saldo", "corte"] },
    costo: { label: "Costo unitario", group: "additional", terms: ["costo", "coste", "valor costo", "costo unitario"] },
    ultimoMovimiento: { label: "Fecha del último movimiento", group: "additional", terms: ["ultimo movimiento", "fecha movimiento", "última salida", "ultima entrada"] },
    inventarioMinimo: { label: "Inventario mínimo", group: "additional", terms: ["inventario minimo", "stock minimo", "mínimo"] },
    inventarioMaximo: { label: "Inventario máximo", group: "additional", terms: ["inventario maximo", "stock maximo", "máximo"] },
    puntoReposicion: { label: "Punto de reposición", group: "additional", terms: ["punto reposicion", "punto pedido", "reorden"] },
    reservada: { label: "Cantidad reservada", group: "additional", terms: ["reservada", "cantidad reservada", "comprometida"] },
    disponible: { label: "Cantidad disponible", group: "additional", terms: ["cantidad disponible", "disponible venta"] },
    pendienteRecibir: { label: "Cantidad pendiente por recibir", group: "additional", terms: ["pendiente recibir", "por recibir", "ordenado"] },
    proveedor: { label: "Proveedor", group: "additional", terms: ["proveedor", "nombre proveedor"] },
    tiempoEntrega: { label: "Tiempo de entrega", group: "additional", terms: ["tiempo entrega", "lead time", "dias entrega"] },
    bodega: { label: "Bodega / sede", group: "additional", terms: ["bodega", "almacén", "sede"] },
    categoria: { label: "Categoría", group: "additional", terms: ["categoría", "familia", "línea"] },
    lote: { label: "Lote", group: "additional", terms: ["lote", "numero lote"] },
    vencimiento: { label: "Fecha de vencimiento", group: "additional", terms: ["vencimiento", "fecha vencimiento", "caducidad"] }
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
  return `<p class="eyebrow">Contexto empresarial</p>
    <h1 class="screen-title">Cuéntanos un poco de tu negocio</h1>
    <p class="screen-intro">Tres respuestas breves nos ayudan a interpretar mejor la información. San José determinará qué atender a partir de tus datos.</p>
    <form id="context-form" class="panel compact-form">
      <div class="form-grid">
        <label>¿A qué se dedica tu negocio? *
          <select name="actividad" required>
            <option value="">Selecciona</option>
            <option>Comercio</option>
            <option>Distribución</option>
            <option>Servicios</option>
            <option>Manufactura</option>
            <option>Alimentos y restaurantes</option>
            <option>Construcción</option>
            <option>Transporte y logística</option>
            <option>Agro</option>
            <option>Salud</option>
            <option>Educación</option>
            <option>Turismo</option>
            <option>Servicios profesionales</option>
            <option value="Otro">Otro</option>
          </select>
        </label>
        <label>¿Cómo llevas hoy la información de tu negocio? *
          <select name="registro" required>
            <option value="">Selecciona</option>
            <option>Excel o Google Sheets</option>
            <option>Software contable o administrativo</option>
            <option>Sistema de punto de venta</option>
            <option>Varias herramientas</option>
            <option>Principalmente de forma manual</option>
            <option>No tengo la información organizada</option>
          </select>
        </label>
        <label>¿Cuánto tiempo lleva funcionando tu negocio? *
          <select name="antiguedad" required>
            <option value="">Selecciona</option>
            <option>Menos de 1 año</option>
            <option>1 a 2 años</option>
            <option>3 a 5 años</option>
            <option>Más de 5 años</option>
          </select>
        </label>
      </div>
      <div id="other-business" class="conditional hidden">
        <label>¿A qué se dedica?<input name="actividadOtro" maxlength="120" placeholder="Descríbelo brevemente"></label>
      </div>
      <section class="free-context">
        <div>
          <p class="eyebrow">Opcional</p>
          <h2>Cuéntanos tu negocio con tus palabras</h2>
          <p>Puedes escribir o hablar. Cuéntanos brevemente qué hace tu negocio y cualquier situación reciente que creas importante.</p>
        </div>
        <div class="context-guide"><strong>Si quieres, puedes contarnos:</strong><ul><li>qué vende o hace tu negocio;</li><li>quiénes son tus principales clientes;</li><li>si pasó algo importante recientemente.</li></ul></div>
        <label for="business-story">Escribir o dictar<textarea id="business-story" name="contextoLibre" rows="5" placeholder="Escribe aquí. Podrás revisar y corregir el texto antes de continuar."></textarea></label>
        <button id="voice-button" class="button secondary hidden" type="button" aria-pressed="false">🎙️ Empezar a hablar</button>
        <p id="voice-status" class="message" role="status"></p>
        <small>Solo conservamos la transcripción textual en este formulario durante la sesión.</small>
      </section>
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
    <div class="case-divider"><span>Probar con un ejemplo</span></div>
    <section class="single-example">
      <div><span class="case-tag">Ejemplo de ventas</span><h2>Ejemplo de ventas</h2><p>Usa este ejemplo si todavía no tienes un archivo para probar San José.</p></div>
      <button class="button secondary" type="button" data-dataset="ejemploVentas">Probar con ejemplo de ventas</button>
    </section>
    ${app.semanticPending ? interpretationPanel() : app.dataset ? datasetScopePanel() : nav(2, null)}`;
}

function datasetScopePanel() {
  const hasSales = app.dataset.sales.length > 0;
  const hasInventory = app.dataset.inventory.length > 0;
  if (hasSales && hasInventory) return `<div class="scope-message success-scope"><h2>Perfecto. Encontramos ventas e inventario.</h2><p>Podemos relacionar ambas fuentes y realizar el análisis completo.</p></div>${nav(2, 4, "Revisar información")}`;
  if (hasSales) return `<div class="scope-message"><h2>Encontramos información de ventas, pero no encontramos inventario.</h2><h3>Sí podemos ayudarte con tus ventas.</h3><p>Podemos revisar cambios en el tiempo, productos relevantes y concentración de las ventas.</p><p>Sin inventario no podremos saber si tienes productos acumulados o si podrías quedarte sin existencias.</p><p><strong>¿Quieres continuar solo con tus ventas?</strong></p></div><div class="partial-actions"><button class="button secondary" type="button" data-focus-upload>Agregar inventario</button><button class="button gold" type="button" data-go="4">Sí, analizar mis ventas →</button></div>`;
  if (hasInventory) return `<div class="scope-message"><h2>Encontramos inventario, pero no ventas.</h2><p>Podemos revisar la información disponible, pero necesitamos ventas para saber qué productos se venden y cuáles permanecen almacenados.</p></div><div class="partial-actions"><button class="button secondary" type="button" data-focus-upload>Agregar ventas</button><button class="button gold" type="button" data-go="4">Continuar con lo que tenemos →</button></div>`;
  return "";
}

function formatBytes(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function interpretationPanel() {
  const issues = requiredMappingIssues();
  const scope = interpretedScope();
  const found = app.classified.map((table, index) => {
    const typeLabel = table.type === "sales" ? "Parece contener ventas" : table.type === "inventory" ? "Parece contener inventario" : table.type === "additional" ? "Información complementaria. No la necesitamos en esta versión" : "No estamos seguros de qué contiene";
    return `<li class="found-sheet ${table.type}">
      <div><strong>${safe(table.fileName)}</strong><span>Hoja: ${safe(table.sheetName)}</span></div>
      <div><b>${typeLabel}</b><small>Confianza: ${safe(table.typeConfidence)}</small></div>
    </li>`;
  }).join("");
  const relevant = app.classified
    .map((table, index) => ({ table, index }))
    .filter(item => ["sales", "inventory"].includes(item.table.type));
  const additional = app.classified.filter(table => table.type === "additional");
  const unknown = app.classified.filter(table => table.type === "unknown");
  return `<section class="panel interpretation-panel">
    <p class="eyebrow">Analista San José · ${app.semanticMode === "remote-ai" ? "interpretación remota" : "motor local de respaldo"}</p>
    <h2>Esto es lo que encontramos</h2>
    <p>Revisamos archivos, hojas, encabezados, tipos de datos y muestras de valores.</p>
    <ul class="found-list">${found}</ul>
    ${additional.length ? `<p class="optional-note">También encontramos ${countText(additional.length, "una hoja", "hojas")} con información adicional. Esta versión de San José se concentra únicamente en ventas e inventario.</p>` : ""}
    ${unknown.length ? `<p class="optional-note">No logramos reconocer ${countText(unknown.length, "una hoja", "hojas")}. Puedes continuar si ya encontramos ventas o inventario.</p>` : ""}
    <h2>Esto es lo que entendimos</h2>
    <p>Revisa qué identificó San José. Puedes confirmar, cambiar o indicar que no tienes un dato.</p>
    <div class="interpretation-key"><span><b>Confianza de interpretación</b>: qué tan seguros estamos del significado de una columna.</span><span>La calidad de los datos se evaluará después de tu confirmación.</span></div>
    <div class="sheet-mappings">
      ${relevant.map(item => mappingCard(item.table, item.index)).join("")}
    </div>
    <div id="mapping-issues">${issues.map(issue => `<div class="low-stop"><h3>${safe(issue.title)}</h3><p>${safe(issue.message)}</p><small>${safe(issue.help)}</small></div>`).join("")}</div>
    ${availabilitySummary()}
    ${analysisScopePanel(scope)}
    <div class="partial-actions">
      <button class="button secondary" type="button" id="clear-files">Elegir otros archivos</button>
      ${scope.hasSales && !scope.hasInventory ? '<button class="button secondary" type="button" data-focus-upload>Agregar inventario</button>' : ""}
      ${scope.hasInventory && !scope.hasSales ? '<button class="button secondary" type="button" data-focus-upload>Agregar ventas</button>' : ""}
      <button id="confirm-mapping" class="button gold" type="button" ${issues.length ? "disabled" : ""}>${scope.hasSales && !scope.hasInventory ? "Sí, analizar mis ventas" : scope.hasInventory && !scope.hasSales ? "Continuar con lo que tenemos" : "Confirmar y analizar"} →</button>
    </div>
  </section>`;
}

function mappingCard(table, tableIndex) {
  const mainRoles = table.type === "sales" ? ["fecha", "producto"] : ["producto", "stock"];
  const additionalRoles = table.type === "sales"
    ? ["cantidad", "valorTotal", "precio", "costo", "cliente", "canal", "categoria", "sede", "vendedor", "descuento"]
    : ["fechaCorte", "costo", "ultimoMovimiento", "categoria", "bodega", "inventarioMinimo", "inventarioMaximo", "puntoReposicion", "proveedor", "vencimiento"];
  return `<article class="mapping-card">
    <header><div><span>${table.type === "sales" ? "Ventas" : "Inventario"}</span><h3>${safe(table.sheetName)}</h3></div><small>${safe(table.fileName)}</small></header>
    <section class="needed-data"><h4>Datos principales</h4>${table.type === "sales" ? '<p>Necesitamos fecha, producto y al menos una medida: cantidad vendida o valor total.</p>' : '<p>Necesitamos producto y existencia actual.</p>'}</section>
    <div class="interpretation-rows">
      ${mainRoles.map(role => interpretationRow(table, tableIndex, role)).join("")}
      ${table.type === "sales" ? `<section class="measure-group"><div class="measure-group-title"><span>Dato que necesitamos</span><h4>Medida de la venta</h4><small>Al menos una: cantidad vendida o valor total.</small></div>${["cantidad", "valorTotal"].map(role => interpretationRow(table, tableIndex, role, true)).join("")}</section>` : ""}
    </div>
    <details class="additional-data"><summary>Ver datos adicionales (${additionalRoles.length})</summary><p>Son opcionales y pueden ampliar el análisis.</p>${additionalRoles.map(role => interpretationRow(table, tableIndex, role)).join("")}</details>
  </article>`;
}

function roleDecision(tableIndex, role) {
  return app.clarifications[`${tableIndex}:${role}`] || null;
}

function interpretationRow(table, tableIndex, role, measureOption = false) {
  const config = semanticRoles[table.type][role];
  const assignment = table.interpretation.assignments[role];
  const decision = roleDecision(tableIndex, role);
  const editing = decision?.status === "editing";
  const unavailable = ["missing", "ignored", "unknown"].includes(decision?.status);
  const sourceIndex = assignmentSourceIndex(assignment, tableIndex);
  const sourceTable = app.classified[sourceIndex] || table;
  const samples = assignment?.header ? (sourceTable.profiles?.[assignment.header]?.sample || assignment.sample || "Sin muestra") : "";
  if (unavailable && !editing) return `<article class="interpretation-item unavailable">
    <div><span>Dato que necesitamos</span><h5>${safe(config.label)}</h5><small>Indicaste que este dato no está disponible.</small></div>
    <div class="interpretation-status"><b>○ No disponible</b><button class="text-link interpretation-action" type="button" data-action="edit" data-table="${tableIndex}" data-role="${role}">Cambiar decisión</button></div>
  </article>`;
  const ambiguity = assignment && assignment.confidence !== "Alta" && !assignment.confirmed;
  const duplicate = assignment?.duplicates?.length > 1 && !assignment.confirmed;
  return `<article class="interpretation-item ${ambiguity || duplicate || !assignment ? "needs-review" : ""} ${measureOption ? "measure-option" : ""}">
    ${ambiguity ? '<p class="human-help">Necesitamos tu ayuda para entender este dato.</p>' : ""}
    ${duplicate ? `<p class="duplicate-warning">Encontramos dos columnas que podrían representar ${safe(config.label)}. ¿Cuál quieres utilizar?</p>` : ""}
    <div class="interpretation-main">
      <div><span>${measureOption ? "Opción de medida" : "Dato que necesitamos"}</span><h5>${safe(config.label)}</h5></div>
      <div><span>Columna encontrada</span><strong>${assignment ? `“${safe(assignment.header)}”` : "No encontrada"}</strong>${assignment && sourceTable !== table ? `<small>Hoja: ${safe(sourceTable.sheetName)}</small>` : ""}${assignment ? `<small>Ejemplos: ${safe(samples)}</small>` : ""}</div>
      <div><span>Confianza</span><strong>${assignment ? safe(assignment.confidence) : "—"}</strong></div>
      <div><span>Estado</span><strong>${assignment?.confirmed ? "✓ Confirmado por ti" : assignment ? "✓ Identificada por San José" : "⚠ Necesita revisión"}</strong></div>
    </div>
    ${ambiguity ? ambiguousMeaningChooser(table, tableIndex, role, assignment) : ""}
    ${editing || !assignment || duplicate ? columnChooser(table, tableIndex, role, assignment) : ""}
    ${assignment && !editing && !duplicate ? `<div class="interpretation-actions">${assignment.confirmed ? "" : `<button class="button mini interpretation-action" type="button" data-action="confirm" data-table="${tableIndex}" data-role="${role}">Sí, está bien</button>`}<button class="button mini secondary interpretation-action" type="button" data-action="edit" data-table="${tableIndex}" data-role="${role}">Cambiar</button><button class="text-link interpretation-action" type="button" data-action="missing" data-table="${tableIndex}" data-role="${role}">No tengo ese dato</button></div>` : ""}
  </article>`;
}

function ambiguousMeaningChooser(table, tableIndex, role, assignment) {
  const preferred = table.type === "sales" ? ["valorTotal", "precio", "costo", "cantidad", "producto", "fecha"] : ["stock", "costo", "producto", "fechaCorte"];
  return `<div class="ambiguous-meaning"><label>¿Qué representa “${safe(assignment.header)}”?
    <select class="ambiguous-role-select" data-table="${tableIndex}" data-role="${role}" data-header="${safe(assignment.header)}"><option value="">Selecciona</option>${preferred.map(optionRole => `<option value="${optionRole}" ${role === optionRole ? "selected" : ""}>${safe(semanticRoles[table.type][optionRole].label)}</option>`).join("")}<option value="other">Otra información</option><option value="unknown">No sé</option></select>
  </label></div>`;
}

function columnChooser(table, tableIndex, role, assignment) {
  const config = semanticRoles[table.type][role];
  const selectedSource = assignmentSourceIndex(assignment, tableIndex);
  const selectedValue = assignment?.header ? columnOptionValue(selectedSource, assignment.header) : "";
  const decision = roleDecision(tableIndex, role);
  const groups = app.classified.map((sourceTable, sourceIndex) => `<optgroup label="${safe(sourceTable.sheetName)} · ${safe(sourceTable.fileName)}">${sourceTable.headers.map(header => {
    const value = columnOptionValue(sourceIndex, header);
    return `<option value="${safe(value)}" ${value === selectedValue ? "selected" : ""}>${safe(header)}</option>`;
  }).join("")}</optgroup>`).join("");
  const sourceTable = app.classified[selectedSource] || table;
  const sample = assignment?.header ? sourceTable.profiles?.[assignment.header]?.sample : "";
  return `<div class="column-chooser"><label>¿Qué columna contiene ${safe(config.label.toLowerCase())}?
    <select class="role-column-select" data-table="${tableIndex}" data-role="${role}"><option value="">Seleccionar columna</option>${groups}</select>
    ${assignment?.header ? `<small class="column-preview"><b>${safe(sourceTable.sheetName)} · ${safe(assignment.header)}</b><br>Ejemplos: ${safe(sample || "Sin muestra")}</small>` : ""}
    ${decision?.error ? `<small class="duplicate-warning" role="alert">${safe(decision.error)}</small>` : ""}
  </label><button class="text-link interpretation-action" type="button" data-action="missing" data-table="${tableIndex}" data-role="${role}">No tengo ese dato</button></div>`;
}

function columnOptionValue(sourceTableIndex, header) {
  return `${sourceTableIndex}::${encodeURIComponent(header)}`;
}

function parseColumnOption(value, fallbackTableIndex) {
  if (!String(value).includes("::")) return { sourceTableIndex: fallbackTableIndex, header: value };
  const separator = String(value).indexOf("::");
  return {
    sourceTableIndex: Number(String(value).slice(0, separator)),
    header: decodeURIComponent(String(value).slice(separator + 2))
  };
}

function assignmentSourceIndex(assignment, fallbackTableIndex) {
  return Number.isInteger(assignment?.sourceTableIndex) ? assignment.sourceTableIndex : fallbackTableIndex;
}

function coherentSourceIndex(tableIndex, assignments, roles) {
  const usable = roles.map(role => assignments[role]).filter(isUsableAssignment);
  if (!usable.length || usable.length !== roles.length) return null;
  const sources = new Set(usable.map(assignment => assignmentSourceIndex(assignment, tableIndex)));
  return sources.size === 1 ? [...sources][0] : null;
}

function interpretedScope() {
  const hasSales = app.classified.some((table, tableIndex) => {
    if (table.type !== "sales") return false;
    const assignments = table.interpretation.assignments;
    return ["cantidad", "valorTotal"].some(measure => coherentSourceIndex(tableIndex, assignments, ["fecha", "producto", measure]) !== null);
  });
  const hasInventory = app.classified.some((table, tableIndex) => table.type === "inventory" && coherentSourceIndex(tableIndex, table.interpretation.assignments, ["producto", "stock"]) !== null);
  return { hasSales, hasInventory };
}

function isUsableAssignment(assignment) {
  return Boolean(assignment?.header && (assignment.confidence === "Alta" || assignment.confirmed) && !(assignment.duplicates?.length > 1 && !assignment.confirmed));
}

function roleAvailability(type, role) {
  const found = app.classified.filter(table => table.type === type).map(table => table.interpretation.assignments[role]).filter(Boolean);
  if (found.some(isUsableAssignment)) return "available";
  if (found.length) return "review";
  return "missing";
}

function availabilitySummary() {
  const item = (type, role, label = semanticRoles[type][role].label) => {
    let status = roleAvailability(type, role);
    const calculated = type === "sales" && role === "valorTotal" && status !== "available" && roleAvailability("sales", "cantidad") === "available" && roleAvailability("sales", "precio") === "available";
    if (calculated) status = "available";
    return `<li class="${status}"><b>${status === "available" ? "✓" : status === "review" ? "!" : "○"}</b> ${safe(label)}${calculated ? " — San José lo calculará con cantidad × precio" : status === "missing" ? " no encontrado" : ""}</li>`;
  };
  const hasSales = app.classified.some(table => table.type === "sales");
  const hasInventory = app.classified.some(table => table.type === "inventory");
  return `<section class="availability-summary"><h3>Resumen de la información</h3><div>${hasSales ? `<article><h4>Ventas</h4><ul>${item("sales", "fecha", "Fecha")}${item("sales", "producto", "Producto")}${item("sales", "valorTotal", "Valor de venta")}${item("sales", "cantidad", "Cantidad")}${item("sales", "costo", "Costo")}</ul></article>` : ""}${hasInventory ? `<article><h4>Inventario</h4><ul>${item("inventory", "producto", "Producto")}${item("inventory", "stock", "Existencia")}${item("inventory", "ultimoMovimiento", "Último movimiento")}</ul></article>` : ""}</div><p class="availability-legend">✓ Disponible &nbsp; ! Necesita revisión &nbsp; ○ No disponible</p></section>`;
}

function analysisScopePanel(scope) {
  const available = [], unavailable = [];
  const has = (type, role) => roleAvailability(type, role) === "available";
  const salesMeasure = has("sales", "cantidad") || has("sales", "valorTotal");
  const revenue = has("sales", "valorTotal") || (has("sales", "cantidad") && has("sales", "precio"));
  if (scope.hasSales && salesMeasure) available.push("cómo han cambiado tus ventas", revenue ? "qué productos generan más ingresos" : "qué productos venden más unidades", "si dependes demasiado de pocos productos");
  if (scope.hasInventory) available.push("cuántas existencias tienes registradas por producto");
  if (revenue && has("sales", "costo")) available.push("una aproximación inicial a la rentabilidad");
  else unavailable.push("Rentabilidad — no encontramos costos y valor de venta suficientes.");
  if (!(scope.hasSales && scope.hasInventory && has("sales", "cantidad"))) unavailable.push("Productos acumulados — necesitamos ventas por cantidad e inventario.");
  if (!revenue && scope.hasSales) unavailable.push("Ingresos — necesitamos valor total o cantidad con precio unitario.");
  return `<section class="analysis-scope"><div><h3>Con esta información podemos analizar:</h3><ul>${available.length ? available.map(text => `<li>✓ ${safe(text)}</li>`).join("") : "<li>! Primero necesitamos completar los datos principales.</li>"}</ul></div><div><h3>Todavía no podemos analizar:</h3><ul>${unavailable.map(text => `<li>○ ${safe(text)}</li>`).join("") || "<li>✓ No identificamos limitaciones adicionales para este alcance.</li>"}</ul></div></section>`;
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
    </div>${nav(3, null)}` : app.analysis.adaptiveNeeded ? adaptiveQuestionPanel() : nav(3, 5, "Ver qué atender primero")}`;
}

function adaptiveQuestionPanel() {
  const trend = app.analysis.priorities[0];
  return `<form id="adaptive-form" class="panel adaptive-panel">
    <p class="eyebrow">Antes de recomendarte qué hacer</p>
    <h2>${safe(trend.title)}</h2>
    <p>Necesitamos confirmar si ocurrió algo fuera de lo normal durante ese periodo.</p>
    <label>¿Qué pasó?
      <select name="eventoReciente" required>
        <option value="">Selecciona</option>
        <option>Cerramos algunos días</option>
        <option>Tuvimos problemas para conseguir productos</option>
        <option>Cambiamos precios</option>
        <option>Perdimos un cliente importante</option>
        <option>No pasó nada especial</option>
        <option>Otro</option>
      </select>
    </label>
    <div class="actions"><button class="button secondary" type="button" data-go="3">← Volver</button><button class="button gold" type="submit">Continuar con este contexto →</button></div>
  </form>`;
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
    $("#context-form select[name='actividad']").addEventListener("change", toggleOtherBusiness);
    toggleOtherBusiness();
    setupSpeechRecognition();
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
    document.querySelectorAll(".interpretation-action").forEach(button => button.addEventListener("click", handleInterpretationAction));
    document.querySelectorAll(".role-column-select").forEach(select => select.addEventListener("change", selectRoleColumn));
    document.querySelectorAll(".ambiguous-role-select").forEach(select => select.addEventListener("change", selectAmbiguousMeaning));
    $("#confirm-mapping")?.addEventListener("click", confirmInterpretation);
    $("#clear-files")?.addEventListener("click", resetUploads);
    document.querySelectorAll("[data-focus-upload]").forEach(button => button.addEventListener("click", () => $("#business-files")?.click()));
  }
  if ([7, 8].includes(app.step)) document.querySelectorAll(".task-check").forEach(input => input.addEventListener("change", updateTask));
  if (app.step === 4) $("#adaptive-form")?.addEventListener("submit", saveAdaptiveContext);
  if (app.step === 9) $("#feedback-form").addEventListener("submit", saveFeedback);
}

function toggleOtherBusiness() {
  const select = $("#context-form select[name='actividad']");
  const visible = select.value === "Otro";
  $("#other-business").classList.toggle("hidden", !visible);
  $("#other-business input").required = visible;
}

function saveContext(event) {
  event.preventDefault();
  if (isListening && speechRecognition) {
    isListening = false;
    clearTimeout(speechRestartTimer);
    speechRecognition.stop();
  }
  app.context = Object.fromEntries(new FormData(event.currentTarget));
  app.completed.form = true;
  go(3);
}

function saveAdaptiveContext(event) {
  event.preventDefault();
  app.context.eventoReciente = new FormData(event.currentTarget).get("eventoReciente");
  app.analysis = analyze(app.dataset);
  render();
}

function setupSpeechRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const button = $("#voice-button");
  if (!Recognition || !button) return;
  const textarea = $("#business-story");
  const status = $("#voice-status");
  let baseText = "";
  let finalTranscript = "";
  let interimTranscript = "";

  button.classList.remove("hidden");
  speechRecognition = new Recognition();
  speechRecognition.lang = "es-CO";
  speechRecognition.interimResults = true;
  speechRecognition.continuous = true;

  const updateTranscript = () => {
    const dictated = [finalTranscript.trim(), interimTranscript.trim()].filter(Boolean).join(" ");
    textarea.value = [baseText.trim(), dictated].filter(Boolean).join(" ");
  };
  const showIdleButton = () => {
    button.textContent = "🎙️ Empezar a hablar";
    button.setAttribute("aria-pressed", "false");
    button.classList.remove("listening");
  };
  const startRecognition = () => {
    if (!isListening) return;
    try {
      speechRecognition.start();
    } catch (error) {
      if (error.name !== "InvalidStateError") {
        isListening = false;
        showIdleButton();
        status.textContent = "No pudimos usar el micrófono. Puedes escribir tu contexto.";
      }
    }
  };

  speechRecognition.onresult = event => {
    finalTranscript = "";
    interimTranscript = "";
    Array.from(event.results).forEach(result => {
      const text = result[0]?.transcript || "";
      if (result.isFinal) finalTranscript += `${text} `;
      else interimTranscript += `${text} `;
    });
    updateTranscript();
  };
  speechRecognition.onerror = event => {
    if (event.error === "no-speech" && isListening) {
      status.textContent = "Te estamos escuchando…";
      return;
    }
    if (event.error === "aborted" && !isListening) return;
    isListening = false;
    clearTimeout(speechRestartTimer);
    showIdleButton();
    status.textContent = ["not-allowed", "service-not-allowed"].includes(event.error)
      ? "No tenemos permiso para usar el micrófono. Puedes continuar escribiendo."
      : "No pudimos usar el micrófono. Puedes escribir tu contexto.";
  };
  speechRecognition.onend = () => {
    if (!isListening) return;
    baseText = textarea.value.trim();
    finalTranscript = "";
    interimTranscript = "";
    status.textContent = "Te estamos escuchando…";
    speechRestartTimer = setTimeout(startRecognition, 150);
  };

  button.addEventListener("click", () => {
    if (isListening) {
      isListening = false;
      clearTimeout(speechRestartTimer);
      speechRecognition.stop();
      showIdleButton();
      status.textContent = "Listo. Puedes revisar y corregir el texto antes de continuar.";
      return;
    }
    baseText = textarea.value.trim();
    finalTranscript = "";
    interimTranscript = "";
    isListening = true;
    button.textContent = "■ Terminar";
    button.setAttribute("aria-pressed", "true");
    button.classList.add("listening");
    status.textContent = "Te estamos escuchando…";
    startRecognition();
  });
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
  const incoming = Array.from(fileList || []);
  if (!incoming.length) return;
  const files = app.source === "custom"
    ? [...app.files, ...incoming].filter((file, index, all) => all.findIndex(candidate => candidate.name === file.name && candidate.size === file.size) === index)
    : incoming;
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
      table.businessContext = {
        activity: app.context.actividad === "Otro" ? app.context.actividadOtro : app.context.actividad,
        information_management: app.context.registro,
        business_age: app.context.antiguedad,
        optional_context: app.context.contextoLibre
      };
      table.profiles = Object.fromEntries(table.headers.map(header => [header, columnProfile(table.rows, header)]));
      const local = localClassifyTable(table);
      const interpreted = await window.AIDataInterpreter.interpret(table, () => local.remote);
      if (interpreted.mode === "remote-ai") usedRemote = true;
      const classifiedTable = buildClassifiedTable(table, local, interpreted);
      const sourceTableIndex = app.classified.length;
      if (classifiedTable.interpretation) Object.values(classifiedTable.interpretation.assignments).forEach(assignment => {
        if (assignment) assignment.sourceTableIndex = sourceTableIndex;
      });
      app.classified.push(classifiedTable);
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
  if (["fecha", "fechaCorte", "ultimoMovimiento", "vencimiento"].includes(role)) score += profile.dates * 6;
  if (["cantidad", "precio", "valorTotal", "costo", "stock", "inventarioMinimo", "inventarioMaximo", "puntoReposicion", "reservada", "disponible", "pendienteRecibir", "tiempoEntrega", "descuento"].includes(role)) score += profile.numeric * 3;
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
    const duplicates = best.score >= 8 ? ranked.filter(item => item.score >= 8 && best.score - item.score <= 1).map(item => item.header) : [];
    assignments[role] = { header: best.header, confidence: duplicates.length > 1 ? "Media" : confidence, score: best.score, sample: best.profile.sample, duplicates };
  }
  return { headers: table.headers, assignments, rowCount: table.rows.length };
}

function localClassifyTable(table) {
  if (table.empty || !table.rows.length) return {
    type: "unknown",
    typeConfidence: "Baja",
    interpretations: {},
    remote: { sheet_type: "unknown", confidence: "low", columns: {} }
  };
  const sales = inferInterpretation(table, "sales");
  const inventory = inferInterpretation(table, "inventory");
  const usable = assignment => assignment && assignment.confidence !== "Baja";
  const salesScore = ["fecha", "producto"].filter(role => usable(sales.assignments[role])).length * 3
    + (usable(sales.assignments.cantidad) || usable(sales.assignments.valorTotal) ? 4 : 0);
  const inventoryScore = ["producto", "stock"].filter(role => usable(inventory.assignments[role])).length * 4;
  const name = normalize(`${table.fileName} ${table.sheetName}`);
  const salesBonus = /(venta|factur|despach|salida)/.test(name) ? 3 : 0;
  const inventoryBonus = /(invent|exist|bodega|stock)/.test(name) ? 3 : 0;
  const additionalName = /(cliente|proveedor|nomina|empleado|impuesto|resumen|contab|cartera)/.test(name);
  let type = "unknown";
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
  const conflicts = app.classified.flatMap(table => table.interpretation ? Object.entries(table.interpretation.assignments).filter(([, assignment]) => assignment?.duplicates?.length > 1 && !assignment.confirmed) : []);
  if (conflicts.length) issues.push({
    title: "Necesitamos resolver una interpretación duplicada",
    message: "Encontramos dos columnas posibles para el mismo dato.",
    help: "Elige cuál quieres utilizar antes de continuar."
  });
  const principalRoles = { sales: ["fecha", "producto", "cantidad", "valorTotal"], inventory: ["producto", "stock"] };
  const repeatedColumns = app.classified.flatMap((table, tableIndex) => {
    if (!principalRoles[table.type]) return [];
    const seen = new Map();
    return principalRoles[table.type].flatMap(role => {
      const assignment = table.interpretation.assignments[role];
      if (!assignment?.header) return [];
      const key = `${assignmentSourceIndex(assignment, tableIndex)}::${assignment.header}`;
      if (seen.has(key)) return [[seen.get(key), role]];
      seen.set(key, role);
      return [];
    });
  });
  if (repeatedColumns.length) issues.push({
    title: "Una columna está asignada a dos datos principales",
    message: "Cada dato principal debe usar una columna distinta.",
    help: "Pulsa Cambiar y elige otra columna para una de las asignaciones."
  });
  const incoherent = app.classified.some((table, tableIndex) => {
    if (!table.interpretation || !["sales", "inventory"].includes(table.type)) return false;
    const assignments = table.interpretation.assignments;
    const roleSets = table.type === "sales" ? [["fecha", "producto", "cantidad"], ["fecha", "producto", "valorTotal"]] : [["producto", "stock"]];
    return roleSets.some(roles => roles.every(role => isUsableAssignment(assignments[role])) && coherentSourceIndex(tableIndex, assignments, roles) === null);
  });
  if (incoherent) issues.push({
    title: "Los datos principales quedaron en hojas distintas",
    message: "Esta versión necesita que los datos principales de cada análisis estén en la misma hoja.",
    help: "Así evitamos combinar filas equivocadas. Cambia la asignación y selecciona columnas de una misma hoja."
  });
  const scope = interpretedScope();
  if (!scope.hasSales && !scope.hasInventory) {
    if (relevant("sales").length) issues.push({
      title: "Necesitamos entender mejor las ventas",
      message: "Necesitamos fecha, producto y al menos cantidad o valor total de la venta.",
      help: "Confirma o corrige los datos principales. Si no existen, San José adaptará el alcance."
    });
    if (relevant("inventory").length) issues.push({
      title: "Necesitamos entender mejor el inventario",
      message: "Encontramos inventario, pero todavía no identificamos producto y existencias con suficiente seguridad.",
      help: "Responde las preguntas marcadas arriba o agrega una hoja más clara."
    });
    if (!relevant("sales").length && !relevant("inventory").length) issues.push({
      title: "Todavía no reconocemos ventas ni inventario",
      message: "Encontramos archivos, pero su contenido parece complementario o desconocido.",
      help: "Agrega un archivo con ventas o inventario y vuelve a intentarlo."
    });
  }
  return issues;
}

function handleInterpretationAction(event) {
  const tableIndex = Number(event.currentTarget.dataset.table);
  const role = event.currentTarget.dataset.role;
  const action = event.currentTarget.dataset.action;
  const table = app.classified[tableIndex];
  const assignment = table.interpretation.assignments[role];
  const key = `${tableIndex}:${role}`;
  if (action === "confirm" && assignment) {
    assignment.confirmed = true;
    assignment.duplicates = [];
    app.clarifications[key] = { status: "confirmed" };
  } else if (action === "edit") app.clarifications[key] = { status: "editing" };
  else if (action === "ignore") {
    app.clarifications[key] = { status: "ignored", header: assignment?.header || "" };
    table.interpretation.assignments[role] = null;
  } else if (action === "missing") {
    app.clarifications[key] = { status: "missing" };
    table.interpretation.assignments[role] = null;
  }
  refreshInterpretationAnalysis();
  render();
}

function selectRoleColumn(event) {
  const tableIndex = Number(event.target.dataset.table);
  const role = event.target.dataset.role;
  const { sourceTableIndex, header } = parseColumnOption(event.target.value, tableIndex);
  if (!header) return;
  const table = app.classified[tableIndex];
  const sourceTable = app.classified[sourceTableIndex];
  if (!sourceTable?.headers.includes(header)) return;
  const importantRoles = table.type === "sales" ? ["fecha", "producto", "cantidad", "valorTotal"] : ["producto", "stock"];
  const usedBy = importantRoles.find(otherRole => {
    if (otherRole === role) return false;
    const other = table.interpretation.assignments[otherRole];
    return other?.header === header && assignmentSourceIndex(other, tableIndex) === sourceTableIndex;
  });
  if (usedBy) {
    app.clarifications[`${tableIndex}:${role}`] = {
      status: "editing",
      error: `Esta columna ya está siendo utilizada como ${semanticRoles[table.type][usedBy].label}. Elige otra columna.`
    };
    render();
    return;
  }
  table.interpretation.assignments[role] = {
    header,
    sourceTableIndex,
    confidence: "Alta",
    confirmed: true,
    userSelected: true,
    duplicates: [],
    score: 10,
    sample: sourceTable.profiles?.[header]?.sample || "Sin muestra"
  };
  app.clarifications[`${tableIndex}:${role}`] = { status: "confirmed" };
  refreshInterpretationAnalysis();
  render();
}

function refreshInterpretationAnalysis() {
  const scope = interpretedScope();
  if (!scope.hasSales && !scope.hasInventory) {
    app.dataset = null;
    app.analysis = null;
    return;
  }
  app.dataset = buildCanonicalDataset();
  app.analysis = analyze(app.dataset);
}

function selectAmbiguousMeaning(event) {
  const tableIndex = Number(event.target.dataset.table);
  const currentRole = event.target.dataset.role;
  const header = event.target.dataset.header;
  const selectedRole = event.target.value;
  if (!selectedRole) return;
  const table = app.classified[tableIndex];
  table.interpretation.assignments[currentRole] = null;
  if (semanticRoles[table.type][selectedRole]) {
    table.interpretation.assignments[selectedRole] = {
      header,
      sourceTableIndex: tableIndex,
      confidence: "Alta",
      confirmed: true,
      userSelected: true,
      duplicates: [],
      score: 10,
      sample: table.profiles[header]?.sample || "Sin muestra"
    };
    app.clarifications[`${tableIndex}:${selectedRole}`] = { status: "confirmed" };
  } else app.clarifications[`${tableIndex}:${currentRole}`] = { status: selectedRole === "other" ? "ignored" : "unknown", header };
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
  const processed = new Set();
  for (const [tableIndex, table] of app.classified.entries()) {
    if (!["sales", "inventory"].includes(table.type) || !table.interpretation) continue;
    const assignments = table.interpretation.assignments;
    if (table.type === "sales") {
      const sourceIndex = coherentSourceIndex(tableIndex, assignments, ["fecha", "producto", "cantidad"])
        ?? coherentSourceIndex(tableIndex, assignments, ["fecha", "producto", "valorTotal"]);
      if (sourceIndex === null || processed.has(`sales:${sourceIndex}`)) continue;
      const sourceTable = app.classified[sourceIndex];
      const value = (row, role) => isUsableAssignment(assignments[role]) && assignmentSourceIndex(assignments[role], tableIndex) === sourceIndex ? row[assignments[role].header] : "";
      processed.add(`sales:${sourceIndex}`);
      sourceTable.rows.forEach(row => {
        const record = Object.fromEntries(Object.keys(semanticRoles.sales).map(role => [role, value(row, role)]));
        if (!record.valorTotal && Number.isFinite(numericValue(record.cantidad)) && Number.isFinite(numericValue(record.precio))) {
          record.valorTotal = numericValue(record.cantidad) * numericValue(record.precio);
          record.valorTotalCalculado = true;
        }
        sales.push(record);
      });
    } else {
      const sourceIndex = coherentSourceIndex(tableIndex, assignments, ["producto", "stock"]);
      if (sourceIndex === null || processed.has(`inventory:${sourceIndex}`)) continue;
      const sourceTable = app.classified[sourceIndex];
      const value = (row, role) => isUsableAssignment(assignments[role]) && assignmentSourceIndex(assignments[role], tableIndex) === sourceIndex ? row[assignments[role].header] : "";
      processed.add(`inventory:${sourceIndex}`);
      sourceTable.rows.forEach(row => inventory.push(Object.fromEntries(Object.keys(semanticRoles.inventory).map(role => [role, value(row, role)]))));
    }
  }
  return { sales, inventory };
}

function analyze(data) {
  const sales = data.sales || [], inventory = data.inventory || [];
  const hasSales = sales.length > 0, hasInventory = inventory.length > 0;
  const saleValue = row => Number.isFinite(numericValue(row.valorTotal)) ? numericValue(row.valorTotal) : Number.isFinite(numericValue(row.precio)) && Number.isFinite(numericValue(row.cantidad)) ? numericValue(row.precio) * numericValue(row.cantidad) : NaN;
  const validProductSales = sales.filter(row => String(row.producto || "").trim()).length;
  const validQuantitySales = sales.filter(row => Number.isFinite(numericValue(row.cantidad)) && numericValue(row.cantidad) >= 0).length;
  const validValueSales = sales.filter(row => Number.isFinite(saleValue(row)) && saleValue(row) >= 0).length;
  const validDateSales = sales.filter(row => !Number.isNaN(new Date(row.fecha).getTime())).length;
  const validMeasureSales = sales.filter(row => (Number.isFinite(numericValue(row.cantidad)) && numericValue(row.cantidad) >= 0) || (Number.isFinite(saleValue(row)) && saleValue(row) >= 0)).length;
  const validInventory = inventory.filter(row => row.producto && Number.isFinite(numericValue(row.stock)) && numericValue(row.stock) >= 0).length;
  const essentialTotal = Math.max(1, sales.length * 3 + inventory.length * 2);
  const essentialValid = validProductSales + validDateSales + validMeasureSales + validInventory * 2;
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
  if (hasSales && sales.length < 5) score -= 30;
  if (hasInventory && inventory.length < 2) score -= 30;
  if (!hasSales && !hasInventory) score = 0;
  score -= Math.round((1 - completeness) * 40);
  if (negativeCount) score -= 15;
  if (duplicates.size) score -= 5;
  if (hasSales && period < 30) score -= 10;
  if (hasSales && hasInventory && relation < .5) score -= 10;
  if (hasSales !== hasInventory) score = Math.min(score, 78);
  score = Math.max(0, Math.min(100, score));
  const enoughSales = hasSales && sales.length >= 5 && validProductSales / sales.length >= .7 && validDateSales / sales.length >= .7 && validMeasureSales / sales.length >= .7;
  const enoughInventory = hasInventory && inventory.length >= 2 && validInventory / inventory.length >= .7;
  if (!enoughSales && !enoughInventory) score = Math.min(score, 49);
  const level = score >= 80 ? "ALTA" : score >= 55 ? "MEDIA" : "BAJA";
  const facts = [];
  if (hasSales) {
    facts.push({ ok: sales.length >= 5, text: `Encontramos ${sales.length} registros de ventas que cubren ${period} días.` });
    facts.push({ ok: validProductSales === sales.length, text: `${percent(validProductSales / Math.max(1, sales.length))} de las ventas tiene producto.` });
    facts.push({ ok: validDateSales === sales.length, text: `${percent(validDateSales / Math.max(1, sales.length))} de las ventas tiene fecha válida.` });
    facts.push({ ok: validMeasureSales === sales.length, text: `${percent(validMeasureSales / Math.max(1, sales.length))} de las ventas tiene cantidad o valor utilizable.` });
    if (validValueSales) facts.push({ ok: validValueSales === sales.length, text: `${percent(validValueSales / Math.max(1, sales.length))} de las ventas tiene valor de venta utilizable.` });
  } else facts.push({ ok: false, text: "No encontramos información de ventas." });
  if (hasInventory) {
    facts.push({ ok: enoughInventory, text: `Encontramos ${inventory.length} productos en inventario y ${percent(validInventory / Math.max(1, inventory.length))} tiene existencias válidas.` });
    if (hasSales) facts.push({ ok: relation >= .5, text: `Pudimos relacionar ${percent(relation)} de los productos vendidos con el inventario.` });
  } else facts.push({ ok: false, text: "No encontramos inventario. No evaluaremos productos acumulados ni posibles faltantes." });
  facts.push({ ok: !negativeCount, text: negativeCount ? `Encontramos ${countText(negativeCount, "un valor negativo", "valores negativos")} que conviene revisar.` : "No encontramos cantidades negativas inesperadas." });
  facts.push({ ok: costCoverage >= .5, text: costCoverage ? `Encontramos costo para ${percent(costCoverage)} del inventario.` : "No encontramos costos; no analizaremos rentabilidad." });
  const missingParts = [];
  if (validMeasureSales < sales.length) missingParts.push(`${countText(sales.length - validMeasureSales, "venta", "ventas")} sin cantidad ni valor utilizable`);
  if (validProductSales < sales.length) missingParts.push(`${countText(sales.length - validProductSales, "venta", "ventas")} sin producto`);
  if (validDateSales < sales.length) missingParts.push(`${countText(sales.length - validDateSales, "venta", "ventas")} sin fecha válida`);
  if (validInventory < inventory.length) missingParts.push(`${countText(inventory.length - validInventory, "producto", "productos")} sin existencias válidas`);
  if (hasSales && sales.length < 5) missingParts.push("más registros de ventas");
  if (hasInventory && inventory.length < 2) missingParts.push("un inventario con al menos dos productos");
  const summary = level === "ALTA"
    ? `Podemos realizar el análisis completo con ${sales.length} ventas, ${inventory.length} productos y ${percent(completeness)} de los datos esenciales utilizables.`
    : level === "MEDIA" && hasSales && !hasInventory
      ? `Podemos orientarte con ${sales.length} ventas. Sin inventario, el análisis se limita a cambios y productos vendidos.`
      : level === "MEDIA" && hasInventory && !hasSales
        ? `Encontramos ${inventory.length} productos. No afirmaremos cuáles se venden o permanecen almacenados porque faltan ventas.`
        : level === "MEDIA"
          ? `Podemos hacer una orientación inicial, aunque conviene revisar ${missingParts.join(", ") || "algunos datos"}.`
          : "Todavía no tenemos información suficiente para decirte qué atender primero.";
  const quality = {
    score,
    level,
    summary,
    facts,
    missing: missingParts.length ? `Necesitamos corregir o completar: ${missingParts.join("; ")}.` : "Necesitamos al menos ventas utilizables o un inventario con productos y existencias.",
    nextStep: "Busca esas columnas o registros en el archivo que ya utiliza tu negocio, complétalos y vuelve a cargarlo."
  };
  const metrics = calculateMetrics(sales, inventory, period);
  const priorities = level === "BAJA" ? [] : prioritize(metrics, { hasSales, hasInventory, completeness });
  const freeContext = normalize(`${app.context.contextoLibre || ""} ${app.context.eventoReciente || ""}`);
  const trendFirst = priorities[0]?.type === "trend";
  const contextMentionsChange = Boolean(app.context.eventoReciente) || /(cerr|problema|proveedor|precio|cliente|normal|vacacion|obra|cambio|perdi)/.test(freeContext);
  return { quality, metrics, priorities, adaptiveNeeded: trendFirst && !contextMentionsChange };
}

function calculateMetrics(sales, inventory, period) {
  const byProduct = {};
  let revenue = 0, units = 0, quantityRows = 0;
  sales.forEach(row => {
    const quantity = numericValue(row.cantidad);
    const value = Number.isFinite(numericValue(row.valorTotal)) ? numericValue(row.valorTotal) : quantity * numericValue(row.precio);
    const validQuantity = Number.isFinite(quantity) && quantity >= 0;
    const validValue = Number.isFinite(value) && value >= 0;
    if (!row.producto || (!validQuantity && !validValue)) return;
    if (validValue) revenue += value;
    if (validQuantity) { units += quantity; quantityRows += 1; }
    byProduct[row.producto] ||= { units: 0, revenue: 0 };
    if (validQuantity) byProduct[row.producto].units += quantity;
    if (validValue) byProduct[row.producto].revenue += value;
  });
  const rankingBasis = revenue > 0 ? "value" : "quantity";
  const basisValue = item => rankingBasis === "value" ? item.revenue : item.units;
  const ranked = Object.entries(byProduct).sort((a, b) => basisValue(b[1]) - basisValue(a[1]));
  const basisTotal = rankingBasis === "value" ? revenue : units;
  const topShare = basisTotal && ranked[0] ? basisValue(ranked[0][1]) / basisTotal : 0;
  const monthlyValue = {}, monthlyUnits = {};
  sales.forEach(row => {
    const date = new Date(row.fecha), quantity = numericValue(row.cantidad);
    const value = Number.isFinite(numericValue(row.valorTotal)) ? numericValue(row.valorTotal) : quantity * numericValue(row.precio);
    if (Number.isNaN(date.getTime())) return;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (Number.isFinite(value) && value >= 0) monthlyValue[key] = (monthlyValue[key] || 0) + value;
    if (Number.isFinite(quantity) && quantity >= 0) monthlyUnits[key] = (monthlyUnits[key] || 0) + quantity;
  });
  const monthlyMap = rankingBasis === "value" ? monthlyValue : monthlyUnits;
  const monthly = Object.entries(monthlyMap).sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => ({ month, value }));
  const windowSize = monthly.length >= 6 ? 3 : monthly.length >= 4 ? 2 : 0;
  const priorMonths = windowSize ? monthly.slice(-windowSize * 2, -windowSize) : [];
  const recentMonths = windowSize ? monthly.slice(-windowSize) : [];
  const average = values => values.length ? values.reduce((sum, item) => sum + item.value, 0) / values.length : 0;
  const priorAverage = average(priorMonths), recentAverage = average(recentMonths);
  const trendChange = priorAverage ? (recentAverage - priorAverage) / priorAverage : 0;
  const trendSustained = recentMonths.length > 1 && recentMonths.every(item => item.value < priorAverage) && recentMonths.every((item, index) => index === 0 || item.value <= recentMonths[index - 1].value);
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
  const inventoryValue = inv.reduce((sum, row) => sum + (Number.isFinite(row.cost) ? row.stock * row.cost : 0), 0);
  const inventoryUnits = inv.reduce((sum, row) => sum + row.stock, 0);
  return { revenue, units, quantityRows, ranked, rankingBasis, topShare, monthly, priorAverage, recentAverage, trendChange, trendSustained, inv, inventoryValue, inventoryUnits, slowItems, slowUnits, slowValue, slowSales, stockout, period, products: inv.length };
}

function priorityScore({ impact, urgency, reach, confidence }) {
  return Math.round(impact * .35 + urgency * .30 + reach * .20 + confidence * .15);
}

function scored(finding, factors) {
  return { ...finding, priorityFactors: factors, priorityScore: priorityScore(factors) };
}

function prioritize(metrics, scope) {
  const findings = [];
  if (scope.hasSales && metrics.trendSustained && metrics.trendChange <= -.15) findings.push(scored({
    type: "trend",
    title: `Tus ventas bajaron ${percent(Math.abs(metrics.trendChange))} en los meses más recientes.`,
    reason: metrics.rankingBasis === "value" ? `El promedio mensual pasó de ${money.format(metrics.priorAverage)} a ${money.format(metrics.recentAverage)}.` : `El promedio mensual pasó de ${Math.round(metrics.priorAverage)} a ${Math.round(metrics.recentAverage)} unidades.`,
    evidence: `La caída aparece de forma sostenida en los últimos ${metrics.monthly.length >= 6 ? 3 : 2} meses disponibles.`,
    meaning: "Es un cambio reciente que afecta el conjunto de las ventas y merece confirmarse antes de atribuirlo a una causa.",
    action: "Confirma si ocurrió algo fuera de lo normal y revisa qué productos explican la mayor parte de la caída.",
    indicator: "Valor vendido cada mes."
  }, { impact: Math.min(100, Math.abs(metrics.trendChange) * 300), urgency: 95, reach: 100, confidence: metrics.monthly.length >= 6 ? 95 : 75 }));
  const concentration = scored({
    type: "concentration",
    title: `Gran parte de tus ventas depende de ${metrics.ranked[0]?.[0] || "un solo producto"}.`,
    reason: `${metrics.ranked[0]?.[0] || "El producto principal"} representa ${percent(metrics.topShare)} ${metrics.rankingBasis === "value" ? "del valor vendido" : "de las unidades vendidas"}.`,
    evidence: metrics.rankingBasis === "value" ? `De ${money.format(metrics.revenue)} vendidos, ${money.format(metrics.ranked[0]?.[1].revenue || 0)} provienen de ese producto.` : `De ${metrics.units} unidades vendidas, ${metrics.ranked[0]?.[1].units || 0} corresponden a ese producto.`,
    meaning: "Una caída en ese producto puede afectar una parte importante de las ventas observadas.",
    action: "Comprueba si el patrón continúa y elige dos productos complementarios que puedas ofrecer junto al principal.",
    indicator: "Porcentaje del valor vendido que representa el producto principal."
  }, { impact: metrics.topShare * 100, urgency: 45, reach: metrics.topShare * 100, confidence: 90 });
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
  const scoredSlow = slow ? scored(slow, {
    impact: metrics.inventoryValue ? Math.min(100, metrics.slowValue / metrics.inventoryValue * 100) : Math.min(100, metrics.slowUnits / Math.max(1, metrics.inventoryUnits) * 100),
    urgency: 75,
    reach: Math.min(100, metrics.slowItems.length / Math.max(1, metrics.products) * 100),
    confidence: scope.hasSales && scope.hasInventory ? 95 : 55
  }) : null;
  const stockout = metrics.stockout ? scored({
    type: "stockout",
    title: `Podrías quedarte sin ${metrics.stockout.producto}.`,
    reason: "El producto tiene ventas registradas y muy pocas unidades disponibles.",
    evidence: `${metrics.stockout.sold} unidades vendidas y ${metrics.stockout.stock} unidades disponibles.`,
    meaning: "Si continúa vendiéndose al mismo ritmo, podrían aparecer ventas que el negocio no pueda atender.",
    action: "Confirma físicamente las existencias y revisa el siguiente pedido antes de que lleguen a cero.",
    indicator: "Días con el producto disponible sin llegar a cero."
  }, { impact: 75, urgency: 95, reach: Math.min(100, metrics.stockout.sold / Math.max(1, metrics.units) * 100), confidence: 95 }) : null;
  if (!scope.hasSales && scope.hasInventory) findings.push(scored({
    type: "inventory-only",
    title: "Agrega ventas antes de decidir qué producto atender.",
    reason: `Encontramos ${metrics.products} productos y ${metrics.inventoryUnits} unidades disponibles, pero ninguna venta.`,
    evidence: metrics.inventoryValue ? `El costo registrado del inventario es ${money.format(metrics.inventoryValue)}.` : "No hay ventas que permitan comparar movimiento por producto.",
    meaning: "Sin ventas o movimientos no podemos afirmar qué producto se vende, permanece almacenado o podría agotarse.",
    action: "Busca un archivo con fecha, producto, cantidad y valor vendido para completar el análisis.",
    indicator: "Número de registros de ventas agregados al próximo análisis."
  }, { impact: 80, urgency: 90, reach: 100, confidence: 100 }));
  if (scope.hasSales && metrics.topShare >= .6) findings.push(concentration);
  if (scope.hasSales && scope.hasInventory && metrics.quantityRows > 0 && scoredSlow) findings.push(scoredSlow);
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
  for (const fallback of fallbacks) if (findings.length < 3 && !findings.some(item => item.type === fallback.type)) findings.push(scored(fallback, { impact: 35, urgency: 35, reach: 45, confidence: scope.completeness * 100 }));
  return findings.sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 3);
}

function metricCards() {
  const metrics = app.analysis.metrics;
  if (!metrics.ranked.length && metrics.products) return `<article class="stat"><span>Productos en inventario</span><strong>${metrics.products}</strong></article>
    <article class="stat"><span>Unidades disponibles</span><strong>${metrics.inventoryUnits}</strong></article>
    <article class="stat"><span>Costo registrado</span><strong>${metrics.inventoryValue ? money.format(metrics.inventoryValue) : "No disponible"}</strong></article>
    <article class="stat"><span>Ventas encontradas</span><strong>0</strong></article>`;
  return `<article class="stat"><span>Valor vendido</span><strong>${metrics.rankingBasis === "value" ? money.format(metrics.revenue) : "No disponible"}</strong></article>
    <article class="stat"><span>Unidades vendidas</span><strong>${metrics.units}</strong></article>
    <article class="stat"><span>Días revisados</span><strong>${metrics.period}</strong></article>
    <article class="stat"><span>Productos relacionados</span><strong>${metrics.products}</strong></article>`;
}

function getPlan() {
  const finding = app.analysis?.priorities[0];
  if (!finding) return [];
  if (finding.type === "trend") return [
    { when: "HOY", action: "Confirma qué productos y semanas explican la caída reciente.", explain: app.context.eventoReciente ? `Ten en cuenta el contexto indicado: ${app.context.eventoReciente}.` : "Compara el periodo reciente con los meses anteriores." },
    { when: "ESTA SEMANA", action: "Elige una causa comprobable y una acción pequeña para responder.", explain: "Evita cambiar precios, compras y promociones al mismo tiempo." },
    { when: "EN 14 DÍAS", action: "Compara nuevamente el valor vendido.", explain: "Revisa si la caída se detuvo, continuó o empezó a recuperarse." }
  ];
  if (finding.type === "inventory-only") return [
    { when: "HOY", action: "Ubica dónde registras las ventas de tu negocio.", explain: "Busca fecha, producto, cantidad y valor vendido." },
    { when: "ESTA SEMANA", action: "Exporta o organiza esos registros en Excel o CSV.", explain: "No necesitas cambiar los nombres de las columnas." },
    { when: "EN 14 DÍAS", action: "Vuelve a analizar ventas e inventario juntos.", explain: "San José podrá comparar qué se vende y qué permanece disponible." }
  ];
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
  link.download = "resumen-ejecutivo-san-jose-v4.html";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
