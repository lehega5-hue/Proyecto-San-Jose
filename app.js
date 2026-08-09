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
  userId: null,
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
  tasks: [],
  actionPlan: null,
  opportunityPlans: {},
  opportunityHistory: [],
  analysisCycles: [],
  currentAnalysisCycleId: null,
  newCyclePending: false,
  currentOpportunityKey: null,
  activeOpportunityId: null,
  activeOpportunityIndex: 0,
  opportunityAttempt: 1,
  lastOpportunityDecision: null,
  cycleSummaryOpen: false,
  planDetailOpen: false,
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
  "Evidencia de la oportunidad",
  "Plan sencillo",
  "Cuéntanos qué pasó",
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

const DEMO_USER = Object.freeze({
  id: "demo-san-jose",
  email: "demo@sanjose.com",
  passwordHash: "996ebdf798646996aa8cf0b9432c9fa0676fa46e7cec49ad2df1a243679f5e3f"
});
const DEMO_STORAGE_KEY = `sanJose.users.${DEMO_USER.id}`;
const PERSISTED_APP_FIELDS = [
  "step", "start", "context", "dataset", "datasetName", "expected", "source", "analysis", "tables", "classified",
  "semanticMode", "semanticPending", "clarifications", "additionalSections", "tasks", "actionPlan", "opportunityPlans", "opportunityHistory",
  "analysisCycles", "currentAnalysisCycleId", "newCyclePending", "currentOpportunityKey", "activeOpportunityId", "activeOpportunityIndex",
  "opportunityAttempt", "lastOpportunityDecision", "cycleSummaryOpen", "planDetailOpen", "activePriority", "feedback", "completed"
];

async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function demoCredentialsValid(email, password) {
  if (String(email || "").trim().toLowerCase() !== DEMO_USER.email) return false;
  return await sha256(password) === DEMO_USER.passwordHash;
}

function demoStateSnapshot() {
  const appState = Object.fromEntries(PERSISTED_APP_FIELDS.map(field => [field, app[field]]));
  return {
    version: 1,
    userId: DEMO_USER.id,
    savedAt: new Date().toISOString(),
    businessContext: app.context,
    uploadedDataHistory: app.analysisCycles.map(cycle => cycle.datosAnalizados),
    analysisHistory: app.analysisCycles.map(cycle => ({ cycleId: cycle.cycleId, fecha: cycle.fecha, hechos: cycle.hechos, hipotesis: cycle.hipotesis })),
    opportunitiesHistory: app.opportunityHistory,
    plansHistory: app.analysisCycles.flatMap(cycle => cycle.planes || []),
    activitiesHistory: app.analysisCycles.flatMap(cycle => [...(cycle.actividadesRealizadas || []), ...(cycle.actividadesPendientes || [])]),
    feedbackHistory: app.analysisCycles.flatMap(cycle => cycle.retroalimentacion || []),
    cycleHistory: app.analysisCycles,
    businessMemory: { contextoInicial: app.context, cicloActual: app.currentAnalysisCycleId, oportunidadesAnteriores: app.opportunityHistory.length },
    currentProgress: { step: app.step, tasks: app.tasks, activeOpportunityIndex: app.activeOpportunityIndex, opportunityAttempt: app.opportunityAttempt, cycleSummaryOpen: app.cycleSummaryOpen },
    appState
  };
}

function persistDemoProgress() {
  if (app.userId !== DEMO_USER.id || typeof localStorage === "undefined") return false;
  try {
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(demoStateSnapshot()));
    return true;
  } catch (error) {
    console.warn("No pudimos guardar el progreso local de esta prueba.", error);
    return false;
  }
}

function restoreDemoProgress() {
  if (typeof localStorage === "undefined") return false;
  try {
    const stored = JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY) || "null");
    if (!stored || stored.userId !== DEMO_USER.id || !stored.appState) return false;
    PERSISTED_APP_FIELDS.forEach(field => {
      if (Object.hasOwn(stored.appState, field)) app[field] = stored.appState[field];
    });
    app.userId = DEMO_USER.id;
    app.files = [];
    return true;
  } catch (error) {
    console.warn("No pudimos recuperar el progreso local de esta prueba.", error);
    return false;
  }
}

function resetDemoProgress() {
  if (typeof localStorage !== "undefined") localStorage.removeItem(DEMO_STORAGE_KEY);
  location.reload();
}

function startDemo(restored = false) {
  $("#welcome-view").classList.add("hidden");
  $("#app-view").classList.remove("hidden");
  app.start ||= Date.now();
  app.completed.start = true;
  if (restored) render();
  else go(2);
}

async function submitDemoAccess(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const message = $("#demo-login-message");
  const valid = await demoCredentialsValid(values.email, values.password);
  form.elements.password.value = "";
  if (!valid) {
    message.textContent = "El correo o la contraseña no coinciden. Revisa e intenta nuevamente.";
    return;
  }
  message.textContent = "";
  app.userId = DEMO_USER.id;
  startDemo(restoreDemoProgress());
}

$("#demo-login-form").addEventListener("submit", submitDemoAccess);
$("#restart-button").addEventListener("click", resetDemoProgress);
$("#test-summary-button").addEventListener("click", showTestSummary);
$(".dialog-close").addEventListener("click", () => $("#test-dialog").close());

