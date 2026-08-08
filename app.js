const $ = selector => document.querySelector(selector);
const money = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0
});
const percent = value => `${Math.round(value * 100)} %`;
const countText = (value, singular, plural) => `${value} ${value === 1 ? singular : plural}`;
const wholeNumber = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const monthLabel = new Intl.DateTimeFormat("es-CO", { month: "short", year: "2-digit", timeZone: "UTC" });

function readablePercent(value) {
  const percentage = Math.max(0, value * 100);
  const digits = percentage > 0 && percentage < .1 ? 2 : Number.isInteger(percentage) ? 0 : 1;
  return `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: digits }).format(percentage)} %`;
}

function readableNumber(value) {
  return wholeNumber.format(Math.round(Number(value) || 0));
}

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
  additionalSections: {},
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
    valorTotal: { label: "Valor total", group: "main", measure: true, description: "Permite analizar ingresos.", terms: ["valor total", "total venta", "vr total", "vr tot fac", "vr neto", "valor neto", "importe", "subtotal", "ingreso"] },
    precio: { label: "Precio unitario", group: "additional", description: "Con cantidad, permite calcular el valor total de la venta.", terms: ["precio", "precio venta", "valor unitario", "vr unitario"] },
    costo: { label: "Costo unitario", group: "additional", description: "Ayuda a estimar rentabilidad cuando también hay valor de venta.", terms: ["costo", "coste", "valor costo", "costo unitario"] },
    cliente: { label: "Cliente", group: "additional", terms: ["cliente", "nombre cliente", "nit cliente"] },
    canal: { label: "Canal de venta", group: "additional", terms: ["canal", "canal venta", "tipo venta"] },
    categoria: { label: "Categoría de producto", group: "additional", terms: ["categoría", "familia", "línea producto"] },
    sede: { label: "Sede / punto de venta", group: "additional", terms: ["sede", "punto venta", "tienda", "local"] },
    vendedor: { label: "Vendedor", group: "additional", terms: ["vendedor", "asesor", "comercial"] },
    utilidad: { label: "Utilidad", group: "additional", terms: ["utilidad", "ganancia", "beneficio", "margen"] },
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
  const review = primaryReviewProgress();
  const found = app.classified.map((table, index) => {
    const typeLabel = table.type === "sales" ? "Parece contener ventas" : table.type === "inventory" ? "Parece contener inventario" : table.type === "additional" ? "Información complementaria. No la necesitamos en esta versión" : "No estamos seguros de qué contiene";
    return `<li class="found-sheet ${table.type}">
      <div><strong>${safe(table.fileName)}</strong><span>Hoja: ${safe(table.sheetName)}</span></div>
      <div><b>${typeLabel}</b></div>
    </li>`;
  }).join("");
  const relevant = app.classified
    .map((table, index) => ({ table, index }))
    .filter(item => ["sales", "inventory"].includes(item.table.type));
  const additional = app.classified.filter(table => table.type === "additional");
  const unknown = app.classified.filter(table => table.type === "unknown");
  return `<section class="panel interpretation-panel">
    <p class="eyebrow">Revisión de tus datos</p>
    <h2>Esto es lo que entendimos</h2>
    <p>San José hizo una primera interpretación. Confirma o corrige cada dato principal.</p>
    <ul class="found-list">${found}</ul>
    ${additional.length ? `<p class="optional-note">También encontramos ${countText(additional.length, "una hoja", "hojas")} con información adicional. Esta versión de San José se concentra únicamente en ventas e inventario.</p>` : ""}
    ${unknown.length ? `<p class="optional-note">No logramos reconocer ${countText(unknown.length, "una hoja", "hojas")}. Puedes continuar si ya encontramos ventas o inventario.</p>` : ""}
    <div class="review-progress"><div><h2>Revisa tus datos principales</h2><p>San José propone. Tú confirmas o corriges.</p></div><strong>${reviewProgressText(review)}</strong></div>
    <div class="sheet-mappings">
      ${relevant.map(item => mappingCard(item.table, item.index)).join("")}
    </div>
    <div id="mapping-issues">${issues.map(issue => `<div class="low-stop"><h3>${safe(issue.title)}</h3><p>${safe(issue.message)}</p><small>${safe(issue.help)}</small></div>`).join("")}</div>
    ${review.complete ? `<div class="review-ready">Listo. Ya sabemos qué información podemos utilizar.</div>${analysisScopePanel(scope)}` : '<p class="pending-review">Antes de continuar, revisa los datos que quedan pendientes.</p>'}
    <div class="partial-actions">
      <button class="button secondary" type="button" id="clear-files">Elegir otros archivos</button>
      ${scope.hasSales && !scope.hasInventory ? '<button class="button secondary" type="button" data-focus-upload>Agregar inventario</button>' : ""}
      ${scope.hasInventory && !scope.hasSales ? '<button class="button secondary" type="button" data-focus-upload>Agregar ventas</button>' : ""}
      <button id="confirm-mapping" class="button gold" type="button" ${issues.length || !review.complete || (!scope.hasSales && !scope.hasInventory) ? "disabled" : ""}>Analizar mi información →</button>
    </div>
  </section>`;
}

function mappingCard(table, tableIndex) {
  const mainRoles = primaryRolesFor(table.type);
  const optionalRoles = additionalRolesFor(table.type);
  const additionalKey = `${tableIndex}:${table.type}`;
  const additionalOpen = Boolean(app.additionalSections[additionalKey]);
  return `<article class="mapping-card">
    <header><div><span>${table.type === "sales" ? "Ventas" : "Inventario"}</span><h3>${safe(table.sheetName)}</h3></div><small>${safe(table.fileName)}</small></header>
    <section class="needed-data"><h4>Datos principales de ${table.type === "sales" ? "ventas" : "inventario"}</h4><p>${table.type === "sales" ? "Necesitamos fecha, producto y al menos una medida de la venta." : "Necesitamos producto y existencia actual."}</p></section>
    <div class="interpretation-rows">${mainRoles.map(role => interpretationRow(table, tableIndex, role)).join("")}</div>
    ${table.type === "sales" ? `<section class="measure-section"><div><h4>Medida de la venta</h4><p>Debe existir al menos una: cantidad vendida o valor de la venta.</p></div><div class="interpretation-rows">${["cantidad", "valorTotal"].map(role => interpretationRow(table, tableIndex, role)).join("")}</div></section>` : ""}
    ${optionalRoles.length ? `<details class="additional-data" data-additional-key="${additionalKey}" ${additionalOpen ? "open" : ""}><summary><span>Datos que pueden mejorar el análisis</span><b>Ver datos adicionales</b></summary><div class="optional-rows">${optionalRoles.map(role => interpretationRow(table, tableIndex, role)).join("")}</div></details>` : ""}
  </article>`;
}

function primaryRolesFor(type) {
  return type === "sales" ? ["fecha", "producto"] : type === "inventory" ? ["producto", "stock"] : [];
}

function additionalRolesFor(type) {
  return type === "sales" ? ["cliente", "vendedor", "utilidad"] : [];
}

function primaryReviewProgress() {
  const items = app.classified.flatMap((table, tableIndex) => {
    const roles = table.type === "sales" ? ["fecha", "producto", "cantidad", "valorTotal"] : table.type === "inventory" ? ["producto", "stock"] : [];
    return roles.map(role => ({ table, tableIndex, role }));
  });
  const resolved = items.filter(({ table, tableIndex, role }) => {
    const decision = roleDecision(tableIndex, role);
    return Boolean(table.interpretation.assignments[role]?.confirmed || ["missing", "ignored", "unknown"].includes(decision?.status));
  }).length;
  return { resolved, total: items.length, complete: items.length > 0 && resolved === items.length };
}

function reviewProgressText(review) {
  const pending = Math.max(0, review.total - review.resolved);
  if (!pending) return "✓ Listo. Revisamos todos los datos principales.";
  return pending === 1 ? "Te falta 1 dato por revisar." : `Te faltan ${pending} datos por revisar.`;
}

function roleDecision(tableIndex, role) {
  return app.clarifications[`${tableIndex}:${role}`] || null;
}

function interpretationRow(table, tableIndex, role) {
  const assignment = table.interpretation.assignments[role];
  const decision = roleDecision(tableIndex, role);
  const unavailable = ["missing", "ignored", "unknown"].includes(decision?.status);
  const sourceIndex = assignmentSourceIndex(assignment, tableIndex);
  const sourceTable = app.classified[sourceIndex] || table;
  const ambiguity = assignment && assignment.confidence !== "Alta" && !assignment.confirmed;
  const visibleAssignment = unavailable ? null : assignment;
  const identification = unavailable
    ? { label: "⚪ No la encontramos", className: "user-missing" }
    : assignment?.confirmed
      ? { label: "✓ Confirmado por ti", className: "confirmed" }
      : columnIdentification(visibleAssignment);
  const showQuality = Boolean(assignment?.confirmed && !unavailable);
  const quality = showQuality ? columnDataQuality(sourceTable, assignment.header, role) : null;
  return `<article class="interpretation-item data-question ${ambiguity ? "needs-review" : ""}">
    <div class="interpretation-main">
      <div class="needed-column"><h5>${safe(roleDisplayLabel(table.type, role))}</h5></div>
      <div class="found-column"><span>Encontramos:</span><strong>${visibleAssignment ? safe(visibleAssignment.header) : "No encontramos una columna"}</strong>${visibleAssignment && sourceTable !== table ? `<small>Hoja: ${safe(sourceTable.sheetName)}</small>` : ""}</div>
      <strong class="identification-state ${identification.className}">${identification.label}</strong>
    </div>
    ${columnChooser(table, tableIndex, role, assignment)}
    ${showQuality ? `<div class="column-data-quality ${quality.className}"><strong>Calidad de los datos: ${quality.level}</strong><p>${safe(quality.explanation)}</p></div>` : ""}
    ${assignment?.confirmed && !unavailable ? `<div class="interpretation-actions"><button class="button mini secondary interpretation-action" type="button" data-action="edit" data-table="${tableIndex}" data-role="${role}">Cambiar</button></div>` : unavailable ? `<div class="interpretation-actions"><button class="button mini secondary interpretation-action" type="button" data-action="edit" data-table="${tableIndex}" data-role="${role}">Cambiar</button></div>` : `<div class="interpretation-actions"><button class="button mini interpretation-action" type="button" data-action="confirm" data-table="${tableIndex}" data-role="${role}" ${assignment ? "" : "disabled"}>Sí, está bien</button><button class="button mini secondary interpretation-action" type="button" data-action="edit" data-table="${tableIndex}" data-role="${role}">Cambiar</button><button class="button mini quiet interpretation-action" type="button" data-action="missing" data-table="${tableIndex}" data-role="${role}">No lo tengo</button></div>`}
  </article>`;
}

function roleDisplayLabel(type, role) {
  if (type === "inventory" && role === "producto") return "Producto / referencia";
  if (type === "sales" && role === "valorTotal") return "Valor de la venta";
  if (type === "sales" && role === "vendedor") return "Comercial / vendedor";
  return semanticRoles[type][role].label;
}

function columnIdentification(assignment) {
  if (!assignment?.header) return { label: "⚪ No la encontramos", className: "not-found" };
  if (assignment.confirmed) return { label: "✓ Confirmado por ti", className: "confirmed" };
  if (assignment.confidence === "Alta") return { label: "🟢 Parece correcto", className: "looks-correct" };
  return { label: "🟠 Revisa este dato", className: "review" };
}

function columnDataQuality(table, header, role) {
  const rows = table?.rows || [];
  if (!header || !rows.length) return {
    level: "Baja",
    className: "low",
    explanation: header ? "No hay registros para evaluar esta columna." : "No hay una columna disponible para evaluar."
  };
  const values = rows.map(row => row[header]);
  const empty = values.filter(value => String(value ?? "").trim() === "").length;
  const dateRoles = ["fecha", "fechaCorte", "ultimoMovimiento", "vencimiento"];
  const numericRoles = ["cantidad", "precio", "valorTotal", "costo", "utilidad", "stock", "inventarioMinimo", "inventarioMaximo", "puntoReposicion", "reservada", "disponible", "pendienteRecibir", "tiempoEntrega", "descuento"];
  const usable = values.filter(value => {
    if (String(value ?? "").trim() === "") return false;
    if (dateRoles.includes(role)) return isValidDateValue(value);
    if (numericRoles.includes(role)) return Number.isFinite(numericValue(value)) && numericValue(value) >= 0;
    return true;
  }).length;
  const usableRate = usable / rows.length;
  const unusableRate = 1 - usableRate;
  const level = usableRate >= .95 ? "Alta" : usableRate >= .75 ? "Media" : "Baja";
  const className = level === "Alta" ? "high" : level === "Media" ? "medium" : "low";
  let explanation;
  const usableName = role === "cantidad" ? "una cantidad utilizable" : role === "stock" ? "una existencia utilizable" : "un valor utilizable";
  const missingName = role === "cantidad" ? "sin cantidad" : role === "stock" ? "sin existencia" : dateRoles.includes(role) ? "sin fecha" : "vacíos";
  if (level === "Alta") {
    explanation = dateRoles.includes(role)
      ? `${percent(usableRate)} de los registros tiene una fecha válida.`
      : numericRoles.includes(role)
        ? `${percent(usableRate)} de los registros tiene ${usableName}.`
        : `${percent(usableRate)} de los registros tiene información utilizable.`;
  } else if (empty === rows.length - usable) explanation = `Encontramos ${percent(empty / rows.length)} de registros ${missingName}.`;
  else explanation = `${percent(unusableRate)} de los valores no se pueden utilizar.`;
  return { level, className, explanation, usableRate, empty, unusable: rows.length - usable };
}

