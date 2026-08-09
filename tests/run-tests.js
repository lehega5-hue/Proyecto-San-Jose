const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");
const PDFLib = require("../assets/pdf-lib.min.js");

const noop = () => {};
const localValues = new Map();
const localStorage = {
  getItem: key => localValues.has(key) ? localValues.get(key) : null,
  setItem: (key, value) => localValues.set(key, String(value)),
  removeItem: key => localValues.delete(key),
  clear: () => localValues.clear()
};
const fallbackElement = {
  addEventListener: noop,
  classList: { add: noop, remove: noop, toggle: noop },
  close: noop,
  focus: noop,
  querySelectorAll: () => [],
  setAttribute: noop,
  showModal: noop,
  style: {},
  value: "",
  set innerHTML(value) { this._innerHTML = value; },
  get innerHTML() { return this._innerHTML || ""; }
};
const document = {
  body: { appendChild: noop },
  createElement: () => ({ ...fallbackElement, click: noop, remove: noop }),
  querySelector: () => fallbackElement,
  querySelectorAll: () => []
};
const sandbox = {
  Blob,
  console,
  crypto: webcrypto,
  document,
  FormData: class {},
  Intl,
  location: { reload: noop },
  navigator: {},
  localStorage,
  TextEncoder,
  setTimeout,
  clearTimeout,
  URL: { createObjectURL: () => "blob:test", revokeObjectURL: noop },
  PDFLib,
  window: { scrollTo: noop }
};
sandbox.window.window = sandbox.window;
sandbox.window.document = document;

const appPath = path.join(__dirname, "..", "app.js");
const source = fs.readFileSync(appPath, "utf8") + `
;globalThis.__test = {
  app, datasets, analyze, priorityScore, requiredMappingIssues,
  demoCredentialsValid, demoStateSnapshot, persistDemoProgress, restoreDemoProgress,
  setupSpeechRecognition, voiceState: () => ({ isListening }), contextScreen, contextProgress, dataScreen, semanticRoles,
  inferInterpretation, buildCanonicalDataset, interpretedScope,
  handleInterpretationAction, selectRoleColumn, interpretationRow,
  columnChooser, columnOptionValue, columnDataQuality, columnIdentification,
  roleDisplayLabel, primaryReviewProgress, interpretationPanel, mappingCard,
  stageThreeQuality, resultsScreen, trendChartHtml, productChartHtml, priorityPresentation,
  executiveSummaryModel, buildExecutiveSummaryPdf, managementDetailHtml, analysisLimitations, getPlan, getActionPlan, planScreen, feedbackScreen, nextScreen, cycleSummaryScreen,
  syncOpportunityCycle, decideOpportunityAfterReview,
  beginAnalysisCycle, currentAnalysisCycle, analysisCycleComparison, startOpportunity,
  cycleOpportunityEntries, currentOpportunityPlanState, productDisplayName,
  buildFeedbackRecord, recordOpportunityReview, detectFollowupEvents,
  evidenceScreen, runBusinessAnalysisModules, prioritizeBusinessFindings
};
`;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: appPath });

const {
  app, datasets, analyze, priorityScore, requiredMappingIssues,
  demoCredentialsValid, demoStateSnapshot, persistDemoProgress, restoreDemoProgress,
  setupSpeechRecognition, voiceState, contextScreen, contextProgress, dataScreen, semanticRoles, inferInterpretation,
  buildCanonicalDataset, interpretedScope, handleInterpretationAction,
  selectRoleColumn, interpretationRow, columnChooser, columnOptionValue,
  columnDataQuality, columnIdentification, roleDisplayLabel,
  primaryReviewProgress, interpretationPanel, mappingCard,
  stageThreeQuality, resultsScreen, trendChartHtml, productChartHtml, priorityPresentation,
  executiveSummaryModel, buildExecutiveSummaryPdf, managementDetailHtml, analysisLimitations, getPlan, getActionPlan, planScreen, feedbackScreen, nextScreen, cycleSummaryScreen,
  syncOpportunityCycle, decideOpportunityAfterReview,
  beginAnalysisCycle, currentAnalysisCycle, analysisCycleComparison, startOpportunity,
  cycleOpportunityEntries, currentOpportunityPlanState, productDisplayName,
  buildFeedbackRecord, recordOpportunityReview, detectFollowupEvents,
  evidenceScreen, runBusinessAnalysisModules, prioritizeBusinessFindings
} = sandbox.__test;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function mockElement(value = "") {
  const listeners = {};
  const classes = new Set(["hidden"]);
  return {
    value,
    textContent: "",
    listeners,
    attributes: {},
    classList: {
      add: name => classes.add(name),
      remove: name => classes.delete(name),
      toggle: (name, force) => force ? classes.add(name) : classes.delete(name),
      contains: name => classes.has(name)
    },
    addEventListener: (name, handler) => { listeners[name] = handler; },
    setAttribute(name, newValue) { this.attributes[name] = newValue; }
  };
}

class FakeRecognition {
  constructor() {
    FakeRecognition.instance = this;
    this.startCalls = 0;
    this.stopCalls = 0;
  }
  start() { this.startCalls += 1; }
  stop() {
    this.stopCalls += 1;
    if (this.onend) this.onend();
  }
}

function setupVoice(initialText = "") {
  const button = mockElement();
  const textarea = mockElement(initialText);
  const status = mockElement();
  const elements = {
    "#voice-button": button,
    "#business-story": textarea,
    "#voice-status": status
  };
  document.querySelector = selector => elements[selector] || fallbackElement;
  sandbox.window.SpeechRecognition = FakeRecognition;
  setupSpeechRecognition();
  return { button, textarea, status, recognition: FakeRecognition.instance };
}

function speechResult(text, isFinal = true) {
  const result = [{ transcript: text }];
  result.isFinal = isFinal;
  return { results: [result] };
}

function assignment(header, confidence = "Alta", extra = {}) {
  return { header, confidence, confirmed: true, score: confidence === "Alta" ? 10 : confidence === "Media" ? 6 : 3, sample: "muestra", duplicates: [], ...extra };
}

function makeTable(type, rows, assignments) {
  const headers = Object.keys(rows[0] || {});
  return {
    type,
    fileName: `${type}.csv`,
    sheetName: type === "sales" ? "Ventas" : "Inventario",
    headers,
    rows,
    profiles: Object.fromEntries(headers.map(header => [header, { numeric: 0, dates: 0, text: 0, sample: rows.slice(0, 3).map(row => row[header]).join(", ") }])),
    interpretation: { assignments: { ...Object.fromEntries(Object.keys(semanticRoles[type]).map(role => [role, null])), ...assignments } }
  };
}

function resetInterpretation(tables) {
  app.classified = tables;
  app.clarifications = {};
  app.additionalSections = {};
  app.semanticPending = true;
  app.step = 3;
}

test("LANDING 1: elimina referencias anteriores y presenta un único acceso simple", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.ok(html.includes("MVP · Orientación basada en datos"));
  assert.ok(html.includes("Tus datos te muestran qué atender primero."));
  assert.ok(html.includes("Entra a San José"));
  assert.ok(html.includes('name="email"'));
  assert.ok(html.includes('name="password"'));
  assert.ok(html.includes("Entrar y continuar →"));
  assert.ok(html.includes("assets/logo-san-jose-azul.png"));
  assert.ok(!/acad[eé]mic/i.test(html));
  assert.ok(!html.includes("demo@sanjose.com"));
  ["Crear cuenta", "Registrarse", "Recuperar contraseña"].forEach((copy) => assert.ok(!html.includes(copy)));
});

test("LANDING 2: rechaza datos incorrectos sin exponer detalles técnicos", async () => {
  assert.equal(await demoCredentialsValid("correo-incorrecto@example.com", "valor-incorrecto"), false);
  assert.equal(await demoCredentialsValid("demo@sanjose.com", "valor-incorrecto"), false);
});

test("LANDING 3: guarda y recupera progreso bajo la clave exclusiva del usuario de prueba", () => {
  localStorage.clear();
  app.userId = "demo-san-jose";
  app.step = 7;
  app.context = { actividad: "Comercio", contextoLibre: "Contexto acumulado" };
  app.tasks = [true, false, true];
  app.analysisCycles = [{
    cycleId: "ciclo-1",
    datosAnalizados: { ventas: 12 },
    hechos: [],
    hipotesis: [],
    planes: [],
    actividadesRealizadas: [],
    actividadesPendientes: [],
    retroalimentacion: []
  }];
  app.currentAnalysisCycleId = "ciclo-1";
  assert.equal(persistDemoProgress(), true);
  const stored = JSON.parse(localStorage.getItem("sanJose.users.demo-san-jose"));
  assert.equal(stored.userId, "demo-san-jose");
  assert.equal(stored.currentProgress.step, 7);
  assert.equal(stored.businessContext.contextoLibre, "Contexto acumulado");
  assert.ok(!Object.hasOwn(stored, "password"));

  app.step = 2;
  app.context = {};
  app.tasks = [];
  app.analysisCycles = [];
  assert.equal(restoreDemoProgress(), true);
  assert.equal(app.step, 7);
  assert.equal(app.context.contextoLibre, "Contexto acumulado");
  assert.deepEqual(Array.from(app.tasks), [true, false, true]);

  app.userId = null;
  app.step = 2;
  app.context = {};
  app.tasks = [];
  app.analysisCycles = [];
  app.currentAnalysisCycleId = null;
  localStorage.clear();
});

test("VOZ 1: el dictado continuo reinicia si el navegador termina la escucha", async () => {
  const voice = setupVoice();
  voice.button.listeners.click();
  assert.equal(voice.recognition.continuous, true);
  assert.equal(voice.recognition.interimResults, true);
  assert.equal(voice.recognition.lang, "es-CO");
  voice.recognition.onend();
  await delay(180);
  assert.equal(voice.recognition.startCalls, 2);
  assert.equal(voiceState().isListening, true);
  voice.button.listeners.click();
});

test("VOZ 2: una pausa breve no corta el modo de escucha", async () => {
  const voice = setupVoice();
  voice.button.listeners.click();
  voice.recognition.onerror({ error: "no-speech" });
  voice.recognition.onend();
  await delay(180);
  assert.equal(voice.recognition.startCalls, 2);
  assert.equal(voice.status.textContent, "Te estamos escuchando…");
  voice.button.listeners.click();
});

test("VOZ 3: Terminar conserva el texto y detiene el reinicio", async () => {
  const voice = setupVoice();
  voice.button.listeners.click();
  voice.recognition.onresult(speechResult("Mi negocio distribuye alimentos"));
  voice.button.listeners.click();
  await delay(180);
  assert.equal(voice.textarea.value, "Mi negocio distribuye alimentos");
  assert.equal(voice.recognition.startCalls, 1);
  assert.equal(voice.status.textContent, "Listo. Puedes revisar y corregir el texto antes de continuar.");
});

test("VOZ 4: un segundo dictado agrega texto al contenido existente", () => {
  const voice = setupVoice("Vendemos café");
  voice.button.listeners.click();
  voice.recognition.onresult(speechResult("a restaurantes"));
  voice.button.listeners.click();
  voice.button.listeners.click();
  voice.recognition.onresult(speechResult("y abrimos una nueva zona"));
  voice.button.listeners.click();
  assert.equal(voice.textarea.value, "Vendemos café a restaurantes y abrimos una nueva zona");
});

test("ETAPA 1 A: mantiene las tres preguntas y simplifica la introducción", () => {
  const html = contextScreen();
  assert.ok(html.includes("Cuéntanos un poco de tu negocio"));
  assert.ok(html.includes("Responde tres preguntas cortas. Esto nos ayuda a entender mejor tus datos."));
  ["actividad", "registro", "antiguedad"].forEach(name => assert.ok(html.includes(`name="${name}"`)));
  assert.ok(!html.includes("Contexto empresarial"));
  assert.ok(html.includes('id="context-submit"'));
  assert.ok(html.includes('type="submit" disabled'));
});

test("ETAPA 1 B: el bloque opcional explica cómo ayuda el contexto", () => {
  const html = contextScreen();
  assert.ok(html.includes("Si quieres, cuéntanos algo más"));
  assert.ok(html.includes("Entre más contexto nos des, mejor podremos interpretar lo que está pasando en tu negocio."));
  ["qué vende o hace tu negocio", "quiénes son tus principales clientes", "fuera de lo normal", "precios, productos, proveedores o personal", "ganaste o perdiste un cliente", "problemas de abastecimiento", "deberíamos tener en cuenta"].forEach(text => assert.ok(html.includes(text), `falta la ayuda: ${text}`));
  assert.ok(html.includes("Ejemplo: En junio perdimos un cliente importante"));
  assert.ok(html.includes("Las conclusiones seguirán basándose en la información que compartas."));
});

test("ETAPA 1 C: el campo libre conserva dictado y empieza con cuatro líneas", () => {
  const html = contextScreen();
  assert.ok(html.includes("Escribe o cuéntanos con tu voz"));
  assert.ok(html.includes('rows="4"'));
  assert.ok(html.includes("Cuéntanos cualquier situación que creas importante. Podrás revisar y corregir el texto antes de continuar."));
  assert.ok(html.includes('id="voice-button"'));
});

test("ETAPA 1 D: el progreso usa mensajes simples y solo habilita al completar", () => {
  const empty = contextProgress({});
  assert.equal(empty.answered, 0);
  assert.equal(empty.missing, 3);
  assert.equal(empty.complete, false);
  assert.equal(empty.text, "Te faltan 3 respuestas para continuar.");
  assert.equal(contextProgress({ actividad: "Comercio" }).text, "Te faltan 2 respuestas para continuar.");
  assert.equal(contextProgress({ actividad: "Comercio", registro: "Excel" }).text, "Te falta 1 respuesta para continuar.");
  const complete = contextProgress({ actividad: "Comercio", registro: "Excel", antiguedad: "3 a 5 años" });
  assert.equal(complete.complete, true);
  assert.equal(complete.text, "Listo. Ya puedes continuar.");
});

test("ETAPA 2 CLARIDAD: muestra solo los seis datos básicos sin bloquear la carga", () => {
  app.files = [];
  app.dataset = null;
  app.semanticPending = false;
  const html = dataScreen();
  assert.ok(html.includes("Usa los archivos que ya tienes"));
  assert.ok(html.includes("Puedes subir ventas, inventario o ambos. Pueden estar en un mismo Excel, en hojas diferentes, o en archivos separados."));
  assert.ok(html.includes("Antes de subirlos, revisa que tengas estos datos"));
  ["Fecha de venta", "Producto o referencia", "Cantidad vendida", "Valor de la venta", "Unidades disponibles"].forEach(text => assert.ok(html.includes(text), `falta ${text}`));
  assert.equal((html.match(/Producto o referencia/g) || []).length, 2);
  assert.equal((html.match(/minimum-data-grid/g) || []).length, 1);
  assert.ok(html.includes("Si te falta alguno, puedes subir el archivo igualmente. San José te dirá qué puede analizar con la información disponible."));
  assert.ok(html.includes("No importa cómo se llamen las columnas en tu archivo. San José intentará reconocerlas."));
  assert.ok(html.includes("Arrastra aquí tus archivos de ventas o inventario"));
  assert.ok(html.includes('type="file" multiple'));
  assert.ok(html.includes(".xlsx,.xls,.csv"));
  assert.ok(html.includes("máximo 5 MB por archivo"));
  ["Cliente", "Comercial", "Utilidad", "Costo", "Categoría", "Proveedor", "Fecha último movimiento", "campos obligatorios", "variables requeridas", "schema", "mapping"].forEach(text => assert.ok(!html.includes(text), `no debe mostrarse ${text}`));
  assert.ok(!html.includes("Puedes subir uno o varios archivos"));
});

test("DEMO 1: existe un único ejemplo y contiene solo ventas", () => {
  assert.deepEqual(Object.keys(datasets), ["ejemploVentas"]);
  assert.ok(datasets.ejemploVentas.sales.length >= 12);
  assert.equal(datasets.ejemploVentas.inventory.length, 0);
});