function go(step) {
  if (step === 7 && app.step <= 6) app.planDetailOpen = false;
  app.step = Math.max(1, Math.min(10, step));
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function currentAnalysisCycle() {
  return app.analysisCycles.find(cycle => cycle.cycleId === app.currentAnalysisCycleId) || null;
}

function opportunityDomain(finding = {}) {
  const declaredDomain = normalize(finding.domain || finding.dominio || "");
  if (finding.type === "profit-decline" || /utilidad|margen|rentabilidad|profit/.test(declaredDomain)) return "profit";
  if (/inventario|inventory/.test(declaredDomain) || /inventory|stock|slow/.test(finding.type || "")) return "inventory";
  if (finding.driver?.dimension === "cliente") return "customers";
  if (finding.driver?.dimension === "vendedor") return "commercial";
  if (/cliente|customer/.test(declaredDomain)) return "customers";
  if (/comercial|vendedor|commercial/.test(declaredDomain)) return "commercial";
  if (/venta|sales/.test(declaredDomain)) return "sales";
  if (declaredDomain) return declaredDomain.replace(/\s+/g, "-");
  return "sales";
}

function stableOpportunityId(cycleId, finding, index) {
  return `${cycleId}-oportunidad-${index + 1}-${normalize(finding?.type || finding?.dominio || "general").replace(/\s+/g, "-")}`;
}

function cycleOpportunityEntries() {
  const cycle = currentAnalysisCycle();
  if (cycle?.cycleOpportunities?.length) return cycle.cycleOpportunities;
  return (app.analysis?.priorities || []).slice(0, 3).map((finding, index) => ({
    id: stableOpportunityId(cycle?.cycleId || "revision-actual", finding, index),
    index,
    sourceIndex: index,
    type: finding.type || "general",
    domain: opportunityDomain(finding),
    title: finding.problemaGeneral || finding.title || `Oportunidad ${index + 1}`
  }));
}

function currentOpportunityEntry() {
  const opportunities = cycleOpportunityEntries();
  const byId = opportunities.find(item => item.id === app.activeOpportunityId);
  return byId?.index === app.activeOpportunityIndex ? byId : opportunities[app.activeOpportunityIndex] || byId || null;
}

function analysisCycleComparison(analysis) {
  const previous = app.analysisCycles.at(-1);
  if (!previous) return [];
  const messages = [];
  const previousChange = previous.datosAnalizados?.cambioVentas;
  const currentChange = analysis.metrics?.panorama?.reliable ? analysis.metrics.panorama.change : null;
  if (Number.isFinite(previousChange) && Number.isFinite(currentChange)) {
    const previousText = previousChange < 0 ? `habían bajado ${readablePercent(Math.abs(previousChange))}` : `habían cambiado ${readablePercent(Math.abs(previousChange))}`;
    const currentText = currentChange < 0 ? `ahora están ${readablePercent(Math.abs(currentChange))} por debajo del periodo comparable` : `ahora muestran una variación de ${readablePercent(currentChange)}`;
    const interpretation = Math.abs(currentChange - previousChange) < .02
      ? "La situación se mantiene en un nivel similar al de la revisión anterior."
      : previousChange < 0 && currentChange < 0 && Math.abs(currentChange) < Math.abs(previousChange)
        ? "Esto muestra una recuperación, aunque todavía están por debajo del nivel anterior."
        : "Los datos nuevos muestran que la situación cambió frente a la revisión anterior.";
    messages.push({ nivel: "RESPALDADO_POR_DATOS", origen: "historia", texto: `En la revisión anterior las ventas ${previousText}. En los datos nuevos ${currentText}. ${interpretation}` });
  }
  const currentTypes = new Set((analysis.priorities || []).map(item => item.type));
  const repeated = (previous.prioridades || []).find(item => currentTypes.has(item.tipo));
  if (repeated) messages.push({ nivel: "RESPALDADO_POR_DATOS", origen: "historia", texto: `Esta es otra revisión en la que aparece ${String(repeated.nombre || "una oportunidad anterior").toLowerCase()}. Los datos nuevos siguen siendo la base para decidir su prioridad.` });
  const relatedComment = [...(previous.retroalimentacion || [])].reverse().find(item => item.comentarioUsuario)?.comentarioUsuario;
  if (relatedComment && repeated) messages.push({ nivel: "INFORMACION_DEL_USUARIO", origen: "historia", texto: `En la revisión anterior nos contaste: “${relatedComment.slice(0, 180)}${relatedComment.length > 180 ? "…" : ""}”. Lo conservamos como contexto, no como una causa confirmada.` });
  const perceivedImprovement = [...(previous.retroalimentacion || [])].reverse().find(item => item.mejoraPercibida === "Sí");
  if (perceivedImprovement && Number.isFinite(currentChange) && currentChange < -.10) messages.unshift({ nivel: "CONTRASTE", origen: "historia", texto: `En la revisión anterior nos contaste que percibiste una mejora. Sin embargo, los datos nuevos todavía muestran una reducción de ${readablePercent(Math.abs(currentChange))} frente al periodo comparable. Conservamos ambas perspectivas.` });
  return messages.slice(0, 2);
}

function applyHistoricalPriorityContext(analysis) {
  const previous = app.analysisCycles.at(-1);
  if (!previous || !analysis?.priorities?.length) return;
  const unresolved = new Set((previous.prioridades || []).filter(item => item.estado !== "atendida suficientemente").map(item => item.tipo));
  analysis.priorities = analysis.priorities.map(item => ({ ...item, recurrente: unresolved.has(item.type) })).sort((a, b) => ((Number(b.priorityScore) || 0) + (b.recurrente ? 5 : 0)) - ((Number(a.priorityScore) || 0) + (a.recurrente ? 5 : 0)));
  analysis.diagnostico = buildDiagnosticHandoff(analysis.priorities[0], analysis.metrics, analysis.resultQuality, app.dataset || { sales: [], inventory: [] });
  analysis.diagnosticHandoff = analysis.diagnostico;
}

function beginAnalysisCycle() {
  if (!app.analysis || (app.currentAnalysisCycleId && !app.newCyclePending)) return currentAnalysisCycle();
  applyHistoricalPriorityContext(app.analysis);
  const historicalContext = analysisCycleComparison(app.analysis);
  if (historicalContext.length && app.analysis.diagnostico) {
    app.analysis.diagnostico.coincidenciasContextoDatos = [...historicalContext, ...(app.analysis.diagnostico.coincidenciasContextoDatos || [])].slice(0, 2);
    app.analysis.diagnosticHandoff = app.analysis.diagnostico;
  }
  const cycle = {
    cycleId: `ciclo-${app.analysisCycles.length + 1}`,
    fecha: new Date().toISOString(),
    contextoInicial: { ...app.context },
    datosAnalizados: {
      fuente: app.datasetName,
      ventas: app.dataset?.sales?.length || 0,
      inventario: app.dataset?.inventory?.length || 0,
      calidad: app.analysis.resultQuality?.score ?? null,
      cambioVentas: app.analysis.metrics?.panorama?.reliable ? app.analysis.metrics.panorama.change : null
    },
    prioridades: (app.analysis.priorities || []).slice(0, 3).map((item, index) => ({ indice: index, tipo: item.type, nombre: item.problemaGeneral || item.title, evidencia: item.evidence || item.reason, estado: "pendiente" })),
    cycleOpportunities: (app.analysis.priorities || []).slice(0, 3).map((item, index) => ({
      id: stableOpportunityId(`ciclo-${app.analysisCycles.length + 1}`, item, index),
      index,
      sourceIndex: index,
      type: item.type || "general",
      domain: opportunityDomain(item),
      title: item.problemaGeneral || item.title || `Oportunidad ${index + 1}`
    })),
    causasObservadas: [...(app.analysis.diagnostico?.causasObservadas || [])],
    hechos: (app.analysis.priorities || []).slice(0, 3).map(item => item.evidence || item.reason).filter(Boolean),
    hipotesis: [...(app.analysis.diagnostico?.hipotesisPorValidar || [])],
    planes: [],
    actividadesRealizadas: [],
    actividadesPendientes: [],
    metas: [],
    resultados: [],
    retroalimentacion: [],
    nuevosEventos: [],
    contextoHistoricoUsado: historicalContext,
    estadoFinal: "en trabajo"
  };
  app.analysisCycles.push(cycle);
  app.currentAnalysisCycleId = cycle.cycleId;
  app.newCyclePending = false;
  app.activeOpportunityIndex = 0;
  app.activeOpportunityId = cycle.cycleOpportunities[0]?.id || null;
  app.activePriority = 0;
  app.opportunityAttempt = 1;
  app.currentOpportunityKey = null;
  app.actionPlan = null;
  app.opportunityPlans = {};
  app.tasks = [];
  app.feedback = {};
  app.lastOpportunityDecision = null;
  app.cycleSummaryOpen = false;
  app.completed.priority = false;
  app.completed.plan = false;
  app.completed.feedback = false;
  return cycle;
}

function refreshCurrentAnalysisCycle() {
  const cycle = currentAnalysisCycle();
  if (!cycle || !app.analysis) return;
  cycle.prioridades = (app.analysis.priorities || []).slice(0, 3).map((item, index) => ({ indice: index, tipo: item.type, nombre: item.problemaGeneral || item.title, evidencia: item.evidence || item.reason, estado: cycle.prioridades?.[index]?.estado || "pendiente" }));
  cycle.causasObservadas = [...(app.analysis.diagnostico?.causasObservadas || [])];
  cycle.hechos = (app.analysis.priorities || []).slice(0, 3).map(item => item.evidence || item.reason).filter(Boolean);
  cycle.hipotesis = [...(app.analysis.diagnostico?.hipotesisPorValidar || [])];
}

function prepareNewDataCycle() {
  app.newCyclePending = true;
  app.files = [];
  app.tables = [];
  app.classified = [];
  app.semanticPending = false;
  app.clarifications = {};
  app.additionalSections = {};
  app.dataset = null;
  app.analysis = null;
  app.source = "";
  app.planDetailOpen = false;
  go(3);
}

function render() {
  const stage = stageByStep[app.step];
  $("#progress-label").textContent = `Etapa ${stage} de 4 · ${stageNames[stage - 1]}`;
  $("#progress-title").textContent = stepNames[app.step - 1];
  $("#progress-bar").style.width = `${stage / 4 * 100}%`;
  const screens = [welcome, contextScreen, dataScreen, qualityScreen, resultsScreen, evidenceScreen, planScreen, feedbackScreen, feedbackScreen, nextScreen];
  $("#screen").innerHTML = screens[app.step - 1]();
  $("#screen").focus({ preventScroll: true });
  bindScreen();
  persistDemoProgress();
}

function nav(back, next, label = "Continuar") {
  return `<div class="actions">
    ${back ? `<button class="button secondary" type="button" data-go="${back}">← Volver</button>` : "<span></span>"}
    <div class="right">${next ? `<button class="button gold" type="button" data-go="${next}">${label} →</button>` : ""}</div>
  </div>`;
}

function welcome() {
  return `<section class="hero-screen"><div><p class="eyebrow">MVP · Orientación basada en datos</p><h1>Tus datos te muestran qué atender primero.</h1><p>No te damos más datos. Te ayudamos a saber qué hacer con los que ya tienes.</p><button class="button gold" type="button" data-go="2">Empezar análisis →</button></div></section>`;
}

function contextScreen() {
  return `<p class="eyebrow">Conozcamos tu negocio</p>
    <h1 class="screen-title">Cuéntanos un poco de tu negocio</h1>
    <p class="screen-intro">Responde tres preguntas cortas. Esto nos ayuda a entender mejor tus datos.</p>
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
        <div class="context-intro">
          <p class="eyebrow">Si quieres, cuéntanos algo más</p>
          <h2>Ayúdanos a entender mejor lo que está pasando</h2>
          <p>Entre más contexto nos des, mejor podremos interpretar lo que está pasando en tu negocio.</p>
        </div>
        <div class="context-guide"><strong>Puedes contarnos, por ejemplo:</strong><ul><li>qué vende o hace tu negocio;</li><li>quiénes son tus principales clientes;</li><li>si pasó algo fuera de lo normal recientemente;</li><li>si cambiaste precios, productos, proveedores o personal;</li><li>si ganaste o perdiste un cliente importante;</li><li>si tuviste cierres, problemas de abastecimiento o temporadas especiales;</li><li>cualquier situación que creas que deberíamos tener en cuenta.</li></ul><p class="context-example">Ejemplo: En junio perdimos un cliente importante y tuvimos problemas para conseguir dos productos.</p></div>
        <label for="business-story">Escribe o cuéntanos con tu voz<textarea id="business-story" name="contextoLibre" rows="4" placeholder="Cuéntanos cualquier situación que creas importante. Podrás revisar y corregir el texto antes de continuar."></textarea></label>
        <div class="context-voice"><button id="voice-button" class="button secondary hidden" type="button" aria-pressed="false">🎙️ Empezar a hablar</button><p id="voice-status" class="message" role="status"></p></div>
        <div class="context-notes"><small>Usaremos este contexto para entender mejor tus datos. Las conclusiones seguirán basándose en la información que compartas.</small><small>Solo conservamos la transcripción textual en este formulario durante la sesión.</small></div>
      </section>
      <div class="actions context-actions">
        <button class="button secondary" id="back-to-welcome" type="button">← Volver</button>
        <div class="context-next"><p id="context-progress" role="status" aria-live="polite">Te faltan 3 respuestas para continuar.</p><button id="context-submit" class="button gold" type="submit" disabled>Continuar →</button></div>
      </div>
    </form>`;
}

function dataScreen() {
  const fileList = app.files.length
    ? `<ul class="file-list">${app.files.map(file => `<li><span>${safe(file.name)}</span><small>${formatBytes(file.size)}</small></li>`).join("")}</ul>`
    : "";
  return `<p class="eyebrow">Sube tu información</p>
    <h1 class="screen-title">Usa los archivos que ya tienes</h1>
    <p class="screen-intro">Puedes subir ventas, inventario o ambos. Pueden estar en un mismo Excel, en hojas diferentes, o en archivos separados.</p>
    <section class="minimum-data" aria-labelledby="minimum-data-title">
      <h2 id="minimum-data-title">Antes de subirlos, revisa que tengas estos datos</h2>
      <div class="minimum-data-grid">
        <article><h3>Ventas</h3><ul><li>Fecha de venta</li><li>Producto o referencia</li><li>Cantidad vendida</li><li>Valor de la venta</li></ul></article>
        <article><h3>Inventario</h3><ul><li>Producto o referencia</li><li>Unidades disponibles</li></ul></article>
      </div>
      <p class="missing-data-note">Si te falta alguno, puedes subir el archivo igualmente. San José te dirá qué puede analizar con la información disponible.</p>
      <p class="column-name-note">No importa cómo se llamen las columnas en tu archivo. San José intentará reconocerlas.</p>
    </section>
    <section class="panel unified-upload">
      <label id="drop-zone" class="drop-zone">
        <input id="business-files" type="file" multiple accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
        <span class="drop-icon" aria-hidden="true">↑</span>
        <strong>Arrastra aquí tus archivos de ventas o inventario</strong>
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
  const critical = ["trend", "business-decline", "profit-decline", "product-decline", "sales-decline-cause"].includes(finding?.type) ? Math.min(rates.date, rates.product, measureRate)
    : finding?.type === "concentration" || finding?.type === "review" || finding?.type === "maintain" ? Math.min(rates.product, measureRate)
      : ["slow", "stockout", "inventory-no-movement", "inventory-accumulation", "inventory-excess", "stock-risk-general"].includes(finding?.type) ? Math.min(rates.product, finding?.type === "inventory-no-movement" ? rates.inventoryProduct : rates.quantity, rates.inventoryProduct, rates.stock) : quality.score / 100;
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
    const title = finding.nivelUrgencia === "Crítico"
      ? strength === "ALTA" ? "Tus ventas requieren atención inmediata." : "Hay señales de una caída crítica en tus ventas. Esto requiere revisión inmediata."
      : strength === "ALTA" ? "Tus ventas vienen bajando." : strength === "MEDIA" ? "Los datos muestran que tus ventas vienen bajando." : "Hay señales de una reducción en las ventas, pero falta información para confirmarla.";
    const magnitude = finding.magnitudDetalle || {};
    const magnitudeMetrics = [`${readablePercent(Math.abs(panorama.change))} menos en los últimos tres meses`];
    if (magnitude.unidadesDejadasDeVender !== null && magnitude.unidadesDejadasDeVender > 0) magnitudeMetrics.push(`${readableNumber(magnitude.unidadesDejadasDeVender)} unidades menos frente al periodo anterior`);
    if (magnitude.valorDejadoDeVender !== null && magnitude.valorDejadoDeVender > 0) magnitudeMetrics.push(`${money.format(magnitude.valorDejadoDeVender)} menos en ventas frente al periodo anterior`);
    if (magnitudeMetrics.length < 4 && metrics.latestComparison.reliable && metrics.latestComparison.change !== null) magnitudeMetrics.push(`El último mes quedó ${readablePercent(Math.abs(metrics.latestComparison.change))} ${metrics.latestComparison.change < 0 ? "por debajo" : "por encima"} del promedio de los tres anteriores`);
    if (magnitudeMetrics.length < 4) magnitudeMetrics.push(`${amount(panorama.recentAverage)} de promedio mensual reciente`);
    return { title, metrics: magnitudeMetrics.slice(0, 4), found: finding.reason, important: finding.meaning, action: finding.action, strength };
  }
  if (finding.type === "profit-decline") {
    const title = strength === "ALTA" ? finding.title : `Los datos indican que ${finding.title.charAt(0).toLowerCase() + finding.title.slice(1)}`;
    const utilityMetric = utilityName(metrics);
    const difference = metrics.utilityMode === "amount" ? `${money.format(metrics.utilityPanorama.priorTotal - metrics.utilityPanorama.recentTotal)} menos frente al periodo anterior` : `De ${utilityDisplay(metrics, metrics.utilityPanorama.priorAverage)} a ${utilityDisplay(metrics, metrics.utilityPanorama.recentAverage)} de margen promedio`;
    return { title, metrics: [`${readablePercent(Math.abs(metrics.utilityPanorama.change))} menos ${utilityMetric}`, difference, `Urgencia: ${finding.nivelUrgencia}`], found: finding.reason, important: finding.meaning, action: finding.action, strength };
  }
  if (["inventory-no-movement", "inventory-accumulation", "inventory-excess", "stock-risk-general"].includes(finding.type)) {
    const title = strength === "ALTA" ? finding.title : strength === "MEDIA" ? `Los datos indican que ${finding.title.charAt(0).toLowerCase() + finding.title.slice(1)}` : `Hay señales de esta situación, pero encontramos información incompleta que puede afectar la conclusión.`;
    const metricsList = finding.type === "inventory-no-movement"
      ? [`${readablePercent(metrics.staleMovementShare)} de las existencias sin movimiento reciente`, `${metrics.staleMovementItems.length} ${metrics.staleMovementItems.length === 1 ? "producto señalado" : "productos señalados"}`]
      : finding.type === "inventory-accumulation"
      ? [`${readablePercent(metrics.inventoryChange)} más unidades en inventario`, `${readablePercent(Math.abs(metrics.unitPanorama.change))} menos unidades vendidas`]
      : finding.type === "inventory-excess"
        ? [`${readablePercent(metrics.excessInventoryShare)} de las existencias con poco movimiento`, `${readableNumber(metrics.inventoryUnits)} unidades disponibles`]
        : [`${readablePercent(metrics.riskSalesShare)} de las ventas recientes en riesgo`, `${metrics.riskItems.length} ${metrics.riskItems.length === 1 ? "producto con pocas existencias" : "productos con pocas existencias"}`];
    return { title, metrics: [...metricsList, `Urgencia: ${finding.nivelUrgencia}`].slice(0, 4), found: finding.reason, important: finding.meaning, action: finding.action, strength };
  }
  if (finding.type === "sales-decline-cause") return { title: finding.title, metrics: [`${readablePercent(finding.driver.contribution)} de la reducción`, `${readablePercent(finding.driver.recentShare)} de las ventas recientes`], found: finding.reason, important: finding.meaning, action: finding.action, strength };
  if (finding.type === "slow") {
    const item = finding.items[0];
    const soldShare = metrics.units ? item.sold / metrics.units : 0;
    const ratio = item.sold > 0 ? item.stock / item.sold : null;
    return { title: lead(productSubject(item.producto)), metrics: [`${readableNumber(item.sold)} unidades vendidas`, `${readableNumber(item.stock)} unidades disponibles`, `${readablePercent(soldShare)} de las unidades vendidas`, ratio ? `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(ratio)} veces más unidades disponibles que vendidas` : "No registró unidades vendidas"], found: `Este producto vendió ${readableNumber(item.sold)} unidades durante ${readableNumber(quality.periodDays)} días revisados.`, important: `Representa ${readablePercent(soldShare)} de las unidades vendidas y mantiene ${readableNumber(item.stock)} unidades disponibles.`, action: "Revisa sus ventas y existencias antes de volver a comprarlo.", strength };
  }
  if (finding.type === "stockout") {
    const item = finding.item || metrics.stockout;
    return { title: lead(`las existencias de ${productSubject(item.producto)}`), metrics: [`${readableNumber(item.sold)} unidades vendidas`, `${readableNumber(item.stock)} unidades disponibles`], found: `${productSubject(item.producto, true)} registró ${readableNumber(item.sold)} unidades vendidas y actualmente aparecen ${readableNumber(item.stock)} unidades disponibles.`, important: "Si continúa vendiéndose, las existencias actuales podrían no ser suficientes.", action: "Confirma las existencias y revisa el siguiente pedido.", strength };
  }
  if (finding.type === "concentration") {
    const [product, values] = metrics.ranked[0];
    const measure = metrics.rankingBasis === "value" ? "valor vendido" : "unidades vendidas";
    const amount = metrics.rankingBasis === "value" ? `${money.format(values.revenue)} vendidos` : `${readableNumber(values.units)} unidades vendidas`;
    return { title: lead(`cuánto dependen tus ventas de ${productSubject(product)}`), metrics: [amount, `${readablePercent(metrics.topShare)} del ${measure}`], found: `${productSubject(product, true)} es el producto que más aporta a las ventas registradas.`, important: `Este producto representa ${readablePercent(metrics.topShare)} del ${measure}.`, action: "Comprueba si este patrón continúa y revisa qué otros productos puedes impulsar.", strength };
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
    return { title: lead(productSubject(item.product)), metrics: [latest, `${readablePercent(Math.abs(item.change))} menos que su promedio reciente`, `${previous} de promedio mensual anterior`], found: `${productSubject(item.product, true)} registró ${latest} en el último mes completo.`, important: `El resultado fue ${readablePercent(Math.abs(item.change))} menor que su promedio de los tres meses completos anteriores.`, action: "Revisa qué cambió en sus ventas antes de ajustar compras, precio o exhibición.", strength };
  }
  if (finding.type === "maintain" && metrics.ranked[0]) {
    const [product, values] = metrics.ranked[0];
    const amount = metrics.rankingBasis === "value" ? `${money.format(values.revenue)} vendidos` : `${readableNumber(values.units)} unidades vendidas`;
    return { title: lead(`la disponibilidad de ${productSubject(product)}`), metrics: [amount, `${readablePercent(metrics.topShare)} ${metrics.rankingBasis === "value" ? "del valor vendido" : "de las unidades vendidas"}`], found: `${productSubject(product, true)} lidera las ventas registradas durante el periodo.`, important: "Mantener disponible un producto con demanda ayuda a evitar ventas que no puedas atender.", action: "Revisa sus existencias y el tiempo de entrega de tu proveedor.", strength };
  }
  const product = metrics.ranked.at(-1)?.[0];
  if (product) {
    const values = metrics.ranked.at(-1)[1];
    const amount = metrics.rankingBasis === "value" ? `${money.format(values.revenue)} vendidos` : `${readableNumber(values.units)} unidades vendidas`;
    return { title: lead(productSubject(product)), metrics: [amount], found: `${productSubject(product, true)} fue el producto con menor movimiento registrado.`, important: "Un producto con poco movimiento puede requerir revisar compras, precio o exhibición.", action: "Confirma sus ventas y existencias antes de hacer una nueva compra.", strength };
  }
  return { title: "Todavía no tenemos información suficiente para decirte qué atender primero.", metrics: [], found: "La información disponible no permite comparar productos o periodos con seguridad.", important: resultQualityCopy(quality), action: "Revisa los datos incompletos indicados arriba y vuelve a realizar el análisis.", strength: "BAJA" };
}

function diagnosticReviewText(finding) {
  if (finding?.reviewFocus) return finding.reviewFocus;
  if (finding?.type === "sales-decline-cause") return "Si este factor continúa aportando a la caída general de las ventas.";
  if (["slow", "inventory-excess", "inventory-accumulation"].includes(finding?.type)) return "Qué productos concentran más existencias frente a sus ventas recientes.";
  if (["stockout", "stock-risk-general"].includes(finding?.type)) return "Si las existencias registradas alcanzan para sostener el ritmo reciente de ventas.";
  if (["concentration", "maintain"].includes(finding?.type)) return "Si la dependencia del producto principal continúa en otros periodos.";
  if (["trend", "product-decline"].includes(finding?.type)) return "Qué productos, clientes o periodos están asociados con el cambio observado.";
  return "La situación señalada y la información que falta para explicarla mejor.";
}

function diagnosticReviewItems(finding) {
  const foci = app.analysis?.diagnostico?.focosPrioritarios || [];
  const concrete = foci.map(item => item.evidencia).filter(Boolean).slice(0, 3);
  return concrete.length ? concrete : [diagnosticReviewText(finding)];
}

function contextualDiagnosisHtml() {
  const coincidences = app.analysis?.diagnostico?.coincidenciasContextoDatos || [];
  if (!coincidences.length) return "";
  const historical = coincidences.some(item => item.origen === "historia");
  return `<aside class="contextual-diagnosis" aria-labelledby="contextual-diagnosis-title"><span id="contextual-diagnosis-title">${historical ? "Tuvimos en cuenta revisiones anteriores" : "Tuvimos en cuenta lo que nos contaste"}</span>${coincidences.slice(0, 2).map(item => `<p>${safe(item.texto || item)}</p>`).join("")}</aside>`;
}

function resultEvidenceHtml(presentation, finding) {
  const reviewItems = diagnosticReviewItems(finding);
  return `<section class="priority-evidence" id="priority-evidence"><article><span>¿Qué encontramos?</span><p>${safe(presentation.found)}</p></article><article><span>¿Por qué es importante?</span><p>${safe(presentation.important)}</p></article><article class="review-now"><span>¿Qué deberías revisar ahora?</span>${reviewItems.length > 1 ? `<ul>${reviewItems.map(item => `<li>${safe(item)}</li>`).join("")}</ul>` : `<p>${safe(reviewItems[0])}</p>`}</article></section>${contextualDiagnosisHtml()}`;
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

function managementObservedCausesHtml() {
  const diagnosis = app.analysis.diagnostico;
  const causes = diagnosis?.causasObservadas || [];
  const main = app.analysis.priorities[0];
  if (!causes.length) return `<section><h3>Qué está explicando el cambio</h3><p><strong>Todavía no encontramos factores observados suficientes para explicarlo.</strong></p><p>No convertimos posibles explicaciones en hechos cuando los archivos no pueden demostrarlas.</p></section>`;
  return `<section><h3>Qué está explicando el cambio</h3><ul>${causes.slice(0, 3).map(item => `<li>${safe(item)}</li>`).join("")}</ul><h4>Qué significa</h4><p>${safe(main?.meaning || "Estos factores están asociados con el resultado observado.")}</p></section>`;
}

function managementDetailHtml(main, presentation, insufficient) {
  const quality = app.analysis.resultQuality;
  const limitations = analysisLimitations();
  const diagnosis = app.analysis.diagnostico;
  const hypotheses = diagnosis?.hipotesisPorValidar || [];
  const foci = diagnosis?.focosPrioritarios || [];
  const details = quality.details.filter(item => ["Fecha de venta", "Producto de ventas", "Cantidad vendida", "Valor de la venta"].includes(item.label)).slice(0, 4);
  return `<div class="management-report"><header><div class="management-heading"><p class="section-kicker">Mini informe gerencial</p><h2>Resumen para tomar decisiones</h2><p>Revisamos tu información. Estos son los puntos más importantes para entender qué está pasando.</p></div><img class="management-logo" src="assets/logo-san-jose-azul.png" alt="San José - Transformación Estratégica"></header>
    ${managementSalesHtml()}${managementObservedCausesHtml()}
    <section><h3>Qué deberías revisar primero</h3>${insufficient ? `<p><strong>Todavía no tenemos información suficiente para decirte qué atender primero.</strong></p><p>${safe(quality.reasons[0] || resultQualityCopy(quality))}</p>` : `<p><strong>${safe(presentation.title)}</strong></p><p>${safe(presentation.found)}</p>${foci.length ? `<ol>${foci.slice(0, 3).map(item => `<li><strong>${safe(item.categoria)}</strong><br>${safe(item.evidencia)}</li>`).join("")}</ol>` : `<p>${safe(diagnosticReviewText(main))}</p>`}<p>${safe(urgencyReviewPrefix(main.nivelUrgencia))}</p>`}</section>
    <section><h3>Lo que todavía no podemos saber</h3>${hypotheses.length ? `<p><strong>Posibles explicaciones por confirmar:</strong></p><ul>${hypotheses.map(item => `<li>${safe(item)}</li>`).join("")}</ul><p>Estas posibilidades no están demostradas por los datos.</p>` : ""}${limitations.length ? `<p><strong>Información que limita el diagnóstico:</strong></p><ul>${limitations.map(item => `<li>${safe(item)}</li>`).join("")}</ul>` : "<p>No encontramos una limitación importante para las conclusiones mostradas.</p>"}</section>
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
    ${insufficient ? `<section class="insufficient-priority"><p class="section-kicker">Resultado del análisis</p><h2>Todavía no tenemos información suficiente para decirte qué atender primero.</h2><p>${safe(quality.reasons[0] || "No encontramos suficientes datos utilizables para comparar productos o periodos.")}</p></section>` : `<section class="result-section priority-section" aria-labelledby="priority-title"><p class="section-kicker">Atiende esto primero</p><article class="main-priority"><h2 id="priority-title">${safe(presentation.title)}</h2><div class="priority-metrics">${presentation.metrics.slice(0, 4).map(metric => `<span>${safe(metric)}</span>`).join("")}</div><p class="quality-notice">${presentation.strength === "MEDIA" ? `Este diagnóstico utiliza información con ${quality.score} % de calidad. Ten en cuenta las limitaciones indicadas.` : presentation.strength === "BAJA" ? `Este diagnóstico se basa en información con ${quality.score} % de calidad y debe tomarse como una señal inicial.` : `Basado en información con ${quality.score} % de calidad.`}</p></article></section>${resultEvidenceHtml(presentation, main)}<div class="priority-actions"><button class="button secondary" type="button" data-priority="0" data-go="6">Ver evidencia</button><button class="button gold priority-next" type="button" data-go="7">Ver mi plan de 3 acciones →</button></div>`}
    ${secondary.length ? `<section class="result-section also-found"><h2>También encontramos</h2><div class="secondary-findings">${secondary.map(item => `<article class="secondary-finding"><p>${safe(item.sentence)}</p></article>`).join("")}</div></section>` : ""}
    <details class="analysis-details"><summary>Ver detalle del análisis</summary>${managementDetailHtml(main, presentation, insufficient)}</details>
    <div class="download-summary-action"><button id="download-summary" class="button secondary" type="button" ${insufficient ? "disabled" : ""}>Descargar resumen ejecutivo</button>${insufficient ? "<p>Podrás descargarlo cuando exista información suficiente para sustentar una conclusión.</p>" : ""}</div>
    ${nav(4, null)}`;
}

function evidenceScreen() {
  const finding = app.analysis?.priorities[app.activePriority];
  if (!finding) return missingState();
  return `<p class="eyebrow">Evidencia de la oportunidad</p>
    <h1 class="screen-title">${safe(finding.title)}</h1>
    <article class="focus-card"><span>Lo que muestran tus datos</span><h2>${safe(finding.evidence)}</h2></article>
    <div class="consulting-detail">
      <section class="panel"><h2>Qué significa</h2><p>${safe(finding.meaning)}</p></section>
      <section class="panel"><h2>Qué conviene investigar</h2><p>${safe(diagnosticReviewText(finding))}</p><p><strong>Qué observar:</strong> ${safe(finding.indicator)}</p></section>
    </div>
    <div class="actions"><button class="button secondary" type="button" data-go="5">← Volver al resultado</button>${app.activePriority === 0 ? '<button class="button gold" type="button" data-go="7">Crear plan de 3 acciones →</button>' : ""}</div>`;
}

function planScreen() {
  if (!app.analysis) return missingState();
  if (!app.planDetailOpen) return opportunitiesSummaryScreen();
  app.completed.plan = true;
  const checklist = stageFourPlanChecklist();
  const activityCount = getActionPlan().phases.flatMap(phase => phase.activities).length;
  const planFinished = activityCount > 0 && app.tasks.filter(Boolean).length === activityCount;
  return `<div class="stage-four-plan"><p class="eyebrow">Un paso a la vez</p>
    <h1 class="screen-title">Tu plan en 3 fases</h1>
    <p class="screen-intro">Primero revisamos qué cambió, después actuamos y al final comprobamos si mejoró.</p>
    ${checklist}</div>
    <section id="plan-finished-message" class="plan-finished ${planFinished ? "" : "hidden"}" aria-live="polite"><h2>Terminaste este plan.</h2><p>Ahora cuéntanos cómo te fue para revisar qué sigue.</p></section>
    <div class="actions plan-closing-actions"><button id="back-opportunities" class="button secondary" type="button">← Ver oportunidades</button><div class="right"><button id="plan-feedback-button" class="button gold" type="button">Cuéntanos qué pasó →</button></div></div>
    <dialog id="plan-pending-dialog" class="plan-pending-dialog" aria-labelledby="plan-pending-title"><h2 id="plan-pending-title">Todavía tienes actividades pendientes.</h2><p>Puedes contarnos cómo te fue hasta ahora o volver al plan.</p><div class="dialog-actions"><button id="return-to-plan" class="button secondary" type="button">Volver al plan</button><button id="continue-to-feedback" class="button gold" type="button">Contarnos qué pasó</button></div></dialog>`;
}

function opportunitiesSummaryScreen() {
  const opportunityEntries = cycleOpportunityEntries();
  const count = opportunityEntries.length;
  const cycle = currentAnalysisCycle();
  const cards = opportunityEntries.map((entry, index) => {
    const finding = app.analysis?.priorities?.[entry.sourceIndex];
    if (!finding) return "";
    const presentation = priorityPresentation(finding);
    const title = finding.problemaGeneral || finding.title || presentation.title;
    const explanation = finding.evidence || finding.reason || presentation.found;
    const defaultLabels = ["Atender primero", "Atender después", "Mantener en observación"];
    const savedState = cycle?.prioridades?.[index]?.estado;
    const rawLabel = savedState && savedState !== "pendiente" ? savedState : defaultLabels[index];
    const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
    const isCurrent = index === app.activeOpportunityIndex;
    return `<article class="opportunity-card ${isCurrent ? "primary" : "pending"}"><header><span>Oportunidad ${index + 1}</span><b>${safe(label)}</b></header><h2>${safe(title)}</h2><p>${safe(explanation)}</p>${presentation.metrics?.length ? `<ul>${presentation.metrics.slice(0, 2).map(metric => `<li>${safe(metric)}</li>`).join("")}</ul>` : ""}${isCurrent ? `<button id="open-plan-detail" class="button gold" type="button">${index ? "Continuar esta oportunidad" : "Trabajar esta oportunidad"} →</button>` : `<span class="opportunity-later">${index < app.activeOpportunityIndex ? "Ya la trabajamos" : "La veremos después"}</span>`}</article>`;
  }).join("");
  const missing = Math.max(0, 3 - count);
  return `<section class="opportunities-summary"><p class="eyebrow">Primero mira el panorama</p><h1 class="screen-title">${count ? `Tus ${count} oportunidades de mejora` : "Oportunidades de mejora"}</h1><p class="screen-intro">${count ? `San José encontró ${count === 1 ? "un tema" : `${count} temas`} que conviene trabajar. Vamos a avanzar uno por uno, empezando por el más importante.` : "Todavía no encontramos una oportunidad con información suficiente para sustentarla."}</p>${count ? `<p class="opportunities-order">Primero verás ${count === 1 ? "la oportunidad disponible" : `las ${count} oportunidades`}. Luego entraremos a la primera para trabajarla en 3 fases.</p>` : ""}<div class="opportunity-grid">${cards}</div>${missing ? `<aside class="opportunity-missing">${missing === 1 ? "No pudimos construir una tercera oportunidad" : "No pudimos construir las otras oportunidades"} porque falta información suficiente para sustentarlas.</aside>` : ""}${count ? `<aside class="opportunity-method"><h2>¿Cómo vamos a trabajar esto?</h2><p>San José te mostrará primero la oportunidad más importante.</p><ol><li>Entender qué cambió</li><li>Actuar</li><li>Comprobar si mejoró</li></ol></aside>` : ""}${nav(6, null)}</section>`;
}

function stageFourPlanChecklist() {
  const actionPlan = getActionPlan();
  const plan = actionPlan.phases;
  const activities = plan.flatMap(phase => phase.activities);
  const opportunity = syncOpportunityCycle(actionPlan);
  const planState = currentOpportunityPlanState();
  if (opportunity.changed || app.tasks.length !== activities.length) {
    app.tasks = planState?.tasks?.length === activities.length ? [...planState.tasks] : Array(activities.length).fill(false);
  }
  const done = app.tasks.filter(Boolean).length;
  const phaseNames = ["Entender qué cambió", "Actuar sobre lo encontrado", "Comprobar si mejoró"];
  let activityIndex = 0;
  const context = actionPlan.context?.length
    ? `<aside class="plan-context"><strong>Tuvimos en cuenta lo que nos contaste</strong>${actionPlan.context.map(item => `<p>${safe(item)}</p>`).join("")}</aside>`
    : "";
  const signals = actionPlan.signals?.length
    ? `<div class="plan-signal-grid">${actionPlan.signals.slice(0, 3).map(signal => `<article class="plan-signal"><h3>${safe(signal.name)}</h3><dl><div><dt>Hoy</dt><dd>${safe(signal.today)}</dd></div><div><dt>Meta</dt><dd>${safe(signal.target)}</dd></div></dl>${signal.reference ? `<p>Referencia anterior: <strong>${safe(signal.reference)}</strong></p>` : ""}${signal.note ? `<small>${safe(signal.note)}</small>` : ""}</article>`).join("")}</div>`
    : `<p class="plan-no-signal">Con la información disponible todavía no podemos calcular una meta responsable. La tercera fase te ayudará a crear un punto de comparación.</p>`;
  return `<section class="plan-problem stage-four-problem" aria-labelledby="plan-problem-title"><div><span>Problema que estamos atendiendo</span><h2 id="plan-problem-title">${safe(actionPlan.problemGeneral)}</h2>${actionPlan.problemEvidence.map(item => `<p>${safe(item)}</p>`).join("")}</div><img src="assets/logo-san-jose-azul.png" alt="San José – Transformación Estratégica"></section>
    <section class="plan-start" aria-labelledby="plan-start-title"><span>Empezaremos por aquí</span><h2 id="plan-start-title">${safe(actionPlan.causeWorked)}</h2>${actionPlan.causeEvidence.map(item => `<p>${safe(item)}</p>`).join("")}${context}</section>
    <div class="plan-progress"><strong id="task-count">${done} de ${activities.length}</strong><span>actividades completadas</span></div>
    <ol class="action-timeline" aria-label="Tiempos del plan">${plan.map((phase, index) => `<li><span class="timeline-dot" aria-hidden="true"></span><b>${safe(phase.when)}</b><small>${index === 0 ? "Primero" : index === 1 ? "Después" : "Al final"}</small></li>`).join("")}</ol>
    <div class="plan-phases">${plan.map((phase, phaseIndex) => {
      const phaseStart = activityIndex;
      activityIndex += phase.activities.length;
      const phaseDone = app.tasks.slice(phaseStart, activityIndex).filter(Boolean).length;
      return `<article class="plan-phase stage-four-phase"><header><div><span>Fase ${phaseIndex + 1}</span><b>${safe(phase.when)}</b></div><small data-phase-progress="${phaseIndex}">${phaseDone} de ${phase.activities.length} actividades</small></header><p class="phase-name">${safe(phaseNames[phaseIndex])}</p><h2>${safe(phase.action)}</h2><p class="phase-evidence">${safe(phase.evidence)}</p><div class="phase-activities">${phase.activities.map((activity, localIndex) => {
        const index = phaseStart + localIndex;
        return `<label class="action-check ${app.tasks[index] ? "completed" : ""}"><input class="task-check" type="checkbox" data-task="${index}" data-phase="${phaseIndex}" ${app.tasks[index] ? "checked" : ""}><span class="check-mark" aria-hidden="true"></span><span class="action-copy"><strong>${safe(activity)}</strong></span></label>`;
      }).join("")}</div>${phase.questions?.length ? `<aside class="client-questions"><strong>Preguntas que pueden ayudarte</strong><ul>${phase.questions.map(question => `<li>${safe(question)}</li>`).join("")}</ul></aside>` : ""}</article>`;
    }).join("")}</div>
    <section class="plan-measures stage-four-signals"><span>¿Cómo sabremos si mejoró?</span><h2>Compara estas señales al terminar la tercera fase</h2>${signals}</section>
    <p class="plan-responsibility">San José te ayuda a identificar prioridades y posibles acciones a partir de tus datos. La decisión final y su ejecución corresponden al empresario.</p>`;
}

function currentOpportunityFinding() {
  const entry = currentOpportunityEntry();
  return entry ? app.analysis?.priorities?.[entry.sourceIndex] || null : null;
}

function currentOpportunityDiagnosis() {
  const finding = currentOpportunityFinding();
  if (!finding || !app.analysis) return null;
  const diagnosis = buildDiagnosticHandoff(finding, app.analysis.metrics, app.analysis.resultQuality, app.dataset || { sales: [], inventory: [] });
  const historical = currentAnalysisCycle()?.contextoHistoricoUsado || [];
  if (historical.length) diagnosis.coincidenciasContextoDatos = [...historical, ...(diagnosis.coincidenciasContextoDatos || [])].slice(0, 2);
  return diagnosis;
}

function syncOpportunityCycle(actionPlan) {
  const entry = currentOpportunityEntry();
  const opportunityId = entry?.id || stableOpportunityId(app.currentAnalysisCycleId || "revision-actual", currentOpportunityFinding(), app.activeOpportunityIndex);
  const key = normalize(`${opportunityId}|${app.opportunityAttempt}|${actionPlan.problemGeneral}|${actionPlan.causeWorked}`);
  const changed = Boolean(app.currentOpportunityKey && app.currentOpportunityKey !== key);
  if (!app.currentOpportunityKey || changed) {
    const existing = app.opportunityHistory.find(item => item.opportunityId === opportunityId && item.intento === app.opportunityAttempt);
    if (existing) {
      const completedByActivity = new Map((existing.actividades || []).map(item => [normalize(item.actividad), Boolean(item.completada)]));
      existing.oportunidadAtendida = actionPlan.problemGeneral;
      existing.problemaOriginal = actionPlan.problemGeneral;
      existing.evidencia = [...(actionPlan.problemEvidence || [])];
      existing.causas = [actionPlan.causeWorked, ...(actionPlan.causeEvidence || [])].filter(Boolean);
      existing.plan = actionPlan.phases.map(phase => ({ momento: phase.when, accion: phase.action, actividades: [...phase.activities] }));
      existing.actividades = actionPlan.phases.flatMap((phase, phaseIndex) => phase.activities.map(activity => ({ fase: phaseIndex + 1, actividad: activity, completada: completedByActivity.get(normalize(activity)) || false })));
      existing.metas = (actionPlan.signals || []).map(signal => ({ señal: signal.name, hoy: signal.today, meta: signal.target }));
      app.currentOpportunityKey = key;
      return { changed: false, cycle: existing };
    }
    const previous = [...app.opportunityHistory].reverse().find(item => item.estadoFinal === "En curso");
    if (changed && previous) previous.estadoFinal = "Pendiente de revisión";
    const opportunityCycle = {
      cicloAnalisisId: app.currentAnalysisCycleId,
      opportunityId,
      dominio: entry?.domain || opportunityDomain(currentOpportunityFinding()),
      oportunidadIndice: app.activeOpportunityIndex,
      intento: app.opportunityAttempt,
      oportunidadAtendida: actionPlan.problemGeneral,
      problemaOriginal: actionPlan.problemGeneral,
      evidencia: [...(actionPlan.problemEvidence || [])],
      causas: [actionPlan.causeWorked, ...(actionPlan.causeEvidence || [])].filter(Boolean),
      fechaInicio: actionPlan.handoff?.fechaInicio || isoDateAfter(0),
      plan: actionPlan.phases.map(phase => ({ momento: phase.when, accion: phase.action, actividades: [...phase.activities] })),
      actividades: actionPlan.phases.flatMap((phase, phaseIndex) => phase.activities.map((activity, activityIndex) => ({ fase: phaseIndex + 1, actividad: activity, completada: changed ? false : Boolean(app.tasks[actionPlan.phases.slice(0, phaseIndex).reduce((sum, item) => sum + item.activities.length, 0) + activityIndex]) }))),
      metas: (actionPlan.signals || []).map(signal => ({ señal: signal.name, hoy: signal.today, meta: signal.target })),
      resultado: null,
      retroalimentacion: null,
      estadoFinal: "En curso"
    };
    app.opportunityHistory.push(opportunityCycle);
    const analysisCycle = currentAnalysisCycle();
    const priority = analysisCycle?.prioridades?.[app.activeOpportunityIndex];
    if (priority) priority.estado = "en trabajo";
    analysisCycle?.planes?.push({ oportunidadIndice: app.activeOpportunityIndex, intento: app.opportunityAttempt, problema: actionPlan.problemGeneral, causa: actionPlan.causeWorked, actividades: actionPlan.phases.flatMap(phase => [...phase.activities]), metas: (actionPlan.signals || []).map(signal => ({ nombre: signal.name, hoy: signal.today, meta: signal.target })), fechaInicio: actionPlan.handoff?.fechaInicio });
    app.currentOpportunityKey = key;
    return { changed, cycle: opportunityCycle };
  }
  const current = [...app.opportunityHistory].reverse().find(item => item.opportunityId === opportunityId && item.intento === app.opportunityAttempt) || null;
  return { changed, cycle: current };
}

function decideOpportunityAfterReview(review = {}) {
  if (review.hasNewData) {
    if (review.outcome === "worse") return { next: false, state: "Empeoró", key: "worse" };
    if (review.outcome !== "improved" || !review.improvedEnough) return { next: false, state: "Sigue igual", key: "same" };
    if (review.remainsHighestPriority) return { next: false, state: "Todavía necesita atención", key: "attention" };
    return { next: true, state: "Mejoró suficientemente", key: "improved" };
  }
  const comment = normalize(review.comment || "");
  if (/(empeor|peor|bajo mas|cayo mas)/.test(comment)) return { next: false, state: "Empeoró", key: "worse" };
  if (review.perceivedImprovement === "Sí" && review.planCompleted === "Sí") return { next: true, state: "Mejoró suficientemente", key: "improved" };
  if (review.perceivedImprovement === "Sí") return { next: false, state: "Mejoró parcialmente", key: "partial" };
  if (review.perceivedImprovement === "Todavía no") return { next: false, state: "Sigue igual", key: "same" };
  return { next: false, state: "No hay información suficiente", key: "insufficient" };
}

function feedbackScreen() {
  return `<p class="eyebrow">Después del plan</p>
    <h1 class="screen-title">Cuéntanos cómo te fue</h1>
    <p class="screen-intro">Lo que nos cuentes nos ayudará a entender qué funcionó, qué cambió y qué deberíamos revisar después.</p>
    <form id="feedback-form" class="panel feedback-simple">
      <div class="feedback-grid">
        ${radioQuestion("planCompletado", "¿Pudiste hacer el plan?", ["Sí", "En parte", "No"])}
        ${radioQuestion("mejoraPercibida", "¿Notaste alguna mejora?", ["Sí", "Todavía no", "No estoy seguro"])}
      </div>
      <section class="feedback-context" aria-labelledby="feedback-context-title">
        <h2 id="feedback-context-title">Cuéntanos qué pasó</h2>
        <p>Puedes decirnos qué mejoró, qué siguió igual, qué fue difícil o si pasó algo nuevo en tu negocio.</p>
        <p>Entre más contexto nos des, mejor podremos entender qué debería revisarse después.</p>
        <label for="feedback-story">Escribe o cuéntanos con tu voz<textarea id="feedback-story" name="comentarioUsuario" rows="4" placeholder="Cuéntanos qué pasó durante el plan."></textarea></label>
        <div class="context-voice"><button id="feedback-voice-button" class="button secondary hidden" type="button" aria-pressed="false">🎙️ Empezar a hablar</button><p id="feedback-voice-status" class="message" role="status"></p></div>
        <div class="feedback-examples"><strong>Puedes contarnos, por ejemplo:</strong><ul><li>qué mejoró;</li><li>qué no funcionó;</li><li>qué fue difícil;</li><li>si pasó algo nuevo;</li><li>cualquier cosa que creas importante.</li></ul><p>Ejemplo: logramos hablar con tres clientes, dos volvieron a comprar, pero seguimos teniendo problemas para conseguir un producto.</p></div>
        <small class="feedback-privacy">Solo usamos lo que escribas o dictemos como texto para esta revisión.</small>
      </section>
      <section class="feedback-next"><h2>Esto nos ayudará a revisar qué sigue</h2><p>San José tendrá en cuenta lo que hiciste, lo que pasó y los nuevos cambios de tu negocio antes de mostrarte la siguiente prioridad.</p></section>
      <div class="actions"><button class="button secondary" type="button" data-go="7">← Volver al plan</button><button class="button gold" type="submit">Guardar y revisar qué sigue →</button></div>
    </form>`;
}

function startOpportunity(index, retry = false) {
  const opportunities = cycleOpportunityEntries();
  const entry = opportunities[index];
  if (!entry) return;
  app.activeOpportunityIndex = index;
  app.activeOpportunityId = entry.id;
  app.activePriority = entry.sourceIndex;
  app.opportunityAttempt = retry ? app.opportunityAttempt + 1 : 1;
  app.currentOpportunityKey = null;
  app.actionPlan = null;
  app.tasks = [];
  app.feedback = {};
  app.lastOpportunityDecision = null;
  app.planDetailOpen = true;
  app.cycleSummaryOpen = false;
  go(7);
}

function reviewedOpportunities() {
  const cycleEntries = app.opportunityHistory.filter(item => item.cicloAnalisisId === app.currentAnalysisCycleId && item.retroalimentacion);
  const latestByOpportunity = new Map();
  cycleEntries.forEach(item => latestByOpportunity.set(item.oportunidadIndice, item));
  return [...latestByOpportunity.values()].sort((a, b) => a.oportunidadIndice - b.oportunidadIndice);
}

function cycleSummaryScreen() {
  const cycle = currentAnalysisCycle();
  const reviewed = reviewedOpportunities();
  const userComments = reviewed.map(item => item.retroalimentacion?.comentarioUsuario).filter(Boolean);
  const dataFacts = reviewed.map(item => item.evidencia?.[0] || item.problemaOriginal).filter(Boolean);
  const easy = userComments.find(comment => /(facil|sencill|logr|pudimos|funcion)/.test(normalize(comment)));
  const difficult = userComments.find(comment => /(dificil|cost|no pud|problema|bloque|falta)/.test(normalize(comment)));
  if (cycle) cycle.estadoFinal = "revisión terminada";
  return `<section class="cycle-summary"><p class="eyebrow">Cierre de esta revisión</p><h1 class="screen-title">Terminamos esta revisión</h1><p class="screen-intro">Trabajamos las principales oportunidades que encontramos con la información que compartiste.</p>
    <div class="cycle-opportunities">${reviewed.map((item, index) => `<article><span>Oportunidad ${index + 1}</span><h2>${safe(item.oportunidadAtendida)}</h2><p><strong>Resultado:</strong> ${safe(item.estadoFinal)}.</p></article>`).join("")}</div>
    <section class="cycle-learning"><h2>Lo que aprendimos en esta revisión</h2>${dataFacts.slice(0, 2).map(fact => `<p><strong>Los datos muestran:</strong> ${safe(fact)}</p>`).join("")}${userComments.slice(0, 2).map(comment => `<p><strong>Nos contaste que:</strong> ${safe(comment)}</p>`).join("")}${!dataFacts.length && !userComments.length ? "<p>Todavía no tenemos información adicional para resumir.</p>" : ""}</section>
    ${easy || difficult ? `<div class="cycle-experience">${easy ? `<article><span>Lo que resultó más fácil</span><p>${safe(easy)}</p></article>` : ""}${difficult ? `<article><span>Lo que resultó más difícil</span><p>${safe(difficult)}</p></article>` : ""}</div>` : ""}
    <section class="cycle-new-data"><h2>Revisa cómo está tu negocio ahora</h2><p>Para revisar cómo está tu negocio ahora, carga información actualizada.</p><button id="load-new-cycle" class="button gold" type="button">Cargar nuevos datos →</button></section>
    <p class="plan-responsibility">San José te ayuda a identificar prioridades y posibles acciones a partir de tus datos. La decisión final y su ejecución corresponden al empresario.</p></section>`;
}

function radioQuestion(name, label, options) {
  return `<fieldset><legend>${label} *</legend><div class="radio-group">${options.map(option => `<label class="radio-pill"><input type="radio" name="${name}" value="${option}" required><span>${option}</span></label>`).join("")}</div></fieldset>`;
}

function nextScreen() {
  if (app.cycleSummaryOpen) return cycleSummaryScreen();
  const opportunities = cycleOpportunityEntries();
  const decision = app.lastOpportunityDecision || { next: false, state: "No hay información suficiente", key: "insufficient" };
  const completedOpportunityIndex = Number.isInteger(decision.completedOpportunityIndex) ? decision.completedOpportunityIndex : app.activeOpportunityIndex;
  const nextOpportunityIndex = completedOpportunityIndex + 1;
  const currentEntry = opportunities[completedOpportunityIndex];
  const nextEntry = opportunities[nextOpportunityIndex];
  const current = currentEntry ? app.analysis?.priorities?.[currentEntry.sourceIndex] : null;
  const next = nextEntry ? app.analysis?.priorities?.[nextEntry.sourceIndex] : null;
  const improved = decision.key === "improved";
  const finalOpportunity = !next;
  const transitionCopy = improved
    ? `<h1 class="screen-title">Esta oportunidad muestra una mejora.</h1><p class="screen-intro">Según lo que nos contaste, el plan produjo una mejora. ${finalOpportunity ? "Terminamos las oportunidades principales de esta revisión." : "Ahora podemos trabajar la siguiente oportunidad que encontramos."}</p>`
    : `<h1 class="screen-title">Esta oportunidad todavía necesita atención.</h1><p class="screen-intro">Puedes probar un camino diferente con lo que aprendimos o revisar la siguiente oportunidad disponible.</p>`;
  const actionButtons = improved
    ? next
      ? `<button id="start-next-opportunity" class="button gold" type="button">Trabajar siguiente oportunidad →</button>`
      : `<button id="show-cycle-summary" class="button gold" type="button">Ver resumen de esta revisión →</button>`
    : `<button id="retry-opportunity" class="button gold" type="button">Probar otro plan para esta oportunidad</button>${next ? `<button id="start-next-opportunity" class="button secondary" type="button">Revisar la siguiente oportunidad</button>` : `<button id="show-cycle-summary" class="button secondary" type="button">Ver resumen de esta revisión →</button>`}`;
  return `<section class="opportunity-transition"><p class="eyebrow">Decidir qué sigue</p>${transitionCopy}
    <div class="continuity-grid"><article class="completion"><span>Oportunidad trabajada · ${completedOpportunityIndex + 1}</span><h2>${safe(current?.problemaGeneral || current?.title || "Oportunidad actual")}</h2><p><strong>Resultado:</strong> ${safe(decision.state)}.</p></article>${next ? `<article class="panel"><span>Siguiente oportunidad · ${nextOpportunityIndex + 1}</span><h3>${safe(next.problemaGeneral || next.title)}</h3><p>${safe(next.evidence || next.reason || "")}</p></article>` : ""}</div>
    <div class="final-actions">${actionButtons}</div>
    <p class="plan-responsibility">San José te ayuda a identificar prioridades y posibles acciones a partir de tus datos. La decisión final y su ejecución corresponden al empresario.</p></section>`;
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
  $("#restart-demo")?.addEventListener("click", resetDemoProgress);
  $("#back-to-welcome")?.addEventListener("click", () => location.reload());
  $("#open-plan-detail")?.addEventListener("click", () => { app.planDetailOpen = true; render(); window.scrollTo({ top: 0, behavior: "smooth" }); });
  $("#back-opportunities")?.addEventListener("click", () => { app.planDetailOpen = false; render(); window.scrollTo({ top: 0, behavior: "smooth" }); });
  $("#plan-feedback-button")?.addEventListener("click", () => {
    const activityCount = getActionPlan().phases.flatMap(phase => phase.activities).length;
    if (app.tasks.filter(Boolean).length < activityCount) $("#plan-pending-dialog")?.showModal();
    else go(9);
  });
  $("#return-to-plan")?.addEventListener("click", () => $("#plan-pending-dialog")?.close());
  $("#continue-to-feedback")?.addEventListener("click", () => { $("#plan-pending-dialog")?.close(); go(9); });
  $("#start-next-opportunity")?.addEventListener("click", () => {
    const completedIndex = Number.isInteger(app.lastOpportunityDecision?.completedOpportunityIndex)
      ? app.lastOpportunityDecision.completedOpportunityIndex
      : app.activeOpportunityIndex;
    startOpportunity(completedIndex + 1);
  });
  $("#retry-opportunity")?.addEventListener("click", () => startOpportunity(app.activeOpportunityIndex, true));
  $("#show-cycle-summary")?.addEventListener("click", () => { app.cycleSummaryOpen = true; render(); window.scrollTo({ top: 0, behavior: "smooth" }); });
  $("#load-new-cycle")?.addEventListener("click", prepareNewDataCycle);

  if (app.step === 2) {
    const contextForm = $("#context-form");
    contextForm.addEventListener("submit", saveContext);
    contextForm.querySelectorAll("select[required]").forEach(select => select.addEventListener("change", updateContextProgress));
    $("#context-form select[name='actividad']").addEventListener("change", toggleOtherBusiness);
    toggleOtherBusiness();
    updateContextProgress();
    setupStoryTextarea();
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
  if (app.step === 7) document.querySelectorAll(".task-check").forEach(input => input.addEventListener("change", updateTask));
  if (app.step === 4) $("#adaptive-form")?.addEventListener("submit", saveAdaptiveContext);
  if ([8, 9].includes(app.step)) {
    $("#feedback-form").addEventListener("submit", saveFeedback);
    setupStoryTextarea("#feedback-story");
    setupSpeechRecognition({
      buttonSelector: "#feedback-voice-button",
      textareaSelector: "#feedback-story",
      statusSelector: "#feedback-voice-status",
      finishedMessage: "Listo. Revisa el texto y cambia lo que quieras antes de continuar.",
      unavailableMessage: "No pudimos usar el micrófono. Puedes continuar escribiendo."
    });
  }
}

function contextProgress(values) {
  const answered = [values.actividad, values.registro, values.antiguedad].filter(value => String(value || "").trim()).length;
  const missing = 3 - answered;
  return {
    answered,
    missing,
    complete: missing === 0,
    text: missing === 0 ? "Listo. Ya puedes continuar." : missing === 1 ? "Te falta 1 respuesta para continuar." : `Te faltan ${missing} respuestas para continuar.`
  };
}

function updateContextProgress() {
  const form = $("#context-form");
  const progressElement = $("#context-progress");
  const submit = $("#context-submit");
  if (!form || !progressElement || !submit) return;
  const result = contextProgress({
    actividad: $("#context-form select[name='actividad']")?.value,
    registro: $("#context-form select[name='registro']")?.value,
    antiguedad: $("#context-form select[name='antiguedad']")?.value
  });
  progressElement.textContent = result.text;
  progressElement.classList.toggle("ready", result.complete);
  submit.disabled = !result.complete;
}

function resizeStoryTextarea(textarea = $("#business-story")) {
  if (!textarea?.style || !textarea.scrollHeight) return;
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(260, Math.max(104, textarea.scrollHeight))}px`;
  textarea.style.overflowY = textarea.scrollHeight > 260 ? "auto" : "hidden";
}

