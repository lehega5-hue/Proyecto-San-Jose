# Resultados de pruebas · San José

Fecha: 8 de agosto de 2026.

Entorno: Node.js 24 incluido en Codex, navegador Chromium integrado y servidor HTTP estático local.

## Resultado

**40 de 40 pruebas automatizadas aprobadas:** 27 de identificación, confirmación, calidad por columna y alcance; 3 validaciones de medidas flexibles; y 10 regresiones del dictado, demostración, calidad parcial y priorización.

```powershell
node tests/run-tests.js
```

## Pruebas de identificación, calidad y alcance

| # | Escenario | Resultado verificado |
|---:|---|---|
| 1 | Columna identificada con claridad | Fecha y producto con nombres normales muestran **🟢 Parece correcto**. |
| 2 | Identificación que el usuario puede corregir | La tarjeta conserva siempre la acción **Cambiar**. |
| 3 | Usuario corrige la columna | La nueva selección se aplica inmediatamente, muestra **🟢 Parece correcto** y todavía exige confirmación. |
| UX crítica | `IdDocumento` fue asociado a Cantidad vendida | **Cambiar** muestra todas las columnas, permite elegir `Cantidad`, mantiene oculta la calidad y la muestra solo después de **Sí, está bien**. |
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

## Comprobaciones obligatorias de la UX final

| # | Comprobación | Resultado |
|---:|---|---|
| 1 | Columna encontrada correctamente | Muestra el nombre real y **🟢 Parece correcto**. |
| 2 | Usuario confirma | Cambia inmediatamente a **✓ Confirmado por ti**. |
| 3 | Calidad después de confirmar | La calidad aparece solo después de la confirmación. |
| 4 | Columna equivocada | La tarjeta mantiene disponible **Cambiar**. |
| 5 | Usuario pulsa Cambiar | Se abre el selector dentro de la misma tarjeta. |
| 6 | Aparecen todas las columnas | Incluye todas las columnas reales, agrupadas por hoja. |
| 7 | Usuario selecciona otra | La tarjeta se actualiza y el selector se cierra. |
| 8 | Calidad oculta tras seleccionar | La selección manual queda pendiente de confirmación. |
| 9 | Usuario confirma la nueva columna | Cambia a **✓ Confirmado por ti**. |
| 10 | Calidad de la nueva columna | Aparece después de confirmar y usa cálculos reales. |
| 11 | Usuario selecciona No lo tengo | La decisión queda guardada durante la sesión. |
| 12 | No lo tengo sin calidad | No se muestra ninguna evaluación de calidad. |
| 13 | Columna no encontrada | Muestra **⚪ No la encontramos**. |
| 14 | No encontrada sin calidad | No se muestra calidad sin una columna confirmada. |
| 15 | Cuatro datos de ventas | Usan cuatro instancias de la misma plantilla visual. |
| 16 | Dos datos de inventario | Usan dos instancias de esa misma plantilla. |
| 17 | Análisis bloqueado con pendientes | El botón permanece deshabilitado y se muestra una indicación sencilla. |
| 18 | Análisis habilitado al resolver | El botón se activa cuando todos los principales están confirmados o marcados como ausentes. |

## Reglas analíticas verificadas

### Ventas

- Datos principales: fecha, producto y al menos una medida de la venta.
- Medidas válidas: cantidad, valor total o valor calculado con cantidad × precio.
- La ausencia de precio no bloquea un análisis de volumen.
- La ausencia de cantidad no bloquea un análisis de ingresos cuando existe valor total.
- Solo Cliente, Comercial / vendedor y Utilidad se muestran como datos opcionales, y únicamente cuando fueron encontrados.

### Inventario

- Producto y existencia actual son necesarios.
- Fecha de corte es muy recomendable y genera una limitación si falta, pero no bloquea.
- Costos, movimientos, mínimos, máximos, reposición, reservas, pedidos, proveedor, entrega, bodega, categoría, lote y vencimiento son adicionales.

### Dos conceptos separados

1. **Identificación de la columna:** usa únicamente **🟢 Parece correcto**, **🟠 Revisa este dato** o **⚪ No la encontramos**.
2. **Calidad de los datos:** aparece únicamente después de una confirmación explícita y muestra un porcentaje calculado sobre vacíos, fechas válidas o valores utilizables.

El alcance del análisis se actualiza aparte, después de cada corrección.

## Comportamiento visible verificado por estructura

- Antes de confirmar, cada tarjeta muestra solo el dato necesario, la columna encontrada, el estado de identificación y las tres acciones.
- La tarjeta ofrece **Sí, está bien**, **Cambiar** y **No lo tengo**; después de confirmar no vuelve a mostrar el botón de confirmación.
- Después de confirmar muestra **✓ Confirmado por ti**, la calidad calculada y únicamente **Cambiar**.
- Los niveles siempre se escriben como **Calidad de los datos: Alta**, **Calidad de los datos: Media** o **Calidad de los datos: Baja**.
- Una columna sin confirmar, no encontrada o marcada **No lo tengo** nunca muestra calidad.
- **Cambiar** presenta todas las columnas reales, agrupadas por hoja, y muestra ejemplos de la selección.
- Si no se encuentra un dato principal, permite seleccionar otra columna o indicar **No lo tengo**.
- Ventas requiere fecha, producto y al menos una medida (cantidad o valor); inventario requiere producto y existencia.
- Cantidad vendida y Valor de la venta son tarjetas principales separadas y usan el mismo componente visual.
- Los opcionales encontrados aparecen dentro de la sección cerrada **Datos que pueden mejorar el análisis**.
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
