# Resultados de pruebas · San José

Fecha: 8 de agosto de 2026.

Entorno: Node.js 24 incluido en Codex, navegador Chromium integrado y servidor HTTP estático local.

## Resultado

**34 de 34 pruebas automatizadas aprobadas:** 21 de identificación, calidad por columna y alcance; 3 validaciones de medidas flexibles; y 10 regresiones del dictado, demostración, calidad parcial y priorización.

```powershell
node tests/run-tests.js
```

## Pruebas de identificación, calidad y alcance

| # | Escenario | Resultado verificado |
|---:|---|---|
| 1 | Columna identificada con claridad | Fecha y producto con nombres normales muestran **🟢 Parece correcto**. |
| 2 | Identificación que el usuario puede corregir | La tarjeta conserva siempre la acción **Cambiar**. |
| 3 | Usuario corrige la columna | La nueva selección se aplica inmediatamente y muestra **🟢 Parece correcto**. |
| UX crítica | `IdDocumento` fue asociado a Cantidad vendida | **Cambiar** muestra todas las columnas de todas las hojas, permite elegir `Cantidad`, confirma la selección y recalcula el análisis. |
| UX multioja | Catálogo de columnas y procedencia | Las opciones se agrupan por hoja y cada asignación conserva internamente hoja + columna. |
| UX duplicados | Una columna intenta cubrir dos datos principales | La segunda asignación se rechaza con una advertencia que identifica el dato que ya usa la columna. |
| 4 | **🟠 Revisa este dato** | No se usa como dato principal hasta que el usuario confirma o corrige la columna. |
| 5 | Identificación dudosa | La tarjeta no confunde la identificación con la calidad de sus registros. |
| 6 | “No lo tengo” | La decisión permanece durante la sesión y la pantalla no vuelve a preguntarlo. |
| 7 | Decisión de no usar un dato | La interpretación se omite sin alterar la fila ni el archivo original. |
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

### Dos conceptos separados

1. **Identificación de la columna:** usa únicamente **🟢 Parece correcto**, **🟠 Revisa este dato** o **⚪ No la encontramos**.
2. **Calidad de los datos:** siempre muestra la etiqueta completa y un porcentaje calculado sobre vacíos, fechas válidas o valores utilizables.

El alcance del análisis se actualiza aparte, después de cada corrección.

## Comportamiento visible verificado por estructura

- Cada tarjeta muestra solo el dato necesario, la columna encontrada, el estado de identificación y la calidad calculada.
- La tarjeta ofrece **Sí, está bien**, **Cambiar** y **No lo tengo**; después de confirmar no vuelve a mostrar el botón de confirmación.
- Los niveles siempre se escriben como **Calidad de los datos: Alta**, **Calidad de los datos: Media** o **Calidad de los datos: Baja**.
- Una identificación dudosa puede tener calidad Alta, y una identificación correcta puede tener calidad Baja.
- **Cambiar** presenta todas las columnas reales, agrupadas por hoja, y muestra ejemplos de la selección.
- Si no se encuentra un dato principal, permite seleccionar otra columna o indicar **No lo tengo**.
- Ventas requiere fecha, producto y al menos una medida (cantidad o valor); inventario requiere producto y existencia.
- Los datos adicionales aparecen dentro de una sección colapsable.
- El resumen usa la leyenda ✓ Disponible, ! Necesita revisión y ○ No disponible.
- El alcance no promete rentabilidad sin costos ni productos acumulados sin ventas por cantidad e inventario.
- La Etapa 2 usa lenguaje de identificación y calidad, sin términos técnicos para la persona usuaria.

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