function setupStoryTextarea(selector = "#business-story") {
  const textarea = $(selector);
  if (!textarea) return;
  textarea.addEventListener("input", () => resizeStoryTextarea(textarea));
  resizeStoryTextarea(textarea);
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
  refreshCurrentAnalysisCycle();
  render();
}

function setupSpeechRecognition(options = {}) {
  const {
    buttonSelector = "#voice-button",
    textareaSelector = "#business-story",
    statusSelector = "#voice-status",
    finishedMessage = "Listo. Puedes revisar y corregir el texto antes de continuar.",
    unavailableMessage = "No pudimos usar el micrófono. Puedes escribir tu contexto."
  } = options;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const button = $(buttonSelector);
  if (!Recognition || !button) return;
  const textarea = $(textareaSelector);
  const status = $(statusSelector);
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
    resizeStoryTextarea(textarea);
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
        status.textContent = unavailableMessage;
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
      : unavailableMessage;
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
      status.textContent = finishedMessage;
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
  beginAnalysisCycle();
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
  beginAnalysisCycle();
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
  const analysisScope = { hasSales, hasInventory, completeness };
  const architecture = businessAnalysisArchitecture(metrics, analysisScope);
  const priorities = level === "BAJA" ? [] : prioritize(metrics, analysisScope);
  const diagnosticHandoff = buildDiagnosticHandoff(priorities[0] || architecture.rankedFindings[0], metrics, resultQuality, data);
  const freeContext = normalize(`${app.context.contextoLibre || ""} ${app.context.eventoReciente || ""}`);
  const trendFirst = ["trend", "business-decline"].includes(priorities[0]?.type);
  const contextMentionsChange = Boolean(app.context.eventoReciente) || /(cerr|problema|proveedor|precio|cliente|normal|vacacion|obra|cambio|perdi)/.test(freeContext);
  return {
    quality, resultQuality, metrics, priorities,
    hallazgosEmpresariales: architecture.findings,
    businessFindings: architecture.findings,
    diagnostico: diagnosticHandoff,
    diagnosticHandoff,
    adaptiveNeeded: trendFirst && !contextMentionsChange
  };
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
  const classification = change !== null && change <= -.50 ? "CAÍDA CRÍTICA"
    : change !== null && change <= -.20 ? "CAÍDA IMPORTANTE" : status;
  const priorAverage = priorTotal / 3, recentAverage = recentTotal / 3;
  const duration = status === "VENTAS EN DESCENSO" ? recent.filter(item => item.value < priorAverage).length
    : status === "VENTAS EN CRECIMIENTO" ? recent.filter(item => item.value > priorAverage).length : 0;
  return { status, classification, reliable: true, basis, window, prior, recent, priorTotal, recentTotal, priorAverage, recentAverage, change, duration, lastMonth: recent.at(-1) };
}

function latestVsPreviousThree(series) {
  const window = series.slice(-4);
  if (window.length < 4 || !consecutiveMonths(window)) return { reliable: false, reason: "Necesitamos cuatro meses completos y consecutivos." };
  const latest = window.at(-1), previous = window.slice(0, 3);
  const previousAverage = previous.reduce((sum, item) => sum + item.value, 0) / 3;
  const change = previousAverage ? (latest.value - previousAverage) / previousAverage : latest.value ? null : 0;
  return { reliable: true, latest, previous, previousAverage, change, difference: latest.value - previousAverage };
}

function urgencyLevel(score) {
  return score >= 75 ? "Crítico" : score >= 45 ? "Importante" : "Observación";
}

function salesUrgency(panorama, latestComparison, confidence) {
  if (!panorama.reliable || panorama.status !== "VENTAS EN DESCENSO") return { score: 20, level: "Observación" };
  const magnitude = Math.abs(panorama.change || 0);
  const magnitudePoints = magnitude >= .70 ? 65 : magnitude >= .50 ? 55 : magnitude >= .30 ? 40 : magnitude >= .15 ? 27 : 15;
  const durationPoints = Math.min(15, (panorama.duration || 0) * 5);
  const latestDrop = latestComparison.reliable && latestComparison.change !== null ? Math.abs(Math.min(0, latestComparison.change)) : 0;
  const speedPoints = latestDrop >= .50 ? 15 : latestDrop >= .25 ? 9 : latestDrop >= .10 ? 4 : 0;
  const evidenceAdjustment = confidence < 65 ? -12 : confidence < 85 ? -4 : 0;
  const score = Math.max(0, Math.min(100, magnitudePoints + durationPoints + speedPoints + 10 + evidenceAdjustment));
  return { score, level: urgencyLevel(score), magnitude, duration: panorama.duration || 0, latestDrop };
}

function inventoryUrgency(type, metrics, confidence) {
  let magnitude = 0, speed = 0, base = 20;
  if (type === "stock-risk-general") {
    magnitude = metrics.riskSalesShare;
    const minimumCoverage = Math.min(...metrics.riskItems.map(item => item.coverageMonths ?? 99), 99);
    speed = minimumCoverage <= .5 ? 18 : minimumCoverage <= 1 ? 10 : 4;
    base = magnitude >= .60 ? 58 : magnitude >= .35 ? 44 : 30;
  } else if (type === "inventory-accumulation") {
    magnitude = Math.max(metrics.inventoryChange || 0, Math.abs(metrics.unitPanorama.change || 0));
    speed = (metrics.inventoryChange || 0) >= .30 ? 15 : 8;
    base = magnitude >= .50 ? 58 : magnitude >= .30 ? 44 : 32;
  } else {
    magnitude = metrics.excessInventoryShare;
    const noMovement = Math.max(metrics.noMovementShare || 0, metrics.staleMovementShare || 0);
    speed = noMovement >= .50 ? 15 : noMovement >= .30 ? 9 : 3;
    base = magnitude >= .70 ? 55 : magnitude >= .50 ? 42 : 30;
  }
  const evidenceAdjustment = confidence < 65 ? -12 : confidence < 85 ? -4 : 0;
  const score = Math.max(0, Math.min(100, base + speed + Math.min(20, magnitude * 20) + evidenceAdjustment));
  return { score, level: urgencyLevel(score), magnitude };
}

