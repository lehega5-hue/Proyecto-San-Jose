# Arquitectura segura de interpretación semántica

## Principio

GitHub Pages aloja únicamente el frontend estático. Ninguna API key, token, contraseña o secreto debe incluirse en HTML, JavaScript, archivos de configuración públicos, historial de Git ni variables accesibles desde el navegador.

```text
Frontend de San José
  ↓ metadatos y muestra mínima anonimizada
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

El navegador puede enviar:

- nombre de archivo y hoja sin datos identificables;
- cantidad de registros;
- encabezados;
- tipos inferidos;
- máximo tres filas de muestra previamente anonimizadas;
- respuestas de contexto empresarial no sensibles;
- alcance permitido: ventas e inventario.

El servicio debe aplicar validación de origen, límite de tamaño, rate limiting, timeout, eliminación de muestras en logs y respuesta JSON estricta.

## Respuesta estricta

```json
{
  "sheet_type": "sales",
  "confidence": "high",
  "columns": {
    "product": { "source": "Descripción", "confidence": "high" },
    "quantity": { "source": "Und", "confidence": "medium" },
    "sale_value": { "source": "Vr Neto", "confidence": "high" },
    "date": { "source": "Fecha Fact", "confidence": "high" }
  }
}
```

Valores admitidos:

- `sheet_type`: `sales`, `inventory`, `additional` o `unknown`;
- `confidence`: `high`, `medium` o `low`;
- cada columna incluye `source` y `confidence`.

Una respuesta diferente, error de red, URL no HTTPS o timeout activa automáticamente `local-fallback`.

## Separación de responsabilidades

- La IA o el motor local interpretan el significado de hojas y columnas.
- El usuario resuelve ambigüedades y puede responder **No sé**.
- El código determinístico calcula sumas, porcentajes, tendencias y calidad.
- Una fórmula explícita ordena hallazgos por impacto, urgencia, alcance y confianza.
- San José explica evidencia y limitaciones.
- La decisión final corresponde al empresario.