function isValidDateValue(value) {
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(text)) return !Number.isNaN(new Date(text).getTime());
  const localDate = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (localDate) {
    const [, day, month, year] = localDate.map(Number);
    const parsed = new Date(year, month - 1, day);
    return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
  }
  return !Number.isNaN(new Date(text).getTime());
}

function ambiguousMeaningChooser(table, tableIndex, role, assignment) {
  const preferred = table.type === "sales" ? ["valorTotal", "precio", "costo", "cantidad", "producto", "fecha"] : ["stock", "costo", "producto", "fechaCorte"];
  return `<div class="ambiguous-meaning"><label>¿Qué representa “${safe(assignment.header)}”?
    <select class="ambiguous-role-select" data-table="${tableIndex}" data-role="${role}" data-header="${safe(assignment.header)}"><option value="">Selecciona</option>${preferred.map(optionRole => `<option value="${optionRole}" ${role === optionRole ? "selected" : ""}>${safe(semanticRoles[table.type][optionRole].label)}</option>`).join("")}<option value="other">Otra información</option><option value="unknown">No sé</option></select>
  </label></div>`;
}

function columnChooser(table, tableIndex, role, assignment) {
  const selectedSource = assignmentSourceIndex(assignment, tableIndex);
  const selectedValue = assignment?.header ? columnOptionValue(selectedSource, assignment.header) : "";
  const decision = roleDecision(tableIndex, role);
  const groups = app.classified.map((sourceTable, sourceIndex) => `<optgroup label="Hoja: ${safe(sourceTable.sheetName)} · ${safe(sourceTable.fileName)}">${sourceTable.headers.map(header => {
    const value = columnOptionValue(sourceIndex, header);
    return `<option value="${safe(value)}" ${value === selectedValue ? "selected" : ""}>${safe(header)}</option>`;
  }).join("")}</optgroup>`).join("");
  return `<div class="column-chooser"><label>¿Qué columna contiene ${safe(roleDisplayLabel(table.type, role).toLowerCase())}?
    <select class="role-column-select" data-table="${tableIndex}" data-role="${role}"><option value="">Seleccionar columna</option>${groups}</select>
    ${decision?.error ? `<small class="duplicate-warning" role="alert">${safe(decision.error)}</small>` : ""}
  </label></div>`;
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
  return Boolean(assignment?.header && assignment.confirmed && !(assignment.duplicates?.length > 1 && !assignment.confirmed));
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
  if (scope.hasSales && salesMeasure) available.push("Cómo han cambiado tus ventas.", "Qué productos aportan más.");
  if (scope.hasSales || scope.hasInventory) available.push("Qué deberías atender primero.");
  if (scope.hasInventory) available.push("Cuántas existencias tienes registradas por producto.");
  if (has("sales", "utilidad") || (revenue && has("sales", "costo"))) available.push("Una aproximación inicial a la rentabilidad.");
  else unavailable.push("Rentabilidad — no encontramos costos.");
  if (!scope.hasInventory) unavailable.push("Productos acumulados — no encontramos inventario.");
  else if (!(scope.hasSales && has("sales", "cantidad"))) unavailable.push("Productos acumulados — necesitamos cantidad vendida para compararla con el inventario.");
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
        <span class="level ${quality.level.toLowerCase()}">Calidad de los datos: ${quality.level[0]}${quality.level.slice(1).toLowerCase()}</span>
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

function resultQualityCopy(quality) {
  if (quality.level === "ALTA") return "Tus datos están en buenas condiciones para hacer este análisis.";
  if (quality.level === "MEDIA") return "Podemos hacer el análisis, pero encontramos algunos datos incompletos.";
  return "Hay información incompleta que puede cambiar algunas conclusiones.";
}

function stageThreeSummaryCards() {
  const { metrics, resultQuality } = app.analysis;
  const salesExist = app.dataset?.sales?.length || metrics.quantityRows || metrics.valueRows;
  if (!salesExist) return [
    { value: `${readableNumber(metrics.inventoryUnits)} unidades`, label: "Disponibles en el inventario" },
    { value: `${readableNumber(metrics.products)} productos`, label: "Con existencias registradas" },
    { value: "No pudimos calcularlo", label: "Valor de las ventas", note: "No encontramos información de ventas." },
    { value: "No pudimos calcularlo", label: "Unidades vendidas", note: "No encontramos información de ventas." }
  ];
  const revenue = metrics.valueRate >= .7
    ? { value: money.format(metrics.revenue), label: "Vendidos en el periodo" }
    : { value: "No pudimos calcularlo", label: "Valor de las ventas", note: metrics.valueUnavailableReason };
  const units = metrics.quantityRate >= .7
    ? { value: `${readableNumber(metrics.units)} unidades`, label: "Vendidas en el periodo" }
    : { value: "No pudimos calcularlo", label: "Unidades vendidas", note: metrics.quantityUnavailableReason };
  const period = resultQuality.periodDays
    ? { value: `${readableNumber(resultQuality.periodDays)} días`, label: "Información revisada" }
    : { value: "No pudimos calcularlo", label: "Periodo analizado", note: "No encontramos fechas de venta que podamos utilizar." };
  return [revenue, units, { value: `${readableNumber(metrics.salesProducts)} productos`, label: "Con ventas registradas" }, period];
}

function summaryCardsHtml() {
  return stageThreeSummaryCards().map(card => `<article class="result-stat"><strong>${safe(card.value)}</strong><span>${safe(card.label)}</span>${card.note ? `<small>${safe(card.note)}</small>` : ""}</article>`).join("");
}

function resultQualityHtml() {
  const quality = app.analysis.resultQuality;
  const reasons = quality.reasons.length ? quality.reasons.map(reason => `<li>${safe(reason)}</li>`).join("") : "<li>No encontramos una limitación importante en los datos utilizados.</li>";
  const details = quality.details.slice(0, 4).map(item => `<li><span>${safe(item.label)}</span><strong>${readablePercent(item.rate)} utilizable</strong></li>`).join("");
  return `<section class="result-quality" aria-labelledby="result-quality-title">
    <div><p class="section-kicker">Calidad de la información</p><h2 id="result-quality-title">${quality.score} % · ${safe(quality.level[0] + quality.level.slice(1).toLowerCase())}</h2><p>${safe(resultQualityCopy(quality))}</p></div>
    <details><summary>¿Por qué?</summary><p>Encontramos:</p><ul>${reasons}</ul><h3>Información que pudimos utilizar</h3><ul class="quality-detail-list">${details}</ul></details>
  </section>`;
}

function monthName(key) {
  return monthLabel.format(new Date(`${key}-01T00:00:00Z`)).replace(" de ", " ");
}

function longMonthName(key) {
  return new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${key}-01T00:00:00Z`));
}

function consecutiveMonths(items) {
  return items.every((item, index) => {
    if (!index) return true;
    const previous = new Date(`${items[index - 1].month}-01T00:00:00Z`);
    previous.setUTCMonth(previous.getUTCMonth() + 1);
    return previous.toISOString().slice(0, 7) === item.month;
  });
}

function trendComparison(monthly, basis) {
  if (monthly.length < 2) return { available: false, reason: "No tenemos suficientes meses completos con información para explicar un cambio." };
  const window = monthly.slice(-Math.min(4, monthly.length));
  if (!consecutiveMonths(window)) return { available: false, reason: "Hay meses sin registros dentro del periodo. No los interpretamos como meses con ventas en cero." };
  const latest = window.at(-1), previous = window.slice(0, -1);
  const average = previous.reduce((sum, item) => sum + item.value, 0) / previous.length;
  const previousMonth = previous.at(-1);
  const currentText = basis === "value" ? money.format(latest.value) : `${readableNumber(latest.value)} unidades`;
  const averageChange = average ? (latest.value - average) / average : null;
  const previousChange = previousMonth?.value ? (latest.value - previousMonth.value) / previousMonth.value : null;
  return { available: true, latest, previous, average, previousMonth, currentText, averageChange, previousChange };
}

function trendMeaning(monthly, basis) {
  const comparison = trendComparison(monthly, basis);
  if (!comparison.available) return comparison.reason;
  const { latest, previous, average, currentText, averageChange } = comparison;
  if (!average) return latest.value
    ? `En ${monthName(latest.month)} registraste ${currentText}; los meses anteriores completos tenían un valor registrado de cero.`
    : `En ${monthName(latest.month)} y en los meses anteriores completos, el valor registrado fue cero.`;
  if (Math.abs(averageChange) < .05) return `En ${monthName(latest.month)} registraste ${currentText}. Las ventas se mantuvieron cerca del promedio de los ${previous.length} meses completos anteriores.`;
  return `En el último mes completo vendiste ${readablePercent(Math.abs(averageChange))} ${averageChange < 0 ? "menos" : "más"} que el promedio de los ${previous.length} meses completos anteriores.`;
}

function trendChartHtml() {
  const metrics = app.analysis.metrics;
  if (!metrics.chartBasis) {
    const reason = metrics.valueRate >= metrics.quantityRate ? metrics.valueUnavailableReason : metrics.quantityUnavailableReason;
    return `<article class="result-chart chart-unavailable"><h3>Así se han movido tus ventas</h3><p>No mostramos este gráfico porque ${safe(reason.charAt(0).toLowerCase() + reason.slice(1))}</p></article>`;
  }
  const data = metrics.monthly.slice(-12);
  if (data.length < 2) return `<article class="result-chart chart-unavailable"><h3>Así se han movido tus ventas</h3><p>No mostramos una tendencia porque encontramos información utilizable en menos de dos meses.</p></article>`;
  const maximum = Math.max(...data.map(item => item.value), 1);
  const unit = metrics.chartBasis === "value" ? "pesos vendidos por mes" : "unidades vendidas por mes";
  const bars = data.map((item, index) => {
    const label = metrics.chartBasis === "value" ? money.format(item.value) : `${readableNumber(item.value)} unidades`;
    return `<div class="month-bar" title="${safe(`${monthName(item.month)}: ${label}`)}" aria-label="${safe(`${monthName(item.month)}: ${label}`)}">${index === data.length - 1 ? `<span class="latest-bar-value">${safe(label)}</span>` : ""}<i style="--bar-height:${Math.max(3, item.value / maximum * 100)}%" aria-hidden="true"></i><b>${safe(monthName(item.month))}</b></div>`;
  }).join("");
  return `<article class="result-chart"><h3>Así se han movido tus ventas</h3><p class="chart-subtitle">${safe(unit)} · Último mes completo analizado: ${safe(longMonthName(metrics.lastCompleteMonth))}.</p><div class="monthly-bars" role="img" aria-label="${safe(unit)}">${bars}</div><p class="chart-meaning"><strong>Esto significa:</strong> ${safe(trendMeaning(data, metrics.chartBasis))}</p></article>`;
}

function productChartHtml() {
  const metrics = app.analysis.metrics;
  if (!metrics.chartBasis) return `<article class="result-chart chart-unavailable"><h3>Productos que más aportan a tus ventas</h3><p>No mostramos este gráfico porque no encontramos una medida de ventas suficientemente completa.</p></article>`;
  const valueOf = item => metrics.chartBasis === "value" ? item[1].revenue : item[1].units;
  const ranked = [...metrics.ranked].sort((a, b) => valueOf(b) - valueOf(a));
  const total = metrics.chartBasis === "value" ? metrics.revenue : metrics.units;
  if (!total || !ranked.length) return `<article class="result-chart chart-unavailable"><h3>Productos que más aportan a tus ventas</h3><p>No mostramos este gráfico porque el total registrado para esta medida es cero.</p></article>`;
  const visible = ranked.slice(0, 4).map(([label, item]) => ({ label, value: valueOf([label, item]) }));
  const other = Math.max(0, total - visible.reduce((sum, item) => sum + item.value, 0));
  if (other > 0) visible.push({ label: "Otros", value: other });
  const rows = visible.map((item, index) => `<div class="product-bar-row"><span>${safe(item.label)}</span><div><i style="--bar-width:${item.value / total * 100}%" class="${index === 0 ? "highlight" : ""}"></i></div><strong>${readablePercent(item.value / total)}</strong></div>`).join("");
  const topThree = ranked.slice(0, 3).reduce((sum, item) => sum + valueOf(item), 0) / total;
  const measure = metrics.chartBasis === "value" ? "valor vendido" : "unidades vendidas";
  return `<article class="result-chart"><h3>Productos que más aportan a tus ventas</h3><p class="chart-subtitle">Porcentaje del ${safe(measure)}</p><div class="product-bars" role="img" aria-label="Porcentaje de los productos sobre el ${safe(measure)}">${rows}</div><p class="chart-meaning"><strong>Esto significa:</strong> Los ${Math.min(3, ranked.length)} productos principales representan ${readablePercent(topThree)} del ${safe(measure)}.</p></article>`;
}

function recommendationStrength(finding, quality) {
  const rates = quality.rates;
  const measureRate = app.analysis.metrics.chartBasis === "value" ? rates.value : rates.quantity;
  const critical = ["trend", "business-decline", "product-decline", "sales-decline-cause"].includes(finding?.type) ? Math.min(rates.date, rates.product, measureRate)
    : finding?.type === "concentration" || finding?.type === "review" || finding?.type === "maintain" ? Math.min(rates.product, measureRate)
      : ["slow", "stockout", "inventory-accumulation", "inventory-excess", "stock-risk-general"].includes(finding?.type) ? Math.min(rates.product, rates.quantity, rates.inventoryProduct, rates.stock) : quality.score / 100;
  const criticalLevel = critical >= .85 ? "ALTA" : critical >= .65 ? "MEDIA" : "BAJA";
  return [quality.level, criticalLevel].includes("BAJA") ? "BAJA" : [quality.level, criticalLevel].includes("MEDIA") ? "MEDIA" : "ALTA";
}

function priorityPresentation(finding) {
  const { metrics, resultQuality: quality } = app.analysis;
  const strength = recommendationStrength(finding, quality);
  const lead = subject => strength === "ALTA" ? `Revisa primero ${subject}.` : strength === "MEDIA" ? `Los datos indican que conviene revisar primero ${subject}.` : `Hay señales de que conviene revisar ${subject}, pero encontramos información incompleta que puede afectar esta conclusión.`;
  if (finding.type === "business-decline") {
    const panorama = metrics.panorama;
    const amount = value => panorama.basis === "value" ? money.format(value) : `${readableNumber(value)} unidades`;
    const title = strength === "ALTA" ? "Tus ventas vienen bajando." : strength === "MEDIA" ? "Los datos muestran que tus ventas vienen bajando." : "Hay señales de una reducción en las ventas, pero falta información para confirmarla.";
    return { title, metrics: [`${readablePercent(Math.abs(panorama.change))} menos en los últimos tres meses`, `${amount(panorama.recentAverage)} de promedio mensual reciente`, `${amount(panorama.priorAverage)} de promedio mensual anterior`], found: finding.reason, important: finding.meaning, action: finding.action, strength };
  }
  if (["inventory-accumulation", "inventory-excess", "stock-risk-general"].includes(finding.type)) {
    const title = strength === "ALTA" ? finding.title : strength === "MEDIA" ? `Los datos indican que ${finding.title.charAt(0).toLowerCase() + finding.title.slice(1)}` : `Hay señales de esta situación, pero encontramos información incompleta que puede afectar la conclusión.`;
    const metricsList = finding.type === "inventory-accumulation"
      ? [`${readablePercent(metrics.inventoryChange)} más unidades en inventario`, `${readablePercent(Math.abs(metrics.unitPanorama.change))} menos unidades vendidas`]
      : finding.type === "inventory-excess"
        ? [`${readablePercent(metrics.excessInventoryShare)} de las existencias con poco movimiento`, `${readableNumber(metrics.inventoryUnits)} unidades disponibles`]
        : [`${readablePercent(metrics.riskSalesShare)} de las ventas recientes en riesgo`, `${metrics.riskItems.length} ${metrics.riskItems.length === 1 ? "producto con pocas existencias" : "productos con pocas existencias"}`];
    return { title, metrics: metricsList, found: finding.reason, important: finding.meaning, action: finding.action, strength };
  }
  if (finding.type === "sales-decline-cause") return { title: finding.title, metrics: [`${readablePercent(finding.driver.contribution)} de la reducción`, `${readablePercent(finding.driver.recentShare)} de las ventas recientes`], found: finding.reason, important: finding.meaning, action: finding.action, strength };
  if (finding.type === "slow") {
    const item = finding.items[0];
    const soldShare = metrics.units ? item.sold / metrics.units : 0;
    const ratio = item.sold > 0 ? item.stock / item.sold : null;
    return { title: lead(`el producto ${item.producto}`), metrics: [`${readableNumber(item.sold)} unidades vendidas`, `${readableNumber(item.stock)} unidades disponibles`, `${readablePercent(soldShare)} de las unidades vendidas`, ratio ? `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(ratio)} veces más unidades disponibles que vendidas` : "No registró unidades vendidas"], found: `Este producto vendió ${readableNumber(item.sold)} unidades durante ${readableNumber(quality.periodDays)} días revisados.`, important: `Representa ${readablePercent(soldShare)} de las unidades vendidas y mantiene ${readableNumber(item.stock)} unidades disponibles.`, action: "Revisa sus ventas y existencias antes de volver a comprarlo.", strength };
  }
  if (finding.type === "stockout") {
    const item = finding.item || metrics.stockout;
    return { title: lead(`las existencias de ${item.producto}`), metrics: [`${readableNumber(item.sold)} unidades vendidas`, `${readableNumber(item.stock)} unidades disponibles`], found: `${item.producto} registró ${readableNumber(item.sold)} unidades vendidas y actualmente aparecen ${readableNumber(item.stock)} unidades disponibles.`, important: "Si continúa vendiéndose, las existencias actuales podrían no ser suficientes.", action: "Confirma las existencias y revisa el siguiente pedido.", strength };
  }
  if (finding.type === "concentration") {
    const [product, values] = metrics.ranked[0];
    const measure = metrics.rankingBasis === "value" ? "valor vendido" : "unidades vendidas";
    const amount = metrics.rankingBasis === "value" ? `${money.format(values.revenue)} vendidos` : `${readableNumber(values.units)} unidades vendidas`;
    return { title: lead(`cuánto dependen tus ventas de ${product}`), metrics: [amount, `${readablePercent(metrics.topShare)} del ${measure}`], found: `${product} es el producto que más aporta a las ventas registradas.`, important: `Este producto representa ${readablePercent(metrics.topShare)} del ${measure}.`, action: "Comprueba si este patrón continúa y revisa qué otros productos puedes impulsar.", strength };
  }
  if (finding.type === "trend") {
    const measure = metrics.chartBasis === "value" ? "valor de las ventas" : "unidades vendidas";
    return { title: lead(`la caída reciente en el ${measure}`), metrics: [`${readablePercent(Math.abs(metrics.trendChange))} menos que el periodo anterior`, `${metrics.monthly.length} meses con registros`], found: finding.reason, important: finding.evidence, action: "Confirma si ocurrió algo fuera de lo normal y revisa qué productos explican el cambio.", strength };
  }
  if (finding.type === "product-decline") {
    if (finding.driver) return { title: finding.title, metrics: [`${readablePercent(Math.abs(finding.driver.change))} menos entre los dos periodos`, `${readablePercent(finding.driver.recentShare)} de las ventas recientes`], found: finding.reason, important: finding.meaning, action: finding.action, strength };
    const item = finding.productChange;
    const measure = metrics.chartBasis === "value" ? "valor vendido" : "unidades vendidas";
    const latest = metrics.chartBasis === "value" ? `${money.format(item.latest)} vendidos` : `${readableNumber(item.latest)} unidades vendidas`;
    const previous = metrics.chartBasis === "value" ? money.format(item.previousAverage) : `${readableNumber(item.previousAverage)} unidades`;
    return { title: lead(`el producto ${item.product}`), metrics: [latest, `${readablePercent(Math.abs(item.change))} menos que su promedio reciente`, `${previous} de promedio mensual anterior`], found: `${item.product} registró ${latest} en el último mes completo.`, important: `El resultado fue ${readablePercent(Math.abs(item.change))} menor que su promedio de los tres meses completos anteriores.`, action: "Revisa qué cambió en sus ventas antes de ajustar compras, precio o exhibición.", strength };
  }
  if (finding.type === "maintain" && metrics.ranked[0]) {
    const [product, values] = metrics.ranked[0];
    const amount = metrics.rankingBasis === "value" ? `${money.format(values.revenue)} vendidos` : `${readableNumber(values.units)} unidades vendidas`;
    return { title: lead(`la disponibilidad de ${product}`), metrics: [amount, `${readablePercent(metrics.topShare)} ${metrics.rankingBasis === "value" ? "del valor vendido" : "de las unidades vendidas"}`], found: `${product} lidera las ventas registradas durante el periodo.`, important: "Mantener disponible un producto con demanda ayuda a evitar ventas que no puedas atender.", action: "Revisa sus existencias y el tiempo de entrega de tu proveedor.", strength };
  }
  const product = metrics.ranked.at(-1)?.[0];
  if (product) {
    const values = metrics.ranked.at(-1)[1];
    const amount = metrics.rankingBasis === "value" ? `${money.format(values.revenue)} vendidos` : `${readableNumber(values.units)} unidades vendidas`;
    return { title: lead(`el producto ${product}`), metrics: [amount], found: `${product} fue el producto con menor movimiento registrado.`, important: "Un producto con poco movimiento puede requerir revisar compras, precio o exhibición.", action: "Confirma sus ventas y existencias antes de hacer una nueva compra.", strength };
  }
  return { title: "Todavía no tenemos información suficiente para decirte qué atender primero.", metrics: [], found: "La información disponible no permite comparar productos o periodos con seguridad.", important: resultQualityCopy(quality), action: "Revisa los datos incompletos indicados arriba y vuelve a realizar el análisis.", strength: "BAJA" };
}

function resultEvidenceHtml(presentation) {
  return `<section class="priority-evidence" id="priority-evidence"><article><span>¿Qué encontramos?</span><p>${safe(presentation.found)}</p></article><article><span>¿Por qué es importante?</span><p>${safe(presentation.important)}</p></article><article><span>¿Qué puedes hacer?</span><p>${safe(presentation.action)}</p></article></section>`;
}

function stageThreeSecondaryFindings() {
  return (app.analysis.priorities || []).slice(1, 3).filter(finding => finding.type !== "data").map(finding => ({
    key: finding.type,
    sentence: finding.summary || finding.reason || finding.title
  }));
}

function analysisLimitations() {
  const metrics = app.analysis.metrics;
  const sales = app.dataset?.sales || [], inventory = app.dataset?.inventory || [];
  const limitations = [];
  if (!sales.length) limitations.push("No encontramos ventas, por eso no podemos explicar qué pasó con ellas.");
  if (sales.length && metrics.valueRate < .7) limitations.push(metrics.valueUnavailableReason);
  if (sales.length && metrics.quantityRate < .7) limitations.push(metrics.quantityUnavailableReason);
  if (!inventory.length) limitations.push("No encontramos inventario, por eso no podemos decir si tienes exceso o falta de existencias.");
  else if (!metrics.inv.length) limitations.push("No usamos el inventario porque no encontramos productos con existencias utilizables.");
  else if (!metrics.linkedProducts) limitations.push("No pudimos comparar ventas e inventario porque los productos de ambos archivos no tienen una referencia que podamos relacionar con suficiente claridad.");
  if (metrics.monthly.length < 2) limitations.push("No encontramos suficientes meses completos para comparar el comportamiento reciente de las ventas.");
  else if (!consecutiveMonths(metrics.monthly.slice(-Math.min(4, metrics.monthly.length)))) limitations.push("Hay meses sin registros. No asumimos que esos meses tuvieron ventas en cero.");
  return [...new Set(limitations)];
}

function compactRecentChartHtml() {
  const metrics = app.analysis.metrics;
  const data = metrics.monthly.slice(-6);
  if (!metrics.chartBasis || data.length < 2) return `<p class="detail-unavailable">No mostramos este gráfico porque la información disponible no es suficiente para hacerlo de forma confiable.</p>`;
  const maximum = Math.max(...data.map(item => item.value), 1);
  const bars = data.map((item, index) => {
    const label = metrics.chartBasis === "value" ? money.format(item.value) : `${readableNumber(item.value)} unidades`;
    return `<div class="compact-month" title="${safe(`${monthName(item.month)}: ${label}`)}"><i style="--bar-height:${Math.max(4, item.value / maximum * 100)}%" class="${index === data.length - 1 ? "latest" : ""}"></i><b>${safe(monthName(item.month))}</b></div>`;
  }).join("");
  return `<div class="compact-chart" role="img" aria-label="Ventas de los últimos seis meses completos">${bars}</div><p class="chart-meaning"><strong>Esto significa:</strong> ${safe(trendMeaning(data, metrics.chartBasis))}</p>`;
}

function managementSalesHtml() {
  const metrics = app.analysis.metrics;
  const panorama = metrics.panorama;
  if (panorama.reliable) {
    const amount = value => panorama.basis === "value" ? money.format(value) : `${readableNumber(value)} unidades`;
    const direction = panorama.status === "VENTAS EN DESCENSO" ? "vienen bajando" : panorama.status === "VENTAS EN CRECIMIENTO" ? "vienen aumentando" : "se mantienen estables";
    const comparison = panorama.change === null ? "partieron de un periodo sin ventas registradas" : `${readablePercent(Math.abs(panorama.change))} ${panorama.change < 0 ? "menos" : "más"} que en los tres meses anteriores`;
    return `<section><h3>Qué pasó con tus ventas</h3><p><strong>Tus ventas ${direction}.</strong></p><p>En los últimos tres meses registraste un promedio mensual de ${safe(amount(panorama.recentAverage))}.</p><p>Eso fue ${safe(comparison)}. El promedio anterior fue de ${safe(amount(panorama.priorAverage))} al mes.</p><p>Esto significa que el negocio ${panorama.status === "VENTAS EN DESCENSO" ? "está vendiendo menos de lo que venía vendiendo" : panorama.status === "VENTAS EN CRECIMIENTO" ? "está vendiendo más de lo que venía vendiendo" : "mantiene un comportamiento similar entre ambos periodos"}.</p><h4>Últimos 6 meses</h4>${compactRecentChartHtml()}</section>`;
  }
  const comparison = trendComparison(metrics.monthly, metrics.chartBasis);
  if (!metrics.chartBasis || !comparison.available) return `<section><h3>Qué pasó con tus ventas</h3><p><strong>No podemos decir todavía si las ventas están mejorando o bajando.</strong></p><p>${safe(comparison.reason || "No encontramos una medida de ventas suficientemente completa.")}</p>${compactRecentChartHtml()}</section>`;
  const direction = Math.abs(comparison.averageChange) < .05 ? "se mantienen" : comparison.averageChange < 0 ? "vienen bajando" : "vienen aumentando";
  const previousText = comparison.previousChange === null ? "" : ` Fueron ${readablePercent(Math.abs(comparison.previousChange))} ${comparison.previousChange < 0 ? "menos" : "más"} que el mes anterior.`;
  return `<section><h3>Qué pasó con tus ventas</h3><p><strong>Tus ventas ${direction}.</strong></p><p>En ${safe(monthName(comparison.latest.month))} registraste ${safe(comparison.currentText)}.${safe(previousText)}</p><p>Frente al promedio de los ${comparison.previous.length} meses completos anteriores, el cambio fue de ${readablePercent(Math.abs(comparison.averageChange))} ${comparison.averageChange < 0 ? "menos" : "más"}.</p><p>Esto significa que las ventas recientes ${comparison.averageChange < -.05 ? "están por debajo" : comparison.averageChange > .05 ? "están por encima" : "se mantienen cerca"} del comportamiento que venías teniendo.</p><h4>Últimos 6 meses</h4>${compactRecentChartHtml()}</section>`;
}

function managementProductsHtml() {
  const metrics = app.analysis.metrics;
  if (!metrics.chartBasis || !metrics.ranked.length) return `<section><h3>Qué productos están sosteniendo tus ventas</h3><p><strong>No pudimos comparar el aporte de los productos.</strong></p><p>No encontramos una medida de ventas suficientemente completa para hacerlo de forma confiable.</p></section>`;
  const valueOf = item => metrics.chartBasis === "value" ? item[1].revenue : item[1].units;
  const total = metrics.chartBasis === "value" ? metrics.revenue : metrics.units;
  const leaders = metrics.ranked.slice(0, 3);
  const combined = leaders.reduce((sum, item) => sum + valueOf(item), 0) / total;
  const first = valueOf(leaders[0]) / total;
  return `<section><h3>Qué productos están sosteniendo tus ventas</h3><p><strong>${combined >= .6 ? "Gran parte de tus ventas depende de pocos productos." : "Tus ventas están repartidas entre varios productos."}</strong></p><p>${safe(leaders.map(item => item[0]).join(", "))} representan ${readablePercent(combined)} ${metrics.chartBasis === "value" ? "del valor vendido" : "de las unidades vendidas"}.</p><p>${safe(leaders[0][0])} representa por sí solo ${readablePercent(first)}.</p><p>Esto significa que si uno de estos productos vende menos, puede afectar una parte importante de tus ventas.</p></section>`;
}

function managementDetailHtml(main, presentation, insufficient) {
  const quality = app.analysis.resultQuality;
  const limitations = analysisLimitations();
  const details = quality.details.filter(item => ["Fecha de venta", "Producto de ventas", "Cantidad vendida", "Valor de la venta"].includes(item.label)).slice(0, 4);
  return `<div class="management-report"><header><p class="section-kicker">Mini informe gerencial</p><h2>Resumen para tomar decisiones</h2><p>Revisamos tu información. Estos son los puntos más importantes para entender qué está pasando.</p></header>
    ${managementSalesHtml()}${managementProductsHtml()}
    <section><h3>Qué deberías revisar primero</h3>${insufficient ? `<p><strong>Todavía no tenemos información suficiente para decirte qué atender primero.</strong></p><p>${safe(quality.reasons[0] || resultQualityCopy(quality))}</p>` : `<p><strong>${safe(presentation.title)}</strong></p><p>${safe(presentation.found)}</p><p>${safe(presentation.important)}</p><p>Por eso San José lo coloca como la primera situación a revisar.</p>`}</section>
    <section><h3>Lo que todavía no podemos saber</h3>${limitations.length ? `<ul>${limitations.map(item => `<li>${safe(item)}</li>`).join("")}</ul>` : "<p>No encontramos una limitación importante para las conclusiones mostradas.</p>"}</section>
    <section><h3>Calidad de la información</h3><p><strong>Calidad de la información: ${quality.score} % · ${safe(quality.level[0] + quality.level.slice(1).toLowerCase())}</strong></p><p>${safe(resultQualityCopy(quality))}</p><details class="detail-quality"><summary>Ver por qué</summary><ul>${details.map(item => `<li><span>${safe(item.label.replace(" de venta", ""))}</span><strong>${readablePercent(item.rate)} utilizable</strong></li>`).join("")}</ul></details></section>
    <section class="download-explanation"><h3>Descargar resumen ejecutivo</h3><p>Guarda estas conclusiones en un informe corto para revisarlas con tu equipo.</p></section></div>`;
}

function resultsScreen() {
  if (!app.analysis) return missingState();
  app.completed.priority = true;
  const quality = app.analysis.resultQuality || app.analysis.quality;
  const main = app.analysis.priorities[0];
  const insufficient = quality.level === "BAJA" || !main;
  const secondary = stageThreeSecondaryFindings();
  const presentation = main ? priorityPresentation(main) : null;
  return `<p class="eyebrow">Lo más importante que encontramos</p>
    <h1 class="screen-title">Esto muestran tus datos</h1>
    <p class="screen-intro">Revisamos la información que compartiste. Aquí te mostramos primero las cifras principales y después lo que creemos que deberías atender.</p>
    <section class="result-section" aria-labelledby="summary-title"><h2 id="summary-title">Tus datos en pocas palabras</h2><div class="result-stats">${summaryCardsHtml()}</div></section>
    ${resultQualityHtml()}
    <section class="result-section" aria-labelledby="charts-title"><h2 id="charts-title">Lo que pasó con tus ventas</h2><div class="result-charts">${trendChartHtml()}${productChartHtml()}</div></section>
    ${insufficient ? `<section class="insufficient-priority"><p class="section-kicker">Resultado del análisis</p><h2>Todavía no tenemos información suficiente para decirte qué atender primero.</h2><p>${safe(quality.reasons[0] || "No encontramos suficientes datos utilizables para comparar productos o periodos.")}</p></section>` : `<section class="result-section priority-section" aria-labelledby="priority-title"><p class="section-kicker">Atiende esto primero</p><article class="main-priority"><h2 id="priority-title">${safe(presentation.title)}</h2><div class="priority-metrics">${presentation.metrics.slice(0, 4).map(metric => `<span>${safe(metric)}</span>`).join("")}</div><p class="quality-notice">${presentation.strength === "MEDIA" ? `Esta recomendación utiliza información con ${quality.score} % de calidad. Ten en cuenta las limitaciones indicadas.` : presentation.strength === "BAJA" ? `Esta recomendación se basa en información con ${quality.score} % de calidad y debe tomarse como una señal inicial.` : `Basado en información con ${quality.score} % de calidad.`}</p></article></section>${resultEvidenceHtml(presentation)}<div class="priority-actions"><button class="button gold" type="button" data-go="7">Ver mis 3 acciones</button><button class="button secondary" type="button" data-priority="0" data-go="6">Ver evidencia</button></div>`}
    ${secondary.length ? `<section class="result-section also-found"><h2>También encontramos</h2><div class="secondary-findings">${secondary.map(item => `<article class="secondary-finding"><p>${safe(item.sentence)}</p></article>`).join("")}</div></section>` : ""}
    <details class="analysis-details"><summary>Ver detalle del análisis</summary>${managementDetailHtml(main, presentation, insufficient)}</details>
    <div class="download-summary-action"><button id="download-summary" class="button secondary" type="button" ${insufficient ? "disabled" : ""}>Descargar resumen ejecutivo</button>${insufficient ? "<p>Podrás descargarlo cuando exista información suficiente para sustentar una conclusión.</p>" : ""}</div>
    ${nav(4, null)}`;
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
    document.querySelectorAll(".additional-data[data-additional-key]").forEach(details => details.addEventListener("toggle", () => {
      app.additionalSections[details.dataset.additionalKey] = details.open;
    }));
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
  app.clarifications = {};
  app.additionalSections = {};
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
  if (["cantidad", "precio", "valorTotal", "costo", "utilidad", "stock", "inventarioMinimo", "inventarioMaximo", "puntoReposicion", "reservada", "disponible", "pendienteRecibir", "tiempoEntrega", "descuento"].includes(role)) score += profile.numeric * 3;
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
  const conflicts = app.classified.flatMap(table => {
    if (!table.interpretation || !["sales", "inventory"].includes(table.type)) return [];
    const roles = table.type === "sales" ? ["fecha", "producto", "cantidad", "valorTotal"] : ["producto", "stock"];
    const hasConfirmedSalesMeasure = table.type === "sales" && ["cantidad", "valorTotal"].some(role => table.interpretation.assignments[role]?.confirmed);
    return roles.filter(role => !(hasConfirmedSalesMeasure && ["cantidad", "valorTotal"].includes(role)))
      .map(role => [role, table.interpretation.assignments[role]])
      .filter(([, assignment]) => assignment?.duplicates?.length > 1 && !assignment.confirmed);
  });
  if (conflicts.length) issues.push({
    title: "Necesitamos revisar una columna",
    message: "Este dato todavía necesita tu confirmación.",
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
  const review = primaryReviewProgress();
  const recognizedCount = relevant("sales").length + relevant("inventory").length;
  if (!recognizedCount || (review.complete && !scope.hasSales && !scope.hasInventory)) {
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
  } else if (action === "edit") {
    if (assignment) assignment.confirmed = false;
    app.clarifications[key] = { status: "editing" };
  }
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
    confirmed: false,
    userSelected: true,
    duplicates: [],
    score: 10,
    sample: sourceTable.profiles?.[header]?.sample || "Sin muestra"
  };
  app.clarifications[`${tableIndex}:${role}`] = { status: "selected" };
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
      confirmed: false,
      userSelected: true,
      duplicates: [],
      score: 10,
      sample: table.profiles[header]?.sample || "Sin muestra"
    };
    app.clarifications[`${tableIndex}:${selectedRole}`] = { status: "selected" };
    refreshInterpretationAnalysis();
  } else app.clarifications[`${tableIndex}:${currentRole}`] = { status: selectedRole === "other" ? "ignored" : "unknown", header };
  render();
}

function confirmInterpretation() {
  const issues = requiredMappingIssues();
  const review = primaryReviewProgress();
  const scope = interpretedScope();
  if (issues.length || !review.complete || (!scope.hasSales && !scope.hasInventory)) return;
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

function stageThreeQuality(sales, inventory) {
  const saleValue = row => Number.isFinite(numericValue(row.valorTotal))
    ? numericValue(row.valorTotal)
    : Number.isFinite(numericValue(row.precio)) && Number.isFinite(numericValue(row.cantidad))
      ? numericValue(row.precio) * numericValue(row.cantidad)
      : NaN;
  const present = value => String(value ?? "").trim() !== "";
  const validDate = value => present(value) && !Number.isNaN(new Date(value).getTime());
  const validQuantity = row => Number.isFinite(numericValue(row.cantidad)) && numericValue(row.cantidad) >= 0;
  const validValue = row => Number.isFinite(saleValue(row)) && saleValue(row) >= 0;
  const validStock = row => Number.isFinite(numericValue(row.stock)) && numericValue(row.stock) >= 0;
  const salesExpected = sales.length * 3;
  const inventoryExpected = inventory.length * 2;
  const expected = salesExpected + inventoryExpected;
  const salesPresent = sales.reduce((sum, row) => sum
    + Number(present(row.producto))
    + Number(present(row.fecha))
    + Number(present(row.cantidad) || present(row.valorTotal) || (present(row.cantidad) && present(row.precio))), 0);
  const inventoryPresent = inventory.reduce((sum, row) => sum + Number(present(row.producto)) + Number(present(row.stock)), 0);
  const available = salesPresent + inventoryPresent;
  const salesValid = sales.reduce((sum, row) => sum + Number(present(row.producto)) + Number(validDate(row.fecha)) + Number(validQuantity(row) || validValue(row)), 0);
  const inventoryValid = inventory.reduce((sum, row) => sum + Number(present(row.producto)) + Number(validStock(row)), 0);
  const usable = salesValid + inventoryValid;
  const rowCompleteness = expected ? available / expected : 0;
  const sourceCoverage = sales.length && inventory.length ? 1 : sales.length ? .6 : inventory.length ? .4 : 0;
  const completeness = rowCompleteness * sourceCoverage;
  const validity = available ? Math.min(1, usable / available) : 0;
  const negativeRows = sales.filter(row => numericValue(row.cantidad) < 0 || saleValue(row) < 0).length
    + inventory.filter(row => numericValue(row.stock) < 0).length;
  const seenSales = new Set();
  const duplicates = sales.filter(row => present(row.factura)).reduce((count, row) => {
    const key = `${normalize(row.factura)}|${normalize(row.producto)}`;
    if (seenSales.has(key)) return count + 1;
    seenSales.add(key);
    return count;
  }, 0);
  const totalRows = sales.length + inventory.length;
  const recordConsistency = totalRows ? Math.max(0, 1 - (negativeRows + duplicates) / totalRows) : 0;
  const salesProducts = new Set(sales.map(row => normalize(row.producto)).filter(Boolean));
  const inventoryProducts = new Set(inventory.map(row => normalize(row.producto)).filter(Boolean));
  const related = [...salesProducts].filter(product => inventoryProducts.has(product)).length;
  const relationCoverage = salesProducts.size && inventoryProducts.size ? related / salesProducts.size : null;
  const consistency = relationCoverage === null ? recordConsistency : recordConsistency * .75 + relationCoverage * .25;
  const validDates = sales.map(row => new Date(row.fecha)).filter(date => !Number.isNaN(date.getTime()));
  const periodDays = validDates.length > 1 ? Math.round((Math.max(...validDates) - Math.min(...validDates)) / 86400000) + 1 : validDates.length;
  const observedMonths = new Set(validDates.map(date => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`));
  let expectedMonths = observedMonths.size;
  if (validDates.length > 1) {
    const first = new Date(Math.min(...validDates)), last = new Date(Math.max(...validDates));
    expectedMonths = (last.getUTCFullYear() - first.getUTCFullYear()) * 12 + last.getUTCMonth() - first.getUTCMonth() + 1;
  }
  const coverageParts = [];
  if (sales.length) coverageParts.push(Math.min(1, sales.length / 20), Math.min(1, periodDays / 180), expectedMonths ? observedMonths.size / expectedMonths : 0);
  if (inventory.length) coverageParts.push(Math.min(1, inventory.length / 10));
  const coverage = coverageParts.length ? coverageParts.reduce((sum, value) => sum + value, 0) / coverageParts.length : 0;
  const score = Math.round((completeness * .35 + validity * .30 + consistency * .20 + coverage * .15) * 100);
  const level = score >= 85 ? "ALTA" : score >= 65 ? "MEDIA" : "BAJA";
  const salesRate = (predicate, rows = sales) => rows.length ? rows.filter(predicate).length / rows.length : 0;
  const details = [];
  if (sales.length) details.push(
    { label: "Producto de ventas", rate: salesRate(row => present(row.producto)) },
    { label: "Fecha de venta", rate: salesRate(row => validDate(row.fecha)) },
    { label: "Cantidad vendida", rate: salesRate(validQuantity) },
    { label: "Valor de la venta", rate: salesRate(validValue) }
  );
  if (inventory.length) details.push(
    { label: "Producto de inventario", rate: salesRate(row => present(row.producto), inventory) },
    { label: "Existencias", rate: salesRate(validStock, inventory) }
  );
  const reasons = [];
  const addReason = (rate, label) => { if (rate < 1) reasons.push(`${readablePercent(1 - rate)} de los registros ${label}.`); };
  if (sales.length) {
    addReason(details.find(item => item.label === "Cantidad vendida").rate, "no tiene una cantidad vendida utilizable");
    addReason(details.find(item => item.label === "Fecha de venta").rate, "no tiene una fecha que podamos utilizar");
    addReason(details.find(item => item.label === "Producto de ventas").rate, "no tiene un producto identificado");
    if (expectedMonths > observedMonths.size) reasons.push(`${countText(expectedMonths - observedMonths.size, "un mes", "meses")} sin registros dentro del periodo revisado.`);
  }
  if (inventory.length) addReason(details.find(item => item.label === "Existencias").rate, "no tiene una existencia utilizable");
  if (duplicates) reasons.push(`${countText(duplicates, "un registro repetido", "registros repetidos")} puede afectar algunos totales.`);
  if (relationCoverage !== null && relationCoverage < .7) reasons.push(`Solo pudimos relacionar ${readablePercent(relationCoverage)} de los productos vendidos con el inventario.`);
  return {
    score,
    level,
    components: { completeness, validity, consistency, coverage },
    details,
    reasons: reasons.slice(0, 4),
    relationCoverage,
    observedMonths: observedMonths.size,
    expectedMonths,
    periodDays,
    rates: {
      product: sales.length ? sales.filter(row => present(row.producto)).length / sales.length : 0,
      date: salesRate(row => validDate(row.fecha)),
      quantity: salesRate(validQuantity),
      value: salesRate(validValue),
      inventoryProduct: inventory.length ? inventory.filter(row => present(row.producto)).length / inventory.length : 0,
      stock: inventory.length ? inventory.filter(validStock).length / inventory.length : 0
    }
  };
}