function productChangeDrivers(productMonthly, panorama) {
  if (!panorama.reliable) return [];
  const field = panorama.basis === "value" ? "revenue" : panorama.basis === "profit" ? "profit" : "units";
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
  const utilityValues = sales.map(row => numericValue(row.utilidad)).filter(Number.isFinite);
  const comparableSalesValues = sales.map(row => {
    const quantity = numericValue(row.cantidad);
    return Number.isFinite(numericValue(row.valorTotal)) ? numericValue(row.valorTotal) : quantity * numericValue(row.precio);
  }).filter(value => Number.isFinite(value) && value >= 0);
  const averageSalesValue = comparableSalesValues.length ? comparableSalesValues.reduce((sum, value) => sum + value, 0) / comparableSalesValues.length : 0;
  const utilityMode = utilityValues.length && utilityValues.every(value => Math.abs(value) <= 1) ? "margin-decimal"
    : utilityValues.length && averageSalesValue > 1000 && utilityValues.every(value => Math.abs(value) <= 100) ? "margin-percent" : "amount";
  let revenue = 0, units = 0, utility = 0, quantityRows = 0, valueRows = 0, utilityRows = 0;
  let utilityWeightedValue = 0, utilityWeight = 0;
  sales.forEach(row => {
    const quantity = numericValue(row.cantidad);
    const value = Number.isFinite(numericValue(row.valorTotal)) ? numericValue(row.valorTotal) : quantity * numericValue(row.precio);
    const rowUtility = numericValue(row.utilidad);
    const validQuantity = Number.isFinite(quantity) && quantity >= 0;
    const validValue = Number.isFinite(value) && value >= 0;
    const validUtility = Number.isFinite(rowUtility);
    if (validValue) { revenue += value; valueRows += 1; }
    if (validQuantity) { units += quantity; quantityRows += 1; }
    if (validUtility) {
      utilityRows += 1;
      if (utilityMode === "amount") utility += rowUtility;
      else if (validValue) {
        const margin = utilityMode === "margin-percent" ? rowUtility / 100 : rowUtility;
        utilityWeightedValue += margin * value;
        utilityWeight += value;
      }
    }
    const product = String(row.producto || "").trim();
    if (!product || (!validQuantity && !validValue)) return;
    byProduct[product] ||= { units: 0, revenue: 0, utility: 0 };
    if (validQuantity) byProduct[product].units += quantity;
    if (validValue) byProduct[product].revenue += value;
    if (validUtility && utilityMode === "amount") byProduct[product].utility += rowUtility;
    const productKey = normalize(product);
    salesByKey[productKey] ||= { units: 0, revenue: 0, label: product };
    if (validQuantity) salesByKey[productKey].units += quantity;
    if (validValue) salesByKey[productKey].revenue += value;
  });
  const quantityRate = sales.length ? quantityRows / sales.length : 0;
  const valueRate = sales.length ? valueRows / sales.length : 0;
  const utilityRate = sales.length ? utilityRows / sales.length : 0;
  if (utilityMode !== "amount") utility = utilityWeight ? utilityWeightedValue / utilityWeight : NaN;
  const customerRate = sales.length ? sales.filter(row => String(row.cliente || "").trim()).length / sales.length : 0;
  const sellerRate = sales.length ? sales.filter(row => String(row.vendedor || "").trim()).length / sales.length : 0;
  const rankingBasis = valueRate >= .7 ? "value" : quantityRate >= .7 ? "quantity" : valueRows > quantityRows ? "value" : "quantity";
  const basisValue = item => rankingBasis === "value" ? item.revenue : item.units;
  const ranked = Object.entries(byProduct).sort((a, b) => basisValue(b[1]) - basisValue(a[1]));
  const basisTotal = rankingBasis === "value" ? revenue : units;
  const topShare = basisTotal && ranked[0] ? basisValue(ranked[0][1]) / basisTotal : 0;
  const monthlyValue = {}, monthlyUnits = {}, monthlyUtility = {}, monthlyUtilityWeighted = {}, monthlyUtilityWeights = {};
  sales.forEach(row => {
    const date = new Date(row.fecha), quantity = numericValue(row.cantidad);
    const value = Number.isFinite(numericValue(row.valorTotal)) ? numericValue(row.valorTotal) : quantity * numericValue(row.precio);
    const rowUtility = numericValue(row.utilidad);
    if (Number.isNaN(date.getTime())) return;
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    if (Number.isFinite(value) && value >= 0) monthlyValue[key] = (monthlyValue[key] || 0) + value;
    if (Number.isFinite(quantity) && quantity >= 0) monthlyUnits[key] = (monthlyUnits[key] || 0) + quantity;
    if (Number.isFinite(rowUtility)) {
      if (utilityMode === "amount") monthlyUtility[key] = (monthlyUtility[key] || 0) + rowUtility;
      else if (Number.isFinite(value) && value >= 0) {
        const margin = utilityMode === "margin-percent" ? rowUtility / 100 : rowUtility;
        monthlyUtilityWeighted[key] = (monthlyUtilityWeighted[key] || 0) + margin * value;
        monthlyUtilityWeights[key] = (monthlyUtilityWeights[key] || 0) + value;
      }
    }
    const product = String(row.producto || "").trim();
    if (product) {
      const productKey = normalize(product);
      productMonthly[productKey] ||= { key: productKey, label: product, months: {} };
      productMonthly[productKey].months[key] ||= { units: 0, revenue: 0, profit: 0 };
      if (Number.isFinite(value) && value >= 0) productMonthly[productKey].months[key].revenue += value;
      if (Number.isFinite(quantity) && quantity >= 0) productMonthly[productKey].months[key].units += quantity;
      if (Number.isFinite(rowUtility) && utilityMode === "amount") productMonthly[productKey].months[key].profit += rowUtility;
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
  if (utilityMode !== "amount") for (const [key, weightedValue] of Object.entries(monthlyUtilityWeighted)) if (monthlyUtilityWeights[key]) monthlyUtility[key] = weightedValue / monthlyUtilityWeights[key];
  const chartBasis = valueRate >= .7 ? "value" : quantityRate >= .7 ? "quantity" : null;
  const monthlyMap = chartBasis === "value" ? monthlyValue : chartBasis === "quantity" ? monthlyUnits : {};
  const currentMonth = `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, "0")}`;
  const allMonthly = Object.entries(monthlyMap).sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => ({ month, value }));
  const monthly = allMonthly.filter(item => item.month < currentMonth);
  const completeMonthlyValue = Object.entries(monthlyValue).sort(([a], [b]) => a.localeCompare(b)).filter(([month]) => month < currentMonth).map(([month, value]) => ({ month, value }));
  const completeMonthlyUnits = Object.entries(monthlyUnits).sort(([a], [b]) => a.localeCompare(b)).filter(([month]) => month < currentMonth).map(([month, value]) => ({ month, value }));
  const completeMonthlyUtility = Object.entries(monthlyUtility).sort(([a], [b]) => a.localeCompare(b)).filter(([month]) => month < currentMonth).map(([month, value]) => ({ month, value }));
  const panorama = salesPanorama(monthly, chartBasis);
  const unitPanorama = salesPanorama(completeMonthlyUnits, quantityRate >= .7 ? "quantity" : null);
  const valuePanorama = salesPanorama(completeMonthlyValue, valueRate >= .7 ? "value" : null);
  const utilityPanorama = salesPanorama(completeMonthlyUtility, utilityRate >= .7 ? utilityMode === "amount" ? "profit" : "margin" : null);
  const latestComparison = latestVsPreviousThree(monthly);
  const latestUnitComparison = latestVsPreviousThree(completeMonthlyUnits);
  const latestValueComparison = latestVsPreviousThree(completeMonthlyValue);
  const latestUtilityComparison = latestVsPreviousThree(completeMonthlyUtility);
  const productDrivers = productChangeDrivers(productMonthly, panorama);
  const utilityDrivers = utilityMode === "amount" ? productChangeDrivers(productMonthly, utilityPanorama).map(item => ({ ...item, dimension: "utilidad" })) : [];
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
    const lastMovementDate = new Date(row.ultimoMovimiento);
    const daysSinceLastMovement = Number.isNaN(lastMovementDate.getTime()) ? null : Math.max(0, Math.floor((referenceDate - lastMovementDate) / 86400000));
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
      daysSinceLastMovement,
      linked
    };
  });
  const linkedProducts = new Set(inv.filter(row => row.linked).map(row => normalize(row.producto))).size;
  const relationCoverage = Object.keys(salesByKey).length ? linkedProducts / Object.keys(salesByKey).length : 0;
  const canCompareInventoryMovement = quantityRate >= .7 && recentUnitMonths.length > 0;
  const excessItems = canCompareInventoryMovement ? inv.filter(row => row.linked && row.stock > 0 && (row.recentSold === 0 || row.coverageMonths >= 6 || (row.stockShare >= .15 && row.recentSalesShare <= .05))).sort((a, b) => b.stockShare - a.stockShare) : [];
  const riskItems = canCompareInventoryMovement ? inv.filter(row => row.linked && row.recentSold > 0 && row.coverageMonths !== null && row.coverageMonths <= 1.5 && row.recentSalesShare >= .05).sort((a, b) => b.recentSalesShare - a.recentSalesShare) : [];
  const noMovementItems = canCompareInventoryMovement ? inv.filter(row => row.linked && row.stock > 0 && row.recentSold === 0).sort((a, b) => b.stock - a.stock) : [];
  const staleMovementItems = inv.filter(row => row.stock > 0 && row.daysSinceLastMovement !== null && row.daysSinceLastMovement >= 180).sort((a, b) => b.stock - a.stock);
  const excessInventoryShare = currentInventoryUnits ? excessItems.reduce((sum, row) => sum + row.stock, 0) / currentInventoryUnits : 0;
  const riskSalesShare = recentUnitsTotal ? riskItems.reduce((sum, row) => sum + row.recentSold, 0) / recentUnitsTotal : 0;
  const noMovementShare = currentInventoryUnits ? noMovementItems.reduce((sum, row) => sum + row.stock, 0) / currentInventoryUnits : 0;
  const staleMovementShare = currentInventoryUnits ? staleMovementItems.reduce((sum, row) => sum + row.stock, 0) / currentInventoryUnits : 0;
  const inventoryChange = inventoryHistory.length >= 2 && inventoryHistory.at(-2).units
    ? (inventoryHistory.at(-1).units - inventoryHistory.at(-2).units) / inventoryHistory.at(-2).units : null;
  const inventoryStatus = !inv.length ? "INFORMACIÓN INSUFICIENTE"
    : !linkedProducts && sales.length ? "INFORMACIÓN INSUFICIENTE"
      : Math.max(noMovementShare, staleMovementShare) >= .30 ? "INVENTARIO SIN MOVIMIENTO"
        : excessInventoryShare >= .30 ? "EXCESO DE INVENTARIO"
          : riskSalesShare >= .20 ? "RIESGO DE FALTA DE INVENTARIO" : "INVENTARIO EQUILIBRADO";
  const slowItems = excessItems;
  const slowUnits = slowItems.reduce((sum, row) => sum + row.stock, 0);
  const slowValue = slowItems.reduce((sum, row) => sum + (Number.isFinite(row.cost) ? row.stock * row.cost : 0), 0);
  const slowSales = slowItems.reduce((sum, row) => sum + row.sold, 0);
  const stockout = riskItems[0];
  const inventoryValue = inv.reduce((sum, row) => sum + (Number.isFinite(row.cost) ? row.stock * row.cost : 0), 0);
  const inventoryUnits = inv.reduce((sum, row) => sum + row.stock, 0);
  const inventoryCostRate = inv.length ? inv.filter(row => Number.isFinite(row.cost) && row.cost >= 0).length / inv.length : 0;
  return {
    revenue, units, utility, utilityMode, quantityRows, valueRows, utilityRows, quantityRate, valueRate, utilityRate, customerRate, sellerRate, ranked, rankingBasis, chartBasis, topShare,
    monthly, allMonthly, currentMonthExcluded: allMonthly.some(item => item.month === currentMonth),
    lastCompleteMonth: monthly.at(-1)?.month || null,
    monthlyValue: completeMonthlyValue, monthlyUnits: completeMonthlyUnits, monthlyUtility: completeMonthlyUtility,
    panorama, unitPanorama, valuePanorama, utilityPanorama, latestComparison, latestUnitComparison, latestValueComparison, latestUtilityComparison, productDrivers, customerDrivers, sellerDrivers, utilityDrivers, productChanges,
    priorAverage, recentAverage, trendChange, trendSustained, inv, inventoryValue, inventoryUnits, slowItems, slowUnits,
    slowValue, slowSales, stockout, excessItems, riskItems, noMovementItems, staleMovementItems, excessInventoryShare, riskSalesShare, noMovementShare, staleMovementShare,
    inventoryHistory: inventoryHistory.map(item => ({ date: item.date, units: item.units })), inventoryChange, inventoryStatus,
    recentUnitsTotal, period, products: inv.length, salesProducts: ranked.length, linkedProducts,
    relationCoverage, inventoryCostRate,
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
  const score = priorityScore(factors);
  return {
    ...finding,
    dominio: finding.dominio || "empresarial",
    tipoProblema: finding.tipoProblema || finding.type || "situacion-por-revisar",
    problemaGeneral: finding.problemaGeneral || finding.title || "Situación por revisar",
    magnitud: finding.magnitud ?? null,
    unidad: finding.unidad || "",
    periodo: finding.periodo || "Periodo disponible",
    evidencia: finding.evidencia || [finding.reason, finding.evidence].filter(Boolean),
    causasObservadas: finding.causasObservadas || [],
    aportePorCausa: finding.aportePorCausa || [],
    hipotesisPorValidar: finding.hipotesisPorValidar || [],
    limitaciones: finding.limitaciones || [],
    focosPrioritarios: (finding.focosPrioritarios || []).slice(0, 3),
    calidadInformacion: finding.calidadInformacion || { nivel: factors.confidence >= 85 ? "Alta" : factors.confidence >= 65 ? "Media" : "Baja", porcentaje: Math.round(factors.confidence) },
    impacto: Math.round(factors.impact),
    urgencia: Math.round(factors.urgency),
    nivelUrgencia: finding.nivelUrgencia || urgencyLevel(factors.urgency),
    alcance: Math.round(factors.reach),
    prioridad: score,
    priorityFactors: factors,
    priorityScore: score
  };
}

function utilityDisplay(metrics, value) {
  return metrics.utilityMode === "amount" ? money.format(value) : readablePercent(value);
}

function utilityName(metrics) {
  return metrics.utilityMode === "amount" ? "utilidad" : "margen";
}

function observedSalesCauses(metrics) {
  const panorama = metrics.panorama;
  if (!panorama.reliable || panorama.status !== "VENTAS EN DESCENSO") return { causes: [], contributions: [], drivers: [], foci: [] };
  const amount = value => panorama.basis === "value" ? money.format(value) : `${readableNumber(value)} unidades`;
  const comparisonAmount = value => panorama.basis === "value" ? `${amount(value)} vendidos` : amount(value);
  const candidates = [];
  metrics.productDrivers.filter(item => item.delta < 0 && item.contribution >= .05).slice(0, 3).forEach(driver => candidates.push({
    categoria: "Productos", rank: driver.contribution, driver,
    texto: `${productSubject(driver.product, true)} explica ${percent(driver.contribution)} de la reducción de las ventas: pasó de ${comparisonAmount(driver.priorTotal)} a ${comparisonAmount(driver.recentTotal)} en los dos periodos comparados.`,
    contribution: { factor: driver.product, dimension: "producto", aporte: driver.contribution, unidad: "proporción de la reducción", evidencia: `Dejó de aportar ${amount(Math.abs(driver.delta))}.` }
  }));
  const inactiveCustomers = metrics.customerRate >= .70 ? metrics.customerDrivers.filter(item => item.priorTotal > 0 && item.recentTotal === 0) : [];
  const decliningCustomer = metrics.customerRate >= .70 ? metrics.customerDrivers.filter(item => item.delta < 0).sort((a, b) => b.contribution - a.contribution)[0] : null;
  if (inactiveCustomers.length) {
    const priorTotal = inactiveCustomers.reduce((sum, item) => sum + item.priorTotal, 0);
    const contribution = inactiveCustomers.reduce((sum, item) => sum + item.contribution, 0);
    const priorShare = panorama.priorTotal ? priorTotal / panorama.priorTotal : 0;
    candidates.push({ categoria: "Clientes", rank: contribution, driver: inactiveCustomers[0],
      texto: `${inactiveCustomers.length} ${inactiveCustomers.length === 1 ? "cliente que antes compraba no registró" : "clientes que antes compraban no registraron"} ventas en los tres meses recientes; representaban ${percent(priorShare)} de las ventas anteriores.`,
      contribution: { factor: "Clientes sin ventas recientes", dimension: "cliente", aporte: contribution, unidad: "proporción de la reducción", evidencia: `Antes aportaban ${amount(priorTotal)}.` }
    });
  } else if (decliningCustomer && decliningCustomer.contribution >= .10) {
    candidates.push({ categoria: "Clientes", rank: decliningCustomer.contribution, driver: decliningCustomer,
      texto: `${decliningCustomer.product} explica ${percent(decliningCustomer.contribution)} de la reducción: sus compras pasaron de ${amount(decliningCustomer.priorTotal)} a ${amount(decliningCustomer.recentTotal)}.`,
      contribution: { factor: decliningCustomer.product, dimension: "cliente", aporte: decliningCustomer.contribution, unidad: "proporción de la reducción", evidencia: `Sus compras bajaron ${percent(Math.abs(decliningCustomer.change || 0))}.` }
    });
  }
  const sellers = metrics.sellerRate >= .70 ? metrics.sellerDrivers.filter(item => item.delta < 0 && item.contribution >= .05).slice(0, 2) : [];
  if (sellers.length) {
    const sellerContribution = sellers.reduce((sum, item) => sum + item.contribution, 0);
    const sellerLoss = sellers.reduce((sum, item) => sum + Math.abs(item.delta), 0);
    candidates.push({ categoria: "Comerciales", rank: sellerContribution, driver: sellers[0],
      texto: `${sellers.length === 1 ? `Las ventas asociadas con ${sellers[0].product}` : `${sellers.length} comerciales`} explican ${percent(sellerContribution)} de la reducción, equivalente a ${amount(sellerLoss)}.`,
      contribution: { factor: sellers.length === 1 ? sellers[0].product : "Comerciales con menor venta", dimension: "comercial", aporte: sellerContribution, unidad: "proporción de la reducción", evidencia: sellers.map(item => `${item.product}: ${percent(Math.abs(item.change || 0))} menos`).join("; ") }
    });
  }
  if (metrics.unitPanorama.reliable && metrics.valuePanorama.reliable && (metrics.unitPanorama.change < 0 || metrics.valuePanorama.change < 0)) {
    const unitDrop = Math.abs(Math.min(0, metrics.unitPanorama.change || 0));
    const valueDrop = Math.abs(Math.min(0, metrics.valuePanorama.change || 0));
    candidates.push({ categoria: "Cantidad y valor", rank: Math.max(unitDrop, valueDrop),
      texto: `Las unidades bajaron ${percent(unitDrop)} y el valor vendido bajó ${percent(valueDrop)} en los mismos dos periodos de tres meses.`,
      contribution: { factor: "Cantidad y valor vendido", dimension: "cantidad-valor", aporte: Math.max(unitDrop, valueDrop), unidad: "variación porcentual", evidencia: "La diferencia entre ambas variaciones merece revisión; no demuestra por sí sola un cambio de precio." }
    });
  }
  if (metrics.utilityRate >= .70 && metrics.utilityPanorama.reliable && metrics.utilityPanorama.change < 0) {
    candidates.push({ categoria: utilityName(metrics)[0].toUpperCase() + utilityName(metrics).slice(1), rank: Math.abs(metrics.utilityPanorama.change), driver: metrics.utilityDrivers.find(item => item.delta < 0),
      texto: `El ${utilityName(metrics)} bajó ${percent(Math.abs(metrics.utilityPanorama.change))}: pasó de ${utilityDisplay(metrics, metrics.utilityPanorama.priorAverage)} a ${utilityDisplay(metrics, metrics.utilityPanorama.recentAverage)} en promedio mensual.`,
      contribution: { factor: utilityName(metrics), dimension: "utilidad", aporte: Math.abs(metrics.utilityPanorama.change), unidad: "variación porcentual", evidencia: `Calculado únicamente con registros que incluyen ${utilityName(metrics)} utilizable.` }
    });
  }
  if (metrics.relationCoverage >= .50 && metrics.excessInventoryShare >= .30) candidates.push({ categoria: "Inventario", rank: metrics.excessInventoryShare,
    texto: `${percent(metrics.excessInventoryShare)} de las existencias está en productos con poco o ningún movimiento reciente.`,
    contribution: { factor: "Existencias frente a ventas", dimension: "inventario", aporte: metrics.excessInventoryShare, unidad: "proporción de las existencias", evidencia: "Solo se compararon productos relacionados con suficiente claridad." }
  });
  const foci = candidates.sort((a, b) => b.rank - a.rank).slice(0, 3);
  return { causes: foci.map(item => item.texto), contributions: foci.map(item => item.contribution), drivers: foci.map(item => item.driver).filter(Boolean), foci };
}

function salesHypotheses(foci) {
  const dimensions = new Set(foci.map(item => item.contribution.dimension));
  const hypotheses = [];
  if (dimensions.has("cliente")) hypotheses.push("Cambios en las necesidades, precio, servicio, competencia o contacto comercial de los clientes señalados.");
  if (dimensions.has("producto")) hypotheses.push("Cambios de disponibilidad, precio, competencia o demanda de los productos señalados.");
  if (dimensions.has("comercial")) hypotheses.push("Cambios en clientes activos, actividad, oportunidades o cobertura de los comerciales señalados.");
  if (dimensions.has("cantidad-valor")) hypotheses.push("Cambios en mezcla de productos, precios o descuentos.");
  if (dimensions.has("utilidad")) hypotheses.push("Cambios en costos, descuentos o mezcla de productos.");
  if (dimensions.has("inventario")) hypotheses.push("Cambios en demanda, reposición o disponibilidad.");
  return hypotheses.slice(0, 4);
}

function urgencyReviewPrefix(level) {
  return level === "Crítico" ? "Esto requiere atención inmediata." : level === "Importante" ? "Revisa esta situación esta semana." : "Conviene revisar esta situación.";
}

function salesAnalysisModule({ metrics, scope, evidenceConfidence }) {
  if (!scope.hasSales) return [];
  const findings = [], panorama = metrics.panorama;
  const measureName = panorama.basis === "value" ? "valor vendido" : "unidades vendidas";
  const amount = value => panorama.basis === "value" ? money.format(value) : `${readableNumber(value)} unidades`;
  const observed = observedSalesCauses(metrics);
  const urgency = salesUrgency(panorama, metrics.latestComparison, evidenceConfidence);
  if (panorama.reliable && panorama.status === "VENTAS EN DESCENSO") findings.push(scored({
    type: "business-decline", level: "general", dominio: "ventas", tipoProblema: "caida-general",
    title: "Tus ventas vienen bajando.", problemaGeneral: "Caída general de ventas",
    magnitud: Math.abs(panorama.change) * 100, unidad: "porcentaje",
    periodo: `${panorama.prior[0].month} a ${panorama.recent.at(-1).month}`,
    reason: `En los últimos tres meses vendiste ${percent(Math.abs(panorama.change))} menos que en los tres meses anteriores.`,
    evidence: `El promedio mensual pasó de ${amount(panorama.priorAverage)} a ${amount(panorama.recentAverage)}.`,
    meaning: observed.causes.length > 1 ? "La reducción aparece en varios frentes observados y no está explicada por un único producto." : "El negocio está vendiendo menos de lo que venía vendiendo.",
    reviewFocus: `${urgencyReviewPrefix(urgency.level)} ${observed.foci.length ? observed.foci.map(item => item.texto).join(" ") : "Revisa la caída general y la información que falta para explicarla."}`,
    indicator: panorama.basis === "value" ? "Valor vendido del último mes completo y promedio mensual reciente." : "Unidades vendidas del último mes completo y promedio mensual reciente.",
    nivelUrgencia: urgency.level,
    magnitudDetalle: {
      porcentaje: panorama.change,
      unidadesDejadasDeVender: metrics.unitPanorama.reliable ? Math.max(0, metrics.unitPanorama.priorTotal - metrics.unitPanorama.recentTotal) : null,
      valorDejadoDeVender: metrics.valuePanorama.reliable ? Math.max(0, metrics.valuePanorama.priorTotal - metrics.valuePanorama.recentTotal) : null,
      mesesRecientesBajoPromedioAnterior: panorama.duration,
      ultimoMesVsTresAnteriores: metrics.latestComparison.reliable ? metrics.latestComparison.change : null
    },
    causasObservadas: observed.causes, aportePorCausa: observed.contributions, drivers: observed.drivers,
    focosPrioritarios: observed.foci.map(item => ({ categoria: item.categoria, evidencia: item.texto, aporte: item.contribution.aporte, unidad: item.contribution.unidad })),
    hipotesisPorValidar: salesHypotheses(observed.foci),
    limitaciones: ["Los datos muestran qué cambió, pero no demuestran por sí solos por qué ocurrió."],
    datosAnalizados: { medida: measureName, meses: 6 }
  }, { impact: Math.min(100, Math.abs(panorama.change) * 260), urgency: urgency.score, reach: 100, confidence: evidenceConfidence }));
  if (panorama.reliable && panorama.status === "VENTAS EN CRECIMIENTO") findings.push(scored({
    type: "sales-growth", dominio: "ventas", tipoProblema: "crecimiento-general", title: "Tus ventas vienen aumentando.", problemaGeneral: "Crecimiento general de ventas",
    magnitud: panorama.change === null ? null : panorama.change * 100, unidad: "porcentaje", periodo: `${panorama.prior[0].month} a ${panorama.recent.at(-1).month}`,
    reason: panorama.change === null ? "Las ventas recientes partieron de un periodo anterior sin ventas registradas." : `En los últimos tres meses vendiste ${percent(panorama.change)} más que en los tres meses anteriores.`,
    evidence: `El promedio mensual pasó de ${amount(panorama.priorAverage)} a ${amount(panorama.recentAverage)}.`, meaning: "El negocio está vendiendo más que en el periodo anterior.", reviewFocus: "Si el crecimiento está repartido o depende de pocos productos, clientes o comerciales.",
    indicator: panorama.basis === "value" ? "Valor vendido por mes." : "Unidades vendidas por mes.",
    causasObservadas: metrics.productDrivers.filter(item => item.delta > 0 && item.contribution >= .10).slice(0, 3).map(item => `${productSubject(item.product, true)} aporta ${percent(item.contribution)} del crecimiento observado.`),
    aportePorCausa: metrics.productDrivers.filter(item => item.delta > 0 && item.contribution >= .10).slice(0, 3).map(item => ({ factor: item.product, dimension: "producto", aporte: item.contribution, unidad: "proporción del crecimiento", evidencia: `Pasó de ${amount(item.priorTotal)} a ${amount(item.recentTotal)}.` })),
    hipotesisPorValidar: ["Mayor demanda.", "Cambios de precio, disponibilidad o actividad comercial."], limitaciones: ["Los datos muestran dónde creció la venta, pero no demuestran por qué ocurrió."]
  }, { impact: Math.min(80, (panorama.change || .3) * 180), urgency: 35, reach: 100, confidence: evidenceConfidence }));
  if (panorama.reliable && panorama.status === "VENTAS ESTABLES") findings.push(scored({
    type: "sales-stability", dominio: "ventas", tipoProblema: "estabilidad-general", title: "Tus ventas se mantienen estables.", problemaGeneral: "Ventas estables",
    magnitud: Math.abs(panorama.change || 0) * 100, unidad: "variación porcentual", periodo: `${panorama.prior[0].month} a ${panorama.recent.at(-1).month}`,
    reason: `La diferencia entre los dos periodos de tres meses fue de ${percent(Math.abs(panorama.change || 0))}.`, evidence: `El promedio mensual reciente fue ${amount(panorama.recentAverage)} frente a ${amount(panorama.priorAverage)} anteriormente.`,
    meaning: "El total se mantiene cerca del periodo anterior, aunque algunos productos pueden haber cambiado.", reviewFocus: "Los cambios internos que pueden quedar ocultos detrás de un total estable.", indicator: panorama.basis === "value" ? "Valor vendido por mes." : "Unidades vendidas por mes.",
    causasObservadas: [], aportePorCausa: [], hipotesisPorValidar: [], limitaciones: ["Un total estable puede ocultar aumentos y reducciones entre productos."]
  }, { impact: 30, urgency: 25, reach: 100, confidence: evidenceConfidence }));
  if (metrics.utilityRate >= .70 && metrics.utilityPanorama.reliable && metrics.utilityPanorama.change <= -.10) {
    const utilityUrgency = salesUrgency(metrics.utilityPanorama, metrics.latestUtilityComparison, evidenceConfidence);
    const utilityMetric = utilityName(metrics);
    const utilityDrivers = metrics.utilityDrivers.filter(item => item.delta < 0 && item.contribution >= .05).slice(0, 3);
    const utilityFoci = utilityDrivers.map(item => ({ categoria: "Productos", evidencia: `${productSubject(item.product, true)} explica ${percent(item.contribution)} de la reducción de la utilidad: pasó de ${money.format(item.priorTotal)} a ${money.format(item.recentTotal)}.`, aporte: item.contribution, unidad: "proporción de la reducción de utilidad" }));
    findings.push(scored({
      type: "profit-decline", level: "general", dominio: "ventas", tipoProblema: `caida-${utilityMetric}`, title: utilityUrgency.level === "Crítico" ? `El ${utilityMetric} requiere atención inmediata.` : `El ${utilityMetric} viene bajando.`, problemaGeneral: `Caída general de ${utilityMetric}`,
      magnitud: Math.abs(metrics.utilityPanorama.change) * 100, unidad: "porcentaje", periodo: `${metrics.utilityPanorama.prior[0].month} a ${metrics.utilityPanorama.recent.at(-1).month}`,
      reason: `En los últimos tres meses el ${utilityMetric} fue ${percent(Math.abs(metrics.utilityPanorama.change))} menor que en los tres meses anteriores.`,
      evidence: metrics.utilityMode === "amount" ? `La utilidad pasó de ${money.format(metrics.utilityPanorama.priorTotal)} a ${money.format(metrics.utilityPanorama.recentTotal)} entre los periodos comparados.` : `El margen mensual promedio pasó de ${utilityDisplay(metrics, metrics.utilityPanorama.priorAverage)} a ${utilityDisplay(metrics, metrics.utilityPanorama.recentAverage)}.`,
      meaning: metrics.valuePanorama.reliable && Math.abs(metrics.valuePanorama.change || 0) < .10 ? `El valor vendido se mantiene cerca del periodo anterior, pero el ${utilityMetric} es menor.` : `El ${utilityMetric} está disminuyendo junto con otros cambios observados en las ventas.`,
      reviewFocus: `${urgencyReviewPrefix(utilityUrgency.level)} ${utilityFoci.length ? utilityFoci.map(item => item.evidencia).join(" ") : `Revisa la reducción general del ${utilityMetric}.`}`,
      indicator: `${utilityMetric[0].toUpperCase() + utilityMetric.slice(1)} del último mes completo y promedio mensual reciente.`, nivelUrgencia: utilityUrgency.level,
      magnitudDetalle: { porcentaje: metrics.utilityPanorama.change, valorDejadoDeGenerar: metrics.utilityMode === "amount" ? Math.max(0, metrics.utilityPanorama.priorTotal - metrics.utilityPanorama.recentTotal) : null, puntosPorcentuales: metrics.utilityMode === "amount" ? null : (metrics.utilityPanorama.recentAverage - metrics.utilityPanorama.priorAverage) * 100, mesesRecientesBajoPromedioAnterior: metrics.utilityPanorama.duration },
      causasObservadas: utilityFoci.map(item => item.evidencia),
      aportePorCausa: utilityFoci.map(item => ({ factor: item.evidencia.split(" explica")[0], dimension: "utilidad", aporte: item.aporte, unidad: item.unidad, evidencia: item.evidencia })),
      focosPrioritarios: utilityFoci,
      hipotesisPorValidar: ["Cambios en costos, descuentos, precios o mezcla de productos."],
      limitaciones: [`El ${utilityMetric} muestra el resultado registrado, pero no explica por sí solo qué decisión lo produjo.`]
    }, { impact: Math.min(100, Math.abs(metrics.utilityPanorama.change) * 240), urgency: utilityUrgency.score, reach: 100, confidence: evidenceConfidence }));
  }
  if (metrics.ranked[0] && metrics.topShare >= .6) findings.push(scored({
    type: "concentration", dominio: "ventas", tipoProblema: "dependencia-producto", title: `Gran parte de tus ventas depende de ${metrics.ranked[0][0]}.`,
    problemaGeneral: "Dependencia de pocos productos", magnitud: metrics.topShare * 100, unidad: "porcentaje de las ventas", periodo: "Periodo completo disponible",
    reason: `${metrics.ranked[0][0]} representa ${percent(metrics.topShare)} ${metrics.rankingBasis === "value" ? "del valor vendido" : "de las unidades vendidas"}.`,
    evidence: metrics.rankingBasis === "value" ? `De ${money.format(metrics.revenue)} vendidos, ${money.format(metrics.ranked[0][1].revenue)} provienen de ese producto.` : `De ${metrics.units} unidades vendidas, ${metrics.ranked[0][1].units} corresponden a ese producto.`,
    meaning: "Una reducción en ese producto puede afectar una parte importante de las ventas observadas.", reviewFocus: "Si esta dependencia continúa en otros periodos.",
    indicator: "Porcentaje de las ventas que representa el producto principal.",
    causasObservadas: [`${metrics.ranked[0][0]} concentra ${percent(metrics.topShare)} de las ventas observadas.`],
    aportePorCausa: [{ factor: metrics.ranked[0][0], dimension: "producto", aporte: metrics.topShare, unidad: "proporción de las ventas", evidencia: "Calculado sobre el periodo completo disponible." }],
    hipotesisPorValidar: ["Preferencia de los clientes.", "Diferencias de disponibilidad, precio o exhibición."],
    limitaciones: ["La concentración describe la distribución de las ventas; no explica por qué los clientes prefieren ese producto."]
  }, { impact: metrics.topShare * 100, urgency: 45, reach: metrics.topShare * 100, confidence: evidenceConfidence }));
  return findings;
}

