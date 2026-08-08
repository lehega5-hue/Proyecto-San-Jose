# Resultados de pruebas · San José

Fecha: 8 de agosto de 2026.

Entorno: Node.js 24 incluido en Codex, navegador Chromium integrado y servidor HTTP estático local.

## Resultado

**26 de 26 pruebas automatizadas aprobadas:** 13 del ajuste analítico, 3 validaciones de medidas flexibles y 10 regresiones del dictado, demostración, calidad parcial y priorización.

```powershell
node tests/run-tests.js
```

## Pruebas de interpretación y alcance

| # | Escenario | Resultado verificado |
|---:|---|---|
| 1 | Interpretación correcta con confianza Alta | Fecha y producto con nombres normales se identifican correctamente. |
| 2 | Interpretación incorrecta con confianza Alta | La fila conserva siempre la acción **Cambiar**. |
| 3 | Usuario corrige interpretación | La nueva columna se aplica inmediatamente y queda **Confirmada por ti**. |
| 4 | Confianza Media | No se usa como dato principal hasta que el usuario la confirma o corrige. |
| 5 | Confianza Baja | No se usa como dato principal hasta que el usuario la confirma o corrige. |
| 6 | “No tengo ese dato” | La decisión permanece durante la sesión y la pantalla no vuelve a preguntarlo. |
| 7 | “No usar esta columna” | La interpretación se ignora sin alterar la fila ni el archivo original. |
| 8 | Falta un dato opcional | El análisis puede continuar. |
| 9 | Falta un dato necesario | El avance queda bloqueado y se explica qué hace falta. |
| 10 | Dos columnas posibles para el mismo dato | Se exige elegir una antes de continuar. |
| 11 | Valor calculado | Cantidad 3 × precio 12.000 produce valor total 36.000 y se marca como calculado. |
| 12 | Solo ventas | El alcance permite ventas y excluye inventario. |
| 13 | Ventas e inventario | El alcance combinado queda disponible. |

Validaciones adicionales: fecha + producto + cantidad permite analizar volumen; fecha + producto + valor total permite analizar ingresos; valor sin cantidad no se usa para afirmar inventario acumulado.

## Reglas analíticas verificadas

### Ventas

- Datos principales: fecha, producto y al menos una medida de la venta.
- Medidas válidas: cantidad, valor total o valor calculado con cantidad × precio.
- La ausencia de precio no bloquea un análisis de volumen.
- La ausencia de cantidad no bloquea un análisis de ingresos cuando existe valor total.
- Cliente, canal, categoría, sede, vendedor, descuento, factura, ciudad y forma de pago son adicionales.

### Inventario

- Producto y existencia actual son necesarios.
- Fecha de corte es muy recomendable y genera una limitación si falta, pero no bloquea.
- Costos, movimientos, mínimos, máximos, reposición, reservas, pedidos, proveedor, entrega, bodega, categoría, lote y vencimiento son adicionales.

### Tres conceptos separados

1. **Confianza de interpretación:** Alta, Media o Baja; indica qué tan segura es la identificación de una columna.
2. **Calidad de datos:** se calcula después de confirmar, usando vacíos, fechas y números válidos, duplicados, cobertura y consistencia.
3. **Alcance del análisis:** enumera dinámicamente qué puede y qué no puede analizar San José.

## Comportamiento visible verificado por estructura

- Cada dato muestra qué se busca, la columna encontrada, ejemplos, interpretación, confianza y estado.
- Una interpretación Alta también ofrece **Confirmar**, **Cambiar** y **No usar esta columna**.
- Las interpretaciones Media y Baja muestran “Necesitamos tu ayuda para entender este dato”.
- Una columna ambigua permite elegir qué representa, **Otra información** o **No sé**.
- Si no se encuentra un dato principal, permite seleccionar otra columna o indicar **No tengo ese dato**.
- Los datos adicionales aparecen dentro de una sección colapsable.
- El resumen usa la leyenda ✓ Disponible, ! Necesita revisión y ○ No disponible.
- El alcance no promete rentabilidad sin costos ni productos acumulados sin ventas por cantidad e inventario.
- La pantalla usa “interpretación” e “identificación”; no usa “correlación” como sinónimo.

## Calidad de datos

Después de la confirmación, el motor calcula cifras reales para:

- porcentaje de ventas con producto;
- porcentaje con fecha válida;
- porcentaje con cantidad o valor utilizable;
- porcentaje con valor de venta cuando existe;
- existencias válidas;
- valores negativos;
- duplicados;
- cobertura temporal;
- relación entre productos vendidos e inventario;
- cobertura de costos.

No se utilizan porcentajes prefabricados.

## Regresiones conservadas

- Los cuatro escenarios de dictado controlado siguen aprobados.
- La demostración mantiene un único ejemplo de solo ventas.
- La calidad parcial no puede presentarse como Alta.
- La priorización conserva impacto, urgencia, alcance y confianza.
- La carga XLS/XLSX/CSV, lectura multioja y fallback local no se modificaron.
- El plan conserva exactamente tres acciones y la retroalimentación sigue disponible.

## Validaciones técnicas

- `app.js` y `ai-interpreter.js` pasan `node --check`.
- `git diff --check` no reporta errores.
- El escaneo no encuentra API keys, tokens, client secrets ni contraseñas incrustadas.
- Los recursos mantienen rutas relativas compatibles con GitHub Pages.

## Aceptación manual recomendada

Antes de un piloto real, conviene repetir el recorrido con un archivo anonimizado que incluya una interpretación deliberadamente incorrecta y dos columnas parecidas de valor. Esto permite confirmar con una persona empresaria que los textos y decisiones resultan comprensibles sin asistencia técnica.
