# Resultados de pruebas · San José

Fecha: 8 de agosto de 2026.

Entorno: Node.js 24 incluido en Codex y servidor HTTP estático local.

## Resultado

**40 de 40 pruebas automatizadas aprobadas.** La batería cubre interpretación de columnas, confianza, confirmación y corrección, archivos con varias hojas, medidas flexibles, calidad calculada, alcance dinámico, dictado, demostración y priorización.

```powershell
node tests/run-tests.js
```

## Ajuste de experiencia verificado

- La Etapa 2 usa el título **Esto es lo que entendimos**.
- Cada tarjeta muestra únicamente el dato necesario, la columna encontrada, **Confianza Alta/Media/Baja**, estado y acciones.
- La confianza describe la interpretación de la columna; no se presenta como calidad de los datos.
- Una propuesta sin confirmar muestra **✓ Identificada por San José** o **⚠ Necesita revisión**.
- **Sí, está bien** cambia el estado a **✓ Confirmado por ti** y no vuelve a solicitar confirmación durante la sesión.
- **Cambiar** está disponible incluso cuando San José asignó confianza alta.
- Una corrección manual queda **✓ Confirmado por ti**, vuelve a validar los datos y recalcula inmediatamente el análisis posible.
- **No tengo ese dato** conserva la decisión durante la sesión y explica el análisis que deja de ser posible cuando el dato es necesario.
- La calidad se calcula posteriormente con los datos reales; no alarga las tarjetas de identificación.

## Prueba crítica documentada

Escenario reproducible:

1. San José interpreta incorrectamente `IdDocumento` como **Cantidad vendida** con confianza alta.
2. La persona pulsa **Cambiar**.
3. El selector muestra todas las columnas reales, no solo las candidatas del reconocimiento automático.
4. La lista incluye `Cantidad` y también las columnas de las demás hojas del archivo.
5. Las opciones están agrupadas por hoja y la selección se conserva internamente como **Hoja + Columna**.
6. El selector muestra ejemplos de valores reales para facilitar el reconocimiento.
7. La persona selecciona `Cantidad`.
8. La tarjeta se actualiza a **Cantidad vendida → Cantidad** con estado **✓ Confirmado por ti**.
9. Sin recargar el archivo, el análisis se recalcula y reconoce una fila con cantidad utilizable.

**Resultado: aprobado.**

## Reglas de datos principales

### Ventas

- Fecha de venta: necesaria.
- Producto / referencia: necesario.
- Medida de la venta: debe existir al menos una entre Cantidad vendida y Valor de la venta.
- No se exige cantidad, precio y valor simultáneamente.
- Fecha + producto + cantidad permite analizar volumen.
- Fecha + producto + valor total permite analizar ingresos.

### Inventario

- Producto / referencia: necesario.
- Existencia actual: necesaria.

### Datos adicionales

La sección **Datos que pueden mejorar el análisis** permanece cerrada inicialmente y no bloquea por ausencias.

- Ventas: Cantidad vendida, Valor total, Precio unitario, Costo, Cliente, Canal, Categoría, Sede, Vendedor y Descuento.
- Inventario: Fecha del inventario, Costo, Último movimiento, Categoría, Bodega, Inventario mínimo, Inventario máximo, Punto de reposición, Proveedor y Fecha de vencimiento.

## Comportamientos analíticos comprobados

| Escenario | Resultado |
|---|---|
| Confianza alta equivocada | Conserva **Cambiar** y permite corregirla. |
| Confianza media o baja | No se usa como dato principal hasta confirmar o corregir. |
| Todas las columnas | El selector enumera encabezados reales de todas las hojas. |
| Nombres repetidos | La selección conserva hoja y columna para evitar ambigüedad. |
| Columna principal duplicada | Se rechaza la segunda selección y se indica qué dato ya la utiliza. |
| Corrección en tiempo real | Actualiza asociación, validación, calidad y alcance sin recargar. |
| Falta un dato adicional | El análisis puede continuar. |
| Falta una medida de venta | Se explica qué análisis deja de ser posible. |
| Solo ventas | No afirma inventario acumulado ni faltantes. |
| Solo inventario | No afirma ventas, rotación ni bajo movimiento. |
| Valor calculado | Cantidad 3 × precio 12.000 produce valor total 36.000. |
| Resumen dinámico | Separa lo que puede analizarse de lo que todavía no puede analizarse. |

## Calidad de datos

El motor mantiene cálculos reales para:

- registros con producto;
- fechas válidas;
- cantidades o valores utilizables;
- existencias válidas;
- vacíos, valores negativos y duplicados;
- cobertura temporal;
- relación entre ventas e inventario;
- cobertura de costos.

Las pruebas incluyen ejemplos de 98 % de fechas válidas, 14 % de cantidades vacías y 31 % de valores inutilizables. No se utilizan porcentajes prefabricados.

## Regresiones conservadas

- Los cuatro escenarios de dictado controlado siguen aprobados.
- La demostración mantiene un único ejemplo de solo ventas.
- La información parcial no puede presentarse como calidad alta.
- La priorización conserva impacto, urgencia, alcance y confianza.
- La carga XLS/XLSX/CSV, lectura de varias hojas y fallback local siguen intactos.
- El plan conserva exactamente tres acciones.

## Validaciones técnicas

- `app.js` y `ai-interpreter.js` pasan `node --check`.
- `git diff --check` no reporta errores.
- El escaneo no encuentra API keys, tokens, contraseñas ni secretos incrustados.
- Los recursos usan rutas relativas compatibles con GitHub Pages.

## Aceptación manual recomendada

Antes del piloto real conviene repetir la prueba crítica con un archivo anonimizado que tenga varias hojas, encabezados repetidos y dos columnas parecidas de valor. Así se valida con una persona empresaria que puede corregir a San José sin conocer conceptos técnicos.