function inventoryAnalysisModule({ metrics, scope, inventoryConfidence, evidenceConfidence }) {
  const findings = [];
  if (!scope.hasInventory) return findings;
  const inventoryLeaders = [...metrics.inv].sort((a, b) => b.stockShare - a.stockShare).slice(0, 3);
  const inventoryConcentration = inventoryLeaders.reduce((sum, item) => sum + item.stockShare, 0);
  if (inventoryLeaders.length && inventoryConcentration >= .60) findings.push(scored({
    type: "inventory-concentration", dominio: "inventario", tipoProblema: "concentracion-inventario", title: "Gran parte de las existencias está concentrada en pocos productos.", problemaGeneral: "Concentración de inventario",
    magnitud: inventoryConcentration * 100, unidad: "porcentaje de las existencias", periodo: "Corte actual de inventario",
    reason: `${inventoryLeaders.map(item => item.producto).join(", ")} concentran ${percent(inventoryConcentration)} de las unidades disponibles.`,
    evidence: `${readableNumber(inventoryLeaders.reduce((sum, item) => sum + item.stock, 0))} de ${readableNumber(metrics.inventoryUnits)} unidades están en esos productos.`,
    meaning: "La mayor parte del inventario depende de pocos productos; esto no indica por sí solo si existe exceso.", reviewFocus: "Si esos productos también tienen movimiento de ventas suficiente.", indicator: "Porcentaje de las existencias concentrado en los principales productos.",
    causasObservadas: inventoryLeaders.map(item => `${productSubject(item.producto, true)} representa ${percent(item.stockShare)} de las existencias actuales.`),
    aportePorCausa: inventoryLeaders.map(item => ({ factor: item.producto, dimension: "producto", aporte: item.stockShare, unidad: "proporción de las existencias", evidencia: `${readableNumber(item.stock)} unidades disponibles.` })),
    focosPrioritarios: inventoryLeaders.map(item => ({ categoria: "Producto", evidencia: `${productSubject(item.producto, true)} representa ${percent(item.stockShare)} de las existencias actuales y tiene ${readableNumber(item.stock)} unidades disponibles.`, aporte: item.stockShare, unidad: "proporción de las existencias" })),
    hipotesisPorValidar: ["Política de compras.", "Demanda esperada.", "Tamaño de lote de proveedores."], limitaciones: ["La concentración actual no permite afirmar que exista exceso sin comparar movimiento o historia."]
  }, { impact: inventoryConcentration * 70, urgency: 35, reach: inventoryConcentration * 100, confidence: evidenceConfidence }));
  if (metrics.staleMovementShare >= .30) {
    const staleUrgency = inventoryUrgency("inventory-excess", { ...metrics, excessInventoryShare: metrics.staleMovementShare }, evidenceConfidence);
    const staleFoci = metrics.staleMovementItems.slice(0, 3).map(item => ({ categoria: "Producto", evidencia: `${productSubject(item.producto, true)} tiene ${readableNumber(item.stock)} unidades y registra ${readableNumber(item.daysSinceLastMovement)} días desde su último movimiento.`, aporte: item.stockShare, unidad: "proporción de las existencias" }));
    findings.push(scored({
      type: "inventory-no-movement", level: "general", dominio: "inventario", tipoProblema: "productos-sin-movimiento", title: staleUrgency.level === "Crítico" ? "El inventario sin movimiento requiere atención inmediata." : "Una parte importante del inventario no registra movimiento reciente.", problemaGeneral: "Productos sin movimiento reciente",
      magnitud: metrics.staleMovementShare * 100, unidad: "porcentaje de las existencias", periodo: "Corte actual y fecha del último movimiento",
      reason: `${percent(metrics.staleMovementShare)} de las existencias está en productos cuyo último movimiento fue hace 180 días o más.`,
      evidence: `${metrics.staleMovementItems.length} ${metrics.staleMovementItems.length === 1 ? "producto reúne" : "productos reúnen"} ${readableNumber(metrics.staleMovementItems.reduce((sum, item) => sum + item.stock, 0))} unidades sin movimiento reciente registrado.`,
      meaning: "Una parte importante del inventario está concentrada en productos que no registran movimiento reciente.", reviewFocus: `${urgencyReviewPrefix(staleUrgency.level)} ${staleFoci.map(item => item.evidencia).join(" ")}`,
      indicator: "Unidades y días desde el último movimiento.", nivelUrgencia: staleUrgency.level,
      magnitudDetalle: { porcentajeExistenciasAfectadas: metrics.staleMovementShare, productosAfectados: metrics.staleMovementItems.length },
      causasObservadas: staleFoci.map(item => item.evidencia),
      aportePorCausa: staleFoci.map(item => ({ factor: item.evidencia.split(" tiene")[0], dimension: "producto", aporte: item.aporte, unidad: item.unidad, evidencia: item.evidencia })),
      focosPrioritarios: staleFoci,
      hipotesisPorValidar: ["Cambios en demanda, compras, sustitución o disponibilidad comercial."],
      limitaciones: ["La fecha del último movimiento muestra inactividad registrada, pero no explica por qué ocurrió."]
    }, { impact: Math.min(100, metrics.staleMovementShare * 130), urgency: staleUrgency.score, reach: metrics.staleMovementShare * 100, confidence: evidenceConfidence }));
  }
  if (!scope.hasSales) findings.push(scored({
    type: "inventory-only", dominio: "inventario", tipoProblema: "informacion-incompleta", title: "Agrega ventas antes de decidir qué producto atender.",
    problemaGeneral: "Inventario sin información de movimiento", magnitud: metrics.inventoryUnits, unidad: "unidades disponibles", periodo: "Corte actual de inventario",
    reason: `Encontramos ${metrics.products} productos y ${metrics.inventoryUnits} unidades disponibles, pero ninguna venta.`,
    evidence: metrics.inventoryValue ? `El costo registrado del inventario es ${money.format(metrics.inventoryValue)}.` : "No hay ventas que permitan comparar movimiento por producto.",
    meaning: "Sin ventas o movimientos no podemos afirmar qué producto se vende, permanece almacenado o podría agotarse.", reviewFocus: "La disponibilidad de registros de ventas para completar el diagnóstico.",
    indicator: "Número de registros de ventas disponibles.", limitaciones: ["No encontramos ventas para medir el movimiento del inventario."],
    hipotesisPorValidar: []
  }, { impact: 80, urgency: 45, reach: 100, confidence: 100 }));
  if (!scope.hasSales || !metrics.linkedProducts) return findings;
  if (metrics.inventoryChange === null && metrics.excessInventoryShare >= .30) {
    const excessUrgency = inventoryUrgency("inventory-excess", metrics, inventoryConfidence);
    const excessFoci = metrics.excessItems.slice(0, 3).map(item => ({ categoria: "Producto", evidencia: `${productSubject(item.producto, true)} representa ${percent(item.stockShare)} de las existencias, ${percent(item.recentSalesShare)} de las ventas recientes y tiene ${readableNumber(item.stock)} unidades disponibles.`, aporte: item.stockShare, unidad: "proporción de las existencias" }));
    findings.push(scored({
    type: "inventory-excess", level: "general", dominio: "inventario", tipoProblema: "existencias-altas", title: excessUrgency.level === "Crítico" ? "Las existencias frente a las ventas requieren atención inmediata." : "Las existencias son altas frente a lo que vendes.",
    problemaGeneral: "Existencias altas frente a las ventas", magnitud: metrics.excessInventoryShare * 100, unidad: "porcentaje de las existencias", periodo: "Inventario actual frente a ventas recientes",
    reason: `${percent(metrics.excessInventoryShare)} de las unidades disponibles está en productos con poco o ningún movimiento reciente.`,
    evidence: `Comparamos la fotografía actual del inventario con las unidades vendidas en los últimos ${Math.max(1, metrics.unitPanorama.recent?.length || 3)} meses completos.`,
    meaning: metrics.inventoryCostRate >= .70 && metrics.slowValue > 0 ? `Hay muchas unidades guardadas frente a lo que se está vendiendo; representan ${money.format(metrics.slowValue)} al costo registrado.` : "Hay muchas unidades guardadas frente a lo que se está vendiendo.", reviewFocus: `${urgencyReviewPrefix(excessUrgency.level)} ${excessFoci.map(item => item.evidencia).join(" ")}`,
    indicator: "Unidades disponibles de los productos con poco movimiento.", items: metrics.excessItems,
    nivelUrgencia: excessUrgency.level,
    magnitudDetalle: { porcentajeExistenciasAfectadas: metrics.excessInventoryShare, unidadesAfectadas: metrics.slowUnits, valorAlCosto: metrics.inventoryCostRate >= .70 ? metrics.slowValue : null },
    causasObservadas: metrics.excessItems.slice(0, 3).map(item => `${productSubject(item.producto, true)} representa ${percent(item.stockShare)} de las existencias y ${percent(item.recentSalesShare)} de las ventas recientes.`),
    aportePorCausa: metrics.excessItems.slice(0, 3).map(item => ({ factor: item.producto, dimension: "producto", aporte: item.stockShare, unidad: "proporción de las existencias", evidencia: `${readableNumber(item.stock)} unidades disponibles.` })),
    focosPrioritarios: excessFoci,
    hipotesisPorValidar: ["Compras superiores a la necesidad.", "Menor demanda.", "Cambios de precio.", "Sustitución por otros productos."],
    limitaciones: ["Solo contamos con una fotografía actual del inventario; no podemos afirmar que las existencias hayan crecido ni que se esté comprando demasiado."]
  }, { impact: Math.min(100, metrics.excessInventoryShare * 130), urgency: excessUrgency.score, reach: metrics.excessInventoryShare * 100, confidence: inventoryConfidence }));
  }
  if (metrics.riskSalesShare >= .20) {
    const riskUrgency = inventoryUrgency("stock-risk-general", metrics, inventoryConfidence);
    const riskFoci = metrics.riskItems.slice(0, 3).map(item => ({ categoria: "Producto", evidencia: `${productSubject(item.producto, true)} representa ${percent(item.recentSalesShare)} de las ventas recientes, tiene ${readableNumber(item.stock)} unidades y cerca de ${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(item.coverageMonths)} meses de existencias al ritmo reciente.`, aporte: item.recentSalesShare, unidad: "proporción de las ventas recientes" }));
    findings.push(scored({
    type: "stock-risk-general", level: "general", dominio: "inventario", tipoProblema: "riesgo-falta-inventario", title: riskUrgency.level === "Crítico" ? "El riesgo de falta de productos requiere atención inmediata." : "Podrías quedarte sin productos que hoy sostienen tus ventas.",
    problemaGeneral: "Riesgo de falta de inventario", magnitud: metrics.riskSalesShare * 100, unidad: "porcentaje de las ventas recientes", periodo: "Inventario actual frente a ventas recientes",
    reason: `Los productos con pocas existencias representan ${percent(metrics.riskSalesShare)} de las unidades vendidas recientemente.`,
    evidence: `${metrics.riskItems.length === 1 ? "Un producto tiene" : `${metrics.riskItems.length} productos tienen`} existencias para cerca de un mes o menos al ritmo reciente de ventas.`,
    meaning: "Si se agotan, pueden afectar una parte importante de las ventas.", reviewFocus: `${urgencyReviewPrefix(riskUrgency.level)} ${riskFoci.map(item => item.evidencia).join(" ")}`,
    indicator: "Unidades disponibles de los productos que más se venden.", items: metrics.riskItems,
    nivelUrgencia: riskUrgency.level,
    magnitudDetalle: { porcentajeVentasEnRiesgo: metrics.riskSalesShare, productosAfectados: metrics.riskItems.length },
    causasObservadas: metrics.riskItems.slice(0, 3).map(item => `${productSubject(item.producto, true)} tiene ${readableNumber(item.stock)} unidades disponibles y representa ${percent(item.recentSalesShare)} de las ventas recientes.`),
    aportePorCausa: metrics.riskItems.slice(0, 3).map(item => ({ factor: item.producto, dimension: "producto", aporte: item.recentSalesShare, unidad: "proporción de las ventas recientes", evidencia: `${readableNumber(item.stock)} unidades disponibles frente a ${readableNumber(item.recentSold)} vendidas recientemente.` })),
    focosPrioritarios: riskFoci,
    hipotesisPorValidar: ["Reposición más lenta.", "Cambios en entregas del proveedor.", "Demanda temporalmente mayor."],
    limitaciones: ["No encontramos pedidos pendientes ni tiempos de entrega de proveedores."]
  }, { impact: Math.min(100, metrics.riskSalesShare * 140), urgency: riskUrgency.score, reach: metrics.riskSalesShare * 100, confidence: inventoryConfidence }));
  }
  return findings;
}

function salesInventoryRelationshipAnalysis({ metrics, scope, inventoryConfidence }) {
  if (!scope.hasSales || !scope.hasInventory || metrics.relationCoverage < .50 || metrics.inventoryChange === null || metrics.inventoryChange < .10 || !metrics.unitPanorama.reliable || metrics.unitPanorama.status !== "VENTAS EN DESCENSO") return [];
  const urgency = inventoryUrgency("inventory-accumulation", metrics, inventoryConfidence);
  const foci = metrics.excessItems.slice(0, 2).map(item => ({ categoria: "Producto", evidencia: `${productSubject(item.producto, true)} tiene ${readableNumber(item.stock)} unidades disponibles y representa ${percent(item.recentSalesShare)} de las ventas recientes.`, aporte: item.stockShare, unidad: "proporción de las existencias" }));
  foci.push({ categoria: "Tendencia general", evidencia: `Las existencias crecieron ${percent(metrics.inventoryChange)} mientras las unidades vendidas bajaron ${percent(Math.abs(metrics.unitPanorama.change))}.`, aporte: Math.max(metrics.inventoryChange, Math.abs(metrics.unitPanorama.change)), unidad: "variación porcentual" });
  return [scored({
    type: "inventory-accumulation", level: "general", dominio: "ventas-inventario", tipoProblema: "ventas-bajas-existencias-altas", title: urgency.level === "Crítico" ? "La caída de ventas y el aumento de existencias requieren atención inmediata." : "Las existencias están creciendo mientras vendes menos.",
    problemaGeneral: "Caída de ventas acompañada de acumulación de existencias", magnitud: Math.max(metrics.inventoryChange, Math.abs(metrics.unitPanorama.change)) * 100, unidad: "variación porcentual", periodo: "Dos periodos de tres meses y cortes históricos de inventario",
    reason: `Las existencias aumentaron ${percent(metrics.inventoryChange)} y las unidades vendidas bajaron ${percent(Math.abs(metrics.unitPanorama.change))}.`,
    evidence: `Comparamos ${metrics.inventoryHistory.length} cortes de inventario y dos periodos de tres meses completos de ventas.`,
    meaning: "La caída de ventas coincide con un aumento de las existencias; los datos muestran la relación, no demuestran por sí solos su causa.", reviewFocus: `${urgencyReviewPrefix(urgency.level)} ${foci.slice(0, 3).map(item => item.evidencia).join(" ")}`,
    indicator: "Unidades disponibles frente a unidades vendidas.", items: metrics.excessItems,
    nivelUrgencia: urgency.level,
    magnitudDetalle: { aumentoInventario: metrics.inventoryChange, caidaUnidadesVendidas: metrics.unitPanorama.change, cortesInventario: metrics.inventoryHistory.length },
    causasObservadas: ["Las unidades vendidas bajaron mientras las existencias totales aumentaron en los periodos comparados."],
    aportePorCausa: [{ factor: "Relación entre ventas e inventario", dimension: "ventas-inventario", aporte: Math.abs(metrics.unitPanorama.change), unidad: "variación de unidades vendidas", evidencia: `Ventas ${percent(Math.abs(metrics.unitPanorama.change))} abajo e inventario ${percent(metrics.inventoryChange)} arriba.` }],
    focosPrioritarios: foci.slice(0, 3),
    hipotesisPorValidar: ["Compras superiores a la necesidad.", "Menor demanda.", "Cambios de disponibilidad o reposición."],
    limitaciones: ["La relación temporal observada no demuestra que una variable haya causado la otra."]
  }, { impact: Math.min(100, (metrics.inventoryChange + Math.abs(metrics.unitPanorama.change)) * 180), urgency: urgency.score, reach: 100, confidence: inventoryConfidence })];
}

const businessAnalysisModules = [salesAnalysisModule, inventoryAnalysisModule];
const businessRelationshipAnalyzers = [salesInventoryRelationshipAnalysis];

function runBusinessAnalysisModules(context, modules = businessAnalysisModules, relationships = businessRelationshipAnalyzers) {
  const moduleFindings = modules.flatMap(analyzer => analyzer(context) || []);
  const relationshipFindings = relationships.flatMap(analyzer => analyzer(context) || []);
  return { moduleFindings, relationshipFindings, findings: [...moduleFindings, ...relationshipFindings] };
}

function prioritizeBusinessFindings(findings) {
  return [...findings].sort((a, b) => b.prioridad - a.prioridad);
}

function businessAnalysisArchitecture(metrics, scope) {
  const evidenceConfidence = Math.round(Math.max(0, Math.min(1, scope.completeness)) * 100);
  const inventoryConfidence = Math.round(evidenceConfidence * Math.min(1, metrics.relationCoverage / .7));
  const analysis = runBusinessAnalysisModules({ metrics, scope, evidenceConfidence, inventoryConfidence });
  return { ...analysis, rankedFindings: prioritizeBusinessFindings(analysis.findings) };
}

function diagnosticDataLimitations(metrics, data) {
  const sales = data.sales || [], inventory = data.inventory || [], limitations = [];
  if (!sales.length) limitations.push("No encontramos ventas para analizar cambios en el negocio.");
  if (sales.length && metrics.valueRate < .7) limitations.push(metrics.valueUnavailableReason);
  if (sales.length && metrics.quantityRate < .7) limitations.push(metrics.quantityUnavailableReason);
  if (!inventory.length) limitations.push("No encontramos inventario para comparar existencias con ventas.");
  else if (!metrics.linkedProducts && sales.length) limitations.push("No pudimos relacionar con suficiente claridad los productos de ventas e inventario.");
  if (metrics.customerRate === 0) limitations.push("No encontramos clientes identificados para medir cuáles dejaron de comprar.");
  else if (metrics.customerRate < .70) limitations.push("Los clientes están incompletos; no los usamos para explicar la prioridad.");
  if (metrics.sellerRate === 0) limitations.push("No encontramos comerciales identificados para comparar su actividad.");
  else if (metrics.sellerRate < .70) limitations.push("Los comerciales están incompletos; no los usamos para explicar la prioridad.");
  limitations.push("No contamos con información de competencia, visitas comerciales ni cambios del mercado.");
  return [...new Set(limitations)];
}

function contextualDiagnosis(context, metrics) {
  const raw = [context?.contextoLibre, context?.eventoReciente].map(value => String(value || "").trim()).filter(Boolean).join(" ");
  const normalized = normalize(raw);
  const panorama = metrics.panorama;
  const coincidences = [];
  const hypotheses = [];
  const evidence = [];
  const add = (level, text, hypothesis = "", proof = "") => {
    if (!text || coincidences.length >= 2 || coincidences.some(item => item.texto === text)) return;
    coincidences.push({ nivel: level, texto: text });
    if (hypothesis) hypotheses.push(hypothesis);
    if (proof) evidence.push(proof);
  };

  if (raw) {
    const mentionsClient = /(cliente|comprador)/.test(normalized);
    const mentionsLostClient = mentionsClient && /(perd|dejo de compr|no (volvio|volvieron)|se retiro)/.test(normalized);
    const inactiveCustomers = metrics.customerRate >= .7
      ? metrics.customerDrivers.filter(item => item.priorTotal > 0 && item.recentTotal === 0)
      : [];
    const namedInactiveCustomer = inactiveCustomers.find(item => normalize(item.product).length >= 3 && normalized.includes(normalize(item.product)));
    if (namedInactiveCustomer) {
      const priorShare = panorama.priorTotal ? namedInactiveCustomer.priorTotal / panorama.priorTotal : 0;
      const proof = `${namedInactiveCustomer.product} dejó de registrar compras y anteriormente representaba ${readablePercent(priorShare)} de las ventas.`;
      add("RESPALDADO_POR_DATOS", `Los datos respaldan que ${proof.charAt(0).toLowerCase() + proof.slice(1)}`, "", proof);
    } else if (mentionsClient && inactiveCustomers.length && panorama.status === "VENTAS EN DESCENSO") {
      const priorTotal = inactiveCustomers.reduce((sum, item) => sum + item.priorTotal, 0);
      const priorShare = panorama.priorTotal ? priorTotal / panorama.priorTotal : 0;
      const proof = `${countText(inactiveCustomers.length, "cliente que antes compraba dejó", "clientes que antes compraban dejaron")} de registrar compras y representaba${inactiveCustomers.length === 1 ? "" : "n"} ${readablePercent(priorShare)} de las ventas anteriores.`;
      add("POSIBLE_EXPLICACION", `Nos contaste que hubo un cambio relacionado con clientes. Los datos muestran que ${proof.charAt(0).toLowerCase() + proof.slice(1)} Esto podría estar relacionado con la reducción, pero no demuestra por sí solo que sea la causa.`, "Revisar cuánto de la reducción podría estar relacionado con los clientes que dejaron de comprar.", proof);
    } else if (mentionsLostClient && panorama.status === "VENTAS EN DESCENSO") {
      add("COINCIDENCIA", "Nos contaste que perdiste un cliente durante este periodo. Esto coincide con una reducción reciente de las ventas, aunque los datos disponibles no permiten confirmar que esa sea la causa.", "Revisar si la pérdida del cliente podría estar relacionada con la reducción de ventas.");
    }

    const mentionsSupply = /(proveedor|abastec|sin producto|falta de producto|escasez)/.test(normalized);
    if (mentionsSupply && metrics.riskItems.length) {
      const products = metrics.riskItems.slice(0, 2).map(item => item.producto).join(" y ");
      const proof = `${products} ${metrics.riskItems.length === 1 ? "tiene" : "tienen"} pocas existencias frente a sus ventas recientes.`;
      add("COINCIDENCIA", `Nos contaste que hubo problemas de abastecimiento o con un proveedor. Esto coincide con la baja disponibilidad que encontramos en ${products}.`, "Revisar si el problema de abastecimiento podría estar relacionado con la disponibilidad actual.", proof);
    } else if (mentionsSupply && panorama.status === "VENTAS EN DESCENSO") {
      add("POSIBLE_EXPLICACION", "Nos contaste que hubo problemas de abastecimiento o falta de producto. Esto podría estar relacionado con la reducción de ventas, pero los archivos no permiten comprobarlo.", "Revisar si la falta de producto afectó las ventas durante el periodo.");
    }

    if (/(precio|tarifa)/.test(normalized) && panorama.reliable) {
      add("POSIBLE_EXPLICACION", "Nos contaste que hubo cambios de precio. Esto podría estar relacionado con la variación de las ventas, pero los datos disponibles no demuestran esa relación.", "Comparar las ventas antes y después del cambio de precio.");
    }
    if (/(cerr|vacacion|temporada|festiv|obra|personal|vendedor|comercial)/.test(normalized) && panorama.reliable) {
      add("COINCIDENCIA", "Nos contaste que ocurrió una situación especial durante este periodo. Esto coincide con el periodo en el que observamos cambios en las ventas y conviene revisarlo sin asumir que fue la causa.", "Revisar si la situación especial podría estar relacionada con el cambio observado.");
    }
  }

  return {
    contextoEmpresarial: {
      actividad: context?.actividad || "",
      manejoInformacion: context?.registro || "",
      antiguedad: context?.antiguedad || ""
    },
    contextoRelevante: coincidences.length ? raw : "",
    coincidenciasContextoDatos: coincidences.slice(0, 2),
    hipotesisContextuales: [...new Set(hypotheses)].slice(0, 2),
    evidenciaContextual: [...new Set(evidence)].slice(0, 2)
  };
}

