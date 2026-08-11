/*
 * Analista San José
 *
 * La interpretación remota es opcional y nunca contiene una clave en el
 * navegador. El endpoint esperado debe ser un servicio serverless propio que
 * autentique la petición del lado servidor. Si no está configurado, tarda
 * demasiado o responde con un JSON inválido, se usa el motor local.
 */
(function () {
  const DEFAULT_CONFIG = Object.freeze({
    enabled: false,
    endpoint: "",
    timeoutMs: 6000
  });

  function validConfidence(value) {
    return ["high", "medium", "low"].includes(value);
  }

  function validRemoteResult(result) {
    if (!result || !["sales", "inventory", "additional", "unknown"].includes(result.sheet_type)) return false;
    if (!validConfidence(result.confidence)) return false;
    if (!result.columns || typeof result.columns !== "object" || Array.isArray(result.columns)) return false;
    return Object.values(result.columns).every(column =>
      column && typeof column.source === "string" && validConfidence(column.confidence)
    );
  }

  const SAFE_HEADER_SIGNALS = new Set([
    "fecha", "documento", "venta", "ventas", "factura", "facturada", "facturado", "dia", "periodo",
    "producto", "articulo", "descripcion", "referencia", "sku", "item", "codigo", "mercancia",
    "cantidad", "unidades", "und", "cant", "qty", "despacho", "volumen", "valor", "total", "neto",
    "importe", "subtotal", "ingreso", "precio", "unitario", "costo", "coste", "utilidad", "ganancia",
    "beneficio", "margen", "cliente", "comprador", "vendedor", "comercial", "asesor", "ejecutivo",
    "representante", "existencia", "existencias", "stock", "inventario", "saldo", "disponible", "actual",
    "bodega", "corte", "movimiento", "ultimo", "entrada", "entradas", "compra", "compras", "minimo",
    "maximo", "recepcion", "recepciones", "salida", "salidas", "proveedor", "lote", "vencimiento"
  ]);

  function normalizedTokens(value) {
    return String(value ?? "")
      .replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, "$1 $2")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .match(/[a-z0-9]+/g) || [];
  }

  function safeColumnDescriptor(header, profile, index) {
    const tokens = normalizedTokens(header);
    return {
      id: `column_${index + 1}`,
      semantic_signals: [...new Set(tokens.filter(token => SAFE_HEADER_SIGNALS.has(token)))],
      token_count: tokens.length,
      contains_digits: tokens.some(token => /\d/.test(token)),
      inferred_type: {
        numeric_ratio: Number(profile?.numeric) || 0,
        date_ratio: Number(profile?.dates) || 0,
        text_ratio: Number(profile?.text) || 0
      }
    };
  }

  function anonymizedDescriptor(table) {
    const sourceMap = new Map();
    const columns = table.headers.map((header, index) => {
      const descriptor = safeColumnDescriptor(header, table.profiles?.[header], index);
      sourceMap.set(descriptor.id, header);
      return descriptor;
    });
    return {
      payload: {
        row_count: table.rows.length,
        column_count: table.headers.length,
        columns,
        analysis_scope: ["sales", "inventory"]
      },
      sourceMap
    };
  }

  function restoreRemoteSources(result, sourceMap) {
    const columns = {};
    for (const [role, column] of Object.entries(result.columns)) {
      const source = sourceMap.get(column.source);
      if (!source) throw new Error("La respuesta usa una columna desconocida");
      columns[role] = { ...column, source };
    }
    return { ...result, columns };
  }

  async function remoteInterpret(table, config) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const descriptor = anonymizedDescriptor(table);
      const response = await fetch(config.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(descriptor.payload),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Servicio no disponible (${response.status})`);
      const result = await response.json();
      if (!validRemoteResult(result)) throw new Error("Respuesta semántica inválida");
      return { mode: "remote-ai", result: restoreRemoteSources(result, descriptor.sourceMap) };
    } finally {
      clearTimeout(timer);
    }
  }

  window.AIDataInterpreter = {
    async interpret(table, localFallback) {
      const config = { ...DEFAULT_CONFIG, ...(window.SAN_JOSE_AI_CONFIG || {}) };
      if (config.enabled && /^https:\/\//i.test(config.endpoint)) {
        try {
          return await remoteInterpret(table, config);
        } catch (error) {
          console.info("Analista San José: se utiliza el motor local.", error.message);
        }
      }
      return { mode: "local-fallback", result: localFallback(table) };
    }
  };
})();