function analyze(data, referenceDate = new Date()) {
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
  const dates = sales.map(row => new Date(row.fecha)).filter(date => !Number.isNaN(date.getTime()));
  const period = dates.length > 1 ? Math.round((Math.max(...dates) - Math.min(...dates)) / 86400000) : 0;
  const saleProducts = new Set(sales.map(row => normalize(row.producto)).filter(Boolean));
  const inventoryProducts = new Set(inventory.map(row => normalize(row.producto)).filter(Boolean));
  const matches = [...saleProducts].filter(product => inventoryProducts.has(product)).length;
  const relation = saleProducts.size ? matches / saleProducts.size : 0;
  const costRows = inventory.filter(row => Number.isFinite(numericValue(row.costo)) && numericValue(row.costo) >= 0).length;
  const costCoverage = inventory.length ? costRows / inventory.length : 0;
  const resultQuality = stageThreeQuality(sales, inventory);
  const score = resultQuality.score;
  const level = resultQuality.level;
  const enoughSales = hasSales && sales.length >= 5 && validProductSales / sales.length >= .7 && validDateSales / sales.length >= .7 && validMeasureSales / sales.length >= .7;
  const enoughInventory = hasInventory && inventory.length >= 2 && validInventory / inventory.length >= .7;
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
  const metrics = calculateMetrics(sales, inventory, period, referenceDate);
  const priorities = level === "BAJA" ? [] : prioritize(metrics, { hasSales, hasInventory, completeness });
  const freeContext = normalize(`${app.context.contextoLibre || ""} ${app.context.eventoReciente || ""}`);
  const trendFirst = ["trend", "business-decline"].includes(priorities[0]?.type);
  const contextMentionsChange = Boolean(app.context.eventoReciente) || /(cerr|problema|proveedor|precio|cliente|normal|vacacion|obra|cambio|perdi)/.test(freeContext);
  return { quality, resultQuality, metrics, priorities, adaptiveNeeded: trendFirst && !contextMentionsChange };
}