test("DEMO 2: el ejemplo continúa sin inventar información de inventario", () => {
  app.context = {};
  const result = analyze(datasets.ejemploVentas);
  assert.equal(result.quality.level, "MEDIA");
  assert.equal(result.priorities[0].type, "business-decline");
  assert.equal(Math.round(result.metrics.trendChange * 100), -30);
  assert.ok(result.quality.facts.some(fact => fact.text.includes("No encontramos inventario")));
  assert.equal(result.metrics.inventoryUnits, 0);
});

test("La calidad de cualquier análisis parcial permanece limitada", () => {
  const result = analyze(datasets.ejemploVentas);
  assert.ok(result.quality.score < 85);
  assert.notEqual(result.quality.level, "ALTA");
});

test("La puntuación conserva la fórmula determinística de cuatro factores", () => {
  assert.equal(priorityScore({ impact: 80, urgency: 90, reach: 70, confidence: 100 }), 84);
});

test("Un dato principal pendiente mantiene incompleta la revisión", () => {
  app.classified = [{
    type: "sales",
    interpretation: { assignments: {
      fecha: { header: "Fecha", confidence: "Alta" },
      producto: { header: "Artículo", confidence: "Alta" },
      cantidad: { header: "U", confidence: "Baja" },
      precio: { header: "Valor", confidence: "Alta" },
      valorTotal: null
    } }
  }];
  assert.equal(primaryReviewProgress().complete, false);
});

test("Un dato opcional ausente no bloquea una carga real completa", () => {
  app.classified = [{
    type: "inventory",
    interpretation: { assignments: {
      producto: { header: "Producto", confidence: "Alta" },
      stock: { header: "Existencias", confidence: "Alta" },
      costo: null
    } }
  }];
  assert.equal(requiredMappingIssues().length, 0);
});

test("ANALÍTICA 1: identifica correctamente columnas normales con confianza alta", () => {
  const rows = [{ Fecha: "2026-01-01", "Cod Art": "A001", Cantidad: 2, "Valor Total": 20000 }];
  const table = makeTable("sales", rows, {});
  table.profiles.Fecha.dates = 1;
  table.profiles["Cod Art"].text = 1;
  table.profiles.Cantidad.numeric = 1;
  table.profiles["Valor Total"].numeric = 1;
  const result = inferInterpretation(table, "sales");
  assert.equal(result.assignments.fecha.confidence, "Alta");
  assert.equal(result.assignments.producto.header, "Cod Art");
});

test("ANALÍTICA 2: una interpretación alta incorrecta sigue mostrando Cambiar", () => {
  const table = makeTable("sales", [{ Fecha: "2026-01-01", Cliente: "Ana", "Cod Art": "A001", Cantidad: 2 }], {
    fecha: assignment("Fecha"), producto: assignment("Cliente", "Alta", { confirmed: false }), cantidad: assignment("Cantidad")
  });
  resetInterpretation([table]);
  const html = interpretationRow(table, 0, "producto");
  assert.ok(html.includes("🟢 Parece correcto"));
  assert.ok(!html.includes("Calidad de los datos:"));
  assert.ok(html.includes("¿Qué columna contiene producto / referencia?"));
  assert.ok(html.includes("role-column-select"));
  assert.ok(html.includes(">Cambiar<"));
});

test("ANALÍTICA 3: el usuario corrige una interpretación sin recargar", () => {
  const table = makeTable("sales", [{ Fecha: "2026-01-01", Cliente: "Ana", "Cod Art": "A001", Cantidad: 2 }], {
    fecha: assignment("Fecha"), producto: assignment("Cliente", "Alta", { confirmed: false }), cantidad: assignment("Cantidad")
  });
  resetInterpretation([table]);
  selectRoleColumn({ target: { dataset: { table: "0", role: "producto" }, value: "Cod Art" } });
  assert.equal(table.interpretation.assignments.producto.header, "Cod Art");
  assert.equal(table.interpretation.assignments.producto.confirmed, false);
  assert.equal(app.dataset, null);
  handleInterpretationAction({ currentTarget: { dataset: { table: "0", role: "producto", action: "confirm" } } });
  assert.ok(interpretationRow(table, 0, "producto").includes("✓ Confirmado por ti"));
  assert.equal(app.dataset.sales.length, 1);
});

test("UX CRÍTICA: Cambiar muestra todas las columnas y corrige IdDocumento por Cantidad", () => {
  const sales = makeTable("sales", [{ Fecha: "2026-01-01", Producto: "A", IdDocumento: "F-1", Cantidad: 4, Total: 80000 }], {
    fecha: assignment("Fecha"), producto: assignment("Producto"), cantidad: assignment("IdDocumento", "Alta", { confirmed: false })
  });
  const inventory = makeTable("inventory", [{ SKU: "A", Existencia: 8, Bodega: "Norte" }], {
    producto: assignment("SKU"), stock: assignment("Existencia")
  });
  resetInterpretation([sales, inventory]);
  app.clarifications["0:cantidad"] = { status: "editing" };
  const selector = columnChooser(sales, 0, "cantidad", sales.interpretation.assignments.cantidad);
  assert.ok(selector.includes("Cantidad"));
  assert.ok(selector.includes("Bodega"));
  assert.ok(selector.includes("Ventas · sales.csv"));
  assert.ok(selector.includes("Inventario · inventory.csv"));
  selectRoleColumn({ target: { dataset: { table: "0", role: "cantidad" }, value: columnOptionValue(0, "Cantidad") } });
  assert.equal(sales.interpretation.assignments.cantidad.header, "Cantidad");
  assert.equal(sales.interpretation.assignments.cantidad.sourceTableIndex, 0);
  assert.equal(sales.interpretation.assignments.cantidad.confirmed, false);
  assert.ok(interpretationRow(sales, 0, "cantidad").includes("🟢 Parece correcto"));
  assert.ok(!interpretationRow(sales, 0, "cantidad").includes("Calidad de los datos:"));
  handleInterpretationAction({ currentTarget: { dataset: { table: "0", role: "cantidad", action: "confirm" } } });
  assert.equal(app.analysis.metrics.quantityRows, 1);
  assert.ok(interpretationRow(sales, 0, "cantidad").includes("Calidad de los datos: Alta"));
});

test("UX: una columna principal no puede asignarse a dos datos", () => {
  const table = makeTable("sales", [{ Fecha: "2026-01-01", Producto: "A", Cantidad: 2 }], {
    fecha: assignment("Fecha"), producto: assignment("Producto"), cantidad: assignment("Cantidad")
  });
  resetInterpretation([table]);
  selectRoleColumn({ target: { dataset: { table: "0", role: "valorTotal" }, value: columnOptionValue(0, "Cantidad") } });
  assert.equal(table.interpretation.assignments.valorTotal, null);
  assert.ok(app.clarifications["0:valorTotal"].error.includes("ya está siendo utilizada como Cantidad vendida"));
});

test("UX: datos principales de hojas distintas no se combinan silenciosamente", () => {
  const sales = makeTable("sales", [{ Fecha: "2026-01-01", Producto: "A", Cantidad: 2 }], {
    fecha: assignment("Fecha"), producto: assignment("Producto"), cantidad: assignment("Cantidad", "Alta", { sourceTableIndex: 1 })
  });
  const other = makeTable("sales", [{ Cantidad: 9 }], {});
  resetInterpretation([sales, other]);
  assert.equal(interpretedScope().hasSales, false);
  assert.ok(requiredMappingIssues().some(issue => issue.title.includes("hojas distintas")));
  assert.equal(buildCanonicalDataset().sales.length, 0);
});

test("ANALÍTICA 4: confianza media necesita confirmación", () => {
  const table = makeTable("sales", [{ Fecha: "2026-01-01", Producto: "A", U: 2 }], {
    fecha: assignment("Fecha"), producto: assignment("Producto"), cantidad: assignment("U", "Media", { confirmed: false })
  });
  resetInterpretation([table]);
  assert.equal(interpretedScope().hasSales, false);
  handleInterpretationAction({ currentTarget: { dataset: { table: "0", role: "cantidad", action: "confirm" } } });
  assert.equal(interpretedScope().hasSales, true);
});

test("ANALÍTICA 5: confianza baja necesita confirmación", () => {
  const table = makeTable("inventory", [{ Referencia: "A", Saldo: 4 }], {
    producto: assignment("Referencia"), stock: assignment("Saldo", "Baja", { confirmed: false })
  });
  resetInterpretation([table]);
  assert.equal(interpretedScope().hasInventory, false);
  handleInterpretationAction({ currentTarget: { dataset: { table: "0", role: "stock", action: "confirm" } } });
  assert.equal(interpretedScope().hasInventory, true);
});

test("ANALÍTICA 6: No tengo ese dato guarda la decisión durante la sesión", () => {
  const table = makeTable("sales", [{ Fecha: "2026-01-01", Producto: "A", Cantidad: 2 }], {
    fecha: assignment("Fecha"), producto: assignment("Producto"), cantidad: assignment("Cantidad")
  });
  resetInterpretation([table]);
  handleInterpretationAction({ currentTarget: { dataset: { table: "0", role: "valorTotal", action: "missing" } } });
  assert.equal(app.clarifications["0:valorTotal"].status, "missing");
  assert.ok(interpretationRow(table, 0, "valorTotal").includes("⚪ No la encontramos"));
  assert.ok(!interpretationRow(table, 0, "valorTotal").includes("Calidad de los datos:"));
});

test("LENGUAJE 1: una identificación dudosa usa el estado simple acordado", () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({ Cliente: `Cliente ${index + 1}` }));
  const table = makeTable("sales", rows, { producto: assignment("Cliente", "Media", { confirmed: false }) });
  resetInterpretation([table]);
  const html = interpretationRow(table, 0, "producto");
  assert.ok(html.includes("🟠 Revisa este dato"));
  assert.ok(!html.includes("Confianza"));
  assert.ok(!html.includes("Calidad de los datos:"));
});

test("LENGUAJE 2: la calidad aparece únicamente después de confirmar", () => {
  const rows = Array.from({ length: 10 }, (_, index) => ({ Cantidad: index < 6 ? index + 1 : "" }));
  const table = makeTable("sales", rows, { cantidad: assignment("Cantidad", "Alta", { confirmed: false }) });
  resetInterpretation([table]);
  const html = interpretationRow(table, 0, "cantidad");
  assert.ok(html.includes("🟢 Parece correcto"));
  assert.ok(!html.includes("Calidad de los datos:"));
  handleInterpretationAction({ currentTarget: { dataset: { table: "0", role: "cantidad", action: "confirm" } } });
  const confirmedHtml = interpretationRow(table, 0, "cantidad");
  assert.ok(confirmedHtml.includes("✓ Confirmado por ti"));
  assert.ok(confirmedHtml.includes("Calidad de los datos: Baja"));
  assert.ok(confirmedHtml.includes("40 % de registros sin cantidad"));
  assert.equal(columnDataQuality(table, "Cantidad", "cantidad").level, "Baja");
});

test("LENGUAJE 3: la calidad de fechas usa cálculos reales", () => {
  const rows = Array.from({ length: 100 }, (_, index) => ({ Fecha: index < 98 ? `2026-01-${String(index % 28 + 1).padStart(2, "0")}` : "" }));
  const quality = columnDataQuality({ rows }, "Fecha", "fecha");
  assert.equal(quality.level, "Alta");
  assert.equal(quality.usableRate, .98);
  assert.equal(quality.explanation, "98 % de los registros tiene una fecha válida.");
});

test("LENGUAJE 4: niveles medio y bajo explican el porcentaje calculado", () => {
  const mediumRows = Array.from({ length: 100 }, (_, index) => ({ Cantidad: index < 86 ? index + 1 : "" }));
  const lowRows = Array.from({ length: 100 }, (_, index) => ({ Cantidad: index < 69 ? index + 1 : "sin dato" }));
  const medium = columnDataQuality({ rows: mediumRows }, "Cantidad", "cantidad");
  const low = columnDataQuality({ rows: lowRows }, "Cantidad", "cantidad");
  assert.equal(medium.level, "Media");
  assert.equal(medium.explanation, "Encontramos 14 % de registros sin cantidad.");
  assert.equal(low.level, "Baja");
  assert.equal(low.explanation, "31 % de los valores no se pueden utilizar.");
});

test("LENGUAJE 5: los seis datos principales usan los nombres y estados acordados", () => {
  assert.equal(roleDisplayLabel("sales", "fecha"), "Fecha de venta");
  assert.equal(roleDisplayLabel("sales", "producto"), "Producto / referencia");
  assert.equal(roleDisplayLabel("sales", "cantidad"), "Cantidad vendida");
  assert.equal(roleDisplayLabel("sales", "valorTotal"), "Valor de la venta");
  assert.equal(roleDisplayLabel("inventory", "producto"), "Producto / referencia");
  assert.equal(roleDisplayLabel("inventory", "stock"), "Existencia actual");
  assert.equal(columnIdentification(assignment("Fecha")).label, "✓ Confirmado por ti");
  assert.equal(columnIdentification(assignment("Fecha", "Alta", { confirmed: false })).label, "🟢 Parece correcto");
  assert.equal(columnIdentification(assignment("Fecha", "Media", { confirmed: false })).label, "🟠 Revisa este dato");
  assert.equal(columnIdentification(null).label, "⚪ No la encontramos");
});

test("UX: todas las tarjetas conservan selector y muestran calidad tras confirmar", () => {
  const table = makeTable("sales", [{ FechaFactura: "2026-01-01" }], {
    fecha: assignment("FechaFactura", "Alta", { confirmed: false })
  });
  resetInterpretation([table]);
  const before = interpretationRow(table, 0, "fecha");
  assert.ok(before.includes("FechaFactura"));
  assert.ok(before.includes("🟢 Parece correcto"));
  assert.ok(before.includes("role-column-select"));
  assert.ok(!before.includes("Calidad de los datos:"));
  handleInterpretationAction({ currentTarget: { dataset: { table: "0", role: "fecha", action: "confirm" } } });
  const after = interpretationRow(table, 0, "fecha");
  assert.ok(after.includes("✓ Confirmado por ti"));
  assert.ok(after.includes("Calidad de los datos: Alta"));
  assert.ok(after.includes("role-column-select"));
  assert.ok(!after.includes("Sí, está bien"));
  assert.ok(after.includes(">Cambiar<"));
});

test("UX CRÍTICA: cambiar no muestra ejemplos y exige confirmar la nueva columna", () => {
  const sales = makeTable("sales", [{ Fecha: "2026-01-01", Producto: "A", IdDocumento: 23794, Cantidad: 3 }], {
    fecha: assignment("Fecha"), producto: assignment("Producto"), cantidad: assignment("IdDocumento", "Alta", { confirmed: false })
  });
  const products = makeTable("inventory", [{ CodigoProducto: "A", Descripcion: "Café 500 g" }], {});
  products.sheetName = "Productos";
  resetInterpretation([sales, products]);
  handleInterpretationAction({ currentTarget: { dataset: { table: "0", role: "cantidad", action: "edit" } } });
  const chooser = interpretationRow(sales, 0, "cantidad");
  assert.ok(chooser.includes("Fecha"));
  assert.ok(chooser.includes("Cantidad"));
  assert.ok(chooser.includes("CodigoProducto"));
  assert.ok(chooser.includes("Hoja: Productos"));
  assert.ok(!chooser.includes("Ejemplos:"));
  selectRoleColumn({ target: { dataset: { table: "0", role: "cantidad" }, value: columnOptionValue(0, "Cantidad") } });
  const selected = interpretationRow(sales, 0, "cantidad");
  assert.ok(selected.includes("Encontramos:</span><strong>Cantidad"));
  assert.ok(selected.includes("🟢 Parece correcto"));
  assert.ok(!selected.includes("Calidad de los datos:"));
  assert.equal(sales.interpretation.assignments.cantidad.confirmed, false);
  handleInterpretationAction({ currentTarget: { dataset: { table: "0", role: "cantidad", action: "confirm" } } });
  assert.ok(interpretationRow(sales, 0, "cantidad").includes("Calidad de los datos: Alta"));
  assert.equal(app.analysis.metrics.quantityRows, 1);
});