function buildDiagnosticHandoff(primary, metrics, resultQuality, data) {
  const sales = data.sales || [];
  const panorama = metrics.panorama;
  const salesComparison = panorama.reliable ? {
    disponible: true,
    periodoAnterior: panorama.prior.map(item => item.month),
    periodoReciente: panorama.recent.map(item => item.month),
    cambio: panorama.change,
    unidad: panorama.basis === "value" ? "valor vendido" : "unidades vendidas"
  } : { disponible: false, motivo: panorama.reason || "No hay dos periodos equivalentes para comparar." };
  const comparison = primary?.dominio === "ventas-inventario" ? {
    disponible: true,
    ventas: salesComparison,
    inventario: { cortes: metrics.inventoryHistory.length, cambio: metrics.inventoryChange, unidad: "unidades disponibles" }
  } : primary?.dominio === "inventario" ? (metrics.inventoryHistory.length >= 2 ? {
    disponible: true,
    inventario: { cortes: metrics.inventoryHistory.length, cambio: metrics.inventoryChange, unidad: "unidades disponibles" }
  } : { disponible: false, motivo: "Solo contamos con un corte actual de inventario; no afirmamos que las existencias hayan aumentado o disminuido." }) : salesComparison;
  const generalLimitations = diagnosticDataLimitations(metrics, data);
  return {
    dominio: primary?.dominio || "empresarial",
    problemGeneral: primary?.problemaGeneral || primary?.title || "Información insuficiente para definir un problema general",
    nivelUrgencia: primary?.nivelUrgencia || "Observación",
    magnitud: primary?.magnitudDetalle || { valor: primary?.magnitud ?? null, unidad: primary?.unidad || "" },
    evidencia: primary?.evidencia || [primary?.reason, primary?.evidence].filter(Boolean),
    evidenciaProblema: primary?.evidencia || [primary?.reason, primary?.evidence].filter(Boolean),
    causasObservadas: (primary?.causasObservadas || []).slice(0, 3),
    aportePorCausa: (primary?.aportePorCausa || []).slice(0, 3),
    focosPrioritarios: (primary?.focosPrioritarios || []).slice(0, 3),
    hipotesisPorValidar: primary?.hipotesisPorValidar || [],
    limitaciones: [...new Set([...(primary?.limitaciones || []), ...generalLimitations])],
    calidadInformacion: { nivel: resultQuality.level[0] + resultQuality.level.slice(1).toLowerCase(), puntaje: resultQuality.score },
    periodoAnalizado: primary?.periodo || (metrics.period ? `${metrics.period} días` : "Periodo no disponible"),
    comparacionHistorica: comparison,
    datosDisponibles: {
      ventas: sales.length > 0,
      inventario: (data.inventory || []).length > 0,
      clientes: metrics.customerRate >= .70,
      comerciales: metrics.sellerRate >= .70,
      utilidad: metrics.utilityRate >= .70,
      precios: sales.some(row => Number.isFinite(numericValue(row.precio))),
      costosInventario: metrics.inventoryCostRate >= .70,
      historialVentas: panorama.reliable,
      historialInventario: metrics.inventoryHistory.length >= 2,
      relacionVentasInventario: metrics.linkedProducts > 0,
      compras: false,
      visitasComerciales: false,
      competencia: false
    },
    ...contextualDiagnosis(app.context, metrics)
  };
}

function prioritize(metrics, scope) {
  const findings = [];
  const { evidenceConfidence, inventoryConfidence } = (() => {
    const evidence = Math.round(Math.max(0, Math.min(1, scope.completeness)) * 100);
    return { evidenceConfidence: evidence, inventoryConfidence: Math.round(evidence * Math.min(1, metrics.relationCoverage / .7)) };
  })();
  const panorama = metrics.panorama;
  const amount = value => panorama.basis === "value" ? money.format(value) : `${readableNumber(value)} unidades`;
  const observed = observedSalesCauses(metrics);
  const topDecliners = observed.drivers.filter(item => ["producto", "cliente", "vendedor"].includes(item.dimension));
  const architecture = businessAnalysisArchitecture(metrics, scope);
  const centrallyRanked = architecture.rankedFindings;
  const general = centrallyRanked.filter(item => ["business-decline", "profit-decline", "inventory-no-movement", "inventory-accumulation", "inventory-excess", "stock-risk-general"].includes(item.type));
  const concentration = centrallyRanked.find(item => item.type === "concentration");
  const inventoryOnly = centrallyRanked.find(item => item.type === "inventory-only");
  if (inventoryOnly && !general.length) findings.push(inventoryOnly);
  if (general.length) {
    const main = general[0];
    findings.push(main);
    if (main.type === "business-decline") {
      for (const driver of topDecliners.slice(0, 2)) {
        const subject = driver.dimension === "cliente" ? `El cliente ${driver.product}` : driver.dimension === "vendedor" ? `Las ventas del comercial ${driver.product}` : productSubject(driver.product, true);
        findings.push(scored({
        type: "sales-decline-cause", level: "cause", parentType: main.type,
        title: `${subject} ${driver.dimension === "vendedor" ? "explican" : "explica"} ${percent(driver.contribution)} de la reducción de las ventas.`,
        reason: `${subject} ${driver.dimension === "vendedor" ? "pasaron" : "pasó"} de ${amount(driver.priorTotal)} a ${amount(driver.recentTotal)} en los dos periodos comparados.`,
        evidence: `${driver.dimension === "vendedor" ? "Perdieron" : "Perdió"} ${amount(Math.abs(driver.delta))} y ${driver.dimension === "vendedor" ? "representan" : "representa"} ${percent(driver.recentShare)} de las ventas recientes.`,
        meaning: `Esta ${driver.dimension === "producto" ? "parte del portafolio" : "dimensión comercial"} es una de las principales explicaciones de la caída general.`,
        action: `Revisa qué cambió en ${driver.dimension === "producto" ? `las ventas de ${productSubject(driver.product)}` : driver.dimension === "cliente" ? `la relación con ${driver.product}` : `las ventas atendidas por ${driver.product}`}.`, indicator: main.indicator, driver,
        summary: `${subject} ${driver.dimension === "vendedor" ? "explican" : "explica"} ${percent(driver.contribution)} de la reducción de las ventas.`
      }, { impact: Math.min(100, driver.contribution * 100), urgency: 75, reach: driver.recentShare * 100, confidence: evidenceConfidence }));
      }
    } else if (["inventory-accumulation", "inventory-excess"].includes(main.type)) {
      for (const item of metrics.excessItems.slice(0, 2)) findings.push(scored({
        type: "slow", level: "cause", parentType: main.type,
        title: `${productSubject(item.producto, true)} concentra existencias altas frente a sus ventas.`,
        reason: `${productSubject(item.producto, true)} representa ${percent(item.stockShare)} de las unidades disponibles y ${percent(item.recentSalesShare)} de las unidades vendidas recientemente.`,
        evidence: `${readableNumber(item.stock)} unidades disponibles y ${readableNumber(item.recentSold)} unidades vendidas en los meses recientes.`,
        meaning: "Hay muchas unidades guardadas frente a lo que se está vendiendo.",
        action: `Revisa ${productSubject(item.producto)} antes de volver a comprarlo.`, indicator: main.indicator, items: [item],
        summary: `${productSubject(item.producto, true)} concentra ${percent(item.stockShare)} de las existencias y ${percent(item.recentSalesShare)} de las ventas recientes.`
      }, { impact: item.stockShare * 100, urgency: 72, reach: item.stockShare * 100, confidence: inventoryConfidence }));
    } else if (main.type === "stock-risk-general") {
      for (const item of metrics.riskItems.slice(0, 2)) findings.push(scored({
        type: "stockout", level: "cause", parentType: main.type,
        title: `${productSubject(item.producto, true)} puede quedarse sin existencias.`,
        reason: `${productSubject(item.producto, true)} representa ${percent(item.recentSalesShare)} de las unidades vendidas recientemente.`,
        evidence: `${readableNumber(item.stock)} unidades disponibles frente a ${readableNumber(item.recentSold)} vendidas en los meses recientes.`,
        meaning: "Si se agota, puede afectar una parte importante de las ventas.",
        action: "Confirma las existencias y el siguiente pedido.", indicator: main.indicator, item,
        summary: `${productSubject(item.producto, true)} aporta ${percent(item.recentSalesShare)} de las ventas recientes y tiene ${readableNumber(item.stock)} unidades disponibles.`
      }, { impact: item.recentSalesShare * 100, urgency: 95, reach: item.recentSalesShare * 100, confidence: inventoryConfidence }));
    }
    for (const alternative of general) if (findings.length < 3 && alternative !== main) findings.push(alternative);
    return findings.slice(0, 3);
  }
  const localized = metrics.productDrivers.find(item => panorama.status === "VENTAS ESTABLES" && item.priorTotal > 0 && item.change <= -.30 && item.recentShare >= .15);
  if (localized) findings.push(scored({
    type: "product-decline", level: "localized", title: `Revisa primero ${productSubject(localized.product)}.`,
    reason: `Sus ventas bajaron ${percent(Math.abs(localized.change))} entre los dos periodos de tres meses.`,
    evidence: `Representa ${percent(localized.recentShare)} de las ventas recientes.`,
    meaning: "El problema está localizado, pero su peso en el negocio es suficiente para atenderlo.",
    action: "Revisa qué cambió en sus clientes, precio o disponibilidad.", indicator: `Ventas de ${productSubject(localized.product)} cada mes.`, driver: localized
  }, { impact: Math.min(100, Math.abs(localized.change) * localized.recentShare * 220), urgency: 80, reach: localized.recentShare * 100, confidence: evidenceConfidence }));
  const localRisk = metrics.riskItems.find(item => item.recentSalesShare >= .10);
  if (localRisk) findings.push(scored({ type: "stockout", level: "localized", title: `Podrías quedarte sin ${productSubject(localRisk.producto)}.`, reason: `${productSubject(localRisk.producto, true)} representa ${percent(localRisk.recentSalesShare)} de las unidades vendidas recientemente.`, evidence: `${readableNumber(localRisk.stock)} unidades disponibles frente a ${readableNumber(localRisk.recentSold)} vendidas recientemente.`, meaning: "Si se agota, puede afectar una parte relevante de tus ventas.", action: "Confirma las existencias y el siguiente pedido.", indicator: "Unidades disponibles del producto.", item: localRisk }, { impact: localRisk.recentSalesShare * 100, urgency: 95, reach: localRisk.recentSalesShare * 100, confidence: inventoryConfidence }));
  if (scope.hasSales && concentration) findings.push(concentration);
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

function actionPlanTiming(level) {
  if (level === "Crítico") return { labels: ["HOY", "EN 2 DÍAS", "EN 7 DÍAS"], days: [0, 2, 7] };
  if (level === "Importante") return { labels: ["HOY", "EN 8 DÍAS", "EN 15 DÍAS"], days: [0, 8, 15] };
  return { labels: ["ESTA SEMANA", "EN 15 DÍAS", "EN 30 DÍAS"], days: [7, 15, 30] };
}

function isoDateAfter(days) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function planRowMeasure(row, basis) {
  const quantity = numericValue(row.cantidad);
  const value = Number.isFinite(numericValue(row.valorTotal)) ? numericValue(row.valorTotal) : quantity * numericValue(row.precio);
  if (basis === "value") return Number.isFinite(value) && value >= 0 ? value : 0;
  if (basis === "profit") return Number.isFinite(numericValue(row.utilidad)) ? numericValue(row.utilidad) : 0;
  return Number.isFinite(quantity) && quantity >= 0 ? quantity : 0;
}

function productDisplayName(product, dataset = app.dataset) {
  const raw = String(product || "").trim();
  if (!raw) return "el producto señalado";
  if (/\breferencia\b/i.test(raw)) return raw;
  const matchingRow = [...(dataset?.sales || []), ...(dataset?.inventory || [])].find(row =>
    normalize(row.producto) === normalize(raw) || normalize(row.referencia) === normalize(raw)
  );
  const reference = String(matchingRow?.referencia || matchingRow?.sku || matchingRow?.codigoProducto || "").trim();
  const name = String(matchingRow?.nombreProducto || matchingRow?.descripcionProducto || matchingRow?.descripcion || "").trim();
  if (name && reference) return `${name} (Referencia ${reference})`;
  if (name && /^\d+$/.test(raw)) return `${name} (Referencia ${raw})`;
  if (/^\d+$/.test(raw)) return `Referencia ${raw}`;
  return raw;
}

function productSubject(product, capitalized = false, dataset = app.dataset) {
  const label = productDisplayName(product, dataset);
  if (/^Referencia\b/i.test(label)) return `${capitalized ? "La" : "la"} ${label}`;
  return label;
}

function relatedDeclineEntities(product, role, analysisContext = {}) {
  const metrics = analysisContext.metrics || app.analysis?.metrics;
  const panorama = metrics?.panorama;
  if (!panorama?.reliable) return [];
  const priorMonths = new Set(panorama.prior.map(item => item.month));
  const recentMonths = new Set(panorama.recent.map(item => item.month));
  const grouped = {};
  (analysisContext.dataset?.sales || app.dataset?.sales || []).forEach(row => {
    if (product && normalize(row.producto) !== normalize(product)) return;
    const label = String(row[role] || "").trim();
    const date = new Date(row.fecha);
    if (!label || Number.isNaN(date.getTime())) return;
    const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!priorMonths.has(month) && !recentMonths.has(month)) return;
    const key = normalize(label);
    grouped[key] ||= { name: label, prior: 0, recent: 0 };
    grouped[key][priorMonths.has(month) ? "prior" : "recent"] += planRowMeasure(row, panorama.basis);
  });
  const declining = Object.values(grouped).map(item => ({ ...item, loss: Math.max(0, item.prior - item.recent), inactive: item.prior > 0 && item.recent === 0 })).filter(item => item.loss > 0).sort((a, b) => b.loss - a.loss);
  const totalLoss = declining.reduce((sum, item) => sum + item.loss, 0);
  return declining.map(item => ({ ...item, contribution: totalLoss ? item.loss / totalLoss : 0 }));
}

function planProductNames(finding) {
  const metrics = app.analysis?.metrics;
  const fromItems = (finding.items || []).map(item => item.producto).filter(Boolean);
  const fromDriver = finding.driver?.dimension === "producto" && finding.driver.product ? [finding.driver.product] : [];
  if (fromDriver.length) return fromDriver;
  const fromDecline = (finding.type === "profit-decline" ? metrics.utilityDrivers : metrics.productDrivers || []).filter(item => item.delta < 0).slice(0, 2).map(item => item.product);
  const fromFocus = (finding.focosPrioritarios || []).map(item => item.evidencia?.split(/ explica| representa| tiene/)[0]).filter(Boolean);
  return [...new Set([...fromItems, ...fromDriver, ...fromDecline, ...fromFocus])].slice(0, 2);
}

function latestInventoryBaseline(products, dataset = app.dataset) {
  const selected = new Set(products.map(normalize));
  const latest = {};
  (dataset?.inventory || []).forEach(row => {
    const product = String(row.producto || "").trim();
    if (!product || (selected.size && !selected.has(normalize(product)))) return;
    const date = new Date(row.fechaCorte);
    const timestamp = Number.isNaN(date.getTime()) ? 0 : date.getTime();
    const current = latest[normalize(product)];
    if (!current || timestamp >= current.timestamp) latest[normalize(product)] = { product, stock: numericValue(row.stock), timestamp };
  });
  return Object.values(latest).filter(item => Number.isFinite(item.stock)).map(item => ({ producto: item.product, unidades: item.stock }));
}

function planRecoveryShare(urgency) {
  if (urgency === "Crítico") return .40;
  if (urgency === "Importante") return .32;
  return .25;
}

function partialRecoverySignal(name, panorama, urgency, formatter, note) {
  if (!panorama?.reliable || !(panorama.priorAverage > panorama.recentAverage) || panorama.recentAverage < 0) return null;
  const current = panorama.recentAverage;
  const target = current + (panorama.priorAverage - current) * planRecoveryShare(urgency);
  const normalizedTarget = name === "Unidades vendidas" ? Math.ceil(target) : Math.round(target);
  if (!(normalizedTarget > current)) return null;
  return {
    name,
    today: formatter(current),
    target: formatter(normalizedTarget),
    reference: formatter(panorama.priorAverage),
    note
  };
}

function salesPlanSignals(finding, diagnosis, timing, products, analysisContext = {}) {
  const metrics = analysisContext.metrics || app.analysis.metrics;
  const signals = [];
  const isProfit = finding.type === "profit-decline";
  const customers = !isProfit && diagnosis.datosDisponibles.clientes ? relatedDeclineEntities(products[0], "cliente", analysisContext).slice(0, 5) : [];
  if (customers.length) {
    const share = diagnosis.nivelUrgencia === "Crítico" ? .60 : diagnosis.nivelUrgencia === "Importante" ? .50 : .40;
    const target = Math.max(1, Math.min(customers.length, Math.ceil(customers.length * share)));
    signals.push({
      name: "Clientes que volvieron a comprar",
      today: `0 de ${customers.length}`,
      target: `${target} de ${customers.length}`,
      note: `Una recuperación parcial y verificable durante los próximos ${timing.days[2]} días.`
    });
  }
  const units = !isProfit && partialRecoverySignal("Unidades vendidas", metrics.unitPanorama, diagnosis.nivelUrgencia, value => `${readableNumber(value)} unidades al mes`, "Recuperar una parte de la diferencia frente al periodo anterior.");
  if (units) signals.push(units);
  const value = partialRecoverySignal("Valor vendido", metrics.valuePanorama, diagnosis.nivelUrgencia, amount => `${money.format(amount)} al mes`, "Recuperar una parte de la diferencia sin asumir que debe alcanzarse todo de inmediato.");
  if (value) signals.push(value);
  if (isProfit && metrics.utilityPanorama?.reliable) {
    const utility = partialRecoverySignal(utilityName(metrics)[0].toUpperCase() + utilityName(metrics).slice(1), metrics.utilityPanorama, diagnosis.nivelUrgencia, amount => utilityDisplay(metrics, amount), "Revisar que la mejora de ventas también cuide la rentabilidad.");
    if (utility) signals.unshift(utility);
  }
  return signals.slice(0, 3);
}

function inventoryPlanSignals(finding, diagnosis, timing, products, analysisContext = {}) {
  const metrics = analysisContext.metrics || app.analysis.metrics;
  if (finding.type === "inventory-only") return [];
  const names = new Set(products.map(normalize));
  const matching = items => (items || []).filter(item => !names.size || names.has(normalize(item.producto)));
  const isRisk = ["stock-risk-general", "stockout"].includes(finding.type);
  const source = matching(isRisk ? metrics.riskItems : [...(metrics.excessItems || []), ...(metrics.noMovementItems || [])]);
  const stock = source.reduce((sum, item) => sum + (Number.isFinite(item.stock) ? item.stock : 0), 0)
    || latestInventoryBaseline(products, analysisContext.dataset || app.dataset).reduce((sum, item) => sum + item.unidades, 0);
  const signals = [];
  if (stock > 0 && isRisk) {
    const recentMonths = Math.max(1, metrics.unitPanorama?.recent?.length || 3);
    const recentMonthlyDemand = source.reduce((sum, item) => sum + (Number.isFinite(item.recentSold) ? item.recentSold : 0), 0) / recentMonths;
    const coverage = diagnosis.nivelUrgencia === "Crítico" ? 1.5 : 2;
    const target = Math.ceil(recentMonthlyDemand * coverage);
    if (target > stock) signals.push({ name: "Unidades disponibles", today: `${readableNumber(stock)} unidades`, target: `${readableNumber(target)} unidades`, note: "Mantener disponibilidad suficiente para cubrir las ventas recientes, sin acumular de más." });
  } else if (stock > 0) {
    const reduction = diagnosis.nivelUrgencia === "Crítico" ? .15 : diagnosis.nivelUrgencia === "Importante" ? .12 : .08;
    const target = Math.max(0, Math.floor(stock * (1 - reduction)));
    signals.push({ name: "Unidades disponibles", today: `${readableNumber(stock)} unidades`, target: `${readableNumber(target)} unidades`, note: `Reducir gradualmente las existencias durante los próximos ${timing.days[2]} días.` });
  }
  const units = partialRecoverySignal("Unidades vendidas", metrics.unitPanorama, diagnosis.nivelUrgencia, value => `${readableNumber(value)} unidades al mes`, "Comprobar si el movimiento mejora frente al periodo reciente.");
  if (units) signals.push(units);
  return signals.slice(0, 3);
}

function salesActionPlan(finding, diagnosis, timing, products, analysisContext = {}) {
  const metrics = analysisContext.metrics || app.analysis.metrics;
  const primaryProductRaw = products[0] || "";
  const primaryProduct = primaryProductRaw ? productSubject(primaryProductRaw, false, analysisContext.dataset) : "los productos que más explican el cambio";
  const productNames = products.map(product => productSubject(product, false, analysisContext.dataset));
  const isProfit = finding.type === "profit-decline";
  const customerDetails = !isProfit && diagnosis.datosDisponibles.clientes ? relatedDeclineEntities(primaryProductRaw, "cliente", analysisContext).slice(0, 5) : [];
  const sellerDetails = !isProfit && diagnosis.datosDisponibles.comerciales ? relatedDeclineEntities(primaryProductRaw, "vendedor", analysisContext).slice(0, 2) : [];
  const customerNames = customerDetails.map(item => item.name);
  const customerShare = customerDetails.reduce((sum, item) => sum + item.contribution, 0);
  const sellerName = sellerDetails[0]?.name;
  const hasValue = metrics.valueRate >= .70;
  const hasUnits = metrics.quantityRate >= .70;
  const measureName = isProfit ? utilityName(metrics) : metrics.panorama.basis === "value" ? "valor vendido" : "unidades vendidas";
  const causeEvidence = diagnosis.causasObservadas[0] || diagnosis.focosPrioritarios[0]?.evidencia || finding.reason;
  const firstAction = isProfit
    ? `Revisa los productos que más explican la reducción de la utilidad: ${productNames.join(" y ") || primaryProduct}.`
    : customerNames.length
    ? `Revisa los ${customerNames.length} clientes que más redujeron la compra de ${primaryProduct}.`
    : sellerName ? `Habla con ${sellerName} y revisen qué cambió en las ventas de ${primaryProduct}.`
      : `Revisa qué cambió en las ventas de ${productNames.join(" y ") || primaryProduct}.`;
  const firstEvidence = customerNames.length
    ? `${customerNames.join(", ")} explican ${percent(customerShare)} de las reducciones observadas entre los clientes de ${primaryProduct}.`
    : causeEvidence;
  const firstActivities = isProfit ? [
    `Compara la utilidad anterior y reciente de ${primaryProduct}.`,
    "Revisa si cambiaron el costo, el precio, el descuento o la mezcla vendida.",
    "Anota qué cambio está confirmado y qué todavía es una posibilidad."
  ] : [
    `Compara el ${measureName} anterior y reciente de ${primaryProduct}.`,
    sellerName ? `Habla con ${sellerName} y revisen qué cambió, sin asumir que el comercial causó la reducción.` : customerNames.length ? "Pregunta a quienes atienden estos clientes qué cambió." : "Identifica con tu equipo cuáles clientes o pedidos cambiaron.",
    "Anota la razón encontrada y separa lo confirmado de lo que todavía es una posibilidad."
  ];
  const secondTarget = customerNames.length ? "los clientes priorizados" : productNames.length ? productNames.join(" y ") : "el foco señalado";
  const phases = [
    { when: timing.labels[0], objective: "Entender qué cambió en el foco de mayor impacto.", action: firstAction, evidence: firstEvidence, activities: firstActivities },
    { when: timing.labels[1], objective: isProfit ? `Corregir una causa confirmada que esté reduciendo el ${measureName}.` : "Responder a la causa confirmada con una acción pequeña y clara.", action: customerNames.length ? `Habla con ${secondTarget} y define cómo recuperar su compra después de confirmar qué cambió.` : `Trabaja sobre la causa que encontramos para ${secondTarget}.`, evidence: `No asumimos que precio, competencia, servicio o disponibilidad sean la causa hasta comprobarlo.`, activities: isProfit ? ["Corrige únicamente el cambio de costo, precio, descuento o mezcla que lograste confirmar.", "Revisa que la acción no reduzca las ventas de forma innecesaria.", "Anota qué hiciste y desde qué fecha."] : [customerNames.length ? "Contacta a los clientes priorizados y pregunta qué cambió." : "Confirma si cambió la demanda, la disponibilidad, el servicio o el precio.", "Define una sola acción para cada causa confirmada.", "Anota qué hiciste y desde qué fecha."], questions: customerNames.length ? ["¿Qué cambió en tus compras?", "¿Tuviste algún problema con el producto o servicio?", "¿Cambió el precio o tu necesidad?", "¿Estás comprando otro producto o a otro proveedor?"] : [] },
    { when: timing.labels[2], objective: "Comprobar si la situación empezó a mejorar y ajustar si hace falta.", action: customerNames.length ? `Revisa si las ventas de ${primaryProduct} y de los clientes priorizados empezaron a mejorar.` : `Revisa si el ${measureName} de ${productNames.join(" y ") || primaryProduct} empezó a mejorar.`, evidence: "Compara con el promedio de los últimos tres meses completos; no uses un periodo incompleto.", activities: isProfit ? ["Compara la utilidad con el punto de partida.", "Revisa el margen solo si la información permite calcularlo de forma confiable.", "Ajusta la acción si la utilidad no mejora."] : [hasUnits ? "Compara las unidades vendidas." : `Compara el ${measureName}.`, hasValue ? "Compara el valor vendido." : "Usa la misma medida disponible en el diagnóstico.", customerNames.length ? "Revisa cuántos clientes volvieron a comprar y ajusta si no hay mejora." : "Ajusta la acción si no hay mejora."] }
  ];
  const indicators = [];
  if (customerNames.length) indicators.push({ name: "Clientes que volvieron a comprar", comparison: `Compara los próximos ${timing.days[2]} días con el periodo reciente.` });
  if (hasUnits && !isProfit) indicators.push({ name: "Unidades vendidas", comparison: "Compáralas con el promedio reciente usando periodos equivalentes." });
  if (hasValue && indicators.length < 3) indicators.push({ name: "Valor vendido", comparison: "Compáralo con el promedio de los últimos tres meses completos." });
  if (isProfit) indicators.unshift({ name: utilityName(metrics)[0].toUpperCase() + utilityName(metrics).slice(1), comparison: "Compáralo con el promedio reciente y revisa que la venta no mejore a costa de la rentabilidad." });
  return { phases, indicators: indicators.slice(0, 3), causeEvidence };
}