function salesPanorama(series, basis) {
  const window = series.slice(-6);
  if (!basis || window.length < 6 || !consecutiveMonths(window)) return {
    status: "INFORMACIÓN INSUFICIENTE", reliable: false,
    reason: "Necesitamos seis meses completos y consecutivos para comparar dos periodos equivalentes."
  };
  const prior = window.slice(0, 3), recent = window.slice(3);
  const total = items => items.reduce((sum, item) => sum + item.value, 0);
  const priorTotal = total(prior), recentTotal = total(recent);
  const change = priorTotal ? (recentTotal - priorTotal) / priorTotal : recentTotal ? null : 0;
  const status = change === null ? "VENTAS EN CRECIMIENTO" : change <= -.10 ? "VENTAS EN DESCENSO" : change >= .10 ? "VENTAS EN CRECIMIENTO" : "VENTAS ESTABLES";
  const priorAverage = priorTotal / 3, recentAverage = recentTotal / 3;
  const duration = status === "VENTAS EN DESCENSO" ? recent.filter(item => item.value < priorAverage).length
    : status === "VENTAS EN CRECIMIENTO" ? recent.filter(item => item.value > priorAverage).length : 0;
  return { status, reliable: true, basis, window, prior, recent, priorTotal, recentTotal, priorAverage, recentAverage, change, duration, lastMonth: recent.at(-1) };
}

