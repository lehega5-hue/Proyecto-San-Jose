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

  function anonymizedDescriptor(table) {
    const samples = table.rows.slice(0, 3).map(row =>
      Object.fromEntries(table.headers.map(header => [header, row[header]]))
    );
    return {
      file_name: table.fileName,
      sheet_name: table.sheetName,
      row_count: table.rows.length,
      headers: table.headers,
      inferred_types: table.profiles,
      sample_rows: samples,
      analysis_scope: ["sales", "inventory"]
    };
  }

  async function remoteInterpret(table, config) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetch(config.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(anonymizedDescriptor(table)),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Servicio no disponible (${response.status})`);
      const result = await response.json();
      if (!validRemoteResult(result)) throw new Error("Respuesta semántica inválida");
      return { mode: "remote-ai", result };
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
