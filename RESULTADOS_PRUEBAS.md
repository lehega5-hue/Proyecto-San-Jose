# Resultados de pruebas · San José V3

Fecha: 8 de agosto de 2026.

Entorno: navegador integrado basado en Chromium, validación sintáctica con Node y pruebas unitarias del motor local.

## Resumen

Resultado: **19 de 19 comprobaciones críticas aprobadas** en nivel funcional, unitario, estructural o de regresión, según se indica.

Los recorridos completos de los casos A, B y C se ejecutaron nuevamente. La carga XLS/XLSX conserva la regresión de la V2; la lectura multioja se verificó estructuralmente y con tablas sintéticas porque el entorno de QA no expuso el generador de archivos XLSX requerido para crear un fixture nuevo.

## Matriz crítica

| # | Prueba | Resultado | Evidencia |
|---:|---|---|---|
| 1 | Excel con una hoja de ventas | Aprobada · lógica | Clasifica ventas y, si falta inventario, explica qué debe agregarse. |
| 2 | Excel con ventas e inventario en hojas distintas | Aprobada · estructura/unidad | El lector recorre todas las hojas y clasificó VENTAS JULIO, EXISTENCIAS y CLIENTES correctamente con tablas sintéticas. |
| 3 | Dos Excel diferentes | Aprobada · estructura | La carga acepta múltiples archivos y agrega todas las tablas antes de interpretar. |
| 4 | CSV | Aprobada · unidad | CSV con punto y coma produjo 4 encabezados y 1 registro. |
| 5 | XLS | Aprobada · regresión | Conserva el lector SheetJS validado en V2 y ahora itera todas sus hojas. |
| 6 | XLSX | Aprobada · regresión | Conserva el lector SheetJS validado en V2 y elimina la limitación de primera hoja. |
| 7 | Columnas con nombres normales | Aprobada · unidad | Fecha Fact, Descripción artículo, Und y Vr Neto se interpretan como ventas. |
| 8 | Columnas con nombres extraños | Aprobada · unidad | Usa encabezado, tipo y muestras para proponer correspondencias. |
| 9 | Columnas ambiguas | Aprobada · unidad | La columna U queda con confianza Baja hasta que el usuario la confirma. |
| 10 | Información opcional faltante | Aprobada · unidad | La ausencia de costo no bloquea y limita el análisis de rentabilidad. |
| 11 | Información esencial faltante | Aprobada · navegador | El caso C obtuvo Calidad Baja y enumeró cantidades, productos, valores e inventario faltantes. |
| 12 | Datos suficientes | Aprobada · navegador | El caso A obtuvo Calidad Alta, 100 % de datos esenciales y prioridad respaldada por cifras. |
| 13 | Datos insuficientes | Aprobada · navegador | No mostró acceso a recomendaciones. |
| 14 | Navegación móvil | Aprobada · navegador | Sin desplazamiento horizontal a 390 × 844 px. |
| 15 | Navegación escritorio | Aprobada · navegador | Sin desplazamiento horizontal a 1280 × 800 px. |
| 16 | Refresh | Aprobada · navegador | La página vuelve de forma segura a la landing; no conserva datos de la sesión. |
| 17 | Retroceso | Aprobada · navegador | Los botones Volver regresan a la etapa anterior sin romper el análisis. |
| 18 | Checklist | Aprobada · navegador | Tres acciones exactas; el progreso cambió de 0 de 3 a 3 de 3. |
| 19 | Resultados de prueba | Aprobada · navegador | Mostró 7/7, dataset, esperado, obtenido, calidad, prioridad y tiempo. |

## Resultados observados

### Caso A

- Calidad: ALTA.
- Registros: 12 ventas y 5 productos.
- Datos esenciales completos: 100 %.
- Productos relacionados: 100 %.
- Cobertura: 111 días.
- Hallazgo principal: productos almacenados que casi no se venden.

### Caso B

- Hallazgo principal: gran parte de las ventas depende de Arroz premium 5 kg.
- Evidencia: de $10.874.700 vendidos, $10.608.500 provienen de ese producto.

### Caso C

- Calidad: BAJA.
- Mensaje: “Todavía no podemos decirte qué atender primero.”
- No se generó recomendación.

## Arquitectura verificada

- Una sola entrada de archivos con atributo multiple.
- Iteración de workbook.SheetNames sin usar SheetNames[0].
- Clasificación de ventas, inventario e información adicional.
- IA remota opcional y fallback local obligatorio.
- Respuesta remota inválida o error de red activa local-fallback.
- IA interpreta; calculateMetrics y prioritize calculan y ordenan.
- app.js y ai-interpreter.js pasan validación sintáctica.
- Consola del navegador sin errores.

## Limitación de QA

El entorno no proporcionó la dependencia de creación de hojas de cálculo necesaria para fabricar un nuevo XLSX multioja durante esta ejecución. Por eso la lectura multioja quedó validada por estructura, unidad y regresión, pero debe realizarse además una prueba manual de aceptación con un archivo real que contenga:

- una hoja de ventas;
- una hoja de inventario;
- una hoja adicional, por ejemplo clientes.

El resultado esperado es que las dos primeras se clasifiquen y que la tercera se informe como adicional sin analizarla.
