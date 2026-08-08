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
  setupSpeechRecognition, voiceState: () => ({ isListening }), semanticRoles,
  inferInterpretation, buildCanonicalDataset, interpretedScope,
  handleInterpretationAction, selectRoleColumn, interpretationRow,
  columnChooser, columnOptionValue, columnDataQuality, columnIdentification,
  roleDisplayLabel
};
`;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: appPath });

const {
  app, datasets, analyze, priorityScore, requiredMappingIssues,
  setupSpeechRecognition, voiceState, semanticRoles, inferInterpretation,
  buildCanonicalDataset, interpretedScope, handleInterpretationAction,
  selectRoleColumn, interpretationRow, columnChooser, columnOptionValue,
  columnDataQuality, columnIdentification, roleDisplayLabel
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
  return { header, confidence, score: confidence === "Alta" ? 10 : confidence === "Media" ? 6 : 3, sample: "muestra", duplicates: [], ...extra };
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

test("DEMO 1: existe un único ejemplo y contiene solo ventas", () => {
  assert.deepEqual(Object.keys(datasets), ["ejemploVentas"]);
  assert.ok(datasets.ejemploVentas.sales.length >= 12);
  assert.equal(datasets.ejemploVentas.inventory.length, 0);
});

test("DEMO 2: el ejemplo continúa sin inventar información de inventario", () => {
  app.context = {};
  const result = analyze(datasets.ejemploVentas);
  assert.equal(result.quality.level, "MEDIA");
  assert.equal(result.priorities[0].type, "trend");
  assert.equal(Math.round(result.metrics.trendChange * 100), -30);
  assert.ok(result.quality.facts.some(fact => fact.text.includes("No encontramos inventario")));
  assert.equal(result.metrics.inventoryUnits, 0);
});

test("La calidad de cualquier análisis parcial permanece limitada", () => {
  const result = analyze(datasets.ejemploVentas);
  assert.ok(result.quality.score <= 78);
  assert.notEqual(result.quality.level, "ALTA");
});

test("La puntuación conserva la fórmula determinística de cuatro factores", () => {
  assert.equal(priorityScore({ impact: 80, urgency: 90, reach: 70, confidence: 100 }), 84);
});

test("No sé en un dato esencial mantiene bloqueada una carga real", () => {
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
  assert.equal(requiredMappingIssues().length, 1);
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
    fecha: assignment("Fecha"), producto: assignment("Cliente"), cantidad: assignment("Cantidad")
  });
  resetInterpretation([table]);
  const html = interpretationRow(table, 0, "producto");
  assert.ok(html.includes("🟢 Parece correcto"));
  assert.ok(html.includes("Calidad de los datos: Alta"));
  assert.ok(html.includes(">Cambiar<"));
  assert.ok(!html.includes("Confianza"));
});

test("ANALÍTICA 3: el usuario corrige una interpretación sin recargar", () => {
  const table = makeTable("sales", [{ Fecha: "2026-01-01", Cliente: "Ana", "Cod Art": "A001", Cantidad: 2 }], {
    fecha: assignment("Fecha"), producto: assignment("Cliente"), cantidad: assignment("Cantidad")
  });
  resetInterpretation([table]);
  selectRoleColumn({ target: { dataset: { table: "0", role: "producto" }, value: "Cod Art" } });
  assert.equal(table.interpretation.assignments.producto.header, "Cod Art");
  assert.equal(table.interpretation.assignments.producto.confirmed, true);
});

test("UX CRÍTICA: Cambiar muestra todas las columnas y corrige IdDocumento por Cantidad", () => {
  const sales = makeTable("sales", [{ Fecha: "2026-01-01", Producto: "A", IdDocumento: "F-1", Cantidad: 4, Total: 80000 }], {
    fecha: assignment("Fecha"), producto: assignment("Producto"), cantidad: assignment("IdDocumento")
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
  assert.equal(sales.interpretation.assignments.cantidad.confirmed, true);
  assert.equal(app.analysis.metrics.quantityRows, 1);
  assert.ok(interpretationRow(sales, 0, "cantidad").includes("🟢 Parece correcto"));
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
    fecha: assignment("Fecha"), producto: assignment("Producto"), cantidad: assignment("U", "Media")
  });
  resetInterpretation([table]);
  assert.equal(interpretedScope().hasSales, false);
  handleInterpretationAction({ currentTarget: { dataset: { table: "0", role: "cantidad", action: "confirm" } } });
  assert.equal(interpretedScope().hasSales, true);
});

test("ANALÍTICA 5: confianza baja necesita confirmación", () => {
  const table = makeTable("inventory", [{ Referencia: "A", Saldo: 4 }], {
    producto: assignment("Referencia"), stock: assignment("Saldo", "Baja")
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
});

test("LENGUAJE 1: identificación dudosa y calidad alta se muestran por separado", () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({ Cliente: `Cliente ${index + 1}` }));
  const table = makeTable("sales", rows, { producto: assignment("Cliente", "Media") });
  resetInterpretation([table]);
  const html = interpretationRow(table, 0, "producto");
  assert.ok(html.includes("🟠 Revisa este dato"));
  assert.ok(html.includes("Calidad de los datos: Alta"));
  assert.ok(html.includes("100 % de los registros tiene información."));
});

test("LENGUAJE 2: identificación correcta y calidad baja se muestran por separado", () => {
  const rows = Array.from({ length: 10 }, (_, index) => ({ Cantidad: index < 6 ? index + 1 : "" }));
  const table = makeTable("sales", rows, { cantidad: assignment("Cantidad") });
  resetInterpretation([table]);
  const html = interpretationRow(table, 0, "cantidad");
  assert.ok(html.includes("🟢 Parece correcto"));
  assert.ok(html.includes("Calidad de los datos: Baja"));
  assert.ok(html.includes("40 % de registros vacíos"));
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
  assert.equal(medium.explanation, "Encontramos 14 % de registros vacíos.");
  assert.equal(low.level, "Baja");
  assert.equal(low.explanation, "31 % de los valores no se pueden utilizar.");
});

test("LENGUAJE 5: los seis datos principales usan los nombres y estados acordados", () => {
  assert.equal(roleDisplayLabel("sales", "fecha"), "Fecha de venta");
  assert.equal(roleDisplayLabel("sales", "producto"), "Producto / referencia");
  assert.equal(roleDisplayLabel("sales", "cantidad"), "Cantidad vendida");
  assert.equal(roleDisplayLabel("sales", "valorTotal"), "Valor de la venta");
  assert.equal(roleDisplayLabel("inventory", "producto"), "Producto / referencia de inventario");
  assert.equal(roleDisplayLabel("inventory", "stock"), "Existencia actual");
  assert.equal(columnIdentification(assignment("Fecha")).label, "🟢 Parece correcto");
  assert.equal(columnIdentification(assignment("Fecha", "Media")).label, "🟠 Revisa este dato");
  assert.equal(columnIdentification(null).label, "⚪ No la encontramos");
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
  assert.ok(requiredMappingIssues().length > 0);
});

test("ANALÍTICA 10: dos columnas posibles deben resolverse", () => {
  const table = makeTable("sales", [{ Fecha: "2026-01-01", Producto: "A", Cantidad: 2, "Total 1": 10, "Total 2": 12 }], {
    fecha: assignment("Fecha"), producto: assignment("Producto"), cantidad: assignment("Cantidad"),
    valorTotal: assignment("Total 1", "Media", { duplicates: ["Total 1", "Total 2"] })
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