function productChangeDrivers(productMonthly, panorama) {
  if (!panorama.reliable) return [];
  const field = panorama.basis === "value" ? "revenue" : "units";
  const priorMonths = panorama.prior.map(item => item.month), recentMonths = panorama.recent.map(item => item.month);
  const businessDelta = panorama.recentTotal - panorama.priorTotal;
  return Object.values(productMonthly).map(item => {
    const sum = months => months.reduce((total, month) => total + (item.months[month]?.[field] || 0), 0);
    const priorTotal = sum(priorMonths), recentTotal = sum(recentMonths), delta = recentTotal - priorTotal;
    const change = priorTotal ? delta / priorTotal : recentTotal ? null : 0;
    const contribution = businessDelta && Math.sign(delta) === Math.sign(businessDelta) ? Math.abs(delta / businessDelta) : 0;
    const recentShare = panorama.recentTotal ? recentTotal / panorama.recentTotal : 0;
    return { product: item.label, key: item.key, priorTotal, recentTotal, delta, change, contribution, recentShare };
  }).filter(item => item.priorTotal || item.recentTotal).sort((a, b) => {
    if (panorama.status === "VENTAS EN DESCENSO") return a.delta - b.delta;
    if (panorama.status === "VENTAS EN CRECIMIENTO") return b.delta - a.delta;
    return Math.abs(b.delta) - Math.abs(a.delta);
  });
}