test("UX FINAL 11-14: no lo tengo y no encontrada nunca muestran calidad", () => {
  const table = makeTable("sales", [{ Fecha: "2026-01-01", Producto: "A" }], {
    fecha: assignment("Fecha"), producto: assignment("Producto")
  });
  resetInterpretation([table]);
  const notFound = interpretationRow(table, 0, "cantidad");
  assert.ok(notFound.includes("⚪ No la encontramos"));
  assert.ok(notFound.includes("disabled"));
  assert.ok(!notFound.includes("Calidad de los datos:"));
  handleInterpretationAction({ currentTarget: { dataset: { table: "0", role: "cantidad", action: "missing" } } });
  const declaredMissing = interpretationRow(table, 0, "cantidad");
  assert.ok(declaredMissing.includes("⚪ No la encontramos"));
  assert.ok(!declaredMissing.includes("Calidad de los datos:"));
});

test("UX: la pantalla separa principales, medida y datos adicionales", () => {
  const sales = makeTable("sales", [{ Fecha: "2026-01-01", Producto: "A", Cantidad: 2, Total: 20000 }], {
    fecha: assignment("Fecha", "Alta", { confirmed: false }), producto: assignment("Producto", "Alta", { confirmed: false }),
    cantidad: assignment("Cantidad", "Alta", { confirmed: false }), valorTotal: assignment("Total", "Alta", { confirmed: false })
  });
  const inventory = makeTable("inventory", [{ Producto: "A", Existencia: 5 }], {
    producto: assignment("Producto", "Alta", { confirmed: false }), stock: assignment("Existencia", "Alta", { confirmed: false })
  });
  resetInterpretation([sales, inventory]);
  const salesHtml = mappingCard(sales, 0);
  const inventoryHtml = mappingCard(inventory, 1);
  assert.ok(salesHtml.includes("Datos principales de ventas"));
  assert.ok(salesHtml.includes("Medida de la venta"));
  assert.ok(inventoryHtml.includes("Datos principales de inventario"));
  assert.ok(salesHtml.includes("Ver datos adicionales"));
  assert.ok(!inventoryHtml.includes("Ver datos adicionales"));
});

test("UX: el contador incluye los cuatro datos principales de ventas", () => {
  const table = makeTable("sales", [{ Fecha: "2026-01-01", Producto: "A", Cantidad: 2, Total: 20000 }], {
    fecha: assignment("Fecha", "Alta", { confirmed: false }), producto: assignment("Producto"), cantidad: assignment("Cantidad"),
    valorTotal: assignment("Total", "Alta", { confirmed: false })
  });
  resetInterpretation([table]);
  assert.equal(primaryReviewProgress().resolved, 2);
  assert.equal(primaryReviewProgress().total, 4);
  assert.ok(interpretationPanel().includes("Te faltan 2 datos por revisar."));
  const pendingButton = interpretationPanel().match(/<button id="confirm-mapping"[^>]*>/)[0];
  assert.ok(pendingButton.includes("disabled"));
  handleInterpretationAction({ currentTarget: { dataset: { table: "0", role: "fecha", action: "confirm" } } });
  assert.ok(interpretationPanel().includes("Te falta 1 dato por revisar."));
  handleInterpretationAction({ currentTarget: { dataset: { table: "0", role: "valorTotal", action: "missing" } } });
  assert.equal(primaryReviewProgress().complete, true);
  const readyButton = interpretationPanel().match(/<button id="confirm-mapping"[^>]*>/)[0];
  assert.ok(!readyButton.includes("disabled"));
  assert.ok(interpretationPanel().includes("Listo. Ya sabemos qué información podemos utilizar."));
  assert.ok(interpretationPanel().includes("✓ Listo. Revisamos todos los datos principales."));
});

test("UX: Cliente, Comercial y Utilidad usan la misma plantilla y la sección conserva su estado", () => {
  const table = makeTable("sales", [{ Fecha: "2026-01-01", Producto: "A", Cantidad: 2, Total: 20000, Cliente: "Ana", Asesor: "Luis", Utilidad: 4000, Canal: "Tienda" }], {
    fecha: assignment("Fecha"), producto: assignment("Producto"), cantidad: assignment("Cantidad"), valorTotal: assignment("Total"),
    cliente: assignment("Cliente", "Alta", { confirmed: false }), vendedor: assignment("Asesor", "Alta", { confirmed: false }),
    utilidad: assignment("Utilidad", "Alta", { confirmed: false }), canal: assignment("Canal", "Alta", { confirmed: false })
  });
  resetInterpretation([table]);
  const html = mappingCard(table, 0);
  assert.ok(html.includes("Datos que pueden mejorar el análisis"));
  for (const label of ["Cliente", "Comercial / vendedor", "Utilidad"]) assert.ok(html.includes(label), label);
  assert.ok(!html.includes("Precio unitario"));
  assert.equal((html.match(/role-column-select/g) || []).length, 7);
  app.additionalSections["0:sales"] = true;
  assert.ok(mappingCard(table, 0).includes('data-additional-key="0:sales" open'));
  const inventory = makeTable("inventory", [{ Producto: "A", Existencia: 2 }], { producto: assignment("Producto"), stock: assignment("Existencia") });
  resetInterpretation([inventory]);
  const inventoryHtml = mappingCard(inventory, 0);
  assert.ok(!inventoryHtml.includes("Datos que pueden mejorar el análisis"));
});

test("INVENTARIO OPCIONAL 1: producto y existencia continúan sin tarjetas opcionales", () => {
  const rows = [{ Producto: "A", Existencia: 12 }];
  const table = makeTable("inventory", rows, {});
  table.interpretation = inferInterpretation(table, "inventory");
  resetInterpretation([table]);
  const html = mappingCard(table, 0);
  assert.ok(!html.includes("Datos que pueden mejorar el análisis"));
  assert.ok(html.includes("Con los datos principales podemos continuar con el análisis."));
});

test("INVENTARIO OPCIONAL 2: costo y último movimiento aparecen sin opcionales de ventas", () => {
  const rows = [{ Producto: "A", Existencia: 12, Costo: 4500, "Último movimiento": "2026-07-15" }];
  const table = makeTable("inventory", rows, {});
  table.interpretation = inferInterpretation(table, "inventory");
  resetInterpretation([table]);
  const html = mappingCard(table, 0);
  for (const label of ["Costo unitario", "Fecha del último movimiento"]) assert.ok(html.includes(label), label);
  for (const label of ["Cliente", "Comercial / vendedor", "Utilidad"]) assert.ok(!html.includes(label), label);
  assert.equal((html.match(/optional-rows/g) || []).length, 1);
});

test("INVENTARIO OPCIONAL 3: stock mínimo y máximo se detectan y conservan separados", () => {
  const rows = [{ Producto: "A", Existencia: 12, "Stock mínimo": 5, "Stock máximo": 20 }];
  const table = makeTable("inventory", rows, {});
  table.interpretation = inferInterpretation(table, "inventory");
  resetInterpretation([table]);
  const html = mappingCard(table, 0);
  assert.ok(html.includes("Stock mínimo"));
  assert.ok(html.includes("Stock máximo"));
  assert.ok(!html.includes("Cliente"));
});

test("INVENTARIO OPCIONAL 4: un archivo combinado no mezcla campos de ventas e inventario", () => {
  const salesRows = [{ Fecha: "2026-07-01", Producto: "A", Cantidad: 2, Cliente: "Ana", Comercial: "Luis", Utilidad: 3000 }];
  const inventoryRows = [{ Producto: "A", Existencia: 12, Costo: 4500, "Último movimiento": "2026-07-15", "Stock mínimo": 5 }];
  const sales = makeTable("sales", salesRows, {});
  const inventory = makeTable("inventory", inventoryRows, {});
  sales.fileName = inventory.fileName = "datos-negocio.xlsx";
  sales.interpretation = inferInterpretation(sales, "sales");
  inventory.interpretation = inferInterpretation(inventory, "inventory");
  resetInterpretation([sales, inventory]);
  const salesHtml = mappingCard(sales, 0);
  const inventoryHtml = mappingCard(inventory, 1);
  for (const label of ["Cliente", "Comercial / vendedor", "Utilidad"]) assert.ok(salesHtml.includes(label), label);
  for (const label of ["Costo unitario", "Fecha del último movimiento", "Stock mínimo"]) assert.ok(inventoryHtml.includes(label), label);
  for (const role of ["cliente", "vendedor", "utilidad"]) assert.ok(!inventoryHtml.includes(`data-role="${role}"`), role);
});

test("INVENTARIO OPCIONAL 5: los campos confirmados pasan al conjunto canónico y habilitan evidencia real", () => {
  const rows = [
    { Producto: "A", Existencia: 12, "Valor inventario": 54000, Entradas: 4, Salidas: 2, Bodega: "Principal" },
    { Producto: "B", Existencia: 8, "Valor inventario": 32000, Entradas: 0, Salidas: 1, Bodega: "Norte" }
  ];
  const table = makeTable("inventory", rows, {});
  table.interpretation = inferInterpretation(table, "inventory");
  Object.values(table.interpretation.assignments).filter(Boolean).forEach(item => { item.confirmed = true; });
  resetInterpretation([table]);
  const canonical = buildCanonicalDataset();
  assert.equal(canonical.inventory[0].valorInventario, 54000);
  assert.equal(canonical.inventory[0].entradas, 4);
  assert.equal(canonical.inventory[0].salidas, 2);
  assert.equal(canonical.inventory[0].bodega, "Principal");
  const result = analyze(canonical, new Date("2026-08-01"));
  assert.equal(result.metrics.inventoryValue, 86000);
  assert.equal(result.diagnostico.datosDisponibles.compras, true);
  assert.equal(result.diagnostico.datosDisponibles.movimientosInventario, true);
});

test("INVENTARIO OPCIONAL 6: sin compras, entradas ni historia no afirma disponibilidad de compras", () => {
  const result = analyze({ sales: [], inventory: [{ producto: "A", stock: 12 }, { producto: "B", stock: 8 }] }, new Date("2026-08-01"));
  assert.equal(result.diagnostico.datosDisponibles.compras, false);
  assert.equal(result.diagnostico.datosDisponibles.movimientosInventario, false);
});

test("ANALÍTICA 7: No usar ignora la columna sin borrar el archivo", () => {
  const rows = [{ Fecha: "2026-01-01", Producto: "A", Cantidad: 2, Cliente: "Ana" }];
  const table = makeTable("sales", rows, { fecha: assignment("Fecha"), producto: assignment("Producto"), cantidad: assignment("Cantidad"), cliente: assignment("Cliente") });
  resetInterpretation([table]);
  handleInterpretationAction({ currentTarget: { dataset: { table: "0", role: "cliente", action: "ignore" } } });
  assert.equal(table.interpretation.assignments.cliente, null);
  assert.equal(table.rows[0].Cliente, "Ana");
  assert.equal(app.clarifications["0:cliente"].status, "ignored");
});

test("ANALÍTICA 8: la ausencia de un dato opcional no bloquea", () => {
  const table = makeTable("sales", [{ Fecha: "2026-01-01", Producto: "A", Cantidad: 2 }], {
    fecha: assignment("Fecha"), producto: assignment("Producto"), cantidad: assignment("Cantidad")
  });
  resetInterpretation([table]);
  assert.equal(requiredMappingIssues().length, 0);
});

test("ANALÍTICA 9: la ausencia de un dato necesario bloquea", () => {
  const table = makeTable("sales", [{ Fecha: "2026-01-01", Producto: "A" }], {
    fecha: assignment("Fecha"), producto: assignment("Producto")
  });
  resetInterpretation([table]);
  assert.equal(primaryReviewProgress().complete, false);
});

test("ANALÍTICA 10: dos columnas posibles deben resolverse", () => {
  const table = makeTable("sales", [{ Fecha: "2026-01-01", Producto: "A", Cantidad: 2, "Total 1": 10, "Total 2": 12 }], {
    fecha: assignment("Fecha"), producto: assignment("Producto"),
    valorTotal: assignment("Total 1", "Media", { confirmed: false, duplicates: ["Total 1", "Total 2"] })
  });
  resetInterpretation([table]);
  assert.ok(requiredMappingIssues().some(issue => issue.title.includes("revisar una columna")));
  selectRoleColumn({ target: { dataset: { table: "0", role: "valorTotal" }, value: "Total 2" } });
  assert.equal(table.interpretation.assignments.valorTotal.header, "Total 2");
  assert.equal(requiredMappingIssues().length, 0);
});

test("ANALÍTICA 11: calcula valor total desde cantidad por precio", () => {
  const table = makeTable("sales", [{ Fecha: "2026-01-01", Producto: "A", Cantidad: 3, Precio: 12000 }], {
    fecha: assignment("Fecha"), producto: assignment("Producto"), cantidad: assignment("Cantidad"), precio: assignment("Precio")
  });
  resetInterpretation([table]);
  const dataset = buildCanonicalDataset();
  assert.equal(dataset.sales[0].valorTotal, 36000);
  assert.equal(dataset.sales[0].valorTotalCalculado, true);
});

test("ANALÍTICA 12: solo ventas produce alcance de ventas", () => {
  const table = makeTable("sales", [{ Fecha: "2026-01-01", Producto: "A", Cantidad: 3 }], {
    fecha: assignment("Fecha"), producto: assignment("Producto"), cantidad: assignment("Cantidad")
  });
  resetInterpretation([table]);
  const scope = interpretedScope();
  assert.equal(scope.hasSales, true);
  assert.equal(scope.hasInventory, false);
});

test("ANALÍTICA 13: ventas e inventario producen alcance combinado", () => {
  const sales = makeTable("sales", [{ Fecha: "2026-01-01", Producto: "A", Cantidad: 3 }], {
    fecha: assignment("Fecha"), producto: assignment("Producto"), cantidad: assignment("Cantidad")
  });
  const inventory = makeTable("inventory", [{ Producto: "A", Existencia: 8 }], {
    producto: assignment("Producto"), stock: assignment("Existencia")
  });
  resetInterpretation([sales, inventory]);
  const scope = interpretedScope();
  assert.equal(scope.hasSales, true);
  assert.equal(scope.hasInventory, true);
});

test("VALIDACIÓN: fecha, producto y cantidad permiten analizar volumen", () => {
  const sales = Array.from({ length: 6 }, (_, index) => ({ fecha: `2026-0${index + 1}-10`, producto: index % 2 ? "B" : "A", cantidad: 10 - index }));
  const result = analyze({ sales, inventory: [] });
  assert.notEqual(result.quality.level, "BAJA");
  assert.equal(result.metrics.rankingBasis, "quantity");
});

test("VALIDACIÓN: fecha, producto y valor total permiten analizar ingresos", () => {
  const sales = Array.from({ length: 6 }, (_, index) => ({ fecha: `2026-0${index + 1}-10`, producto: index % 2 ? "B" : "A", valorTotal: 100000 - index * 5000 }));
  const result = analyze({ sales, inventory: [] });
  assert.notEqual(result.quality.level, "BAJA");
  assert.equal(result.metrics.rankingBasis, "value");
});

test("VALIDACIÓN: valor sin cantidad no se usa para afirmar inventario acumulado", () => {
  const sales = Array.from({ length: 6 }, (_, index) => ({ fecha: `2026-0${index + 1}-10`, producto: index % 2 ? "B" : "A", valorTotal: 100000 }));
  const inventory = [{ producto: "A", stock: 80, costo: 10000 }, { producto: "B", stock: 70, costo: 9000 }];
  const result = analyze({ sales, inventory });
  assert.equal(result.metrics.quantityRows, 0);
  assert.ok(!result.priorities.some(finding => finding.type === "slow"));
});

function stageThreeSales({ months = 6, rowsPerMonth = 4, products = ["A", "B", "C", "D"], quantity = true, value = true } = {}) {
  const rows = [];
  for (let month = 1; month <= months; month += 1) {
    for (let row = 0; row < rowsPerMonth; row += 1) {
      rows.push({
        fecha: `2025-${String(month).padStart(2, "0")}-${String(row + 2).padStart(2, "0")}`,
        producto: products[row % products.length],
        cantidad: quantity ? row + 1 : "",
        valorTotal: value ? (row + 1) * 10000 : ""
      });
    }
  }
  return rows;
}

