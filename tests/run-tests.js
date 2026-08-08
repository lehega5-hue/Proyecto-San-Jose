const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const noop = () => {};
const element = {
  addEventListener: noop,
  classList: { add: noop, remove: noop, toggle: noop },
  close: noop,
  focus: noop,
  querySelectorAll: () => [],
  showModal: noop,
  style: {},
  set innerHTML(value) { this._innerHTML = value; },
  get innerHTML() { return this._innerHTML || ""; }
};
const document = {
  body: { appendChild: noop },
  createElement: () => ({ ...element, click: noop, remove: noop }),
  querySelector: () => element,
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
  URL: { createObjectURL: () => "blob:test", revokeObjectURL: noop },
  window: { scrollTo: noop }
};
sandbox.window.window = sandbox.window;
sandbox.window.document = document;

const appPath = path.join(__dirname, "..", "app.js");
const source = fs.readFileSync(appPath, "utf8") + `
;globalThis.__test = { app, datasets, analyze, priorityScore, requiredMappingIssues };
`;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: appPath });

const { app, datasets, analyze, priorityScore, requiredMappingIssues } = sandbox.__test;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("Caso A: datos completos producen calidad alta y prioridad de inventario detenido", () => {
  app.context = {};
  const result = analyze(datasets.detenido);
  assert.equal(result.quality.level, "ALTA");
  assert.equal(result.priorities[0].type, "slow");
});

test("Caso B: la concentración comercial es el hallazgo principal", () => {
  app.context = {};
  const result = analyze(datasets.concentrado);
  assert.equal(result.priorities[0].type, "concentration");
  assert.ok(result.metrics.topShare > 0.9);
});

test("Caso C: la información insuficiente detiene las recomendaciones", () => {
  app.context = {};
  const result = analyze(datasets.insuficiente);
  assert.equal(result.quality.level, "BAJA");
  assert.equal(result.priorities.length, 0);
});

test("Solo ventas: continúa con calidad media y prioriza la caída reciente", () => {
  app.context = {};
  const result = analyze(datasets.soloVentas);
  assert.equal(result.quality.level, "MEDIA");
  assert.equal(result.priorities[0].type, "trend");
  assert.equal(Math.round(result.metrics.trendChange * 100), -30);
  assert.equal(result.adaptiveNeeded, true);
});

test("El contexto libre evita repetir la pregunta adaptativa", () => {
  app.context = { contextoLibre: "No pasó nada fuera de lo normal." };
  assert.equal(analyze(datasets.soloVentas).adaptiveNeeded, false);
});

test("Solo inventario: continúa sin afirmar ventas ni baja rotación", () => {
  app.context = {};
  const result = analyze(datasets.soloInventario);
  assert.equal(result.quality.level, "MEDIA");
  assert.equal(result.priorities[0].type, "inventory-only");
  assert.ok(!result.priorities[0].title.includes("casi no se venden"));
});

test("Un análisis parcial nunca obtiene calidad alta", () => {
  const sales = Array.from({ length: 20 }, (_, index) => ({
    fecha: `2026-07-${String((index % 20) + 1).padStart(2, "0")}`,
    producto: "Producto",
    cantidad: 1,
    precio: 1000
  }));
  const result = analyze({ sales, inventory: [] });
  assert.ok(result.quality.score <= 78);
  assert.notEqual(result.quality.level, "ALTA");
});

test("La puntuación de prioridad aplica los cuatro factores publicados", () => {
  assert.equal(priorityScore({ impact: 80, urgency: 90, reach: 70, confidence: 100 }), 84);
});

test("Elegir No sé en un dato esencial mantiene el análisis bloqueado", () => {
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

test("Un dato opcional ausente no bloquea una hoja esencial completa", () => {
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

let passed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(error);
  }
}
console.log(`\n${passed}/${tests.length} pruebas aprobadas`);
process.exitCode = passed === tests.length ? 0 : 1;
