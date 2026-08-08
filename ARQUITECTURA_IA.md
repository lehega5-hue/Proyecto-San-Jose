# Arquitectura segura de interpretación semántica

## Principio

GitHub Pages aloja el frontend. Una clave de API nunca debe incluirse en HTML, JavaScript, variables públicas ni archivos versionados.

    Frontend de San José
        ↓ metadatos y muestra anonimizada
    Servicio serverless propio
        ↓ secreto almacenado en el proveedor
    Servicio de IA
        ↓ JSON estricto
    Frontend
        ↓
    Código determinístico calcula y prioriza

## Configuración

Un despliegue controlado puede definir antes de cargar **ai-interpreter.js**:

    window.SAN_JOSE_AI_CONFIG = {
      enabled: true,
      endpoint: "https://api.ejemplo.com/interpretar",
      timeoutMs: 6000
    };

Solo se configura la URL pública del servicio propio. Nunca la clave del proveedor.

## Solicitud permitida

El navegador envía:

- nombre del archivo y de la hoja;
- cantidad de registros;
- encabezados;
- tipos inferidos;
- máximo tres filas de muestra;
- alcance permitido: ventas e inventario.

El servicio serverless debe aplicar autenticación, límite de tamaño, rate limiting, CORS limitado y eliminación de logs con muestras.

## Respuesta estricta

Ejemplo:

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

Valores admitidos:

- sheet_type: sales, inventory, additional o unknown;
- confidence: high, medium o low;
- cada columna incluye source y confidence.

Una respuesta distinta, un error de red o un timeout activa automáticamente **local-fallback**.

## Responsabilidades

- La IA interpreta significado; no calcula cifras.
- El usuario confirma columnas dudosas.
- El código determinístico calcula sumas, porcentajes y calidad.
- Las reglas determinísticas ordenan hallazgos.
- La decisión final corresponde al empresario.