function inventoryActionPlan(finding, diagnosis, timing, products, analysisContext = {}) {
  const metrics = analysisContext.metrics || app.analysis.metrics;
  const names = products.map(product => productSubject(product, false, analysisContext.dataset)).join(" y ") || "los productos señalados";
  const isRisk = ["stock-risk-general", "stockout"].includes(finding.type);
  const inventoryOnly = finding.type === "inventory-only";
  const noMovement = finding.type === "inventory-no-movement";
  const causeEvidence = diagnosis.causasObservadas[0] || diagnosis.focosPrioritarios[0]?.evidencia || finding.reason;
  if (inventoryOnly) return {
    causeEvidence,
    phases: [
      { when: timing.labels[0], objective: "Conseguir la información necesaria para comparar existencias y ventas.", action: "Ubica dónde registras las ventas de tu negocio.", evidence: "Hoy solo tenemos una fotografía de inventario y no podemos afirmar si hay exceso o falta de existencias.", activities: ["Busca fecha, producto y cantidad vendida.", "Incluye valor vendido si lo tienes.", "Confirma que los productos usan nombres o referencias reconocibles."] },
      { when: timing.labels[1], objective: "Preparar un archivo que San José pueda revisar.", action: "Organiza o exporta los registros de ventas en Excel o CSV.", evidence: "No necesitas cambiar los nombres originales de las columnas.", activities: ["Incluye varios meses completos si están disponibles.", "Revisa que las fechas sean válidas.", "Guarda una copia antes de hacer cambios."] },
      { when: timing.labels[2], objective: "Obtener un diagnóstico conjunto sin inventar relaciones.", action: "Vuelve a analizar ventas e inventario juntos.", evidence: "Solo compararemos productos que podamos relacionar con suficiente claridad.", activities: ["Carga los dos archivos.", "Confirma las columnas identificadas.", "Revisa el nuevo resultado y define un punto de partida."] }
    ],
    indicators: [{ name: "Meses de ventas disponibles", comparison: "Busca al menos seis meses completos cuando sea posible." }, { name: "Productos relacionados", comparison: "Revisa cuántas referencias aparecen tanto en ventas como en inventario." }]
  };
  const firstAction = isRisk ? `Confirma las existencias físicas de ${names}.` : `Antes de hacer nuevas compras de ${names}, revisa lo que ya tienes.`;
  const secondAction = isRisk ? `Confirma cuáles de ${names} necesitan reposición.` : `Define cómo mover primero las unidades disponibles de ${names}.`;
  const thirdAction = isRisk ? `Revisa si la disponibilidad de ${names} mejoró y si evitaste ventas sin atender.` : `Comprueba si las existencias de ${names} empezaron a bajar.`;
  const phases = [
    { when: timing.labels[0], objective: isRisk ? "Confirmar qué productos podrían quedarse sin unidades." : noMovement ? "Confirmar las unidades y el tiempo sin movimiento." : "Confirmar cuánto inventario tienes frente a las ventas recientes.", action: firstAction, evidence: causeEvidence, activities: ["Confirma las existencias físicas.", diagnosis.datosDisponibles.ventas ? "Revisa las unidades vendidas recientemente." : "Registra las ventas recientes que todavía no estén en el archivo.", diagnosis.datosDisponibles.compras ? "Confirma compras o pedidos pendientes." : "Confirma manualmente si hay pedidos pendientes."] },
    { when: timing.labels[1], objective: isRisk ? "Reponer únicamente lo que la demanda y la disponibilidad justifican." : "Mover las existencias actuales sin asumir una causa ni regalar margen.", action: secondAction, evidence: isRisk ? "La reposición debe considerar ventas recientes, unidades disponibles y tiempo de entrega." : "No recomendamos descuentos o promociones sin revisar primero la causa y la rentabilidad.", activities: isRisk ? ["Prioriza los productos con más ventas y menos cobertura.", "Confirma cantidades y fecha de entrega con el proveedor.", "Anota qué productos decidiste reponer y por qué."] : [diagnosis.datosDisponibles.clientes ? "Revisa qué clientes compraban estos productos." : "Pregunta a tu equipo qué clientes compraban estos productos.", diagnosis.datosDisponibles.comerciales ? "Revisa oportunidades con los comerciales relacionados." : "Revisa oportunidades con quienes atienden a tus clientes.", "Define una acción específica por producto después de confirmar la causa."] },
    { when: timing.labels[2], objective: isRisk ? "Comprobar si mejoró la disponibilidad sin acumular unidades innecesarias." : "Comprobar si bajaron las existencias sin afectar la rentabilidad.", action: thirdAction, evidence: "Compara con las unidades disponibles al iniciar el plan.", activities: isRisk ? ["Compara las unidades disponibles.", "Revisa las unidades vendidas y las ventas que no pudiste atender.", "Ajusta la reposición si la disponibilidad no mejoró."] : ["Compara las unidades disponibles con el nivel inicial.", "Compara las unidades y el valor vendido.", diagnosis.datosDisponibles.utilidad ? "Revisa la utilidad y ajusta si no hay mejora." : "Ajusta la acción si no hay mejora."] }
  ];
  const indicators = isRisk
    ? [{ name: "Unidades disponibles", comparison: "Compáralas con el nivel inicial y con las ventas recientes." }, { name: "Unidades vendidas", comparison: "Revisa si la disponibilidad permitió atender la demanda." }, { name: "Ventas que no pudiste atender", comparison: "Anota cada caso desde el inicio del plan." }]
    : [{ name: "Unidades disponibles", comparison: "Compáralas con el nivel registrado al iniciar el plan." }, { name: "Unidades vendidas", comparison: "Compáralas con el periodo reciente equivalente." }, noMovement ? { name: "Días sin movimiento", comparison: "Revisa si los productos volvieron a tener salidas." } : diagnosis.datosDisponibles.utilidad ? { name: "Utilidad", comparison: "Confirma que mover inventario no reduzca la rentabilidad." } : { name: "Valor vendido", comparison: "Compáralo con el periodo reciente equivalente." }];
  return { phases, indicators: indicators.slice(0, 3), causeEvidence };
}

function previousOpportunityAttempt() {
  const opportunityId = currentOpportunityEntry()?.id;
  return [...app.opportunityHistory].reverse().find(item => item.cicloAnalisisId === app.currentAnalysisCycleId && item.opportunityId === opportunityId && item.retroalimentacion) || null;
}

function retryPlanAlternatives(previous, diagnosis) {
  const comment = String(previous?.retroalimentacion?.comentarioUsuario || "");
  const normalized = normalize(comment);
  const available = diagnosis.datosDisponibles || {};
  if (/(precio|tarifa)/.test(normalized)) return [
    "Compara el precio aplicado antes y después del cambio mencionado.",
    available.utilidad ? "Revisa si el cambio de precio también modificó la utilidad." : "Anota qué clientes o productos reaccionaron de forma diferente al precio.",
    "Prueba un ajuste acotado y registra desde qué fecha lo aplicaste."
  ];
  if (/(proveedor|abastec|falta de producto|agotado|sin existencias)/.test(normalized)) return [
    "Registra qué productos y fechas estuvieron afectados por la disponibilidad.",
    "Compara las ventas de esos productos durante y después del problema informado.",
    "Define una alternativa de abastecimiento solo para los productos confirmados."
  ];
  if (/(cliente|comprador)/.test(normalized)) return [
    "Separa los clientes que respondieron de los que todavía no volvieron a comprar.",
    "Trabaja una acción distinta con el grupo que sigue sin comprar.",
    "Compara cuántos clientes compraron antes y después de la nueva acción."
  ];
  return [
    "Revisa la nueva información que apareció durante el primer plan.",
    "Prueba una acción distinta sobre la causa que todavía no está resuelta.",
    "Compara el resultado con el mismo punto de partida del plan anterior."
  ];
}

function adaptPlanForRetry(detail, diagnosis, analysisContext = {}) {
  if ((analysisContext.opportunityAttempt || 1) <= 1) return detail;
  const previous = analysisContext.previousFeedback || null;
  if (!previous) return detail;
  const completed = new Set((previous.actividades || []).filter(item => item.completada).map(item => normalize(item.actividad)));
  const alternatives = retryPlanAlternatives(previous, diagnosis);
  const phases = detail.phases.map((phase, phaseIndex) => {
    let replacementUsed = false;
    const activities = phase.activities.map(activity => {
      if (!completed.has(normalize(activity))) return activity;
      replacementUsed = true;
      return alternatives[phaseIndex];
    });
    if (!replacementUsed && completed.size) activities[0] = alternatives[phaseIndex];
    return { ...phase, action: phaseIndex === 0 ? "Revisa lo nuevo que aprendimos antes de actuar otra vez." : phase.action, activities: [...new Set(activities)] };
  });
  const comment = String(previous.retroalimentacion?.comentarioUsuario || "").trim();
  return {
    ...detail,
    phases,
    causeEvidence: comment ? `Nos contaste: “${comment.slice(0, 180)}${comment.length > 180 ? "…" : ""}”. Lo usamos como contexto para probar un camino diferente.` : "El plan anterior no produjo evidencia suficiente de mejora; probaremos un camino diferente."
  };
}

function opportunityFocusKind(opportunity) {
  const finding = opportunity.rawFinding || {};
  const searchable = normalize([opportunity.type, opportunity.title, ...(opportunity.observedCauses || [])].join(" "));
  if (finding.driver?.dimension === "cliente" || /cliente|comprador|inactiv/.test(searchable)) return "customers";
  if (finding.driver?.dimension === "vendedor" || /comercial|vendedor|asesor/.test(searchable)) return "commercial";
  if (/concentration|maintain/.test(opportunity.type) || (opportunity.domain === "sales" && /dependencia.{0,30}producto|producto.{0,30}concentr/.test(searchable))) return "concentration";
  if (opportunity.domain === "profit" || /utilidad|margen|rentabilidad/.test(searchable)) return "profit";
  if (opportunity.domain === "inventory" && /sin movimiento|inmovil|no movement/.test(searchable)) return "no-movement";
  if (opportunity.domain === "inventory" && /falta|agot|stockout|riesgo/.test(searchable)) return "stock-risk";
  if (opportunity.domain === "inventory") return "inventory";
  if (finding.driver?.dimension === "producto" || /producto|referencia/.test(searchable)) return "products";
  if (/business-decline|trend|product-decline|sales-decline-cause/.test(opportunity.type)) return "sales";
  return "general";
}

function opportunityContract(finding, diagnosis, entry) {
  return {
    id: entry?.id || stableOpportunityId(app.currentAnalysisCycleId || "revision-actual", finding, app.activeOpportunityIndex),
    domain: entry?.domain || opportunityDomain(finding),
    type: finding?.type || "general",
    title: diagnosis?.problemGeneral || finding?.problemaGeneral || finding?.title || "Oportunidad de mejora",
    evidence: (Array.isArray(diagnosis?.evidenciaProblema) ? diagnosis.evidenciaProblema : [diagnosis?.evidenciaProblema || finding?.evidence || finding?.reason]).filter(Boolean),
    magnitude: diagnosis?.magnitud || finding?.magnitudDetalle || finding?.magnitud || null,
    urgency: diagnosis?.nivelUrgencia || finding?.nivelUrgencia || "Observación",
    observedCauses: [...(diagnosis?.causasObservadas || finding?.causasObservadas || [])],
    priorityFocus: [...(diagnosis?.focosPrioritarios || finding?.focosPrioritarios || [])],
    availableData: { ...(diagnosis?.datosDisponibles || {}) },
    dataQuality: { ...(diagnosis?.calidadInformacion || {}) },
    rawFinding: finding
  };
}

function customerActionPlan(opportunity, diagnosis, timing, analysisContext) {
  const customers = relatedDeclineEntities("", "cliente", analysisContext).slice(0, 8);
  const sellers = diagnosis.datosDisponibles.comerciales ? relatedDeclineEntities(analysisContext.products[0] || "", "vendedor", analysisContext).slice(0, 2) : [];
  const named = opportunity.rawFinding?.driver?.dimension === "cliente" ? [opportunity.rawFinding.driver.product] : customers.map(item => item.name);
  const names = [...new Set(named.filter(Boolean))].slice(0, 5);
  const focus = names.length ? names.join(", ") : "los clientes que dejaron de comprar o redujeron sus compras";
  const product = analysisContext.products[0] ? productSubject(analysisContext.products[0], false, analysisContext.dataset) : "los productos relacionados";
  const customerEvidence = customers.length ? `${customers.map(item => item.name).join(", ")} son los clientes con las mayores reducciones observadas.` : "";
  const causeEvidence = customerEvidence || opportunity.observedCauses[0] || opportunity.priorityFocus[0]?.evidencia || opportunity.evidence[0];
  const phases = [
    { when: timing.labels[0], action: names.length ? `Revisa los ${names.length} clientes que más redujeron la compra de ${product}.` : `Revisa qué cambió en las compras de ${focus}.`, evidence: causeEvidence, activities: ["Compara cuándo compraron por última vez y cuánto compraban antes.", sellers[0] ? `Habla con ${sellers[0].name} y revisen qué cambió con estos clientes.` : "Pregunta a quienes atienden estos clientes qué cambió.", "Anota qué cambio está confirmado y qué todavía es una posibilidad."] },
    { when: timing.labels[1], action: "Trabaja primero con los clientes que más explican la reducción.", evidence: "La acción debe partir de lo que el cliente o el equipo logre confirmar.", activities: ["Contacta a los clientes priorizados y pregunta qué cambió.", "Define una acción concreta para cada causa confirmada.", "Registra quién fue contactado, qué respondió y desde qué fecha actuarás."], questions: ["¿Qué cambió en tus compras?", "¿Tuviste algún problema con el producto o servicio?", "¿Cambió el precio o tu necesidad?"] },
    { when: timing.labels[2], action: "Comprueba si los clientes priorizados volvieron a comprar.", evidence: "Compara periodos equivalentes y conserva separados los hechos de las explicaciones.", activities: ["Cuenta cuántos clientes volvieron a comprar.", "Compara las unidades o el valor vendido a esos clientes.", "Ajusta la acción si no aparece una mejora verificable."] }
  ];
  const signals = salesPlanSignals({ ...opportunity.rawFinding, type: "customer-opportunity" }, diagnosis, timing, [], analysisContext);
  return { phases, signals, indicators: signals.map(signal => ({ name: signal.name, comparison: signal.note || "Compáralo con el punto de partida." })), causeEvidence };
}

function commercialActionPlan(opportunity, diagnosis, timing, analysisContext) {
  const sellers = relatedDeclineEntities("", "vendedor", analysisContext).slice(0, 5);
  const named = opportunity.rawFinding?.driver?.dimension === "vendedor" ? [opportunity.rawFinding.driver.product] : sellers.map(item => item.name);
  const names = [...new Set(named.filter(Boolean))];
  const focus = names.length ? names.join(" y ") : "los comerciales relacionados con la reducción";
  const causeEvidence = opportunity.observedCauses[0] || opportunity.priorityFocus[0]?.evidencia || opportunity.evidence[0];
  const phases = [
    { when: timing.labels[0], action: `Habla con ${focus} y revisen qué cambió en las ventas atendidas.`, evidence: causeEvidence, activities: ["Compara sus ventas anteriores y recientes usando la misma medida.", "Revisa qué clientes, productos o zonas explican la diferencia.", "No atribuyas la causa al comercial hasta confirmar qué ocurrió."] },
    { when: timing.labels[1], action: "Trabaja sobre las causas confirmadas con el equipo comercial.", evidence: "La evidencia puede señalar dónde ocurrió el cambio, pero no demuestra por sí sola quién lo causó.", activities: ["Define una acción concreta para cada causa confirmada.", "Asigna responsable y fecha sin duplicar actividades de otros planes.", "Registra qué se hizo y con qué clientes o productos."] },
    { when: timing.labels[2], action: "Comprueba si las ventas atendidas por los comerciales priorizados mejoraron.", evidence: "Usa periodos equivalentes y la misma medida del diagnóstico.", activities: ["Compara unidades o valor vendido.", "Revisa si mejoraron los clientes o productos afectados.", "Ajusta la acción si el cambio no es verificable."] }
  ];
  const salesSignals = salesPlanSignals({ ...opportunity.rawFinding, type: "commercial-opportunity" }, diagnosis, timing, [], analysisContext).filter(signal => signal.name !== "Clientes que volvieron a comprar");
  const teamSignal = names.length ? { name: "Comerciales con ventas recuperadas", today: `0 de ${names.length}`, target: `${Math.max(1, Math.ceil(names.length / 2))} de ${names.length}`, note: "Verificar una recuperación parcial en el periodo de revisión." } : null;
  const signals = [teamSignal, ...salesSignals].filter(Boolean).slice(0, 3);
  return { phases, signals, indicators: signals.map(signal => ({ name: signal.name, comparison: signal.note || "Compáralo con el punto de partida." })), causeEvidence };
}

function concentrationActionPlan(opportunity, diagnosis, timing, analysisContext) {
  const metrics = analysisContext.metrics;
  const leaders = (metrics.ranked || []).slice(0, 2).map(item => productSubject(item[0], false, analysisContext.dataset));
  const focus = leaders.join(" y ") || "los productos que concentran las ventas";
  const total = metrics.rankingBasis === "value" ? metrics.revenue : metrics.units;
  const leadingValue = (metrics.ranked || []).slice(0, 2).reduce((sum, item) => sum + (metrics.rankingBasis === "value" ? item[1].revenue : item[1].units), 0);
  const share = total ? leadingValue / total : metrics.topShare || 0;
  const targetShare = Math.max(0, share - .08);
  const causeEvidence = opportunity.observedCauses[0] || opportunity.priorityFocus[0]?.evidencia || opportunity.evidence[0];
  const phases = [
    { when: timing.labels[0], action: `Revisa por qué tus ventas dependen tanto de ${focus}.`, evidence: causeEvidence, activities: ["Confirma qué porcentaje aportan los productos principales.", "Revisa qué otros productos tienen demanda comprobable.", "Identifica el riesgo de que uno de los productos principales venda menos o no esté disponible."] },
    { when: timing.labels[1], action: "Trabaja una alternativa concreta para reducir la dependencia sin descuidar lo que ya se vende.", evidence: "Diversificar solo tiene sentido cuando existe demanda o una oportunidad comercial confirmada.", activities: ["Elige un producto alternativo con evidencia de demanda.", "Define una acción pequeña para aumentar su participación.", "Mantén disponibles los productos que hoy sostienen las ventas."] },
    { when: timing.labels[2], action: "Comprueba si las ventas están menos concentradas.", evidence: "Compara la participación de los mismos productos en periodos equivalentes.", activities: ["Calcula nuevamente la participación de los productos principales.", "Revisa si otros productos aumentaron su aporte.", "Ajusta la acción sin poner en riesgo las ventas actuales."] }
  ];
  const signals = [
    { name: "Participación de los productos principales", today: readablePercent(share), target: readablePercent(targetShare), note: "Reducir gradualmente la dependencia, no eliminar la venta de los productos principales." },
    { name: "Productos con ventas activas", today: `${(metrics.ranked || []).filter(item => item[1].units > 0 || item[1].revenue > 0).length} productos`, target: "Aumentar al menos un producto con demanda confirmada", note: "Contar solo productos con ventas reales." }
  ];
  return { phases, signals, indicators: signals.map(signal => ({ name: signal.name, comparison: signal.note })), causeEvidence };
}

function genericActionPlan(opportunity, diagnosis, timing) {
  const cause = opportunity.observedCauses[0] || opportunity.priorityFocus[0]?.evidencia || opportunity.evidence[0] || "Todavía necesitamos confirmar qué está explicando esta oportunidad.";
  const secondCause = opportunity.observedCauses[1] || opportunity.priorityFocus[1]?.evidencia;
  const available = Object.entries(opportunity.availableData).filter(([, value]) => value).map(([key]) => key).slice(0, 3).join(", ");
  const phases = [
    { when: timing.labels[0], action: "Entender qué está explicando esta oportunidad.", evidence: opportunity.evidence[0] || cause, activities: [`Revisa la evidencia disponible: ${opportunity.evidence[0] || cause}`, `Confirma esta posible explicación: ${cause}`, secondCause ? `Compara también este foco: ${secondCause}` : `Usa los datos disponibles${available ? ` de ${available}` : ""} y anota qué información falta.`] },
    { when: timing.labels[1], action: "Trabajar sobre las causas principales que encontramos.", evidence: cause, activities: ["Elige únicamente una causa que hayas podido confirmar.", "Define una acción concreta, un responsable y una fecha.", "Registra lo que hiciste sin convertir una hipótesis en un hecho."] },
    { when: timing.labels[2], action: "Comprobar si la situación empezó a mejorar.", evidence: "Compara la misma evidencia con el punto de partida.", activities: ["Revisa nuevamente la señal relacionada con la oportunidad.", "Compara el resultado con el punto de partida.", "Ajusta la acción si no existe una mejora verificable."] }
  ];
  const signals = [{ name: "Estado de la oportunidad", today: "Pendiente de confirmar", target: "Causa principal confirmada y acción registrada", note: "Usa la misma evidencia para comprobar el cambio." }];
  return { phases, signals, indicators: [{ name: signals[0].name, comparison: signals[0].note }], causeEvidence: cause };
}

function buildPlanForOpportunity(opportunity, analysisContext) {
  const { diagnosis, timing, products } = analysisContext;
  const focusKind = opportunityFocusKind(opportunity);
  let detail;
  if (focusKind === "customers") detail = customerActionPlan(opportunity, diagnosis, timing, analysisContext);
  else if (focusKind === "commercial") detail = commercialActionPlan(opportunity, diagnosis, timing, analysisContext);
  else if (focusKind === "concentration") detail = concentrationActionPlan(opportunity, diagnosis, timing, analysisContext);
  else if (focusKind === "profit") {
    detail = salesActionPlan(opportunity.rawFinding, diagnosis, timing, products, analysisContext);
    detail.signals = salesPlanSignals(opportunity.rawFinding, diagnosis, timing, products, analysisContext);
  } else if (["inventory", "stock-risk", "no-movement"].includes(focusKind)) {
    detail = inventoryActionPlan(opportunity.rawFinding, diagnosis, timing, products, analysisContext);
    detail.signals = inventoryPlanSignals(opportunity.rawFinding, diagnosis, timing, products, analysisContext);
  } else if (["products", "sales"].includes(focusKind)) {
    detail = salesActionPlan(opportunity.rawFinding, diagnosis, timing, products, analysisContext);
    detail.signals = salesPlanSignals(opportunity.rawFinding, diagnosis, timing, products, analysisContext);
  } else detail = genericActionPlan(opportunity, diagnosis, timing);
  detail = adaptPlanForRetry(detail, diagnosis, analysisContext);
  const phases = detail.phases.map(phase => ({ ...phase, activities: [...phase.activities], questions: phase.questions ? [...phase.questions] : undefined }));
  const signals = (detail.signals || []).map(signal => ({ ...signal }));
  const activities = phases.flatMap((phase, phaseIndex) => phase.activities.map((activity, activityIndex) => ({ id: `${opportunity.id}-f${phaseIndex + 1}-a${activityIndex + 1}`, phase: phaseIndex + 1, text: activity })));
  const targets = signals.map(signal => ({ signal: signal.name, target: signal.target, current: signal.today }));
  return {
    opportunityId: opportunity.id,
    domain: opportunity.domain,
    type: opportunity.type,
    focusKind,
    opportunityTitle: opportunity.title,
    causes: [...opportunity.observedCauses],
    focus: opportunity.priorityFocus.map(item => ({ ...item })),
    problemGeneral: opportunity.title,
    causeWorked: detail.causeEvidence,
    problemEvidence: [...opportunity.evidence].slice(0, 2),
    causeEvidence: opportunity.priorityFocus.map(item => item.evidencia).filter(item => item && item !== detail.causeEvidence).slice(0, 2),
    context: [...(analysisContext.relevantContext || [])],
    urgency: opportunity.urgency,
    phases,
    activities,
    signals,
    targets,
    indicators: detail.indicators || signals.map(signal => ({ name: signal.name, comparison: signal.note || "Compáralo con el punto de partida." })),
    progress: { completed: 0, total: activities.length, activityProgress: Object.fromEntries(activities.map(activity => [activity.id, false])) }
  };
}

const PLAN_GENERATOR_VERSION = 2;

