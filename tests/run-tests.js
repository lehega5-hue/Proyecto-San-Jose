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
  setupSpeechRecognition, voiceState: () => ({ isListening })
};
`;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: appPath });

const {
  app, datasets, analyze, priorityScore, requiredMappingIssues,
  setupSpeechRecognition, voiceState
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