function setStageThree(data, referenceDate = new Date("2026-08-08T12:00:00Z"), context = {}) {
  app.context = context;
  app.dataset = data;
  app.analysis = analyze(data, referenceDate);
  app.tasks = [];
  app.actionPlan = null;
  app.opportunityPlans = {};
  app.planDetailOpen = false;
  app.opportunityHistory = [];
  app.analysisCycles = [];
  app.currentAnalysisCycleId = null;
  app.newCyclePending = false;
  app.currentOpportunityKey = null;
  app.activeOpportunityId = null;
  app.activeOpportunityIndex = 0;
  app.activePriority = 0;
  app.opportunityAttempt = 1;
  app.lastOpportunityDecision = null;
  app.cycleSummaryOpen = false;
  return app.analysis;
}

test("ETAPA 3 A: ventas, cantidades e inventario completos producen resumen, calidad y dos gráficos", () => {
  const sales = stageThreeSales();
  const inventory = ["A", "B", "C", "D"].map((producto, index) => ({ producto, stock: index + 6, costo: 5000 }));
  const result = setStageThree({ sales, inventory });
  const html = resultsScreen();
  assert.equal(result.resultQuality.level, "ALTA");
  assert.ok(html.indexOf("Tus datos en pocas palabras") < html.indexOf("Calidad de la información"));
  assert.ok(html.indexOf("Calidad de la información") < html.indexOf("Lo que pasó con tus ventas"));
  assert.ok(html.indexOf("Lo que pasó con tus ventas") < html.indexOf("id=\"priority-title\""));
  assert.ok(html.indexOf("id=\"priority-title\"") < html.indexOf("id=\"priority-evidence\""));
  assert.ok(html.indexOf("id=\"priority-evidence\"") < html.indexOf("Ver mi plan de 3 acciones"));
  assert.ok(html.indexOf("Ver evidencia") < html.indexOf("Ver mi plan de 3 acciones"));
  assert.ok(html.indexOf("Ver mi plan de 3 acciones") < html.indexOf("También encontramos"));
  assert.ok(html.indexOf("También encontramos") < html.indexOf("Ver detalle del análisis"));
  assert.equal((html.match(/class="result-chart(?: chart|\")/g) || []).length, 2);
  assert.equal((html.match(/class="result-stat"/g) || []).length, 4);
  assert.ok(html.includes("Ver mi plan de 3 acciones"));
  assert.ok(html.includes("Ver detalle del análisis"));
  assert.ok(html.includes("Resumen para tomar decisiones"));
  assert.ok(html.includes("Lo que todavía no podemos saber"));
  assert.ok(html.indexOf("Ver detalle del análisis") < html.indexOf("Descargar resumen ejecutivo"));
});

test("ETAPA 3 B: sin valor monetario utiliza únicamente unidades en cifras y gráficos", () => {
  const result = setStageThree({ sales: stageThreeSales({ value: false }), inventory: [] });
  assert.equal(result.metrics.chartBasis, "quantity");
  assert.ok(trendChartHtml().includes("unidades vendidas por mes"));
  assert.ok(productChartHtml().includes("unidades vendidas"));
  assert.ok(resultsScreen().includes("No encontramos una columna de valor total"));
});

test("ETAPA 3 C: un valor monetario de baja calidad no se usa para el gráfico", () => {
  const sales = stageThreeSales();
  sales.forEach((row, index) => { if (index % 2) row.valorTotal = "sin dato"; });
  const result = setStageThree({ sales, inventory: [] });
  assert.equal(result.metrics.valueRate, .5);
  assert.equal(result.metrics.chartBasis, "quantity");
  assert.ok(!trendChartHtml().includes("pesos vendidos por mes"));
  assert.ok(resultsScreen().includes("50 % de los registros no tiene un valor de venta utilizable"));
});

test("ETAPA 3 D: ventas e inventario sin relación no generan conclusiones cruzadas", () => {
  const sales = stageThreeSales({ products: ["A", "B"] });
  const inventory = [{ producto: "X", stock: 941 }, { producto: "Y", stock: 800 }];
  const result = setStageThree({ sales, inventory });
  assert.equal(result.metrics.linkedProducts, 0);
  assert.ok(!result.priorities.some(finding => ["slow", "stockout"].includes(finding.type)));
  assert.ok(resultsScreen().includes("No pudimos comparar ventas e inventario"));
  assert.ok(resultsScreen().includes("no tienen una referencia que podamos relacionar"));
});

test("ETAPA 3 E: un mes sin registros no se convierte en ventas iguales a cero", () => {
  const sales = stageThreeSales({ months: 5 }).filter(row => !row.fecha.startsWith("2025-02"));
  const result = setStageThree({ sales, inventory: [] });
  assert.equal(result.resultQuality.observedMonths, 4);
  assert.equal(result.resultQuality.expectedMonths, 5);
  assert.equal(result.metrics.monthly.length, 4);
  assert.ok(trendChartHtml().includes("No los interpretamos como meses con ventas en cero"));
});

test("ETAPA 3 F: pocas ventas y mucho inventario priorizan un producto relacionado específico", () => {
  const sales = stageThreeSales({ products: ["Café Tradicional 500 g", "Otro"], rowsPerMonth: 2 }).map((row, index) => ({ ...row, cantidad: index % 2 === 0 ? 0 : 10, valorTotal: index % 2 === 0 ? 0 : 100000 }));
  const inventory = [{ producto: "Café Tradicional 500 g", stock: 941 }, { producto: "Otro", stock: 4 }];
  const result = setStageThree({ sales, inventory });
  assert.ok(["inventory-excess", "stock-risk-general"].includes(result.priorities[0].type));
  assert.ok(result.priorities.slice(1).some(finding => ["slow", "stockout"].includes(finding.type)));
  assert.ok(result.priorities.some(finding => `${finding.title} ${finding.evidence}`.includes("Café Tradicional 500 g") || `${finding.title} ${finding.evidence}`.includes("Otro")));
});

test("ETAPA 3 G: la concentración muestra el porcentaje y su significado", () => {
  const sales = stageThreeSales({ products: ["A", "A", "A", "B"], rowsPerMonth: 4 }).map((row, index) => ({ ...row, cantidad: index % 4 === 3 ? 1 : 10, valorTotal: index % 4 === 3 ? 10000 : 100000 }));
  const result = setStageThree({ sales, inventory: [] });
  assert.ok(result.metrics.topShare > .6);
  const chart = productChartHtml();
  assert.ok(chart.includes("productos principales representan"));
  assert.ok(chart.includes("del valor vendido"));
});

test("ETAPA 3 H: la calidad alta usa la fórmula 35/30/20/15 y el umbral de 85", () => {
  const quality = stageThreeQuality(stageThreeSales(), ["A", "B", "C", "D"].map(producto => ({ producto, stock: 10 })));
  const expected = Math.round((quality.components.completeness * .35 + quality.components.validity * .30 + quality.components.consistency * .20 + quality.components.coverage * .15) * 100);
  assert.equal(quality.score, expected);
  assert.ok(quality.score >= 85);
  assert.equal(quality.level, "ALTA");
});

test("ETAPA 3 I: la calidad media se comunica sin términos técnicos", () => {
  const sales = stageThreeSales({ months: 3, rowsPerMonth: 4 });
  sales.forEach((row, index) => { if (index % 2 === 0) row.fecha = ""; if (index % 2 === 1) row.producto = ""; });
  const result = setStageThree({ sales, inventory: [] });
  assert.equal(result.resultQuality.level, "MEDIA");
  const html = resultsScreen();
  assert.ok(html.includes("algunos datos incompletos"));
  for (const technical of ["dataset", "outlier", "validation score", "confidence score", "nulls"]) assert.ok(!html.toLowerCase().includes(technical));
});

test("ETAPA 3 J: una cantidad crítica incompleta impide conclusiones de inventario", () => {
  const sales = stageThreeSales({ products: ["A", "B"], rowsPerMonth: 4 });
  sales.forEach((row, index) => { row.cantidad = index % 2 ? "" : 1; });
  const inventory = [{ producto: "A", stock: 100 }, { producto: "B", stock: 100 }];
  const result = setStageThree({ sales, inventory });
  assert.equal(result.metrics.quantityRate, .5);
  assert.equal(result.metrics.excessItems.length, 0);
  assert.equal(result.metrics.riskItems.length, 0);
  assert.ok(!result.priorities.some(finding => ["inventory-accumulation", "inventory-excess", "stock-risk-general", "slow", "stockout"].includes(finding.type)));
});

test("ETAPA 3 FINAL A: solo ventas con cantidad conserva unidades y explica la ausencia de dinero", () => {
  const result = setStageThree({ sales: stageThreeSales({ value: false }), inventory: [] });
  assert.equal(result.metrics.chartBasis, "quantity");
  assert.ok(resultsScreen().includes("unidades vendidas"));
  assert.ok(resultsScreen().includes("No encontramos una columna de valor total"));
});

test("ETAPA 3 FINAL B: ventas con cantidad y valor usa pesos sin mezclarlos con unidades", () => {
  const result = setStageThree({ sales: stageThreeSales(), inventory: [] });
  assert.equal(result.metrics.chartBasis, "value");
  assert.ok(trendChartHtml().includes("pesos vendidos por mes"));
  assert.ok(productChartHtml().includes("del valor vendido"));
});

test("ETAPA 3 FINAL C: calidad alta conserva la fórmula determinística y habilita prioridad", () => {
  const result = setStageThree({ sales: stageThreeSales(), inventory: ["A", "B", "C", "D"].map(producto => ({ producto, stock: 12 })) });
  assert.equal(result.resultQuality.level, "ALTA");
  assert.ok(result.priorities.length > 0);
  assert.ok(resultsScreen().includes(`${result.resultQuality.score} % · Alta`));
});

test("ETAPA 3 FINAL D: calidad media comunica cautela y no certeza", () => {
  const sales = stageThreeSales({ months: 3 });
  sales.forEach((row, index) => { if (index % 2 === 0) row.fecha = ""; if (index % 2 === 1) row.producto = ""; });
  const result = setStageThree({ sales, inventory: [] });
  assert.equal(result.resultQuality.level, "MEDIA");
  assert.ok(resultsScreen().includes("algunos datos incompletos"));
});

test("ETAPA 3 FINAL E: calidad insuficiente no genera prioridad ni descarga", () => {
  const result = setStageThree({ sales: [{ fecha: "", producto: "", cantidad: "" }], inventory: [] });
  const html = resultsScreen();
  assert.equal(result.resultQuality.level, "BAJA");
  assert.equal(result.priorities.length, 0);
  assert.ok(html.includes("Todavía no tenemos información suficiente"));
  assert.ok(html.includes("Descargar resumen ejecutivo</button>"));
  assert.ok(html.includes("disabled"));
});

test("ETAPA 3 FINAL F: ventas e inventario relacionados sustentan cifras cruzadas", () => {
  const sales = stageThreeSales({ products: ["A", "B"] });
  const result = setStageThree({ sales, inventory: [{ producto: "A", stock: 40 }, { producto: "B", stock: 3 }] });
  assert.equal(result.metrics.linkedProducts, 2);
  assert.ok(result.priorities.some(finding => ["slow", "stockout"].includes(finding.type)));
});

test("ETAPA 3 FINAL G: inventario sin relación válida solo aparece como limitación", () => {
  const result = setStageThree({ sales: stageThreeSales({ products: ["A", "B"] }), inventory: [{ producto: "X", stock: 40 }, { producto: "Y", stock: 3 }] });
  assert.equal(result.metrics.linkedProducts, 0);
  assert.ok(!result.priorities.some(finding => ["slow", "stockout"].includes(finding.type)));
  assert.ok(analysisLimitations().some(item => item.includes("No pudimos comparar ventas e inventario")));
});

test("ETAPA 3 FINAL H: el mes actual incompleto queda fuera de comparaciones y gráficos", () => {
  const sales = [];
  for (let month = 4; month <= 8; month += 1) sales.push({ fecha: `2026-${String(month).padStart(2, "0")}-05`, producto: "A", cantidad: month * 10, valorTotal: month * 100000 });
  const result = setStageThree({ sales, inventory: [] }, new Date("2026-08-08T12:00:00Z"));
  assert.equal(result.metrics.currentMonthExcluded, true);
  assert.equal(result.metrics.lastCompleteMonth, "2026-07");
  assert.ok(!result.metrics.monthly.some(item => item.month === "2026-08"));
  assert.ok(trendChartHtml().includes("julio de 2026"));
  assert.ok(!trendChartHtml().includes("ago 2026"));
});

test("ETAPA 3 FINAL I: un producto dominante muestra su porcentaje real", () => {
  const sales = stageThreeSales({ products: ["Líder", "Líder", "Líder", "Otro"] }).map((row, index) => ({ ...row, cantidad: index % 4 === 3 ? 1 : 20, valorTotal: index % 4 === 3 ? 10000 : 200000 }));
  const result = setStageThree({ sales, inventory: [] });
  assert.ok(result.metrics.topShare > .6);
  assert.ok(productChartHtml().includes("productos principales representan"));
});

test("ETAPA 3 FINAL J: un producto que se deteriora puede convertirse en la misma prioridad del detalle", () => {
  const sales = [];
  const quantities = [100, 100, 100, 40, 35, 30];
  const offsets = [50, 50, 50, 110, 115, 120];
  quantities.forEach((quantity, index) => {
    sales.push({ fecha: `2026-0${index + 1}-10`, producto: "Producto en baja", cantidad: quantity, valorTotal: quantity * 1000 });
    sales.push({ fecha: `2026-0${index + 1}-11`, producto: "Producto compensador", cantidad: offsets[index], valorTotal: offsets[index] * 1000 });
  });
  const result = setStageThree({ sales, inventory: [] });
  const decline = result.priorities.find(finding => finding.type === "product-decline");
  assert.ok(decline);
  const presentation = priorityPresentation(decline);
  assert.ok(presentation.title.includes("Producto en baja"));
  assert.ok(managementDetailHtml(decline, presentation, false).includes(presentation.title));
});

test("ETAPA 3 FINAL K: valor monetario ausente siempre muestra la causa específica", () => {
  setStageThree({ sales: stageThreeSales({ value: false }), inventory: [] });
  assert.ok(resultsScreen().includes("No encontramos una columna de valor total ni información suficiente de cantidad y precio para calcularlo."));
  assert.ok(executiveSummaryModel().unknown.some(item => item.includes("No encontramos una columna de valor total")));
});

test("PDF 1: el modelo conserva contenido gerencial, calidad, limitaciones y responsabilidad", () => {
  setStageThree({ sales: stageThreeSales(), inventory: [] });
  const model = executiveSummaryModel();
  assert.equal(model.title, "Resumen para tomar decisiones");
  assert.ok(model.overview.length >= 2);
  assert.ok(model.priority.title);
  assert.ok(model.quality.label.includes("%"));
  assert.ok(model.cards.length >= 4);
  assert.ok(model.monthly.length >= 2);
  assert.ok(model.unknown.some(item => item.includes("inventario")));
  assert.ok(model.responsibility.includes("San José no toma decisiones por la empresa"));
});

test("PDF 2: genera un archivo PDF A4 real con logo y varias páginas legibles", async () => {
  setStageThree({ sales: datasets.ejemploVentas.sales, inventory: [] });
  const logo = fs.readFileSync(path.join(__dirname, "..", "assets", "logo-san-jose-azul.png"));
  const bytes = await buildExecutiveSummaryPdf(logo);
  assert.equal(Buffer.from(bytes).subarray(0, 5).toString("ascii"), "%PDF-");
  const document = await PDFLib.PDFDocument.load(bytes);
  assert.ok(document.getPageCount() >= 2);
  assert.equal(Math.round(document.getPage(0).getWidth()), 595);
  assert.equal(Math.round(document.getPage(0).getHeight()), 842);
  assert.equal(document.getTitle(), "Resumen para tomar decisiones - San José");
  if (process.env.SAN_JOSE_PDF_QA_PATH) {
    fs.mkdirSync(path.dirname(process.env.SAN_JOSE_PDF_QA_PATH), { recursive: true });
    fs.writeFileSync(process.env.SAN_JOSE_PDF_QA_PATH, bytes);
  }
});

test("ETAPA 3 FINAL L: sin inventario no genera análisis de existencias", () => {
  const result = setStageThree({ sales: stageThreeSales(), inventory: [] });
  assert.equal(result.metrics.inv.length, 0);
  assert.ok(!result.priorities.some(finding => ["slow", "stockout"].includes(finding.type)));
  assert.ok(analysisLimitations().some(item => item.includes("No encontramos inventario")));
  assert.ok(!resultsScreen().includes("Productos con más unidades disponibles"));
});

function businessRows(productSeries) {
  const rows = [];
  Object.entries(productSeries).forEach(([producto, values]) => values.forEach((cantidad, index) => rows.push({
    fecha: `2026-${String(index + 1).padStart(2, "0")}-10`, producto, cantidad, valorTotal: cantidad * 1000
  })));
  return rows;
}

test("MOTOR 1: detecta una caída general aunque el último mes tenga una pequeña recuperación", () => {
  const sales = businessRows({ A: [60, 60, 60, 40, 30, 35], B: [40, 40, 40, 30, 30, 30] });
  const result = setStageThree({ sales, inventory: [] });
  assert.equal(result.metrics.panorama.status, "VENTAS EN DESCENSO");
  assert.equal(result.priorities[0].type, "business-decline");
  assert.ok(result.priorities[0].reason.includes("tres meses"));
});

test("MOTOR 2: calcula qué producto explica la reducción total del negocio", () => {
  const sales = businessRows({ "Producto A": [60, 60, 60, 20, 20, 20], "Producto B": [40, 40, 40, 45, 45, 45] });
  const result = setStageThree({ sales, inventory: [] });
  const cause = result.priorities.find(finding => finding.type === "sales-decline-cause");
  assert.equal(result.priorities[0].type, "business-decline");
  assert.ok(cause);
  assert.equal(cause.driver.product, "Producto A");
  assert.ok(cause.driver.contribution > 1);
  assert.ok(cause.summary.includes("Producto A explica"));
});

test("MOTOR 3: un producto solo es prioridad principal cuando el negocio está estable", () => {
  const sales = businessRows({ "Producto localizado": [100, 100, 100, 40, 35, 30], "Producto compensador": [50, 50, 50, 110, 115, 120] });
  const result = setStageThree({ sales, inventory: [] });
  assert.equal(result.metrics.panorama.status, "VENTAS ESTABLES");
  assert.equal(result.priorities[0].type, "product-decline");
  assert.equal(result.priorities[0].driver.product, "Producto localizado");
});

test("MOTOR 4: varios cortes permiten afirmar que las existencias aumentaron", () => {
  const sales = businessRows({ A: [60, 60, 60, 40, 40, 40], B: [40, 40, 40, 30, 30, 30] });
  const inventory = [
    { fechaCorte: "2026-03-31", producto: "A", stock: 100 }, { fechaCorte: "2026-03-31", producto: "B", stock: 100 },
    { fechaCorte: "2026-06-30", producto: "A", stock: 140 }, { fechaCorte: "2026-06-30", producto: "B", stock: 120 }
  ];
  const result = setStageThree({ sales, inventory });
  assert.equal(result.metrics.inventoryHistory.length, 2);
  assert.equal(Math.round(result.metrics.inventoryChange * 100), 30);
  assert.equal(result.priorities[0].type, "inventory-accumulation");
  assert.ok(result.priorities[0].reason.includes("existencias aumentaron"));
});

test("MOTOR 5: una sola fotografía nunca se describe como aumento de inventario", () => {
  const sales = businessRows({ A: [10, 10, 10, 10, 10, 10], B: [90, 90, 90, 90, 90, 90] });
  const result = setStageThree({ sales, inventory: [{ producto: "A", stock: 900 }, { producto: "B", stock: 100 }] });
  assert.equal(result.metrics.inventoryChange, null);
  assert.notEqual(result.priorities[0].type, "inventory-accumulation");
  assert.ok(result.priorities.some(finding => finding.type === "inventory-excess"));
  assert.ok(result.priorities.every(finding => !`${finding.title} ${finding.reason}`.includes("aument")));
});

test("MOTOR 6: ventas estables con productos críticos y pocas existencias priorizan el riesgo general", () => {
  const sales = businessRows({ A: [70, 70, 70, 70, 70, 70], B: [30, 30, 30, 30, 30, 30] });
  const result = setStageThree({ sales, inventory: [{ producto: "A", stock: 10 }, { producto: "B", stock: 90 }] });
  assert.equal(result.metrics.panorama.status, "VENTAS ESTABLES");
  assert.equal(result.priorities[0].type, "stock-risk-general");
  assert.ok(result.priorities[0].reason.includes("unidades vendidas recientemente"));
});

test("MOTOR 7: inventario sin relación válida no genera prioridades conjuntas", () => {
  const sales = businessRows({ A: [60, 60, 60, 40, 40, 40], B: [40, 40, 40, 30, 30, 30] });
  const result = setStageThree({ sales, inventory: [{ producto: "X", stock: 500 }, { producto: "Y", stock: 1 }] });
  assert.equal(result.metrics.linkedProducts, 0);
  assert.ok(!result.priorities.some(finding => ["inventory-accumulation", "inventory-excess", "stock-risk-general", "slow", "stockout"].includes(finding.type)));
});

test("MOTOR 8: los tres hallazgos forman una historia y el plan recibe sus causas", () => {
  const sales = businessRows({ A: [60, 60, 60, 20, 20, 20], B: [30, 30, 30, 20, 20, 20], C: [10, 10, 10, 10, 10, 10] });
  const result = setStageThree({ sales, inventory: [] });
  const plan = getPlan();
  assert.ok(result.priorities.length <= 3);
  assert.equal(result.priorities[0].level, "general");
  assert.ok(result.priorities.slice(1).every(finding => finding.parentType === result.priorities[0].type));
  assert.ok(plan[0].action.includes("A"));
  assert.equal(plan.length, 3);
});

test("MOTOR 9: clasifica internamente crecimiento y no lo presenta como caída", () => {
  const sales = businessRows({ A: [40, 40, 40, 60, 65, 70], B: [20, 20, 20, 30, 30, 30] });
  const result = setStageThree({ sales, inventory: [] });
  assert.equal(result.metrics.panorama.status, "VENTAS EN CRECIMIENTO");
  assert.notEqual(result.priorities[0].type, "business-decline");
});

test("MOTOR 10: analiza clientes confirmados como explicación de una caída general", () => {
  const sales = [];
  for (let month = 1; month <= 6; month += 1) {
    const north = month <= 3 ? 70 : 30;
    sales.push({ fecha: `2026-0${month}-10`, producto: "Producto A", cliente: "Cliente Norte", cantidad: north, valorTotal: north * 1000 });
    sales.push({ fecha: `2026-0${month}-11`, producto: "Producto A", cliente: "Cliente Sur", cantidad: 30, valorTotal: 30000 });
  }
  const result = setStageThree({ sales, inventory: [] });
  assert.ok(result.metrics.customerDrivers.length >= 2);
  assert.equal(result.priorities[0].type, "business-decline");
  assert.ok(result.priorities.slice(1).some(finding => finding.driver?.dimension === "cliente" && finding.driver.product === "Cliente Norte"));
});

test("CONTEXTO 1: conecta un cliente mencionado con evidencia real sin inventar causalidad", () => {
  const sales = [];
  for (let month = 1; month <= 6; month += 1) {
    if (month <= 3) sales.push({ fecha: `2026-0${month}-10`, producto: "A", cliente: "Cliente Norte", cantidad: 70, valorTotal: 70000 });
    sales.push({ fecha: `2026-0${month}-11`, producto: "B", cliente: "Cliente Sur", cantidad: 30, valorTotal: 30000 });
  }
  const context = { actividad: "Comercio", registro: "Excel o Google Sheets", antiguedad: "3 a 5 años", contextoLibre: "En mayo perdimos al Cliente Norte." };
  const result = setStageThree({ sales, inventory: [] }, new Date("2026-08-08T12:00:00Z"), context);
  const diagnosis = result.diagnostico;
  assert.equal(diagnosis.contextoEmpresarial.actividad, "Comercio");
  assert.equal(diagnosis.contextoRelevante, context.contextoLibre);
  assert.equal(diagnosis.coincidenciasContextoDatos.length, 1);
  assert.equal(diagnosis.coincidenciasContextoDatos[0].nivel, "RESPALDADO_POR_DATOS");
  assert.ok(diagnosis.coincidenciasContextoDatos[0].texto.includes("Los datos respaldan que"));
  assert.ok(diagnosis.evidenciaContextual[0].includes("Cliente Norte dejó de registrar compras"));
  const html = resultsScreen();
  assert.ok(html.includes("Tuvimos en cuenta lo que nos contaste"));
  assert.ok(html.includes("Cliente Norte"));
  assert.ok(html.indexOf("Tuvimos en cuenta lo que nos contaste") < html.indexOf("Ver evidencia"));
  assert.ok(!html.includes("bajaron porque"));
});

test("CONTEXTO 2: un cambio de precio permanece como hipótesis y no como causa observada", () => {
  const sales = businessRows({ A: [60, 60, 60, 20, 20, 20], B: [40, 40, 40, 30, 30, 30] });
  const result = setStageThree({ sales, inventory: [] }, new Date("2026-08-08T12:00:00Z"), { contextoLibre: "Cambiamos los precios en abril." });
  assert.equal(result.diagnostico.coincidenciasContextoDatos[0].nivel, "POSIBLE_EXPLICACION");
  assert.ok(result.diagnostico.coincidenciasContextoDatos[0].texto.includes("podría estar relacionado"));
  assert.ok(result.diagnostico.hipotesisContextuales.some(item => item.includes("precio")));
  assert.ok(!result.diagnostico.causasObservadas.some(item => item.includes("precio")));
});

test("CONTEXTO 3: oculta el bloque cuando el relato no aporta una coincidencia relevante", () => {
  const sales = businessRows({ A: [60, 60, 60, 20, 20, 20], B: [40, 40, 40, 30, 30, 30] });
  const result = setStageThree({ sales, inventory: [] }, new Date("2026-08-08T12:00:00Z"), { contextoLibre: "Nuestro negocio vende productos para el hogar." });
  assert.equal(result.diagnostico.coincidenciasContextoDatos.length, 0);
  assert.equal(result.diagnostico.contextoRelevante, "");
  assert.ok(!resultsScreen().includes("Tuvimos en cuenta lo que nos contaste"));
});

test("ARQUITECTURA 1: todos los módulos entregan el contrato empresarial común", () => {
  const sales = businessRows({ A: [60, 60, 60, 20, 20, 20], B: [40, 40, 40, 30, 30, 30] });
  const result = setStageThree({ sales, inventory: [{ producto: "A", stock: 500 }, { producto: "B", stock: 5 }] });
  const required = ["dominio", "tipoProblema", "problemaGeneral", "magnitud", "unidad", "periodo", "evidencia", "causasObservadas", "aportePorCausa", "hipotesisPorValidar", "limitaciones", "calidadInformacion", "impacto", "urgencia", "alcance", "prioridad"];
  assert.ok(result.businessFindings.length >= 2);
  result.businessFindings.forEach(finding => required.forEach(field => assert.ok(Object.hasOwn(finding, field), `${finding.type} no tiene ${field}`)));
});

test("ARQUITECTURA 2: el diagnóstico entrega hechos, hipótesis y datos disponibles por separado", () => {
  const sales = [];
  for (let month = 1; month <= 6; month += 1) {
    if (month <= 3) sales.push({ fecha: `2026-0${month}-10`, producto: "A", cliente: "Cliente inactivo", cantidad: 70, valorTotal: 70000 });
    sales.push({ fecha: `2026-0${month}-11`, producto: "B", cliente: "Cliente activo", cantidad: month <= 3 ? 30 : 20, valorTotal: (month <= 3 ? 30 : 20) * 1000 });
  }
  const result = setStageThree({ sales, inventory: [] });
  const diagnosis = result.diagnostico;
  const required = ["problemGeneral", "evidenciaProblema", "causasObservadas", "aportePorCausa", "hipotesisPorValidar", "limitaciones", "calidadInformacion", "periodoAnalizado", "comparacionHistorica", "datosDisponibles"];
  required.forEach(field => assert.ok(Object.hasOwn(diagnosis, field), `falta ${field}`));
  assert.ok(diagnosis.causasObservadas.some(item => item.includes("Cliente inactivo") || item.includes("cliente que antes compraba")));
  assert.ok(diagnosis.hipotesisPorValidar.some(item => item.includes("precio")));
  assert.ok(!diagnosis.causasObservadas.some(item => item.includes("precio")));
  assert.equal(diagnosis.datosDisponibles.competencia, false);
});

test("ARQUITECTURA 3: Etapa 3 muestra qué revisar sin presentar un plan comercial detallado", () => {
  const sales = businessRows({ A: [60, 60, 60, 20, 20, 20], B: [40, 40, 40, 30, 30, 30] });
  setStageThree({ sales, inventory: [] });
  const html = resultsScreen();
  assert.ok(html.includes("¿Qué deberías revisar ahora?"));
  assert.ok(!html.includes("¿Qué conviene investigar?"));
  assert.ok(!html.includes("¿Qué puedes hacer?"));
  app.activePriority = 0;
  const evidence = evidenceScreen();
  assert.ok(evidence.includes("Qué conviene investigar"));
  assert.ok(!evidence.includes("Qué conviene hacer"));
});

test("ARQUITECTURA 4: el motor central puede priorizar un módulo futuro sin reconstruirse", () => {
  const futureFinding = { dominio: "cartera", tipoProblema: "cartera-vencida", problemaGeneral: "La cartera vencida está aumentando.", magnitud: 64, unidad: "porcentaje", periodo: "Último mes", evidencia: ["Cinco clientes concentran 64 % de la deuda vencida."], causasObservadas: [], aportePorCausa: [], hipotesisPorValidar: [], limitaciones: [], calidadInformacion: { nivel: "Alta", porcentaje: 95 }, impacto: 95, urgencia: 90, alcance: 80, prioridad: 91 };
  const architecture = runBusinessAnalysisModules({}, [() => [futureFinding]], []);
  const ranked = prioritizeBusinessFindings([...architecture.findings, { ...futureFinding, dominio: "ventas", prioridad: 60 }]);
  assert.equal(ranked[0].dominio, "cartera");
  assert.equal(architecture.moduleFindings[0].tipoProblema, "cartera-vencida");
});

test("ARQUITECTURA 5: el cruce Ventas e Inventario exige productos relacionados", () => {
  const sales = businessRows({ A: [60, 60, 60, 40, 40, 40], B: [40, 40, 40, 30, 30, 30] });
  const invalid = setStageThree({ sales, inventory: [{ fechaCorte: "2026-03-31", producto: "X", stock: 100 }, { fechaCorte: "2026-06-30", producto: "X", stock: 160 }] });
  assert.ok(!invalid.businessFindings.some(finding => finding.dominio === "ventas-inventario"));
  const valid = setStageThree({ sales, inventory: [{ fechaCorte: "2026-03-31", producto: "A", stock: 100 }, { fechaCorte: "2026-06-30", producto: "A", stock: 160 }] });
  assert.ok(valid.businessFindings.some(finding => finding.dominio === "ventas-inventario"));
  assert.ok(valid.businessFindings.find(finding => finding.dominio === "ventas-inventario").limitaciones.some(item => item.includes("no demuestra")));
});

test("DIAGNÓSTICO 1: una caída de 90 % activa atención inmediata y cuantifica la pérdida", () => {
  const sales = businessRows({ A: [100, 100, 100, 10, 10, 10] });
  const result = setStageThree({ sales, inventory: [] });
  const main = result.priorities[0];
  const presentation = priorityPresentation(main);
  assert.equal(main.type, "business-decline");
  assert.equal(main.nivelUrgencia, "Crítico");
  assert.equal(Math.round(main.magnitudDetalle.unidadesDejadasDeVender), 270);
  assert.equal(Math.round(main.magnitudDetalle.valorDejadoDeVender), 270000);
  assert.ok(presentation.title.includes("atención inmediata") || presentation.title.includes("revisión inmediata"));
  assert.ok(presentation.metrics.some(item => item.includes("270 unidades")));
  assert.ok(!resultsScreen().includes("Espera para confirmar"));
});

test("DIAGNÓSTICO 2: limita a tres focos y conserva evidencia y aporte alineados", () => {
  const sales = [];
  for (let month = 1; month <= 6; month += 1) {
    const recent = month > 3;
    sales.push({ fecha: `2026-0${month}-10`, producto: "A", cliente: "Cliente Norte", vendedor: "Comercial 1", cantidad: recent ? 10 : 70, valorTotal: (recent ? 10 : 70) * 1000, utilidad: (recent ? 2 : 20) * 1000 });
    sales.push({ fecha: `2026-0${month}-11`, producto: "B", cliente: "Cliente Sur", vendedor: "Comercial 2", cantidad: recent ? 20 : 30, valorTotal: (recent ? 20 : 30) * 1000, utilidad: (recent ? 4 : 10) * 1000 });
  }
  const result = setStageThree({ sales, inventory: [] });
  const main = result.priorities[0];
  assert.ok(main.focosPrioritarios.length <= 3);
  assert.equal(main.causasObservadas.length, main.aportePorCausa.length);
  assert.equal(main.causasObservadas.length, main.focosPrioritarios.length);
  assert.ok(main.causasObservadas.every(item => /%|\$|unidades/.test(item)));
  assert.equal(result.diagnostico.focosPrioritarios.length, main.focosPrioritarios.length);
});

test("DIAGNÓSTICO 3: clientes incompletos no explican la prioridad", () => {
  const sales = businessRows({ A: [100, 100, 100, 40, 40, 40] });
  sales[0].cliente = "Cliente parcial";
  const result = setStageThree({ sales, inventory: [] });
  assert.ok(result.metrics.customerRate < .70);
  assert.ok(!result.priorities[0].aportePorCausa.some(item => item.dimension === "cliente"));
  assert.equal(result.diagnostico.datosDisponibles.clientes, false);
  assert.ok(result.diagnostico.limitaciones.some(item => item.includes("clientes están incompletos")));
});

test("DIAGNÓSTICO 4: utilidad solo se analiza cuando tiene calidad suficiente", () => {
  const sales = [];
  for (let month = 1; month <= 6; month += 1) sales.push({ fecha: `2026-0${month}-10`, producto: "A", cantidad: 100, valorTotal: 100000, utilidad: month <= 3 ? 30000 : 10000 });
  const result = setStageThree({ sales, inventory: [] });
  assert.equal(result.metrics.panorama.status, "VENTAS ESTABLES");
  assert.equal(result.metrics.utilityRate, 1);
  assert.equal(result.priorities[0].type, "profit-decline");
  assert.equal(result.diagnostico.datosDisponibles.utilidad, true);
  assert.ok(result.priorities[0].reason.includes("utilidad"));
});

test("DIAGNÓSTICO 5: diferencia unidades y valor sin inventar una causa", () => {
  const sales = [];
  for (let month = 1; month <= 6; month += 1) {
    const quantity = month <= 3 ? 100 : 80;
    const value = month <= 3 ? 100000 : 50000;
    sales.push({ fecha: `2026-0${month}-10`, producto: "A", cantidad: quantity, valorTotal: value });
  }
  const result = setStageThree({ sales, inventory: [] });
  const comparison = result.priorities[0].causasObservadas.find(item => item.includes("unidades bajaron"));
  assert.ok(comparison.includes("20 %"));
  assert.ok(comparison.includes("50 %"));
  assert.ok(result.priorities[0].hipotesisPorValidar.some(item => item.includes("precios") || item.includes("descuentos")));
});

test("DIAGNÓSTICO 6: fecha de último movimiento permite detectar inventario inmóvil", () => {
  const inventory = [
    { producto: "A", stock: 80, ultimoMovimiento: "2025-10-01" },
    { producto: "B", stock: 20, ultimoMovimiento: "2026-07-20" }
  ];
  const result = setStageThree({ sales: [], inventory });
  assert.equal(result.metrics.inventoryStatus, "INVENTARIO SIN MOVIMIENTO");
  assert.equal(result.priorities[0].type, "inventory-no-movement");
  assert.ok(result.priorities[0].focosPrioritarios[0].evidencia.includes("días desde su último movimiento"));
});

test("DIAGNÓSTICO 7: el contrato para acciones incluye urgencia, magnitud y focos", () => {
  const result = setStageThree({ sales: businessRows({ A: [100, 100, 100, 20, 20, 20] }), inventory: [] });
  const diagnosis = result.diagnostico;
  ["dominio", "problemGeneral", "nivelUrgencia", "magnitud", "evidencia", "causasObservadas", "aportePorCausa", "focosPrioritarios", "hipotesisPorValidar", "limitaciones", "calidadInformacion"].forEach(field => assert.ok(Object.hasOwn(diagnosis, field), `falta ${field}`));
  assert.ok(diagnosis.focosPrioritarios.length <= 3);
  assert.equal(diagnosis.nivelUrgencia, result.priorities[0].nivelUrgencia);
});

test("DIAGNÓSTICO 8: un margen porcentual no se suma ni se presenta como dinero", () => {
  const sales = [];
  for (let month = 1; month <= 6; month += 1) sales.push({ fecha: `2026-0${month}-10`, producto: "A", cantidad: 100, valorTotal: 100000, utilidad: month <= 3 ? 30 : 10 });
  const result = setStageThree({ sales, inventory: [] });
  const main = result.priorities[0];
  const presentation = priorityPresentation(main);
  assert.equal(result.metrics.utilityMode, "margin-percent");
  assert.equal(main.type, "profit-decline");
  assert.ok(main.evidence.includes("30 %"));
  assert.ok(main.evidence.includes("10 %"));
  assert.ok(!presentation.metrics[1].includes("$"));
  assert.equal(main.magnitudDetalle.valorDejadoDeGenerar, null);
});

test("ETAPA 4 RESUMEN A: presenta primero las tres oportunidades sin desarrollar el plan", () => {
  setStageThree({ sales: businessRows({ A: [100, 100, 100, 20, 20, 20], B: [40, 40, 40, 30, 30, 30] }), inventory: [] });
  const html = planScreen();
  assert.ok(html.includes("Tus 3 oportunidades de mejora"));
  assert.ok(html.includes("Vamos a avanzar uno por uno"));
  assert.equal((html.match(/class="opportunity-card/g) || []).length, 3);
  assert.ok(html.includes("Atender primero"));
  assert.ok(html.includes("Atender después"));
  assert.ok(html.includes("Mantener en observación"));
  assert.equal((html.match(/id="open-plan-detail"/g) || []).length, 1);
  assert.equal((html.match(/Trabajar esta oportunidad →/g) || []).length, 1);
  assert.equal((html.match(/La veremos después/g) || []).length, 2);
  assert.ok(html.includes("¿Cómo vamos a trabajar esto?"));
  assert.ok(html.includes("Entender qué cambió") && html.includes("Actuar") && html.includes("Comprobar si mejoró"));
  assert.ok(!html.includes("class=\"plan-phases\""));
});

test("ETAPA 4 RESUMEN B: muestra solo oportunidades sustentadas y explica la faltante", () => {
  setStageThree({ sales: businessRows({ A: [100, 100, 100, 20, 20, 20] }), inventory: [] });
  app.analysis.priorities = app.analysis.priorities.slice(0, 2);
  const html = planScreen();
  assert.ok(html.includes("Tus 2 oportunidades de mejora"));
  assert.equal((html.match(/class="opportunity-card/g) || []).length, 2);
  assert.ok(html.includes("No pudimos construir una tercera oportunidad porque falta información suficiente"));
  assert.equal((html.match(/id="open-plan-detail"/g) || []).length, 1);
});

test("ETAPA 4 RESUMEN C: el detalle existente se abre después del resumen", () => {
  setStageThree({ sales: businessRows({ A: [100, 100, 100, 20, 20, 20] }), inventory: [] });
  assert.ok(planScreen().includes("class=\"opportunities-summary\""));
  app.planDetailOpen = true;
  const detail = planScreen();
  assert.ok(detail.includes("Tu plan en 3 fases"));
  assert.ok(detail.includes("class=\"plan-phases\""));
  assert.ok(detail.includes("← Ver oportunidades"));
  assert.ok(!detail.includes("class=\"opportunity-grid\""));
});

test("ETAPA 4 A: una situación crítica usa hoy, 2 días y 7 días", () => {
  setStageThree({ sales: businessRows({ "Referencia 4": [100, 100, 100, 10, 10, 10] }), inventory: [] });
  const plan = getActionPlan();
  assert.equal(plan.urgency, "Crítico");
  assert.deepEqual(Array.from(plan.phases, phase => phase.when), ["HOY", "EN 2 DÍAS", "EN 7 DÍAS"]);
  assert.equal(plan.phases.length, 3);
  assert.ok(plan.phases.every(phase => phase.activities.length >= 1 && phase.activities.length <= 3));
  assert.ok(plan.phases[0].action.includes("Referencia 4"));
});

test("ETAPA 4 B: una prioridad importante usa hoy, 8 días y 15 días", () => {
  setStageThree({ sales: businessRows({ A: [60, 60, 60, 40, 40, 40], B: [40, 40, 40, 30, 30, 30] }), inventory: [] });
  const plan = getActionPlan();
  assert.equal(plan.urgency, "Importante");
  assert.deepEqual(Array.from(plan.phases, phase => phase.when), ["HOY", "EN 8 DÍAS", "EN 15 DÍAS"]);
});

test("ETAPA 4 C: usa clientes y comercial reales relacionados con el producto principal", () => {
  const sales = [];
  for (let month = 1; month <= 6; month += 1) {
    const recent = month > 3;
    sales.push({ fecha: `2026-0${month}-10`, producto: "Referencia 4", cliente: "Cliente Norte", vendedor: "Comercial A", cantidad: recent ? 10 : 50, valorTotal: (recent ? 10 : 50) * 1000 });
    sales.push({ fecha: `2026-0${month}-11`, producto: "Referencia 4", cliente: "Cliente Sur", vendedor: "Comercial A", cantidad: recent ? 10 : 30, valorTotal: (recent ? 10 : 30) * 1000 });
    sales.push({ fecha: `2026-0${month}-12`, producto: "Referencia estable", cliente: "Cliente Centro", vendedor: "Comercial B", cantidad: 20, valorTotal: 20000 });
  }
  setStageThree({ sales, inventory: [] });
  const plan = getActionPlan();
  assert.ok(plan.phases[0].action.includes("2 clientes"));
  assert.ok(plan.phases[0].action.includes("Referencia 4"));
  assert.ok(plan.phases[0].evidence.includes("Cliente Norte"));
  assert.ok(plan.phases[0].evidence.includes("Cliente Sur"));
  assert.ok(plan.phases[0].activities.some(item => item.includes("Comercial A")));
});

test("ETAPA 4 D: no inventa clientes ni comerciales cuando no están disponibles", () => {
  setStageThree({ sales: businessRows({ "Referencia 4": [100, 100, 100, 30, 30, 30] }), inventory: [] });
  const plan = getActionPlan();
  const text = JSON.stringify(plan.phases);
  assert.ok(plan.phases[0].action.includes("Referencia 4"));
  assert.ok(!text.includes("Cliente A"));
  assert.ok(!text.includes("Comercial A"));
  assert.ok(text.includes("Identifica con tu equipo"));
});

test("ETAPA 4 E: exceso y riesgo de inventario producen planes diferentes", () => {
  const excessSales = businessRows({ A: [2, 2, 2, 2, 2, 2], B: [98, 98, 98, 98, 98, 98] });
  setStageThree({ sales: excessSales, inventory: [{ producto: "A", stock: 900 }, { producto: "B", stock: 1000 }] });
  const excess = getActionPlan();
  assert.ok(["inventory-excess", "inventory-accumulation"].includes(app.analysis.priorities[0].type));
  assert.ok(excess.phases[0].action.includes("Antes de hacer nuevas compras"));
  assert.ok(excess.phases[2].action.includes("existencias"));

  const riskSales = businessRows({ A: [70, 70, 70, 70, 70, 70], B: [30, 30, 30, 30, 30, 30] });
  setStageThree({ sales: riskSales, inventory: [{ producto: "A", stock: 10 }, { producto: "B", stock: 90 }] });
  const risk = getActionPlan();
  assert.equal(app.analysis.priorities[0].type, "stock-risk-general");
  assert.ok(risk.phases[0].action.includes("Confirma las existencias"));
  assert.ok(risk.phases[1].action.includes("reposición"));
  assert.ok(risk.phases[2].action.includes("disponibilidad"));
});

test("ETAPA 4 F: prepara el seguimiento antes contra después", () => {
  setStageThree({ sales: businessRows({ A: [100, 100, 100, 20, 20, 20] }), inventory: [] });
  const plan = getActionPlan();
  const handoff = plan.handoff;
  ["problemGeneral", "causaTrabajada", "accionesPropuestas", "actividades", "fechaInicio", "fechaRevision", "indicadoresSeguimiento", "valorBase"].forEach(field => assert.ok(Object.hasOwn(handoff, field), `falta ${field}`));
  assert.equal(handoff.accionesPropuestas.length, 3);
  assert.equal(handoff.actividades.length, plan.phases.flatMap(phase => phase.activities).length);
  assert.ok(handoff.indicadoresSeguimiento.length >= 1 && handoff.indicadoresSeguimiento.length <= 3);
  assert.ok(handoff.valorBase.promedioMensualReciente !== null);
  assert.equal(app.actionPlan.fechaRevision, handoff.fechaRevision);
});

test("ETAPA 4 G: la pantalla muestra problema, línea de tiempo, fases y progreso por actividad", () => {
  setStageThree({ sales: businessRows({ A: [60, 60, 60, 30, 30, 30], B: [40, 40, 40, 30, 30, 30] }), inventory: [] });
  app.planDetailOpen = true;
  const html = planScreen();
  const activityCount = getActionPlan().phases.flatMap(phase => phase.activities).length;
  assert.ok(html.includes("Tu plan en 3 fases"));
  assert.ok(html.includes("Problema que estamos atendiendo"));
  assert.ok(html.includes("Empezaremos por aquí"));
  assert.ok(html.includes("Tiempos del plan"));
  assert.ok(html.includes("Fase 1") && html.includes("Fase 2") && html.includes("Fase 3"));
  assert.ok(html.includes("Entender qué cambió") && html.includes("Actuar sobre lo encontrado") && html.includes("Comprobar si mejoró"));
  assert.ok(html.includes(`0 de ${activityCount}`));
  assert.ok(html.includes("¿Cómo sabremos si mejoró?"));
  assert.ok(html.includes("assets/logo-san-jose-azul.png"));
  assert.equal((html.match(/La decisión final y su ejecución corresponden al empresario\./g) || []).length, 1);
  assert.equal((html.match(/class="task-check"/g) || []).length, activityCount);
});

test("ETAPA 4 H: calcula metas parciales con valor de hoy y referencia real", () => {
  setStageThree({ sales: businessRows({ A: [100, 100, 100, 20, 20, 20] }), inventory: [] });
  const plan = getActionPlan();
  const units = plan.signals.find(signal => signal.name === "Unidades vendidas");
  assert.ok(units);
  assert.equal(units.today, "20 unidades al mes");
  assert.equal(units.reference, "100 unidades al mes");
  assert.ok(Number.parseInt(units.target, 10) > 20);
  assert.ok(Number.parseInt(units.target, 10) < 100);
  assert.ok(plan.signals.length <= 3);
});

test("ETAPA 4 I: la meta de clientes se adapta a la cantidad realmente afectada", () => {
  const sales = [];
  ["Norte", "Sur", "Centro", "Occidente", "Oriente"].forEach((cliente, clientIndex) => {
    for (let month = 1; month <= 6; month += 1) sales.push({ fecha: `2026-0${month}-10`, producto: "A", cliente, cantidad: month <= 3 ? 20 - clientIndex : 0, valorTotal: (month <= 3 ? 20 - clientIndex : 0) * 1000 });
  });
  setStageThree({ sales, inventory: [] });
  const plan = getActionPlan();
  const customers = plan.signals.find(signal => signal.name === "Clientes que volvieron a comprar");
  assert.ok(customers);
  assert.equal(customers.today, "0 de 5");
  assert.notEqual(customers.target, "5 de 5");
  assert.ok(plan.phases[1].questions.length >= 1);
  assert.equal(plan.phases[0].questions, undefined);
  assert.equal(plan.phases[2].questions, undefined);
});

test("ETAPA 4 J: la pantalla usa lenguaje simple y reserva las metas para el cierre", () => {
  setStageThree({ sales: businessRows({ A: [100, 100, 100, 20, 20, 20] }), inventory: [] });
  app.planDetailOpen = true;
  const html = planScreen();
  ["Gantt", "KPI", "indicador", "target", "baseline", "performance", "mitigación", "framework", "root cause", "gap"].forEach(term => assert.ok(!html.toLowerCase().includes(term.toLowerCase()), `aparece ${term}`));
  const phaseSection = html.slice(html.indexOf("plan-phases"), html.indexOf("stage-four-signals"));
  assert.ok(!phaseSection.includes(">Meta<"));
  assert.ok(html.includes(">Hoy<") && html.includes(">Meta<"));
});

test("NAVEGACIÓN DEL PLAN A: elimina la vista repetida y prepara el paso directo para contar qué pasó", () => {
  setStageThree({ sales: businessRows({ A: [100, 100, 100, 20, 20, 20] }), inventory: [] });
  app.opportunityHistory = [];
  app.currentOpportunityKey = null;
  app.planDetailOpen = true;
  const actionPlan = getActionPlan();
  const html = planScreen();
  const activityCount = actionPlan.phases.flatMap(phase => phase.activities).length;
  assert.ok(html.includes("Tu plan en 3 fases"));
  assert.ok(html.includes("Problema que estamos atendiendo"));
  assert.ok(!html.includes("Avanza una acción a la vez"));
  assert.ok(!html.includes("Oportunidad que estamos atendiendo"));
  assert.ok(!html.includes("Hacer seguimiento"));
  assert.ok(html.includes("Cuéntanos qué pasó →"));
  assert.ok(html.includes("Todavía tienes actividades pendientes."));
  assert.ok(html.includes("Puedes contarnos cómo te fue hasta ahora o volver al plan."));
  assert.ok(html.includes("Volver al plan"));
  assert.ok(html.includes("Contarnos qué pasó"));
  assert.ok(html.includes("assets/logo-san-jose-azul.png"));
  assert.equal((html.match(/class="task-check"/g) || []).length, activityCount);
  actionPlan.signals.forEach(signal => {
    assert.ok(html.includes(signal.name));
    assert.ok(html.includes(signal.today));
    assert.ok(html.includes(signal.target));
  });
  assert.equal((html.match(/La decisión final y su ejecución corresponden al empresario\./g) || []).length, 1);
});

test("NAVEGACIÓN DEL PLAN B: al completar todas las actividades muestra el cierre acordado", () => {
  setStageThree({ sales: businessRows({ A: [100, 100, 100, 20, 20, 20] }), inventory: [] });
  app.opportunityHistory = [];
  app.currentOpportunityKey = null;
  app.planDetailOpen = true;
  planScreen();
  app.tasks = app.tasks.map(() => true);
  const html = planScreen();
  assert.ok(html.includes("Terminaste este plan."));
  assert.ok(html.includes("Ahora cuéntanos cómo te fue para revisar qué sigue."));
  assert.ok(html.includes('class="plan-finished "'));
  assert.equal((html.match(/Cuéntanos qué pasó →/g) || []).length, 1);
});

test("NAVEGACIÓN DEL PLAN C: no muestra más de tres señales ni lenguaje técnico", () => {
  setStageThree({ sales: businessRows({ A: [100, 100, 100, 20, 20, 20] }), inventory: [] });
  app.opportunityHistory = [];
  app.currentOpportunityKey = null;
  app.planDetailOpen = true;
  const html = planScreen().toLowerCase();
  assert.ok(getActionPlan().signals.length <= 3);
  ["kpi", "indicador de gestión", "target", "baseline", "performance", "seguimiento estratégico", "medición de desempeño", "cierre de proyecto", "iteración"].forEach(term => assert.ok(!html.includes(term), `aparece ${term}`));
});

test("NAVEGACIÓN DEL PLAN D: una nueva oportunidad crea otro ciclo y no reutiliza actividades", () => {
  setStageThree({ sales: businessRows({ A: [100, 100, 100, 20, 20, 20] }), inventory: [] });
  app.opportunityHistory = [];
  app.currentOpportunityKey = null;
  app.planDetailOpen = true;
  planScreen();
  const firstKey = app.currentOpportunityKey;
  const firstOpportunity = app.opportunityHistory[0].oportunidadAtendida;
  app.tasks = Array(getActionPlan().phases.flatMap(phase => phase.activities).length).fill(true);
  const inventoryData = { sales: [], inventory: [{ producto: "Inventario A", stock: 500 }, { producto: "Inventario B", stock: 300 }] };
  app.dataset = inventoryData;
  app.analysis = analyze(inventoryData, new Date("2026-08-08T12:00:00Z"));
  app.actionPlan = null;
  planScreen();
  assert.notEqual(app.currentOpportunityKey, firstKey);
  assert.equal(app.opportunityHistory.length, 2);
  assert.equal(app.opportunityHistory[0].oportunidadAtendida, firstOpportunity);
  assert.equal(app.opportunityHistory[0].estadoFinal, "Pendiente de revisión");
  assert.ok(app.tasks.every(value => value === false));
  assert.ok(app.opportunityHistory[1].actividades.every(item => item.completada === false));
});

test("NAVEGACIÓN DEL PLAN E: completar actividades no decide por sí solo pasar a otra oportunidad", () => {
  const insufficient = decideOpportunityAfterReview({ hasNewData: false, activitiesCompleted: true });
  const stillPriority = decideOpportunityAfterReview({ hasNewData: true, outcome: "improved", improvedEnough: true, remainsHighestPriority: true, activitiesCompleted: true });
  const nextOpportunity = decideOpportunityAfterReview({ hasNewData: true, outcome: "improved", improvedEnough: true, remainsHighestPriority: false });
  assert.equal(insufficient.next, false);
  assert.equal(insufficient.state, "No hay información suficiente");
  assert.equal(stillPriority.next, false);
  assert.equal(stillPriority.state, "Todavía necesita atención");
  assert.equal(nextOpportunity.next, true);
  assert.equal(nextOpportunity.state, "Mejoró suficientemente");
});

test("DESPUÉS DEL PLAN A: muestra dos preguntas rápidas y una sola pregunta abierta", () => {
  const html = feedbackScreen();
  assert.ok(html.includes("Cuéntanos cómo te fue"));
  assert.ok(html.includes("¿Pudiste hacer el plan?"));
  assert.ok(html.includes("¿Notaste alguna mejora?"));
  assert.ok(html.includes('value="En parte"'));
  assert.equal((html.match(/<fieldset>/g) || []).length, 2);
  assert.equal((html.match(/<textarea/g) || []).length, 1);
  assert.ok(html.includes("Escribe o cuéntanos con tu voz"));
  assert.ok(html.includes("Guardar y revisar qué sigue →"));
  assert.ok(html.includes('data-go="7">← Volver al plan'));
  assert.ok(!html.includes('data-go="8"'));
  assert.ok(html.includes("Solo usamos lo que escribas o dictemos como texto para esta revisión."));
});

test("DESPUÉS DEL PLAN B: reutiliza el dictado continuo con el mensaje final acordado", () => {
  const button = mockElement();
  const textarea = mockElement("Ya escribí algo.");
  const status = mockElement();
  const elements = { "#feedback-voice-button": button, "#feedback-story": textarea, "#feedback-voice-status": status };
  document.querySelector = selector => elements[selector] || fallbackElement;
  sandbox.window.SpeechRecognition = FakeRecognition;
  setupSpeechRecognition({ buttonSelector: "#feedback-voice-button", textareaSelector: "#feedback-story", statusSelector: "#feedback-voice-status", finishedMessage: "Listo. Revisa el texto y cambia lo que quieras antes de continuar.", unavailableMessage: "No pudimos usar el micrófono. Puedes continuar escribiendo." });
  button.listeners.click();
  assert.equal(button.textContent, "■ Terminar");
  assert.equal(status.textContent, "Te estamos escuchando…");
  FakeRecognition.instance.onresult(speechResult("Dos clientes volvieron."));
  assert.equal(textarea.value, "Ya escribí algo. Dos clientes volvieron.");
  button.listeners.click();
  assert.equal(status.textContent, "Listo. Revisa el texto y cambia lo que quieras antes de continuar.");
});

test("DESPUÉS DEL PLAN C: guarda percepción, avance, metas y datos por separado", () => {
  setStageThree({ sales: businessRows({ A: [100, 100, 100, 20, 20, 20] }), inventory: [] });
  app.opportunityHistory = [];
  app.currentOpportunityKey = null;
  const actionPlan = getActionPlan();
  const activityCount = actionPlan.phases.flatMap(phase => phase.activities).length;
  app.tasks = Array(activityCount).fill(false);
  app.tasks[0] = true;
  syncOpportunityCycle(actionPlan);
  const record = buildFeedbackRecord({ planCompletado: "En parte", mejoraPercibida: "Sí", comentarioUsuario: "Perdimos un cliente y seguimos con falta de producto del proveedor." }, new Date("2026-08-08T12:00:00Z"));
  assert.equal(record.planCompletado, "En parte");
  assert.equal(record.accionesRealizadas.length, 1);
  assert.equal(record.accionesPendientes.length, activityCount - 1);
  assert.ok(record.metasPrevias.length >= 1 && record.metasPrevias.length <= 3);
  assert.equal(record.resultadosDisponibles.hayDatosNuevos, false);
  assert.equal(record.loQueDiceElUsuario.mejoraPercibida, "Sí");
  assert.equal(record.loQueMuestranLosDatos.hayDatosNuevos, false);
  assert.ok(record.nuevosCambiosMencionados.includes("Pérdida de cliente"));
  assert.ok(record.nuevosCambiosMencionados.includes("Falta de producto"));
  assert.ok(record.nuevosCambiosMencionados.includes("Cambio relacionado con proveedor"));
  assert.equal(record.fechaRevision, "2026-08-08T12:00:00.000Z");
  const decision = recordOpportunityReview(record);
  assert.equal(decision.next, false);
  assert.equal(app.opportunityHistory[0].estadoFinal, "Mejoró parcialmente");
  assert.equal(app.opportunityHistory[0].retroalimentacion.mejoraPercibida, "Sí");
  assert.equal(app.opportunityHistory[0].resultado.hayDatosNuevos, false);
});

test("DESPUÉS DEL PLAN D: evita lenguaje técnico frente al usuario", () => {
  const html = feedbackScreen().toLowerCase();
  ["retroalimentación", "iteración", "evaluación de desempeño", "kpi", "aprendizaje del sistema", "mejora continua", "ciclo de optimización", "feedback loop", "pdca"].forEach(term => assert.ok(!html.includes(term), `aparece ${term}`));
});

test("CICLO 1: cada oportunidad construye su propio diagnóstico y plan", () => {
  setStageThree({ sales: businessRows({ A: [100, 100, 100, 20, 20, 20], B: [60, 60, 60, 30, 30, 30] }), inventory: [] });
  app.datasetName = "Ciclo de prueba";
  beginAnalysisCycle();
  const first = getActionPlan();
  app.activeOpportunityIndex = 1;
  app.activePriority = 1;
  app.currentOpportunityKey = null;
  app.actionPlan = null;
  const second = getActionPlan();
  assert.notEqual(first.problemGeneral, second.problemGeneral);
  assert.notEqual(first.phases[0].action, second.phases[0].action);
  assert.equal(app.analysisCycles.length, 1);
  assert.equal(currentAnalysisCycle().prioridades.length, Math.min(3, app.analysis.priorities.length));
});

test("CICLO 2: clasifica percepción suficiente, parcial, sin mejora y sin información", () => {
  assert.equal(decideOpportunityAfterReview({ perceivedImprovement: "Sí", planCompleted: "Sí" }).state, "Mejoró suficientemente");
  assert.equal(decideOpportunityAfterReview({ perceivedImprovement: "Sí", planCompleted: "En parte" }).state, "Mejoró parcialmente");
  assert.equal(decideOpportunityAfterReview({ perceivedImprovement: "Todavía no", planCompleted: "Sí" }).state, "Sigue igual");
  assert.equal(decideOpportunityAfterReview({ perceivedImprovement: "No estoy seguro", planCompleted: "Sí" }).state, "No hay información suficiente");
  assert.equal(decideOpportunityAfterReview({ perceivedImprovement: "Sí", planCompleted: "Sí", comment: "La situación empeoró" }).state, "Empeoró");
});

test("CICLO 3: la transición avanza, repite o cierra según el resultado y las oportunidades disponibles", () => {
  setStageThree({ sales: businessRows({ A: [100, 100, 100, 20, 20, 20], B: [60, 60, 60, 30, 30, 30] }), inventory: [] });
  app.lastOpportunityDecision = { next: true, state: "Mejoró suficientemente", key: "improved" };
  let html = nextScreen();
  assert.ok(html.includes("Esta oportunidad muestra una mejora."));
  assert.ok(html.includes("Trabajar siguiente oportunidad →"));
  assert.ok(html.includes("Siguiente oportunidad"));
  app.lastOpportunityDecision = { next: false, state: "Sigue igual", key: "same" };
  html = nextScreen();
  assert.ok(html.includes("Esta oportunidad todavía necesita atención."));
  assert.ok(html.includes("Probar otro plan para esta oportunidad"));
  assert.ok(html.includes("Revisar la siguiente oportunidad"));
  app.activeOpportunityIndex = app.analysis.priorities.length - 1;
  app.lastOpportunityDecision = { next: true, state: "Mejoró suficientemente", key: "improved" };
  html = nextScreen();
  assert.ok(html.includes("Ver resumen de esta revisión →"));
  assert.ok(!html.includes("Trabajar siguiente oportunidad →"));
});

test("CICLO 4: un segundo plan usa la retroalimentación y no repite actividades completadas", () => {
  setStageThree({ sales: businessRows({ A: [100, 100, 100, 20, 20, 20] }), inventory: [] });
  app.datasetName = "Primer ciclo";
  beginAnalysisCycle();
  app.planDetailOpen = true;
  planScreen();
  const firstAttempt = app.opportunityHistory.at(-1);
  firstAttempt.actividades.forEach(item => { item.completada = true; });
  app.tasks = firstAttempt.actividades.map(() => true);
  const feedback = buildFeedbackRecord({ planCompletado: "Sí", mejoraPercibida: "Todavía no", comentarioUsuario: "Los clientes dijeron que el precio está alto." }, new Date("2026-08-08T12:00:00Z"));
  recordOpportunityReview(feedback);
  const completedActivities = new Set(firstAttempt.actividades.map(item => item.actividad));
  app.opportunityAttempt = 2;
  app.currentOpportunityKey = null;
  app.tasks = [];
  const retry = getActionPlan();
  const retryActivities = retry.phases.flatMap(phase => phase.activities);
  assert.ok(retryActivities.some(activity => activity.includes("precio")));
  assert.ok(retryActivities.every(activity => !completedActivities.has(activity)));
  assert.ok(retry.causeWorked.includes("Lo usamos como contexto"));
});

test("CICLO 5: conserva la historia y contrasta un nuevo análisis sin convertir comentarios en hechos", () => {
  const firstData = { sales: businessRows({ A: [100, 100, 100, 20, 20, 20] }), inventory: [] };
  setStageThree(firstData);
  app.datasetName = "Datos ciclo 1";
  beginAnalysisCycle();
  const firstCycle = currentAnalysisCycle();
  firstCycle.retroalimentacion.push({ mejoraPercibida: "Sí", comentarioUsuario: "Creo que las ventas mejoraron por el precio." });
  firstCycle.prioridades[0].estado = "todavía necesita atención";
  const secondData = { sales: businessRows({ A: [100, 100, 100, 60, 60, 60] }), inventory: [] };
  app.dataset = secondData;
  app.datasetName = "Datos ciclo 2";
  app.analysis = analyze(secondData, new Date("2026-08-08T12:00:00Z"));
  app.newCyclePending = true;
  beginAnalysisCycle();
  assert.equal(app.analysisCycles.length, 2);
  assert.deepEqual({ ...currentAnalysisCycle().contextoInicial }, { ...app.context });
  assert.ok(currentAnalysisCycle().contextoHistoricoUsado.length >= 1);
  assert.ok(currentAnalysisCycle().contextoHistoricoUsado.some(item => item.texto.includes("datos nuevos")));
  assert.ok(currentAnalysisCycle().hipotesis.every(item => typeof item === "string"));
});

test("CICLO 6: el cierre resume oportunidades, datos y voz del usuario y ofrece nuevos datos", () => {
  setStageThree({ sales: businessRows({ A: [100, 100, 100, 20, 20, 20] }), inventory: [] });
  app.datasetName = "Cierre";
  beginAnalysisCycle();
  app.opportunityHistory.push({ cicloAnalisisId: app.currentAnalysisCycleId, oportunidadIndice: 0, oportunidadAtendida: "Caída general de ventas", evidencia: ["Las ventas bajaron 30 %."], estadoFinal: "Mejoró parcialmente", retroalimentacion: { comentarioUsuario: "Fue fácil contactar clientes, pero fue difícil conseguir producto." } });
  const html = cycleSummaryScreen();
  assert.ok(html.includes("Terminamos esta revisión"));
  assert.ok(html.includes("Oportunidad 1"));
  assert.ok(html.includes("Los datos muestran:"));
  assert.ok(html.includes("Nos contaste que:"));
  assert.ok(html.includes("Lo que resultó más fácil"));
  assert.ok(html.includes("Lo que resultó más difícil"));
  assert.ok(html.includes("Cargar nuevos datos →"));
});

function setIndependentOpportunityCycle() {
  const sales = [];
  for (let month = 1; month <= 6; month += 1) {
    const recent = month > 3;
    const quantity = recent ? 20 : 100;
    sales.push({ fecha: `2026-0${month}-10`, producto: "4", referencia: "4", nombreProducto: "Café Tradicional 500 g", cantidad: quantity, valorTotal: quantity * 1000, utilidad: recent ? 5000 : 30000 });
    sales.push({ fecha: `2026-0${month}-11`, producto: "B", cantidad: 50, valorTotal: 50000, utilidad: 10000 });
  }
  const inventory = [{ producto: "4", referencia: "4", nombreProducto: "Café Tradicional 500 g", stock: 900 }, { producto: "B", stock: 10 }];
  setStageThree({ sales, inventory });
  const common = { level: "general", nivelUrgencia: "Importante", magnitud: 40, periodo: "Dos periodos de tres meses", limitaciones: [], hipotesisPorValidar: [] };
  app.analysis.priorities = [
    { ...common, type: "business-decline", dominio: "ventas", problemaGeneral: "Caída general de ventas", title: "Las ventas bajaron", reason: "Las ventas bajaron 40 %.", evidence: "La Referencia 4 explica la mayor parte de la reducción.", causasObservadas: ["La Referencia 4 vendió menos."], focosPrioritarios: [{ evidencia: "La Referencia 4 explica 60 % de la reducción." }], driver: { dimension: "producto", product: "4" } },
    { ...common, type: "profit-decline", dominio: "ventas", problemaGeneral: "Caída general de utilidad", title: "La utilidad bajó", reason: "La utilidad bajó 50 %.", evidence: "La utilidad de la Referencia 4 disminuyó.", causasObservadas: ["La utilidad de la Referencia 4 fue menor."], focosPrioritarios: [{ evidencia: "La Referencia 4 explica la mayor pérdida de utilidad." }] },
    { ...common, type: "inventory-excess", dominio: "inventario", problemaGeneral: "Muchas existencias frente a lo que estás vendiendo", title: "Hay existencias altas", reason: "Las existencias son altas frente a las ventas.", evidence: "La Referencia 4 concentra existencias.", causasObservadas: ["Hay muchas unidades disponibles frente a las ventas recientes."], focosPrioritarios: [{ evidencia: "La Referencia 4 concentra las existencias." }], items: [{ producto: "4", stock: 900, stockShare: .99, recentSalesShare: .28, recentSold: 60 }] }
  ];
  app.datasetName = "Tres oportunidades independientes";
  beginAnalysisCycle();
  app.step = 7;
}

test("CICLO CORREGIDO 1: ventas, utilidad e inventario conservan planes, metas y progreso independientes", () => {
  setIndependentOpportunityCycle();
  const plans = [];
  const signalSets = [];
  const comments = ["Comentario de ventas", "Comentario de utilidad", "Comentario de inventario"];
  for (let index = 0; index < 3; index += 1) {
    startOpportunity(index);
    const html = planScreen();
    const plan = getActionPlan();
    plans.push(plan.phases.map(phase => phase.action).join(" | "));
    signalSets.push(plan.signals.map(signal => signal.name).join(" | "));
    assert.ok(html.includes('id="task-count">0 de'));
    assert.ok(app.tasks.every(value => value === false));
    app.tasks[0] = true;
    currentOpportunityPlanState().tasks = [...app.tasks];
    const feedback = buildFeedbackRecord({ planCompletado: "En parte", mejoraPercibida: "Sí", comentarioUsuario: comments[index] }, new Date(`2026-08-0${index + 1}T12:00:00Z`));
    recordOpportunityReview(feedback);
  }
  assert.equal(new Set(plans).size, 3);
  assert.equal(new Set(signalSets).size, 3);
  assert.ok(signalSets[0].includes("Unidades vendidas") || signalSets[0].includes("Valor vendido"));
  assert.ok(signalSets[1].toLowerCase().includes("utilidad"));
  assert.ok(!signalSets[1].includes("Clientes que volvieron a comprar"));
  assert.ok(signalSets[2].includes("Unidades disponibles"));
  const records = app.opportunityHistory.filter(item => item.cicloAnalisisId === app.currentAnalysisCycleId);
  assert.equal(new Set(records.map(item => item.opportunityId)).size, 3);
  assert.deepEqual(Array.from(records.map(item => item.retroalimentacion.comentarioUsuario)), comments);
});

test("CICLO CORREGIDO 2: las transiciones son 1 a 2, 2 a 3 y 3 a cierre", () => {
  setIndependentOpportunityCycle();
  app.lastOpportunityDecision = { next: true, state: "Mejoró suficientemente", key: "improved", completedOpportunityIndex: 0 };
  let html = nextScreen();
  assert.ok(html.includes("Oportunidad trabajada · 1"));
  assert.ok(html.includes("Siguiente oportunidad · 2"));
  app.lastOpportunityDecision = { next: true, state: "Mejoró suficientemente", key: "improved", completedOpportunityIndex: 1 };
  html = nextScreen();
  assert.ok(html.includes("Oportunidad trabajada · 2"));
  assert.ok(html.includes("Siguiente oportunidad · 3"));
  assert.ok(!html.includes("Siguiente oportunidad · 2"));
  app.lastOpportunityDecision = { next: true, state: "Mejoró suficientemente", key: "improved", completedOpportunityIndex: 2 };
  html = nextScreen();
  assert.ok(html.includes("Oportunidad trabajada · 3"));
  assert.ok(html.includes("Terminamos las oportunidades principales de esta revisión."));
  assert.ok(!html.includes("Siguiente oportunidad ·"));
  assert.ok(html.includes("Ver resumen de esta revisión →"));
});

test("CICLO CORREGIDO 3: una referencia numérica nunca se presenta como producto aislado", () => {
  setIndependentOpportunityCycle();
  assert.equal(productDisplayName("4"), "Café Tradicional 500 g (Referencia 4)");
  startOpportunity(0);
  const namedPlan = JSON.stringify(getActionPlan());
  assert.ok(namedPlan.includes("Café Tradicional 500 g (Referencia 4)"));
  app.dataset = { sales: [{ producto: "4" }], inventory: [] };
  assert.equal(productDisplayName("4"), "Referencia 4");
  const diagnosticCopy = app.analysis.priorities.map(item => [item.title, item.reason, item.evidence].join(" ")).join(" ");
  assert.ok(!/(?<!Referencia )\b4 explica/.test(diagnosticCopy));
});

test("PLAN DINÁMICO 1: cada oportunidad recibe objetos de plan y fases con referencias independientes", () => {
  setIndependentOpportunityCycle();
  startOpportunity(0);
  const salesPlan = getActionPlan();
  startOpportunity(1);
  const profitPlan = getActionPlan();
  startOpportunity(2);
  const inventoryPlan = getActionPlan();
  assert.notStrictEqual(salesPlan, profitPlan);
  assert.notStrictEqual(profitPlan, inventoryPlan);
  assert.notStrictEqual(salesPlan.phases, profitPlan.phases);
  assert.notStrictEqual(profitPlan.phases, inventoryPlan.phases);
  assert.notDeepEqual(Array.from(salesPlan.phases, phase => phase.action), Array.from(profitPlan.phases, phase => phase.action));
  assert.notDeepEqual(Array.from(profitPlan.phases, phase => phase.action), Array.from(inventoryPlan.phases, phase => phase.action));
  startOpportunity(0);
  assert.strictEqual(getActionPlan(), salesPlan);
});

function dynamicOpportunityData() {
  const sales = [];
  for (let month = 1; month <= 6; month += 1) {
    const recent = month > 3;
    sales.push({ fecha: `2026-0${month}-10`, producto: "Producto A", cliente: "Cliente Norte", vendedor: "Comercial A", cantidad: recent ? 8 : 45, valorTotal: (recent ? 8 : 45) * 1000, utilidad: (recent ? 2 : 12) * 1000 });
    sales.push({ fecha: `2026-0${month}-11`, producto: "Producto B", cliente: "Cliente Sur", vendedor: "Comercial B", cantidad: recent ? 15 : 35, valorTotal: (recent ? 15 : 35) * 1000, utilidad: (recent ? 4 : 10) * 1000 });
  }
  return { sales, inventory: [{ producto: "Producto A", stock: 4, ultimoMovimiento: "2025-01-01" }, { producto: "Producto B", stock: 450, ultimoMovimiento: "2025-01-01" }] };
}

function planForDynamicFinding(finding) {
  setStageThree(dynamicOpportunityData());
  const common = { level: "general", nivelUrgencia: "Importante", magnitud: 35, periodo: "Dos periodos comparables", limitaciones: [], hipotesisPorValidar: [] };
  app.analysis.priorities = [{ ...common, ...finding }];
  app.datasetName = `Prueba ${finding.type}`;
  beginAnalysisCycle();
  app.step = 7;
  startOpportunity(0);
  return getActionPlan();
}

test("PLAN DINÁMICO 2: clientes, concentración, comerciales, faltantes e inmovilidad generan planes coherentes", () => {
  const scenarios = [
    {
      expectedFocus: "customers",
      expectedWords: ["clientes", "volvieron a comprar"],
      finding: { type: "inactive-customers", dominio: "ventas", problemaGeneral: "Varios clientes dejaron de comprar", title: "Clientes inactivos", evidence: "Dos clientes redujeron sus compras.", causasObservadas: ["Los clientes dejaron de registrar compras."], focosPrioritarios: [{ evidencia: "Cliente Norte y Cliente Sur explican la reducción." }], driver: { dimension: "cliente", product: "Cliente Norte" } }
    },
    {
      expectedFocus: "concentration",
      expectedWords: ["dependen", "participación de los productos principales"],
      finding: { type: "concentration", dominio: "ventas", problemaGeneral: "Dos productos concentran 82 % de las ventas", title: "Dependencia de productos", evidence: "Producto A y Producto B concentran las ventas.", causasObservadas: ["Las ventas están concentradas en pocos productos."], focosPrioritarios: [{ evidencia: "Dos productos representan 82 % de las ventas." }] }
    },
    {
      expectedFocus: "commercial",
      expectedWords: ["comercial a", "comerciales con ventas recuperadas"],
      finding: { type: "sales-decline-cause", dominio: "ventas", problemaGeneral: "Caída asociada a un comercial", title: "Ventas atendidas por comercial", evidence: "Las ventas de Comercial A disminuyeron.", causasObservadas: ["Comercial A concentra la reducción observada."], focosPrioritarios: [{ evidencia: "Comercial A explica una parte importante de la reducción." }], driver: { dimension: "vendedor", product: "Comercial A" } }
    },
    {
      expectedFocus: "stock-risk",
      expectedWords: ["existencias físicas", "unidades disponibles"],
      finding: { type: "stock-risk-general", dominio: "inventario", problemaGeneral: "Riesgo de falta de inventario", title: "Riesgo de faltantes", evidence: "Producto A tiene pocas unidades.", causasObservadas: ["Producto A tiene pocas existencias frente a sus ventas."], focosPrioritarios: [{ evidencia: "Producto A puede agotarse." }], items: [{ producto: "Producto A", stock: 4, recentSold: 24, recentSalesShare: .35 }] }
    },
    {
      expectedFocus: "no-movement",
      expectedWords: ["tiempo sin movimiento", "unidades disponibles"],
      finding: { type: "inventory-no-movement", dominio: "inventario", problemaGeneral: "Producto sin movimiento", title: "Inventario inmóvil", evidence: "Producto B no registra movimiento reciente.", causasObservadas: ["Producto B lleva varios meses sin movimiento."], focosPrioritarios: [{ evidencia: "Producto B concentra unidades sin movimiento." }], items: [{ producto: "Producto B", stock: 450, recentSold: 0, stockShare: .99 }] }
    }
  ];
  scenarios.forEach(({ finding, expectedFocus, expectedWords }) => {
    const plan = planForDynamicFinding(finding);
    const copy = JSON.stringify(plan).toLowerCase();
    assert.equal(plan.focusKind, expectedFocus);
    assert.equal(plan.phases.length, 3);
    assert.ok(plan.activities.length >= 3);
    assert.ok(plan.signals.length >= 1);
    assert.equal(plan.targets.length, plan.signals.length);
    expectedWords.forEach(word => assert.ok(copy.includes(word), `${finding.type} no incluye ${word}`));
  });
});

test("PLAN DINÁMICO 3: una oportunidad nueva usa el fallback basado en su propia evidencia", () => {
  const plan = planForDynamicFinding({
    type: "cashflow-anomaly",
    dominio: "finanzas",
    problemaGeneral: "Los cobros recientes tardan más",
    title: "Demora en cobros",
    evidence: "El tiempo promedio de cobro aumentó 12 días.",
    causasObservadas: ["Tres facturas concentran la demora observada."],
    focosPrioritarios: [{ evidencia: "Las facturas A, B y C siguen pendientes." }]
  });
  const copy = JSON.stringify(plan);
  assert.equal(plan.focusKind, "general");
  assert.equal(plan.domain, "finanzas");
  assert.ok(copy.includes("Entender qué está explicando esta oportunidad."));
  assert.ok(copy.includes("Tres facturas concentran la demora observada."));
  assert.ok(copy.includes("El tiempo promedio de cobro aumentó 12 días."));
  assert.ok(!copy.includes("Clientes que volvieron a comprar"));
  assert.ok(!copy.includes("Unidades disponibles"));
});

(async () => {
  let passed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      passed += 1;
      console.log(`✓ ${name}`);
    } catch (error) {
      console.error(`✗ ${name}`);
      console.error(error);
    }
  }
  console.log(`\n${passed}/${tests.length} pruebas aprobadas`);
  process.exitCode = passed === tests.length ? 0 : 1;
})();