function getActionPlan() {
  const finding = currentOpportunityFinding();
  const diagnosis = currentOpportunityDiagnosis();
  if (!finding || !diagnosis) return { problemGeneral: "Información insuficiente", causeWorked: "Completar la información", problemEvidence: [], causeEvidence: [], context: [], phases: [], signals: [], indicators: [] };
  const entry = currentOpportunityEntry();
  const opportunity = opportunityContract(finding, diagnosis, entry);
  const planKey = `${opportunity.id}:intento-${app.opportunityAttempt}`;
  const savedState = app.opportunityPlans[planKey];
  if (savedState?.plannerVersion === PLAN_GENERATOR_VERSION && savedState.plan) {
    app.actionPlan = savedState.plan.handoff || null;
    return savedState.plan;
  }
  const timing = actionPlanTiming(diagnosis.nivelUrgencia);
  const products = planProductNames(finding);
  const relevantContext = (diagnosis.coincidenciasContextoDatos || []).map(item => item.texto || item).filter(Boolean).slice(0, 2);
  const analysisContext = {
    metrics: app.analysis.metrics,
    dataset: app.dataset || { sales: [], inventory: [] },
    businessContext: { ...app.context },
    diagnosis,
    timing,
    products: [...products],
    relevantContext,
    previousFeedback: previousOpportunityAttempt(),
    opportunityAttempt: app.opportunityAttempt,
    dataQuality: app.analysis.resultQuality
  };
  const plan = buildPlanForOpportunity(opportunity, analysisContext);
  const baseline = {
    periodo: diagnosis.periodoAnalizado,
    promedioMensualReciente: app.analysis.metrics.panorama?.reliable ? app.analysis.metrics.panorama.recentAverage : null,
    unidad: app.analysis.metrics.panorama?.basis === "value" ? "valor vendido" : "unidades vendidas",
    inventario: latestInventoryBaseline(products, analysisContext.dataset)
  };
  const handoff = {
    opportunityId: opportunity.id,
    domain: opportunity.domain,
    problemGeneral: plan.problemGeneral,
    causaTrabajada: plan.causeWorked,
    accionesPropuestas: plan.phases.map(phase => phase.action),
    actividades: plan.phases.flatMap((phase, phaseIndex) => phase.activities.map(activity => ({ fase: phaseIndex + 1, momento: phase.when, actividad: activity }))),
    fechaInicio: isoDateAfter(0),
    fechaRevision: isoDateAfter(timing.days[2]),
    indicadoresSeguimiento: plan.indicators,
    valorBase: baseline
  };
  plan.handoff = handoff;
  app.actionPlan = handoff;
  app.opportunityPlans[planKey] = {
    plannerVersion: PLAN_GENERATOR_VERSION,
    opportunityId: opportunity.id,
    opportunityIndex: app.activeOpportunityIndex,
    domain: opportunity.domain,
    attempt: app.opportunityAttempt,
    plan,
    tasks: Array(plan.activities.length).fill(false),
    feedback: null
  };
  return plan;
}

function currentOpportunityPlanState() {
  const opportunity = currentOpportunityEntry();
  return app.opportunityPlans[`${opportunity?.id || "oportunidad-actual"}:intento-${app.opportunityAttempt}`] || null;
}

function getPlan() {
  return getActionPlan().phases;
}

function updateTask(event) {
  const index = Number(event.target.dataset.task);
  app.tasks[index] = event.target.checked;
  const done = app.tasks.filter(Boolean).length;
  document.querySelectorAll("#task-count").forEach(element => { element.textContent = `${done} de ${app.tasks.length}`; });
  $("#plan-finished-message")?.classList.toggle("hidden", done !== app.tasks.length || app.tasks.length === 0);
  let offset = 0;
  getActionPlan().phases.forEach((phase, phaseIndex) => {
    const phaseDone = app.tasks.slice(offset, offset + phase.activities.length).filter(Boolean).length;
    document.querySelectorAll(`[data-phase-progress="${phaseIndex}"]`).forEach(element => { element.textContent = `${phaseDone} de ${phase.activities.length} actividades`; });
    offset += phase.activities.length;
  });
  event.target.closest(".action-check")?.classList.toggle("completed", event.target.checked);
  const currentEntry = currentOpportunityEntry();
  const currentCycle = [...app.opportunityHistory].reverse().find(item =>
    item.opportunityId === currentEntry?.id && item.intento === app.opportunityAttempt
  );
  if (currentCycle?.actividades?.[index]) currentCycle.actividades[index].completada = event.target.checked;
  const planState = currentOpportunityPlanState();
  if (planState) {
    planState.tasks = [...app.tasks];
    planState.plan.progress.completed = done;
    const activityId = planState.plan.activities[index]?.id;
    if (activityId) planState.plan.progress.activityProgress[activityId] = event.target.checked;
  }
  persistDemoProgress();
}

function detectFollowupEvents(comment) {
  const text = normalize(comment || "");
  const eventPatterns = [
    ["Pérdida de cliente", /(perdi|perdimos|perdio|dejo de comprar|se retiro).{0,35}cliente|cliente.{0,35}(perdi|perdimos|perdio|dejo de comprar|se retiro)/],
    ["Cambio de precio", /(cambi|sub|baj).{0,20}(precio|tarifa)|(precio|tarifa).{0,20}(cambi|sub|baj)/],
    ["Cambio relacionado con proveedor", /proveedor|abastecimiento/],
    ["Falta de producto", /falta.{0,20}producto|sin existencias|agotado|escasez/],
    ["Nuevo comercial", /nuevo.{0,20}(comercial|vendedor)|(comercial|vendedor).{0,20}nuevo/],
    ["Cierre", /cerramos|cierre|cerrado/],
    ["Competencia", /competencia|competidor/],
    ["Temporada especial", /temporada|festiv|vacacion|evento especial/]
  ];
  return eventPatterns.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

function buildFeedbackRecord(values, reviewedAt = new Date()) {
  const actionPlan = getActionPlan();
  const opportunity = currentOpportunityEntry();
  const activities = actionPlan.phases.flatMap((phase, phaseIndex) => phase.activities.map(activity => ({ fase: phaseIndex + 1, actividad: activity })));
  const completed = activities.filter((_, index) => Boolean(app.tasks[index]));
  const pending = activities.filter((_, index) => !app.tasks[index]);
  const comment = String(values.comentarioUsuario || "").trim();
  const planCompleted = values.planCompletado || "";
  const perceivedImprovement = values.mejoraPercibida || "";
  const goals = (actionPlan.signals || []).map(signal => ({
    señal: signal.name,
    valorAntesDelPlan: signal.today,
    meta: signal.target,
    referenciaAnterior: signal.reference || ""
  }));
  const date = reviewedAt instanceof Date ? reviewedAt : new Date(reviewedAt);
  return {
    opportunityId: opportunity?.id || null,
    opportunityIndex: app.activeOpportunityIndex,
    opportunityDomain: opportunity?.domain || opportunityDomain(currentOpportunityFinding()),
    attempt: app.opportunityAttempt,
    planCompletado: planCompleted,
    mejoraPercibida: perceivedImprovement,
    comentarioUsuario: comment,
    fechaRevision: Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(),
    problemaTrabajado: actionPlan.problemGeneral,
    causaTrabajada: actionPlan.causeWorked,
    accionesRealizadas: completed,
    accionesPendientes: pending,
    metasPrevias: goals,
    resultadosDisponibles: {
      hayDatosNuevos: false,
      resultados: [],
      puntoDePartida: goals.map(goal => ({ señal: goal.señal, valor: goal.valorAntesDelPlan }))
    },
    loQueDiceElUsuario: { planCompletado: planCompleted, mejoraPercibida: perceivedImprovement, comentario: comment },
    loQueMuestranLosDatos: { hayDatosNuevos: false, resultados: [] },
    nuevosCambiosMencionados: detectFollowupEvents(comment)
  };
}

function recordOpportunityReview(feedbackRecord) {
  const cycle = [...app.opportunityHistory].reverse().find(item =>
    item.opportunityId === feedbackRecord?.opportunityId && item.intento === feedbackRecord?.attempt
  );
  if (!cycle || !feedbackRecord) return null;
  cycle.resultado = feedbackRecord.resultadosDisponibles;
  cycle.retroalimentacion = {
    planCompletado: feedbackRecord.planCompletado,
    mejoraPercibida: feedbackRecord.mejoraPercibida,
    comentarioUsuario: feedbackRecord.comentarioUsuario,
    fechaRevision: feedbackRecord.fechaRevision
  };
  const dataResult = feedbackRecord.loQueMuestranLosDatos || {};
  const decision = decideOpportunityAfterReview({
    hasNewData: Boolean(dataResult.hayDatosNuevos),
    outcome: dataResult.estado || "unknown",
    improvedEnough: Boolean(dataResult.mejoraSuficiente),
    remainsHighestPriority: dataResult.sigueSiendoPrioritaria !== false,
    planCompleted: feedbackRecord.planCompletado,
    perceivedImprovement: feedbackRecord.mejoraPercibida,
    comment: feedbackRecord.comentarioUsuario
  });
  cycle.estadoFinal = decision.state;
  cycle.resultadoClasificado = decision.key;
  cycle.actividadesRealizadas = feedbackRecord.accionesRealizadas;
  cycle.actividadesPendientes = feedbackRecord.accionesPendientes;
  cycle.metas = feedbackRecord.metasPrevias;
  cycle.nuevosEventos = feedbackRecord.nuevosCambiosMencionados;
  const planState = currentOpportunityPlanState();
  if (planState) {
    planState.tasks = [...app.tasks];
    planState.feedback = { ...cycle.retroalimentacion };
  }
  const analysisCycle = currentAnalysisCycle();
  if (analysisCycle) {
    analysisCycle.retroalimentacion.push({ oportunidadIndice: app.activeOpportunityIndex, intento: app.opportunityAttempt, ...cycle.retroalimentacion, resultado: decision.state, actividadesRealizadas: feedbackRecord.accionesRealizadas, actividadesPendientes: feedbackRecord.accionesPendientes, metas: feedbackRecord.metasPrevias, nuevosEventos: feedbackRecord.nuevosCambiosMencionados });
    analysisCycle.nuevosEventos = [...new Set([...analysisCycle.nuevosEventos, ...feedbackRecord.nuevosCambiosMencionados])];
    analysisCycle.actividadesRealizadas.push(...feedbackRecord.accionesRealizadas.map(item => ({ oportunidadIndice: app.activeOpportunityIndex, intento: app.opportunityAttempt, ...item })));
    analysisCycle.actividadesPendientes.push(...feedbackRecord.accionesPendientes.map(item => ({ oportunidadIndice: app.activeOpportunityIndex, intento: app.opportunityAttempt, ...item })));
    analysisCycle.metas.push(...feedbackRecord.metasPrevias.map(item => ({ oportunidadIndice: app.activeOpportunityIndex, intento: app.opportunityAttempt, ...item })));
    analysisCycle.resultados.push({ oportunidadIndice: app.activeOpportunityIndex, intento: app.opportunityAttempt, clasificacion: decision.state, datos: feedbackRecord.loQueMuestranLosDatos, percepcion: feedbackRecord.loQueDiceElUsuario, fecha: feedbackRecord.fechaRevision });
    const priority = analysisCycle.prioridades[app.activeOpportunityIndex];
    if (priority) priority.estado = decision.next ? "atendida suficientemente" : decision.key === "partial" ? "mejorando" : "todavía necesita atención";
  }
  app.lastOpportunityDecision = {
    ...decision,
    completedOpportunityId: feedbackRecord.opportunityId,
    completedOpportunityIndex: feedbackRecord.opportunityIndex
  };
  return app.lastOpportunityDecision;
}

function saveFeedback(event) {
  event.preventDefault();
  if (isListening && speechRecognition) {
    isListening = false;
    clearTimeout(speechRestartTimer);
    speechRecognition.stop();
  }
  app.feedback = buildFeedbackRecord(Object.fromEntries(new FormData(event.currentTarget)));
  recordOpportunityReview(app.feedback);
  app.completed.feedback = true;
  go(10);
}

function showTestSummary() {
  const steps = [
    ["Análisis iniciado", app.completed.start],
    ["Contexto completado", app.completed.form],
    ["Información interpretada", app.completed.data],
    ["Calidad evaluada", app.completed.quality],
    ["Oportunidad principal generada", app.completed.priority],
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

const executiveResponsibilityNote = "Este informe presenta orientaciones y recomendaciones basadas en la información suministrada. San José no toma decisiones por la empresa. La revisión, interpretación final y ejecución de acciones son responsabilidad exclusiva de los propietarios, administradores o responsables del negocio.";

function executiveSummaryModel() {
  if (!app.analysis) return null;
  const { metrics, resultQuality: quality } = app.analysis;
  const diagnosis = app.analysis.diagnostico || {};
  const finding = app.analysis.priorities[0];
  const presentation = finding ? priorityPresentation(finding) : null;
  const cards = stageThreeSummaryCards();
  const comparison = trendComparison(metrics.monthly, metrics.chartBasis);
  const dates = (app.dataset?.sales || []).map(row => new Date(row.fecha)).filter(date => !Number.isNaN(date.getTime())).sort((a, b) => a - b);
  const period = dates.length ? `${new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" }).format(dates[0])} a ${new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" }).format(dates.at(-1))}` : "No pudimos calcular el periodo porque no encontramos fechas utilizables.";
  const salesText = comparison.available ? trendMeaning(metrics.monthly, metrics.chartBasis) : comparison.reason;
  const inventory = app.dataset?.inventory || [];
  const inventoryText = !inventory.length
    ? "No encontramos inventario; por eso no evaluamos productos acumulados ni posibles faltantes."
    : metrics.linkedProducts
      ? `Pudimos relacionar ${readableNumber(metrics.linkedProducts)} productos entre ventas e inventario.`
      : "Encontramos inventario, pero no pudimos relacionarlo con suficiente claridad con los productos vendidos.";
  const valueOf = item => metrics.chartBasis === "value" ? item[1].revenue : item[1].units;
  const total = metrics.chartBasis === "value" ? metrics.revenue : metrics.units;
  const products = metrics.chartBasis && total ? metrics.ranked.slice(0, 5).map(item => ({
    label: item[0],
    share: valueOf(item) / total,
    text: `${readablePercent(valueOf(item) / total)} ${metrics.chartBasis === "value" ? "del valor vendido" : "de las unidades vendidas"}`
  })) : [];
  const reviewItems = (diagnosis.focosPrioritarios || []).map(item => item.evidencia).filter(Boolean).slice(0, 3);
  const limitations = analysisLimitations();
  const hypotheses = diagnosis.hipotesisPorValidar || [];
  return {
    title: "Resumen para tomar decisiones",
    subtitle: "Revisamos tu información. Estos son los puntos más importantes para entender qué está pasando.",
    date: new Intl.DateTimeFormat("es-CO", { dateStyle: "long" }).format(new Date()),
    period,
    overview: [salesText, inventoryText].filter(Boolean),
    causes: (diagnosis.causasObservadas || []).slice(0, 3),
    products,
    priority: presentation ? {
      title: presentation.title,
      metrics: presentation.metrics.slice(0, 4),
      important: presentation.important,
      reviewItems: reviewItems.length ? reviewItems : [diagnosticReviewText(finding)]
    } : { title: "Todavía no podemos indicar una prioridad", metrics: [], important: quality.reasons[0] || resultQualityCopy(quality), reviewItems: [] },
    context: (diagnosis.coincidenciasContextoDatos || []).map(item => item.texto || item).slice(0, 2),
    unknown: [...hypotheses, ...limitations].filter(Boolean),
    quality: {
      label: `${quality.score} % · ${quality.level[0] + quality.level.slice(1).toLowerCase()}`,
      explanation: resultQualityCopy(quality),
      details: quality.details.slice(0, 6).map(item => `${item.label}: ${readablePercent(item.rate)} utilizable`)
    },
    cards,
    monthly: metrics.monthly.slice(-6).map(item => ({ label: monthName(item.month), value: item.value })),
    chartLabel: metrics.chartBasis === "value" ? "Valor vendido por mes" : metrics.chartBasis === "quantity" ? "Unidades vendidas por mes" : "Ventas por mes",
    responsibility: executiveResponsibilityNote
  };
}

function pdfSafeText(value) {
  return String(value ?? "").replace(/[\u2010-\u2015]/g, "-").replace(/\u2192/g, ">").replace(/[\u00a0\u202f]/g, " ");
}

async function buildExecutiveSummaryPdf(logoBytes) {
  const model = executiveSummaryModel();
  if (!model || !globalThis.PDFLib) throw new Error("No fue posible preparar el resumen en PDF.");
  const { PDFDocument, StandardFonts, PageSizes, rgb } = globalThis.PDFLib;
  const pdf = await PDFDocument.create();
  pdf.setTitle("Resumen para tomar decisiones - San José");
  pdf.setAuthor("San José - Transformación Estratégica");
  pdf.setSubject("Orientación empresarial basada en la información suministrada");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const serif = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const logo = await pdf.embedPng(logoBytes);
  const PAGE_WIDTH = 595.28, PAGE_HEIGHT = 841.89, MARGIN = 46, CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
  const navy = rgb(1 / 255, 18 / 255, 53 / 255), gold = rgb(216 / 255, 166 / 255, 58 / 255), ink = rgb(31 / 255, 41 / 255, 55 / 255), muted = rgb(101 / 255, 112 / 255, 134 / 255), pale = rgb(248 / 255, 242 / 255, 228 / 255), line = rgb(220 / 255, 225 / 255, 233 / 255), white = rgb(1, 1, 1);
  const pages = [];
  let page, y;
  const newPage = first => {
    page = pdf.addPage(PageSizes.A4);
    pages.push(page);
    if (first) {
      page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 154, width: PAGE_WIDTH, height: 154, color: navy });
      page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 158, width: PAGE_WIDTH, height: 4, color: gold });
      page.drawText("MINI INFORME GERENCIAL", { x: MARGIN, y: PAGE_HEIGHT - 48, size: 8, font: bold, color: gold });
      page.drawText(pdfSafeText(model.title), { x: MARGIN, y: PAGE_HEIGHT - 83, size: 24, font: serif, color: white });
      wrap(model.subtitle, regular, 9.5, 330).slice(0, 2).forEach((lineText, index) => page.drawText(lineText, { x: MARGIN, y: PAGE_HEIGHT - 106 - index * 12, size: 9.5, font: regular, color: white }));
      page.drawText(pdfSafeText(model.date), { x: MARGIN, y: PAGE_HEIGHT - 132, size: 8, font: regular, color: rgb(.82, .85, .9) });
      page.drawImage(logo, { x: PAGE_WIDTH - MARGIN - 104, y: PAGE_HEIGHT - 139, width: 104, height: 104 });
      y = PAGE_HEIGHT - 184;
    } else {
      page.drawRectangle({ x: MARGIN, y: PAGE_HEIGHT - 29, width: CONTENT_WIDTH, height: 2, color: gold });
      page.drawText("SAN JOSE - TRANSFORMACION ESTRATEGICA", { x: MARGIN, y: PAGE_HEIGHT - 22, size: 7, font: bold, color: navy });
      y = PAGE_HEIGHT - 54;
    }
  };
  const ensure = height => { if (y - height < 58) newPage(false); };
  const wrap = (text, font, size, width) => {
    const words = pdfSafeText(text).split(/\s+/).filter(Boolean), lines = [];
    let current = "";
    words.forEach(word => {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width || !current) current = candidate;
      else { lines.push(current); current = word; }
    });
    if (current) lines.push(current);
    return lines.length ? lines : [""];
  };
  const paragraph = (text, options = {}) => {
    const font = options.font || regular, size = options.size || 10, color = options.color || ink, width = options.width || CONTENT_WIDTH, indent = options.indent || 0, lineHeight = options.lineHeight || size * 1.42;
    const lines = wrap(text, font, size, width - indent);
    lines.forEach(lineText => { ensure(lineHeight + 3); page.drawText(lineText, { x: MARGIN + indent, y, size, font, color }); y -= lineHeight; });
    y -= options.after ?? 7;
  };
  const sectionTitle = title => {
    ensure(45);
    y -= 7;
    page.drawText(pdfSafeText(title), { x: MARGIN, y, size: 15, font: serif, color: navy });
    y -= 8;
    page.drawRectangle({ x: MARGIN, y, width: 36, height: 2, color: gold });
    y -= 18;
  };
  const bullets = items => items.forEach(item => paragraph(`- ${item}`, { indent: 8, after: 3 }));

  newPage(true);
  paragraph(`Periodo revisado: ${model.period}`, { font: bold, color: navy, after: 14 });
  sectionTitle("Cifras clave del análisis");
  for (let index = 0; index < model.cards.length; index += 2) {
    ensure(68);
    const row = model.cards.slice(index, index + 2);
    row.forEach((card, column) => {
      const x = MARGIN + column * (CONTENT_WIDTH / 2 + 5), width = CONTENT_WIDTH / 2 - 5;
      page.drawRectangle({ x, y: y - 52, width, height: 58, color: rgb(.97, .975, .98), borderColor: line, borderWidth: .5 });
      page.drawRectangle({ x, y: y + 3, width, height: 3, color: gold });
      page.drawText(pdfSafeText(card.value), { x: x + 12, y: y - 18, size: 15, font: bold, color: navy, maxWidth: width - 24 });
      const labelLines = wrap(card.label, regular, 8.5, width - 24).slice(0, 2);
      labelLines.forEach((label, lineIndex) => page.drawText(label, { x: x + 12, y: y - 34 - lineIndex * 10, size: 8.5, font: regular, color: muted }));
    });
    y -= 70;
  }

  sectionTitle("Qué pasó con tus ventas / inventario");
  model.overview.forEach(item => paragraph(item));
  if (model.monthly.length >= 2) {
    ensure(178);
    paragraph(model.chartLabel, { font: bold, color: navy, after: 5 });
    const chartHeight = 105, baseY = y - chartHeight, maxValue = Math.max(...model.monthly.map(item => item.value), 1), gap = 12, barWidth = (CONTENT_WIDTH - gap * (model.monthly.length - 1)) / model.monthly.length;
    page.drawRectangle({ x: MARGIN, y: baseY, width: CONTENT_WIDTH, height: .7, color: line });
    model.monthly.forEach((item, index) => {
      const height = Math.max(4, item.value / maxValue * 88), x = MARGIN + index * (barWidth + gap);
      page.drawRectangle({ x: x + barWidth * .2, y: baseY, width: barWidth * .6, height, color: index === model.monthly.length - 1 ? gold : navy });
      const label = pdfSafeText(item.label);
      page.drawText(label, { x: x + Math.max(0, (barWidth - regular.widthOfTextAtSize(label, 7)) / 2), y: baseY - 13, size: 7, font: regular, color: muted });
    });
    y = baseY - 25;
  }

  ensure(76 + Math.max(1, model.causes.length) * 20 + model.products.length * 32);
  sectionTitle("Qué productos o datos están explicando el resultado");
  if (model.causes.length) bullets(model.causes);
  else paragraph("Todavía no encontramos factores observados suficientes para explicar el resultado sin convertir hipótesis en hechos.");
  if (model.products.length) {
    y -= 3;
    model.products.forEach(item => {
      ensure(29);
      paragraph(`${item.label}: ${item.text}`, { font: bold, color: navy, after: 2 });
      page.drawRectangle({ x: MARGIN, y, width: CONTENT_WIDTH, height: 6, color: line });
      page.drawRectangle({ x: MARGIN, y, width: CONTENT_WIDTH * item.share, height: 6, color: gold });
      y -= 14;
    });
  }

  sectionTitle("Qué deberías revisar primero");
  ensure(70);
  page.drawRectangle({ x: MARGIN, y: y - 12, width: 5, height: 26, color: gold });
  paragraph(model.priority.title, { font: serif, size: 14, color: navy, indent: 15, after: 8 });
  bullets(model.priority.metrics);
  paragraph(`Por qué es importante: ${model.priority.important}`, { color: muted });
  if (model.priority.reviewItems.length) {
    paragraph("Revisa ahora:", { font: bold, color: navy, after: 3 });
    bullets(model.priority.reviewItems);
  }
  if (model.context.length) {
    paragraph("Tuvimos en cuenta lo que nos contaste", { font: bold, color: rgb(.6, .4, 0), after: 3 });
    bullets(model.context);
  }

  sectionTitle("Lo que todavía no podemos saber");
  if (model.unknown.length) bullets(model.unknown);
  else paragraph("No encontramos una limitación importante para las conclusiones mostradas.");

  const responsibilityLines = wrap(model.responsibility, regular, 9.5, CONTENT_WIDTH - 28);
  const responsibilityHeight = responsibilityLines.length * 13 + 28;
  ensure(118 + model.quality.details.length * 18 + responsibilityHeight);
  sectionTitle("Calidad de la información");
  paragraph(`Calidad de la información: ${model.quality.label}`, { font: bold, size: 12, color: navy });
  paragraph(model.quality.explanation);
  bullets(model.quality.details);

  ensure(responsibilityHeight + 50);
  sectionTitle("Importante");
  page.drawRectangle({ x: MARGIN, y: y - responsibilityHeight + 10, width: CONTENT_WIDTH, height: responsibilityHeight, color: pale, borderColor: gold, borderWidth: 1 });
  let noteY = y - 8;
  responsibilityLines.forEach(lineText => { page.drawText(lineText, { x: MARGIN + 14, y: noteY, size: 9.5, font: regular, color: ink }); noteY -= 13; });
  y -= responsibilityHeight + 2;

  pages.forEach((pdfPage, index) => {
    pdfPage.drawRectangle({ x: MARGIN, y: 40, width: CONTENT_WIDTH, height: .5, color: line });
    pdfPage.drawText("San José - Transformación Estratégica", { x: MARGIN, y: 25, size: 7.5, font: regular, color: muted });
    const pageLabel = `${index + 1} / ${pages.length}`;
    pdfPage.drawText(pageLabel, { x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(pageLabel, 7.5), y: 25, size: 7.5, font: regular, color: muted });
  });
  return pdf.save();
}

async function downloadExecutiveSummary() {
  if (!app.analysis || app.analysis.resultQuality.level === "BAJA") return;
  const button = $("#download-summary");
  const originalLabel = button?.textContent || "Descargar resumen ejecutivo";
  try {
    if (button) { button.disabled = true; button.textContent = "Preparando PDF…"; }
    const response = await fetch("assets/logo-san-jose-azul.png");
    if (!response.ok) throw new Error("No fue posible cargar el logo oficial.");
    const bytes = await buildExecutiveSummaryPdf(new Uint8Array(await response.arrayBuffer()));
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "resumen-ejecutivo-san-jose.pdf";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    console.error(error);
    window.alert("No pudimos generar el PDF. Intenta nuevamente.");
  } finally {
    if (button) { button.disabled = false; button.textContent = originalLabel; }
  }
}
