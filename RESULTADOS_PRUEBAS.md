# Resultados de pruebas · San José V4

Fecha: 8 de agosto de 2026.

Entorno: Chromium integrado, Node.js 24 incluido en Codex y servidor HTTP estático local.

## Resultado

**10 de 10 pruebas automatizadas aprobadas.** También se aprobaron los recorridos manuales críticos de los casos ficticios, la carga de recursos estáticos y la revisión de secretos.

Comando reproducible:

```powershell
node tests/run-tests.js
```

## Diez casos automatizados

| # | Caso | Resultado verificado |
|---:|---|---|
| 1 | Ventas e inventario suficientes | Calidad Alta y prioridad de productos almacenados con pocas ventas. |
| 2 | Ventas concentradas | La concentración comercial queda como hallazgo principal y supera 90 %. |
| 3 | Información insuficiente | Calidad Baja, análisis detenido y cero recomendaciones. |
| 4 | Solo ventas con caída reciente | Calidad Media, caída sostenida de 30 % como prioridad y pregunta adaptativa. |
| 5 | Contexto libre ya disponible | No repite la pregunta adaptativa. |
| 6 | Solo inventario | Calidad Media y orientación para agregar ventas, sin afirmar rotación. |
| 7 | Información parcial abundante | La calidad permanece limitada a 78 y nunca llega a Alta. |
| 8 | Fórmula de prioridad | Impacto, urgencia, alcance y confianza producen una puntuación determinística. |
| 9 | “No sé” en un dato esencial | El análisis permanece bloqueado y solicita completar la interpretación. |
| 10 | Dato opcional ausente | No bloquea una hoja con todos los datos esenciales confirmados. |

## Recorridos manuales en navegador

| Prueba | Resultado |
|---|---|
| Contexto obligatorio | Hay exactamente tres preguntas estructuradas. “Otra actividad” abre un campo libre. |
| Dictado | El control aparece cuando Chromium expone reconocimiento de voz; el texto queda editable. |
| Solo ventas | Permite agregar inventario o continuar; no genera afirmaciones de existencias. |
| Solo inventario | Permite agregar ventas o continuar; no usa expresiones como “casi no se venden”. |
| Tendencia | El caso D compara $1.000.000 con $700.000 y prioriza la caída sobre la concentración. |
| Pregunta adaptativa | Al responder “No pasó nada especial” desaparece y el análisis continúa. |
| Regresión caso A | Mantiene productos almacenados con pocas ventas como prioridad. |
| Regresión caso C | Mantiene Calidad Baja y no ofrece recomendaciones. |
| Checklist | El plan contiene exactamente tres acciones marcables. |
| Diseño adaptable | Sin desplazamiento horizontal en 390 × 844 ni en 1280 × 800. |
| Refresh y retroceso | Refresh vuelve a la landing y los botones Volver conservan un recorrido válido. |

## Validaciones técnicas

- `app.js` y `ai-interpreter.js` pasan `node --check`.
- Los diez casos pasan en `tests/run-tests.js`.
- `git diff --check` no reporta errores de espacios.
- El escaneo no encontró API keys, access tokens, client secrets ni contraseñas incrustadas.
- El servidor estático devolvió HTTP 200 para `/`, `app.js`, `ai-interpreter.js`, `overrides.css` y el logo.
- Los recursos usan rutas relativas, compatibles con el subdirectorio de GitHub Pages.
- La interfaz funciona sin endpoint remoto mediante `local-fallback`.

## Resultado observado por dataset

### Caso A

- Calidad: Alta.
- Datos esenciales: 100 %.
- Hallazgo principal: productos almacenados que casi no se venden.

### Caso B

- Hallazgo principal: dependencia de Arroz premium 5 kg.
- Evidencia: más de 90 % del valor vendido corresponde a ese producto.

### Caso C

- Calidad: Baja.
- Mensaje: “Todavía no tenemos información suficiente para decirte qué atender primero.”
- Recomendaciones: ninguna.

### Caso D

- Alcance: solo ventas.
- Calidad: Media.
- Tendencia: promedio mensual de $1.000.000 a $700.000, caída de 30 %.
- Hallazgo principal: caída reciente sostenida.

### Caso E

- Alcance: solo inventario.
- Calidad: Media.
- Evidencia permitida: 134 unidades y $4.944.000 de costo registrado.
- Orientación: agregar ventas antes de decidir qué producto atender.

## Limitación de aceptación

La lectura XLS/XLSX multioja conserva el lector SheetJS y recorre `workbook.SheetNames`. Antes de uso con una empresa real conviene repetir una prueba manual con un archivo propio que contenga ventas, inventario y una hoja complementaria, usando datos anonimizados.