function calculateMetrics(sales, inventory, period, referenceDate = new Date()) {
  const byProduct = {}, salesByKey = {}, productMonthly = {}, customerMonthly = {}, sellerMonthly = {};
  let revenue = 0, units = 0, quantityRows = 0, valueRows = 0;
  sales.forEach(row => {
    const quantity = numericValue(row.cantidad);
    const value = Number.isFinite(numericValue(row.valorTotal)) ? numericValue(row.valorTotal) : quantity * numericValue(row.precio);
    const validQuantity = Number.isFinite(quantity) && quantity >= 0;
    const validValue = Number.isFinite(value) && value >= 0;
    if (validValue) { revenue += value; valueRows += 1; }
    if (validQuantity) { units += quantity; quantityRows += 1; }
    const product = String(row.producto || "").trim();
    if (!product || (!validQuantity && !validValue)) return;
    byProduct[product] ||= { units: 0, revenue: 0 };
    if (validQuantity) byProduct[product].units += quantity;
    if (validValue) byProduct[product].revenue += value;
    const productKey = normalize(product);
    salesByKey[productKey] ||= { units: 0, revenue: 0, label: product };
    if (validQuantity) salesByKey[productKey].units += quantity;
    if (validValue) salesByKey[productKey].revenue += value;
  });
  const quantityRate = sales.length ? quantityRows / sales.length : 0;
  const valueRate = sales.length ? valueRows / sales.length : 0;
  const rankingBasis = valueRate >= .7 ? "value" : quantityRate >= .7 ? "quantity" : valueRows > quantityRows ? "value" : "quantity";
  const basisValue = item => rankingBasis === "value" ? item.revenue : item.units;
  const ranked = Object.entries(byProduct).sort((a, b) => basisValue(b[1]) - basisValue(a[1]));
  const basisTotal = rankingBasis === "value" ? revenue : units;
  const topShare = basisTotal && ranked[0] ? basisValue(ranked[0][1]) / basisTotal : 0;
  const monthlyValue = {}, monthlyUnits = {};
  sales.forEach(row => {
    const date = new Date(row.fecha), quantity = numericValue(row.cantidad);
    const value = Number.isFinite(numericValue(row.valorTotal)) ? numericValue(row.valorTotal) : quantity * numericValue(row.precio);
    if (Number.isNaN(date.getTime())) return;
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    if (Number.isFinite(value) && value >= 0) monthlyValue[key] = (monthlyValue[key] || 0) + value;
    if (Number.isFinite(quantity) && quantity >= 0) monthlyUnits[key] = (monthlyUnits[key] || 0) + quantity;
    const product = String(row.producto || "").trim();
    if (product) {
      const productKey = normalize(product);
      productMonthly[productKey] ||= { key: productKey, label: product, months: {} };
      productMonthly[productKey].months[key] ||= { units: 0, revenue: 0 };
      if (Number.isFinite(value) && value >= 0) productMonthly[productKey].months[key].revenue += value;
      if (Number.isFinite(quantity) && quantity >= 0) productMonthly[productKey].months[key].units += quantity;
    }
    [["cliente", customerMonthly], ["vendedor", sellerMonthly]].forEach(([role, collection]) => {
      const label = String(row[role] || "").trim();
      if (!label) return;
      const dimensionKey = normalize(label);
      collection[dimensionKey] ||= { key: dimensionKey, label, months: {} };
      collection[dimensionKey].months[key] ||= { units: 0, revenue: 0 };
      if (Number.isFinite(value) && value >= 0) collection[dimensionKey].months[key].revenue += value;
      if (Number.isFinite(quantity) && quantity >= 0) collection[dimensionKey].months[key].units += quantity;
    });
  });
  const chartBasis = valueRate >= .7 ? "value" : quantityRate >= .7 ? "quantity" : null;
  const monthlyMap = chartBasis === "value" ? monthlyValue : chartBasis === "quantity" ? monthlyUnits : {};
  const currentMonth = `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, "0")}`;
  const allMonthly = Object.entries(monthlyMap).sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => ({ month, value }));
  const monthly = allMonthly.filter(item => item.month < currentMonth);
  const completeMonthlyValue = Object.entries(monthlyValue).sort(([a], [b]) => a.localeCompare(b)).filter(([month]) => month < currentMonth).map(([month, value]) => ({ month, value }));
  const completeMonthlyUnits = Object.entries(monthlyUnits).sort(([a], [b]) => a.localeCompare(b)).filter(([month]) => month < currentMonth).map(([month, value]) => ({ month, value }));
  const panorama = salesPanorama(monthly, chartBasis);
  const unitPanorama = salesPanorama(completeMonthlyUnits, quantityRate >= .7 ? "quantity" : null);
  const valuePanorama = salesPanorama(completeMonthlyValue, valueRate >= .7 ? "value" : null);
  const productDrivers = productChangeDrivers(productMonthly, panorama);
  const customerDrivers = productChangeDrivers(customerMonthly, panorama).map(item => ({ ...item, dimension: "cliente" }));
  const sellerDrivers = productChangeDrivers(sellerMonthly, panorama).map(item => ({ ...item, dimension: "vendedor" }));
  productDrivers.forEach(item => { item.dimension = "producto"; });
  const windowSize = panorama.reliable ? 3 : monthly.length >= 4 ? 2 : 0;
  const priorMonths = panorama.reliable ? panorama.prior : windowSize ? monthly.slice(-windowSize * 2, -windowSize) : [];
  const recentMonths = panorama.reliable ? panorama.recent : windowSize ? monthly.slice(-windowSize) : [];
  const average = values => values.length ? values.reduce((sum, item) => sum + item.value, 0) / values.length : 0;
  const priorAverage = average(priorMonths), recentAverage = average(recentMonths);
  const trendChange = priorAverage ? (recentAverage - priorAverage) / priorAverage : 0;
  const trendSustained = recentMonths.length > 1 && consecutiveMonths([...priorMonths, ...recentMonths]) && recentMonths.every(item => item.value < priorAverage) && recentMonths.every((item, index) => index === 0 || item.value <= recentMonths[index - 1].value);
  const productChanges = Object.values(productMonthly).map(item => {
    const series = monthly.slice(-4).map(month => ({ month: month.month, value: item.months[month.month]?.[chartBasis === "value" ? "revenue" : "units"] ?? 0 }));
    if (!chartBasis || series.length < 4 || series.some(item => item.value === null)) return null;
    const latest = series.at(-1).value;
    const previous = series.slice(0, 3);
    const previousAverage = previous.reduce((sum, item) => sum + item.value, 0) / 3;
    const change = previousAverage ? (latest - previousAverage) / previousAverage : 0;
    return { product: item.label, latest, previousAverage, change, series };
  }).filter(Boolean).sort((a, b) => a.change - b.change);
  const validInventoryRows = inventory.filter(row => row.producto && Number.isFinite(numericValue(row.stock)) && numericValue(row.stock) >= 0);
  const inventorySnapshots = validInventoryRows.reduce((groups, row) => {
    const date = new Date(row.fechaCorte);
    if (Number.isNaN(date.getTime())) return groups;
    const key = date.toISOString().slice(0, 10);
    (groups[key] ||= []).push(row);
    return groups;
  }, {});
  const inventoryHistory = Object.entries(inventorySnapshots).sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => ({
    date, units: rows.reduce((sum, row) => sum + numericValue(row.stock), 0), rows
  }));
  const currentInventoryRows = inventoryHistory.length ? inventoryHistory.at(-1).rows : validInventoryRows;
  const inventoryKeyCounts = currentInventoryRows.reduce((counts, row) => {
    const key = normalize(row.producto);
    if (key) counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  const recentUnitMonths = unitPanorama.reliable ? unitPanorama.recent.map(item => item.month) : completeMonthlyUnits.slice(-3).map(item => item.month);
  const recentUnitsTotal = recentUnitMonths.reduce((sum, month) => sum + (monthlyUnits[month] || 0), 0);
  const currentInventoryUnits = currentInventoryRows.reduce((sum, row) => sum + numericValue(row.stock), 0);
  const inv = currentInventoryRows.map(row => {
    const key = normalize(row.producto);
    const linked = Boolean(salesByKey[key]) && inventoryKeyCounts[key] === 1;
    const recentSold = linked ? recentUnitMonths.reduce((sum, month) => sum + (productMonthly[key]?.months[month]?.units || 0), 0) : null;
    const recentMonthlyAverage = recentUnitMonths.length && recentSold !== null ? recentSold / recentUnitMonths.length : null;
    const stock = numericValue(row.stock);
    return {
      ...row,
      stock,
      cost: numericValue(row.costo),
      sold: linked ? salesByKey[key].units : null,
      recentSold,
      recentMonthlyAverage,
      stockShare: currentInventoryUnits ? stock / currentInventoryUnits : 0,
      recentSalesShare: recentUnitsTotal && recentSold !== null ? recentSold / recentUnitsTotal : 0,
      coverageMonths: recentMonthlyAverage > 0 ? stock / recentMonthlyAverage : null,
      linked
    };
  });
  const linkedProducts = new Set(inv.filter(row => row.linked).map(row => normalize(row.producto))).size;
  const relationCoverage = Object.keys(salesByKey).length ? linkedProducts / Object.keys(salesByKey).length : 0;
  const canCompareInventoryMovement = quantityRate >= .7 && recentUnitMonths.length > 0;
  const excessItems = canCompareInventoryMovement ? inv.filter(row => row.linked && row.stock > 0 && (row.recentSold === 0 || row.coverageMonths >= 6 || (row.stockShare >= .15 && row.recentSalesShare <= .05))).sort((a, b) => b.stockShare - a.stockShare) : [];
  const riskItems = canCompareInventoryMovement ? inv.filter(row => row.linked && row.recentSold > 0 && row.coverageMonths !== null && row.coverageMonths <= 1.5 && row.recentSalesShare >= .05).sort((a, b) => b.recentSalesShare - a.recentSalesShare) : [];
  const noMovementItems = canCompareInventoryMovement ? inv.filter(row => row.linked && row.stock > 0 && row.recentSold === 0).sort((a, b) => b.stock - a.stock) : [];
  const excessInventoryShare = currentInventoryUnits ? excessItems.reduce((sum, row) => sum + row.stock, 0) / currentInventoryUnits : 0;
  const riskSalesShare = recentUnitsTotal ? riskItems.reduce((sum, row) => sum + row.recentSold, 0) / recentUnitsTotal : 0;
  const noMovementShare = currentInventoryUnits ? noMovementItems.reduce((sum, row) => sum + row.stock, 0) / currentInventoryUnits : 0;
  const inventoryChange = inventoryHistory.length >= 2 && inventoryHistory.at(-2).units
    ? (inventoryHistory.at(-1).units - inventoryHistory.at(-2).units) / inventoryHistory.at(-2).units : null;
  const inventoryStatus = !inv.length ? "INFORMACIÓN INSUFICIENTE"
    : !linkedProducts && sales.length ? "INFORMACIÓN INSUFICIENTE"
      : noMovementShare >= .30 ? "INVENTARIO SIN MOVIMIENTO"
        : excessInventoryShare >= .30 ? "EXCESO DE INVENTARIO"
          : riskSalesShare >= .20 ? "RIESGO DE FALTA DE INVENTARIO" : "INVENTARIO EQUILIBRADO";
  const slowItems = excessItems;
  const slowUnits = slowItems.reduce((sum, row) => sum + row.stock, 0);
  const slowValue = slowItems.reduce((sum, row) => sum + (Number.isFinite(row.cost) ? row.stock * row.cost : 0), 0);
  const slowSales = slowItems.reduce((sum, row) => sum + row.sold, 0);
  const stockout = riskItems[0];
  const inventoryValue = inv.reduce((sum, row) => sum + (Number.isFinite(row.cost) ? row.stock * row.cost : 0), 0);
  const inventoryUnits = inv.reduce((sum, row) => sum + row.stock, 0);
  return {
    revenue, units, quantityRows, valueRows, quantityRate, valueRate, ranked, rankingBasis, chartBasis, topShare,
    monthly, allMonthly, currentMonthExcluded: allMonthly.some(item => item.month === currentMonth),
    lastCompleteMonth: monthly.at(-1)?.month || null,
    monthlyValue: Object.entries(monthlyValue).sort(([a], [b]) => a.localeCompare(b)).filter(([month]) => month < currentMonth).map(([month, value]) => ({ month, value })),
    monthlyUnits: Object.entries(monthlyUnits).sort(([a], [b]) => a.localeCompare(b)).filter(([month]) => month < currentMonth).map(([month, value]) => ({ month, value })),
    panorama, unitPanorama, valuePanorama, productDrivers, customerDrivers, sellerDrivers, productChanges,
    priorAverage, recentAverage, trendChange, trendSustained, inv, inventoryValue, inventoryUnits, slowItems, slowUnits,
    slowValue, slowSales, stockout, excessItems, riskItems, noMovementItems, excessInventoryShare, riskSalesShare, noMovementShare,
    inventoryHistory: inventoryHistory.map(item => ({ date: item.date, units: item.units })), inventoryChange, inventoryStatus,
    recentUnitsTotal, period, products: inv.length, salesProducts: ranked.length, linkedProducts,
    relationCoverage,
    valueUnavailableReason: valueRows === 0
      ? "No encontramos una columna de valor total ni información suficiente de cantidad y precio para calcularlo."
      : `${readablePercent(1 - valueRate)} de los registros no tiene un valor de venta utilizable.`,
    quantityUnavailableReason: quantityRows === 0
      ? "No encontramos una columna con la cantidad vendida."
      : `${readablePercent(1 - quantityRate)} de los registros no tiene una cantidad vendida utilizable.`
  };
}

function priorityScore({ impact, urgency, reach, confidence }) {
  return Math.round(impact * .35 + urgency * .30 + reach * .20 + confidence * .15);
}

function scored(finding, factors) {
  return { ...finding, priorityFactors: factors, priorityScore: priorityScore(factors) };
}

function prioritize(metrics, scope) {
  const findings = [], general = [];
  const evidenceConfidence = Math.round(Math.max(0, Math.min(1, scope.completeness)) * 100);
  const inventoryConfidence = Math.round(evidenceConfidence * Math.min(1, metrics.relationCoverage / .7));
  const panorama = metrics.panorama;
  const measureName = panorama.basis === "value" ? "valor vendido" : "unidades vendidas";
  const amount = value => panorama.basis === "value" ? money.format(value) : `${readableNumber(value)} unidades`;
  const productDecliners = metrics.productDrivers.filter(item => item.delta < 0);
  const dimensionDecliners = [...metrics.customerDrivers, ...metrics.sellerDrivers].filter(item => item.delta < 0).sort((a, b) => b.contribution - a.contribution);
  const topDecliners = [productDecliners[0], dimensionDecliners.find(item => item.contribution >= .25) || productDecliners[1]].filter(Boolean);
  const topGrowers = metrics.productDrivers.filter(item => item.delta > 0);
  if (scope.hasSales && panorama.reliable && panorama.status === "VENTAS EN DESCENSO") general.push(scored({
    type: "business-decline", level: "general", title: "Tus ventas vienen bajando.",
    reason: `En los últimos tres meses vendiste ${percent(Math.abs(panorama.change))} menos que en los tres meses anteriores.`,
    evidence: `El promedio mensual pasó de ${amount(panorama.priorAverage)} a ${amount(panorama.recentAverage)}.`,
    meaning: "Esto significa que el negocio está vendiendo menos de lo que venía vendiendo.",
    action: "Revisa primero qué productos explican la mayor parte de la reducción.",
    indicator: panorama.basis === "value" ? "Valor vendido en los próximos tres meses." : "Unidades vendidas en los próximos tres meses.",
    drivers: topDecliners
  }, { impact: Math.min(100, Math.abs(panorama.change) * 260), urgency: 85, reach: 100, confidence: evidenceConfidence }));
  if (scope.hasSales && scope.hasInventory && metrics.inventoryChange !== null && metrics.inventoryChange >= .10 && metrics.unitPanorama.reliable && metrics.unitPanorama.status === "VENTAS EN DESCENSO") general.push(scored({
    type: "inventory-accumulation", level: "general", title: "Las existencias están creciendo mientras vendes menos.",
    reason: `Las existencias aumentaron ${percent(metrics.inventoryChange)} y las unidades vendidas bajaron ${percent(Math.abs(metrics.unitPanorama.change))}.`,
    evidence: `Comparamos ${metrics.inventoryHistory.length} cortes de inventario y dos periodos de tres meses completos de ventas.`,
    meaning: "Esto significa que la mercancía está creciendo más rápido que las ventas.",
    action: "Revisa los productos que explican la mayor parte de las existencias altas antes de volver a pedirlos.",
    indicator: "Unidades disponibles frente a unidades vendidas.", items: metrics.excessItems
  }, { impact: Math.min(100, (metrics.inventoryChange + Math.abs(metrics.unitPanorama.change)) * 180), urgency: 88, reach: 100, confidence: inventoryConfidence }));
  if (scope.hasSales && scope.hasInventory && metrics.linkedProducts && metrics.inventoryChange === null && metrics.excessInventoryShare >= .30) general.push(scored({
    type: "inventory-excess", level: "general", title: "Las existencias son altas frente a lo que vendes.",
    reason: `${percent(metrics.excessInventoryShare)} de las unidades disponibles está en productos con poco o ningún movimiento reciente.`,
    evidence: `Comparamos la fotografía actual del inventario con las unidades vendidas en los últimos ${Math.max(1, metrics.unitPanorama.recent?.length || 3)} meses completos.`,
    meaning: "Esto significa que hay muchas unidades guardadas frente a lo que se está vendiendo.",
    action: "Revisa esos productos antes de volver a comprarlos.",
    indicator: "Unidades disponibles de los productos con poco movimiento.", items: metrics.excessItems
  }, { impact: Math.min(100, metrics.excessInventoryShare * 130), urgency: 78, reach: metrics.excessInventoryShare * 100, confidence: inventoryConfidence }));
  if (scope.hasSales && scope.hasInventory && metrics.linkedProducts && metrics.riskSalesShare >= .20) general.push(scored({
    type: "stock-risk-general", level: "general", title: "Podrías quedarte sin productos que hoy sostienen tus ventas.",
    reason: `Los productos con pocas existencias representan ${percent(metrics.riskSalesShare)} de las unidades vendidas recientemente.`,
    evidence: `${metrics.riskItems.length === 1 ? "Un producto tiene" : `${metrics.riskItems.length} productos tienen`} existencias para cerca de un mes o menos al ritmo reciente de ventas.`,
    meaning: "Si se agotan, pueden afectar una parte importante de tus ventas.",
    action: "Confirma las existencias y los tiempos de entrega antes del siguiente pedido.",
    indicator: "Unidades disponibles de los productos que más se venden.", items: metrics.riskItems
  }, { impact: Math.min(100, metrics.riskSalesShare * 140), urgency: 96, reach: metrics.riskSalesShare * 100, confidence: inventoryConfidence }));
  const concentration = scored({
    type: "concentration",
    title: `Gran parte de tus ventas depende de ${metrics.ranked[0]?.[0] || "un solo producto"}.`,
    reason: `${metrics.ranked[0]?.[0] || "El producto principal"} representa ${percent(metrics.topShare)} ${metrics.rankingBasis === "value" ? "del valor vendido" : "de las unidades vendidas"}.`,
    evidence: metrics.rankingBasis === "value" ? `De ${money.format(metrics.revenue)} vendidos, ${money.format(metrics.ranked[0]?.[1].revenue || 0)} provienen de ese producto.` : `De ${metrics.units} unidades vendidas, ${metrics.ranked[0]?.[1].units || 0} corresponden a ese producto.`,
    meaning: "Una caída en ese producto puede afectar una parte importante de las ventas observadas.",
    action: "Comprueba si el patrón continúa y elige dos productos complementarios que puedas ofrecer junto al principal.",
    indicator: "Porcentaje del valor vendido que representa el producto principal."
  }, { impact: metrics.topShare * 100, urgency: 45, reach: metrics.topShare * 100, confidence: evidenceConfidence });
  if (!scope.hasSales && scope.hasInventory) findings.push(scored({
    type: "inventory-only",
    title: "Agrega ventas antes de decidir qué producto atender.",
    reason: `Encontramos ${metrics.products} productos y ${metrics.inventoryUnits} unidades disponibles, pero ninguna venta.`,
    evidence: metrics.inventoryValue ? `El costo registrado del inventario es ${money.format(metrics.inventoryValue)}.` : "No hay ventas que permitan comparar movimiento por producto.",
    meaning: "Sin ventas o movimientos no podemos afirmar qué producto se vende, permanece almacenado o podría agotarse.",
    action: "Busca un archivo con fecha, producto, cantidad y valor vendido para completar el análisis.",
    indicator: "Número de registros de ventas agregados al próximo análisis."
  }, { impact: 80, urgency: 90, reach: 100, confidence: 100 }));
  if (general.length) {
    const main = general.sort((a, b) => b.priorityScore - a.priorityScore)[0];
    findings.push(main);
    if (main.type === "business-decline") {
      for (const driver of topDecliners.slice(0, 2)) {
        const subject = driver.dimension === "cliente" ? `El cliente ${driver.product}` : driver.dimension === "vendedor" ? `Las ventas del comercial ${driver.product}` : driver.product;
        findings.push(scored({
        type: "sales-decline-cause", level: "cause", parentType: main.type,
        title: `${subject} ${driver.dimension === "vendedor" ? "explican" : "explica"} ${percent(driver.contribution)} de la reducción de las ventas.`,
        reason: `${subject} ${driver.dimension === "vendedor" ? "pasaron" : "pasó"} de ${amount(driver.priorTotal)} a ${amount(driver.recentTotal)} en los dos periodos comparados.`,
        evidence: `${driver.dimension === "vendedor" ? "Perdieron" : "Perdió"} ${amount(Math.abs(driver.delta))} y ${driver.dimension === "vendedor" ? "representan" : "representa"} ${percent(driver.recentShare)} de las ventas recientes.`,
        meaning: `Esta ${driver.dimension === "producto" ? "parte del portafolio" : "dimensión comercial"} es una de las principales explicaciones de la caída general.`,
        action: `Revisa qué cambió en ${driver.dimension === "producto" ? `las ventas de ${driver.product}` : driver.dimension === "cliente" ? `la relación con ${driver.product}` : `las ventas atendidas por ${driver.product}`}.`, indicator: main.indicator, driver,
        summary: `${subject} ${driver.dimension === "vendedor" ? "explican" : "explica"} ${percent(driver.contribution)} de la reducción de las ventas.`
      }, { impact: Math.min(100, driver.contribution * 100), urgency: 75, reach: driver.recentShare * 100, confidence: evidenceConfidence }));
      }
    } else if (["inventory-accumulation", "inventory-excess"].includes(main.type)) {
      for (const item of metrics.excessItems.slice(0, 2)) findings.push(scored({
        type: "slow", level: "cause", parentType: main.type,
        title: `${item.producto} concentra existencias altas frente a sus ventas.`,
        reason: `${item.producto} representa ${percent(item.stockShare)} de las unidades disponibles y ${percent(item.recentSalesShare)} de las unidades vendidas recientemente.`,
        evidence: `${readableNumber(item.stock)} unidades disponibles y ${readableNumber(item.recentSold)} unidades vendidas en los meses recientes.`,
        meaning: "Hay muchas unidades guardadas frente a lo que se está vendiendo.",
        action: `Revisa ${item.producto} antes de volver a comprarlo.`, indicator: main.indicator, items: [item],
        summary: `${item.producto} concentra ${percent(item.stockShare)} de las existencias y ${percent(item.recentSalesShare)} de las ventas recientes.`
      }, { impact: item.stockShare * 100, urgency: 72, reach: item.stockShare * 100, confidence: inventoryConfidence }));
    } else if (main.type === "stock-risk-general") {
      for (const item of metrics.riskItems.slice(0, 2)) findings.push(scored({
        type: "stockout", level: "cause", parentType: main.type,
        title: `${item.producto} puede quedarse sin existencias.`,
        reason: `${item.producto} representa ${percent(item.recentSalesShare)} de las unidades vendidas recientemente.`,
        evidence: `${readableNumber(item.stock)} unidades disponibles frente a ${readableNumber(item.recentSold)} vendidas en los meses recientes.`,
        meaning: "Si se agota, puede afectar una parte importante de las ventas.",
        action: "Confirma las existencias y el siguiente pedido.", indicator: main.indicator, item,
        summary: `${item.producto} aporta ${percent(item.recentSalesShare)} de las ventas recientes y tiene ${readableNumber(item.stock)} unidades disponibles.`
      }, { impact: item.recentSalesShare * 100, urgency: 95, reach: item.recentSalesShare * 100, confidence: inventoryConfidence }));
    }
    for (const alternative of general) if (findings.length < 3 && alternative !== main) findings.push(alternative);
    return findings.slice(0, 3);
  }
  const localized = metrics.productDrivers.find(item => panorama.status === "VENTAS ESTABLES" && item.priorTotal > 0 && item.change <= -.30 && item.recentShare >= .15);
  if (localized) findings.push(scored({
    type: "product-decline", level: "localized", title: `Revisa primero el producto ${localized.product}.`,
    reason: `Sus ventas bajaron ${percent(Math.abs(localized.change))} entre los dos periodos de tres meses.`,
    evidence: `Representa ${percent(localized.recentShare)} de las ventas recientes.`,
    meaning: "El problema está localizado, pero su peso en el negocio es suficiente para atenderlo.",
    action: "Revisa qué cambió en sus clientes, precio o disponibilidad.", indicator: `Ventas de ${localized.product} cada mes.`, driver: localized
  }, { impact: Math.min(100, Math.abs(localized.change) * localized.recentShare * 220), urgency: 80, reach: localized.recentShare * 100, confidence: evidenceConfidence }));
  const localRisk = metrics.riskItems.find(item => item.recentSalesShare >= .10);
  if (localRisk) findings.push(scored({ type: "stockout", level: "localized", title: `Podrías quedarte sin ${localRisk.producto}.`, reason: `${localRisk.producto} representa ${percent(localRisk.recentSalesShare)} de las unidades vendidas recientemente.`, evidence: `${readableNumber(localRisk.stock)} unidades disponibles frente a ${readableNumber(localRisk.recentSold)} vendidas recientemente.`, meaning: "Si se agota, puede afectar una parte relevante de tus ventas.", action: "Confirma las existencias y el siguiente pedido.", indicator: "Unidades disponibles del producto.", item: localRisk }, { impact: localRisk.recentSalesShare * 100, urgency: 95, reach: localRisk.recentSalesShare * 100, confidence: inventoryConfidence }));
  if (scope.hasSales && metrics.topShare >= .6) findings.push(concentration);
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
  for (const fallback of fallbacks.filter(item => item.type !== "data")) if (findings.length < 3 && !findings.some(item => item.type === fallback.type)) findings.push(scored(fallback, { impact: 35, urgency: 35, reach: 45, confidence: scope.completeness * 100 }));
  return findings.sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 3);
}

