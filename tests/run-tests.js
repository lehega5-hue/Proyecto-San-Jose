const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const noop = () => {};
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
  document,
  FormData: class {},
  Intl,
  location: { reload: noop },
  navigator: {},
  setTimeout,
  clearTimeout,
  URL: { createObjectURL: () => "blob:test", revokeObjectURL: noop },
  window: { scrollTo: noop }
};
sandbox.window.window = sandbox.window;
sandbox.window.document = document;

const appPath = path.join(__dirname, "..", "app.js");
const source = fs.readFileSync(appPath, "utf8") + `
;globalThis.__test = {
  app, datasets, analyze, priorityScore, requiredMappingIssues,
  setupSpeechRecognition, voiceState: () => ({ isListening }), contextScreen, contextProgress, dataScreen, semanticRoles,
  inferInterpretation, buildCanonicalDataset, interpretedScope,
  handleInterpretationAction, selectRoleColumn, interpretationRow,
  columnChooser, columnOptionValue, columnDataQuality, columnIdentification,
  roleDisplayLabel, primaryReviewProgress, interpretationPanel, mappingCard,
  stageThreeQuality, resultsScreen, trendChartHtml, productChartHtml, priorityPresentation,
  executiveSummaryHtml, managementDetailHtml, analysisLimitations, getPlan, getActionPlan, planScreen,
  evidenceScreen, runBusinessAnalysisModules, prioritizeBusinessFindings
};
`;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: appPath });

const {
  app, datasets, analyze, priorityScore, requiredMappingIssues,
  setupSpeechRecognition, voiceState, contextScreen, contextProgress, dataScreen, semanticRoles, inferInterpretation,
  buildCanonicalDataset, interpretedScope, handleInterpretationAction,
  selectRoleColumn, interpretationRow, columnChooser, columnOptionValue,
  columnDataQuality, columnIdentification, roleDisplayLabel,
  primaryReviewProgress, interpretationPanel, mappingCard,
  stageThreeQuality, resultsScreen, trendChartHtml, productChartHtml, priorityPresentation,
  executiveSummaryHtml, managementDetailHtml, analysisLimitations, getPlan, getActionPlan, planScreen,
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

function setStageThree(data, referenceDate = new Date("2026-08-08T12:00:00Z")) {
  app.context = {};
  app.dataset = data;
  app.analysis = analyze(data, referenceDate);
  app.tasks = [];
  app.actionPlan = null;
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
  assert.ok(html.indexOf("id=\"priority-evidence\"") < html.indexOf("Ver mis 3 acciones"));
  assert.ok(html.indexOf("Ver mis 3 acciones") < html.indexOf("También encontramos"));
  assert.ok(html.indexOf("También encontramos") < html.indexOf("Ver detalle del análisis"));
  assert.equal((html.match(/class="result-chart(?: chart|\")/g) || []).length, 2);
  assert.equal((html.match(/class="result-stat"/g) || []).length, 4);
  assert.ok(html.includes("Ver mis 3 acciones"));
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
  assert.ok(executiveSummaryHtml().includes("No encontramos una columna de valor total"));
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

test("ARQUITECTURA 3: Etapa 3 investiga y no presenta un plan comercial detallado", () => {
  const sales = businessRows({ A: [60, 60, 60, 20, 20, 20], B: [40, 40, 40, 30, 30, 30] });
  setStageThree({ sales, inventory: [] });
  const html = resultsScreen();
  assert.ok(html.includes("¿Qué conviene investigar?"));
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

test("ETAPA 4 A: una situación crítica usa hoy, 3 días y 7 días", () => {
  setStageThree({ sales: businessRows({ "Referencia 4": [100, 100, 100, 10, 10, 10] }), inventory: [] });
  const plan = getActionPlan();
  assert.equal(plan.urgency, "Crítico");
  assert.deepEqual(Array.from(plan.phases, phase => phase.when), ["HOY", "EN 3 DÍAS", "EN 7 DÍAS"]);
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
  const html = planScreen();
  const activityCount = getActionPlan().phases.flatMap(phase => phase.activities).length;
  assert.ok(html.includes("Tres acciones para empezar"));
  assert.ok(html.includes("Problema que estamos atendiendo"));
  assert.ok(html.includes("Línea de tiempo del plan"));
  assert.ok(html.includes("Fase 1") && html.includes("Fase 2") && html.includes("Fase 3"));
  assert.ok(html.includes(`0 de ${activityCount}`));
  assert.ok(html.includes("Qué revisar para saber si funcionó"));
  assert.equal((html.match(/class="task-check"/g) || []).length, activityCount);
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
