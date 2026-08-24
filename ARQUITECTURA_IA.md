# Arquitectura segura de interpretación semántica

## Principio

GitHub Pages aloja únicamente el frontend estático. Ninguna API key, token, contraseña o secreto debe incluirse en HTML, JavaScript, archivos de configuración públicos, historial de Git ni variables accesibles desde el navegador.

```text
Frontend de ConsultorIA
  ↓ señales estructurales no identificables
Función serverless propia
  ↓ credencial en una variable de entorno privada
Proveedor de IA
  ↓ JSON estricto
Frontend
  ↓
Código determinístico calcula y prioriza
```

## Modo predeterminado

Sin configuración externa, `AIDataInterpreter` utiliza `local-fallback`. La aplicación completa funciona de esta forma en GitHub Pages y no necesita ninguna credencial.

## Configuración remota opcional

Un despliegue controlado puede definir, antes de cargar `ai-interpreter.js`:

```html
<script>
  window.SAN_JOSE_AI_CONFIG = {
    enabled: true,
    endpoint: "https://servicio-propio.example/interpretar",
    timeoutMs: 6000
  };
</script>
```

La URL pública del servicio no es un secreto. La credencial del proveedor debe configurarse exclusivamente como variable de entorno de la función serverless y nunca devolverse al navegador.

## Solicitud permitida

El navegador puede enviar únicamente:

- cantidad de registros y columnas;
- identificadores efímeros de columnas, sin el encabezado original;
- patrones estructurales permitidos y tipos inferidos;
- señales semánticas derivadas de un vocabulario cerrado para Ventas e Inventario.

No se envían filas, muestras, valores, nombres de archivo, nombres de hoja, encabezados originales ni respuestas de contexto empresarial. El servicio debe aplicar validación de origen, límite de tamaño, rate limiting, timeout, logs sin cuerpo empresarial y respuesta JSON estricta.

## Respuesta estricta

```json
{
  "sheet_type": "sales",
  "confidence": "high",
  "columns": {
    "product": { "source": "column_1", "confidence": "high" },
    "quantity": { "source": "column_2", "confidence": "medium" },
    "sale_value": { "source": "column_3", "confidence": "high" },
    "date": { "source": "column_4", "confidence": "high" }
  }
}
```

Valores admitidos:

- `sheet_type`: `sales`, `inventory`, `additional` o `unknown`;
- `confidence`: `high`, `medium` o `low`;
- cada columna incluye `source` y `confidence`.

Una respuesta diferente, error de red, URL no HTTPS o timeout activa automáticamente `local-fallback`.

La respuesta remota se valida sobre una copia independiente. Si es parcial, incompatible, cambia el dominio sin sustento o utiliza identificadores desconocidos, se descarta y se recupera exactamente el resultado local original. `semanticMode` refleja siempre el modo finalmente utilizado.

## Separación de responsabilidades

- La IA o el motor local interpretan el significado de hojas y columnas.
- El usuario resuelve ambigüedades y puede responder **No sé**.
- El código determinístico calcula sumas, porcentajes, tendencias y calidad.
- Una fórmula explícita ordena hallazgos por impacto, urgencia, alcance y confianza.
- San José explica evidencia y limitaciones.
- La decisión final corresponde al empresario.

## Arquitectura del análisis empresarial

La Etapa 3 usa una metodología común, independiente del dominio:

```text
Analizador de Ventas ──────┐
                           ├─→ Hallazgos con contrato común
Analizador de Inventario ──┤         ↓
                           │   Relaciones válidas entre módulos
Módulos futuros ───────────┘         ↓
                               Motor central de prioridad
                                      ↓
                         Diagnóstico estructurado para acciones
```

Cada analizador describe lo observado, su magnitud, evidencia, factores asociados, aportes, hipótesis, limitaciones y calidad. No elige la prioridad final. El motor central compara todos los hallazgos mediante impacto, urgencia, alcance y calidad de la evidencia.

El contrato común contiene:

- `dominio`, `tipoProblema` y `problemaGeneral`;
- `magnitud`, `unidad`, `periodo` y `evidencia`;
- `causasObservadas` y `aportePorCausa`;
- `hipotesisPorValidar` y `limitaciones`;
- `calidadInformacion`, `impacto`, `urgencia`, `alcance` y `prioridad`.

Los cruces entre dominios se ejecutan por analizadores de relaciones separados. Ventas e Inventario solo se combinan cuando las referencias de producto tienen cobertura suficiente. Una relación observada nunca se presenta como causa demostrada.

La salida `diagnostico` separa el problema general de las causas observadas y de las hipótesis. Esta salida alimenta la etapa posterior, que es la responsable de construir acciones. Para agregar Cartera, Caja u otro dominio futuro basta con entregar hallazgos bajo el mismo contrato y registrarlos en el conjunto de analizadores; el motor de prioridad no cambia.