function metricCards() {
  const metrics = app.analysis.metrics;
  if (!metrics.ranked.length && metrics.products) return `<article class="stat"><span>Productos en inventario</span><strong>${readableNumber(metrics.products)} productos</strong></article>
    <article class="stat"><span>Existencias registradas</span><strong>${readableNumber(metrics.inventoryUnits)} unidades disponibles</strong></article>
    <article class="stat"><span>Costo registrado</span><strong>${metrics.inventoryValue ? `${money.format(metrics.inventoryValue)} en inventario` : "No pudimos calcularlo"}</strong>${metrics.inventoryValue ? "" : "<small>No encontramos costos utilizables.</small>"}</article>
    <article class="stat"><span>Información de ventas</span><strong>No encontramos registros de ventas</strong></article>`;
  return `<article class="stat"><span>Valor de las ventas</span><strong>${metrics.valueRate >= .7 ? `${money.format(metrics.revenue)} vendidos` : "No pudimos calcularlo"}</strong>${metrics.valueRate >= .7 ? "" : `<small>${safe(metrics.valueUnavailableReason)}</small>`}</article>
    <article class="stat"><span>Unidades vendidas</span><strong>${metrics.quantityRate >= .7 ? `${readableNumber(metrics.units)} unidades vendidas` : "No pudimos calcularlo"}</strong>${metrics.quantityRate >= .7 ? "" : `<small>${safe(metrics.quantityUnavailableReason)}</small>`}</article>
    <article class="stat"><span>Periodo revisado</span><strong>${app.analysis.resultQuality.periodDays ? `${readableNumber(app.analysis.resultQuality.periodDays)} días analizados` : "No pudimos calcularlo"}</strong></article>
    <article class="stat"><span>Relación con inventario</span><strong>${metrics.inv.length ? `${readableNumber(metrics.linkedProducts)} productos relacionados` : "No encontramos inventario"}</strong>${metrics.inv.length && !metrics.linkedProducts ? "<small>No comparamos ventas e inventario porque los productos no coincidieron.</small>" : ""}</article>`;
}

