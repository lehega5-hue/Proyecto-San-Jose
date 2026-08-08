# Resultados de pruebas · San José

Fecha: 8 de agosto de 2026.

Entorno: Node.js 24 incluido en Codex y servidor HTTP estático local.

## Resultado

**50 de 50 pruebas automatizadas aprobadas.** La batería cubre tarjetas uniformes, selector permanente, confirmación, archivos con varias hojas, medidas flexibles, calidad calculada, alcance dinámico, dictado, demostración, priorización y los diez escenarios obligatorios de la Etapa 3.

```powershell
node tests/run-tests.js
```

## Ajuste de experiencia verificado

- La Etapa 2 usa el título **Esto es lo que entendimos**.
- Cada tarjeta conserva el mismo orden: dato, columna encontrada, estado, pregunta, selector y acciones.
- Los únicos estados previos son **🟢 Parece correcto**, **🟠 Revisa este dato** y **⚪ No la encontramos**.
- El selector permanece visible en todas las tarjetas y muestra solo hojas y nombres de columnas.
- No se muestran ejemplos ni mensajes especiales por encima del dato.
- **Sí, está bien** cambia el estado a **✓ Confirmado por ti** y no vuelve a solicitar confirmación durante la sesión.
- **Cambiar** está disponible incluso cuando San José asignó confianza alta.
- Una corrección manual queda pendiente hasta pulsar nuevamente **Sí, está bien**.
- **No lo tengo** conserva la decisión durante la sesión.
- La calidad aparece dentro de la misma plantilla únicamente después de confirmar y usa cálculos reales.
- El contador informa cuántos datos principales faltan y muestra el mensaje final al resolver los seis.
- La sección adicional permanece abierta durante confirmaciones, cambios y selecciones hasta que la persona la cierre.

## Prueba crítica documentada

Escenario reproducible:

1. San José interpreta incorrectamente `IdDocumento` como **Cantidad vendida** con confianza alta.
2. La persona pulsa **Cambiar**.
3. El selector muestra todas las columnas reales, no solo las candidatas del reconocimiento automático.
4. La lista incluye `Cantidad` y también las columnas de las demás hojas del archivo.
5. Las opciones están agrupadas por hoja y la selección se conserva internamente como **Hoja + Columna**.
6. El selector no muestra ejemplos ni valores de muestra.
7. La persona selecciona `Cantidad` y la tarjeta queda pendiente de confirmación.
8. La persona pulsa **Sí, está bien** y la tarjeta cambia a **Cantidad vendida → Cantidad** con estado **✓ Confirmado por ti**.
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

La sección **Datos que pueden mejorar el análisis** permanece cerrada inicialmente, no bloquea por ausencias y conserva su estado abierto durante cualquier interacción.

- Adicionales: Cliente, Comercial / vendedor y Utilidad.

## Comportamientos analíticos comprobados

| Escenario | Resultado |
|---|---|
| Asociación que parece correcta | Muestra **🟢 Parece correcto**, selector y las tres acciones. |
| Asociación dudosa | Muestra **🟠 Revisa este dato** sin mensajes especiales. |
| Columna ausente | Muestra **⚪ No la encontramos** y deshabilita **Sí, está bien**. |
| Todas las columnas | El selector enumera encabezados reales de todas las hojas. |
| Nombres repetidos | La selección conserva hoja y columna para evitar ambigüedad. |
| Columna principal duplicada | Se rechaza la segunda selección y se indica qué dato ya la utiliza. |
| Corrección en tiempo real | Actualiza la columna, exige confirmación y recalcula al confirmar sin recargar. |
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

## Etapa 3 · Esto muestran tus datos

Se verificaron como una sola especificación los siguientes escenarios:

| Caso | Resultado |
|---|---|
| A · Ventas, cantidad e inventario completos | Muestra cuatro cifras, calidad alta, dos gráficos y prioridad. |
| B · Cantidad sin valor monetario | Usa unidades y explica por qué no calcula pesos. |
| C · Valor con baja calidad | No usa el valor en el gráfico; cambia a cantidad si es utilizable. |
| D · Productos sin relación | Informa 0 productos relacionados y no compara ventas con inventario. |
| E · Mes sin registros | Conserva el vacío y no lo interpreta como ventas iguales a cero. |
| F · Pocas ventas y mucho inventario | Identifica el producto relacionado y muestra ventas, existencias, proporción y periodo. |
| G · Ventas concentradas | Explica el porcentaje y si corresponde al valor o a las unidades. |
| H · Calidad alta | Aplica 35 % completitud, 30 % validez, 20 % consistencia y 15 % cobertura. |
| I · Calidad media | Usa una explicación breve y neutral sobre información incompleta. |
| J · Calidad crítica | Cambia la recomendación a un lenguaje prudente. |

La pantalla mantiene un máximo de cuatro indicadores, dos gráficos y dos hallazgos secundarios. El detalle de calidad y el detalle del análisis permanecen cerrados inicialmente.

## Validaciones técnicas

- `app.js` y `ai-interpreter.js` pasan `node --check`.
- `git diff --check` no reporta errores.
- El escaneo no encuentra API keys, tokens, contraseñas ni secretos incrustados.
- Los recursos usan rutas relativas compatibles con GitHub Pages.

## Aceptación manual recomendada

Antes del piloto real conviene repetir la prueba crítica con un archivo anonimizado que tenga varias hojas, encabezados repetidos y dos columnas parecidas de valor. Así se valida con una persona empresaria que puede corregir a San José sin conocer conceptos técnicos.