function getPlan() {
  const finding = app.analysis?.priorities[0];
  if (!finding) return [];
  if (finding.type === "business-decline") {
    const drivers = (finding.drivers || []).slice(0, 2).map(item => item.dimension === "cliente" ? `el cliente ${item.product}` : item.dimension === "vendedor" ? `el comercial ${item.product}` : item.product);
    const names = drivers.length ? drivers.join(" y ") : "los productos que más bajaron";
    return [
      { when: "HOY", action: `Revisa qué cambió en las ventas de ${names}.`, explain: "Estos productos explican la mayor parte de la reducción reciente." },
      { when: "ESTA SEMANA", action: "Compara precio, clientes y disponibilidad frente a los tres meses anteriores.", explain: "Busca una causa comprobable antes de cambiar varias decisiones al mismo tiempo." },
      { when: "EN 14 DÍAS", action: "Revisa si las ventas empezaron a recuperarse frente al promedio reciente.", explain: "Usa la misma medida y compara meses completos." }
    ];
  }
  if (["inventory-accumulation", "inventory-excess"].includes(finding.type)) {
    const products = (finding.items || []).slice(0, 2).map(item => item.producto).join(" y ") || "los productos con más existencias frente a sus ventas";
    return [
      { when: "HOY", action: `Revisa ${products} antes de volver a comprarlos.`, explain: "Confirma físicamente las existencias y las ventas pendientes de registrar." },
      { when: "ESTA SEMANA", action: "Define cómo mover las unidades que ya tienes.", explain: "Prueba una acción por producto para saber cuál funciona." },
      { when: "EN 14 DÍAS", action: "Compara nuevamente existencias y ventas.", explain: "No afirmes que el inventario creció si todavía solo tienes una fotografía actual." }
    ];
  }
  if (finding.type === "stock-risk-general") {
    const products = (finding.items || []).slice(0, 2).map(item => item.producto).join(" y ") || "los productos con pocas existencias";
    return [
      { when: "HOY", action: `Confirma las existencias físicas de ${products}.`, explain: "Revisa también pedidos pendientes y tiempos de entrega." },
      { when: "ESTA SEMANA", action: "Ajusta el siguiente pedido usando las ventas recientes.", explain: "Prioriza los productos que sostienen una parte importante de las ventas." },
      { when: "EN 14 DÍAS", action: "Comprueba si los productos se mantuvieron disponibles.", explain: "Registra cualquier venta que no pudiste atender por falta de unidades." }
    ];
  }
  if (finding.type === "product-decline" && finding.driver) return [
    { when: "HOY", action: `Revisa qué cambió en las ventas de ${finding.driver.product}.`, explain: "Compara los dos periodos de tres meses usados por San José." },
    { when: "ESTA SEMANA", action: "Compara clientes, precio y disponibilidad del producto.", explain: "El problema está localizado y tiene peso suficiente en el negocio." },
    { when: "EN 14 DÍAS", action: "Comprueba si sus ventas empezaron a recuperarse.", explain: finding.indicator }
  ];
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
      <div><dt>Evaluación</dt><dd>${app.analysis?.quality.level ? `Calidad de los datos: ${safe(app.analysis.quality.level[0] + app.analysis.quality.level.slice(1).toLowerCase())}` : "Calidad de los datos: No evaluada"}</dd></div>
      <div><dt>Prioridad</dt><dd>${safe(app.analysis?.priorities[0]?.title || "No generada")}</dd></div>
      <div><dt>Tiempo</dt><dd>${elapsed} min</dd></div>
    </dl>`;
  $("#test-dialog").showModal();
}

function executiveSummaryHtml() {
  if (!app.analysis) return "";
  const { metrics, resultQuality: quality } = app.analysis;
  const finding = app.analysis.priorities[0];
  const presentation = finding ? priorityPresentation(finding) : null;
  const secondary = stageThreeSecondaryFindings();
  const limitations = analysisLimitations();
  const cards = stageThreeSummaryCards();
  const comparison = trendComparison(metrics.monthly, metrics.chartBasis);
  const recent = metrics.monthly.slice(-6);
  const maximum = Math.max(...recent.map(item => item.value), 1);
  const chart = recent.length >= 2 ? `<div class="report-chart">${recent.map((item, index) => `<div><i style="height:${Math.max(4, item.value / maximum * 100)}%" class="${index === recent.length - 1 ? "latest" : ""}"></i><span>${safe(monthName(item.month))}</span></div>`).join("")}</div>` : `<p>No mostramos un gráfico porque no encontramos suficientes meses completos.</p>`;
  const valueOf = item => metrics.chartBasis === "value" ? item[1].revenue : item[1].units;
  const total = metrics.chartBasis === "value" ? metrics.revenue : metrics.units;
  const products = metrics.chartBasis && total ? metrics.ranked.slice(0, 5).map(item => `<li><strong>${safe(item[0])}</strong>: ${readablePercent(valueOf(item) / total)} ${metrics.chartBasis === "value" ? "del valor vendido" : "de las unidades vendidas"}</li>`).join("") : "<li>No encontramos información suficiente para comparar productos.</li>";
  const dates = (app.dataset?.sales || []).map(row => new Date(row.fecha)).filter(date => !Number.isNaN(date.getTime())).sort((a, b) => a - b);
  const periodText = dates.length ? `${new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" }).format(dates[0])} a ${new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" }).format(dates.at(-1))}` : "No pudimos calcular el periodo porque no encontramos fechas utilizables.";
  const latestText = comparison.available ? trendMeaning(metrics.monthly, metrics.chartBasis) : comparison.reason;
  const prioritySection = presentation ? `<section class="priority"><p class="tag">Lo primero que deberías revisar</p><h2>${safe(presentation.title)}</h2><ul>${presentation.metrics.slice(0, 4).map(item => `<li>${safe(item)}</li>`).join("")}</ul><p><strong>Por qué:</strong> ${safe(presentation.important)}</p></section>` : `<section class="priority"><h2>Todavía no podemos indicar una prioridad</h2><p>${safe(quality.reasons[0] || resultQualityCopy(quality))}</p></section>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Resumen del análisis · San José</title><style>@page{margin:14mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#1f2937;max-width:820px;margin:28px auto;padding:0 18px;line-height:1.4;font-size:13px}h1,h2{font-family:Georgia,serif;color:#011235}h1{font-size:30px;margin:5px 0}h2{font-size:20px;margin-bottom:8px}header{border-bottom:4px solid #D8A63A;padding-bottom:14px}.tag{color:#9a6500;font-weight:800;text-transform:uppercase;letter-spacing:.08em}section{margin:20px 0;break-inside:avoid}.cards{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.card{padding:12px;border-top:3px solid #D8A63A;background:#f7f7f6}.card strong{display:block;color:#011235;font-size:17px}.priority{padding:16px;border-left:5px solid #D8A63A;background:#f8f2e4}.report-chart{height:150px;display:flex;align-items:end;gap:10px;border-bottom:1px solid #aeb8c6;padding-top:10px}.report-chart div{height:120px;flex:1;display:grid;grid-template-rows:1fr auto;align-items:end;text-align:center}.report-chart i{display:block;width:60%;min-height:3px;margin:auto auto 0;background:#011235}.report-chart i.latest{background:#D8A63A}.report-chart span{font-size:10px;margin-top:5px}ul{padding-left:20px}li{margin:5px 0}button{background:#011235;color:#fff;border:0;padding:10px 14px}@media print{button{display:none}body{margin:0;padding:0}.page-break{break-before:page}}</style></head><body><header><p class="tag">San José · Transformación Estratégica</p><h1>Resumen del análisis</h1><p>Una explicación corta para tomar decisiones.</p><small>${new Intl.DateTimeFormat("es-CO", { dateStyle: "long" }).format(new Date())}</small></header>
    <section><h2>Periodo revisado</h2><p>${safe(periodText)}</p><p><strong>Calidad de la información: ${quality.score} % · ${safe(quality.level[0] + quality.level.slice(1).toLowerCase())}</strong><br>${safe(resultQualityCopy(quality))}</p></section>
    <section><h2>Cifras principales</h2><div class="cards">${cards.map(card => `<div class="card"><strong>${safe(card.value)}</strong><span>${safe(card.label)}</span>${card.note ? `<small>${safe(card.note)}</small>` : ""}</div>`).join("")}</div></section>
    <section><h2>Qué pasó en el último mes completo</h2><p>${safe(latestText)}</p>${chart}</section>
    <section><h2>Productos que más aportan</h2><ul>${products}</ul></section>${prioritySection}
    ${secondary.length ? `<section><h2>También encontramos</h2><ul>${secondary.map(item => `<li>${safe(item.sentence)}</li>`).join("")}</ul></section>` : ""}
    <section><h2>Lo que no pudimos concluir</h2>${limitations.length ? `<ul>${limitations.map(item => `<li>${safe(item)}</li>`).join("")}</ul>` : "<p>No encontramos una limitación importante para las conclusiones mostradas.</p>"}</section>
    <button onclick="window.print()">Imprimir o guardar como PDF</button></body></html>`;
}

function downloadExecutiveSummary() {
  if (!app.analysis || app.analysis.resultQuality.level === "BAJA") return;
  const blob = new Blob([executiveSummaryHtml()], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "resumen-ejecutivo-san-jose.html";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
