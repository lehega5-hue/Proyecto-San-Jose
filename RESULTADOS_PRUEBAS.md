# Resultados de pruebas del MVP – Versión 2

Fecha de ejecución: 8 de agosto de 2026.

Entorno: navegador integrado basado en Chromium; validaciones de escritorio y móvil; revisión estática de JavaScript.

## Resumen

Resultado: **25 de 25 comprobaciones aprobadas**. Las pruebas de carga e interpretación corresponden a la regresión conservada del MVP validado; los recorridos y la interfaz de la Versión 2 se ejecutaron nuevamente.

## Matriz validada

| Prueba | Resultado | Evidencia observada |
|---|---|---|
| Bienvenida institucional | Aprobada | No solicita acceso; **Iniciar demostración** abre el contexto. |
| Formulario de contexto | Aprobada | Los campos obligatorios permiten continuar. |
| Pregunta condicional | Aprobada | Aparece únicamente cuando la respuesta la requiere. |
| Cuatro etapas | Aprobada | La barra agrupa el recorrido en conocer, analizar, priorizar y actuar. |
| Inventario detenido | Aprobada | Calidad Alta; prioriza liberar Vajilla blanca con evidencia calculada. |
| Ventas concentradas | Aprobada | La regresión conserva la identificación de dependencia comercial. |
| Información insuficiente | Aprobada | Calidad Baja (18/100); no ofrece acceso a prioridades. |
| Mensaje de abstención | Aprobada | Muestra literalmente “Todavía no tenemos suficiente información para recomendar con confianza.” |
| Carga `.xlsx` | Aprobada | Regresión conservada: lectura local de la primera hoja. |
| Carga `.xls` | Aprobada | Regresión conservada: lectura de Excel tradicional. |
| Carga `.csv` | Aprobada | Regresión conservada: coma y punto y coma. |
| Inferencia semántica | Aprobada | Conserva propuestas a partir de encabezados y muestras. |
| Muestra y confianza | Aprobada | Presenta ejemplos y confianza Alta, Media o Baja. |
| Confirmación previa | Aprobada | El mapeo se confirma antes de calcular resultados. |
| Corrección manual | Aprobada | Conserva la reasignación de columnas. |
| Campo esencial dudoso | Aprobada | Bloquea el análisis y explica cómo corregirlo. |
| Campo opcional ausente | Aprobada | No bloquea e informa la limitación. |
| Cálculo determinista | Aprobada | El caso principal genera calidad Alta y resultados reproducibles. |
| Tres prioridades | Aprobada | Presenta una principal y dos secundarias. |
| Prioridad principal | Aprobada | Expone detección, significado, evidencia y primer paso antes de métricas. |
| Plan de acción | Aprobada | Incluye acción, responsable editable, plazo e indicador. |
| Seguimiento y continuidad | Aprobada | Conserva responsable, estado y muestra la siguiente prioridad. |
| Resumen ejecutivo | Aprobada | Genera un HTML descargable, imprimible y guardable como PDF. |
| Escritorio y móvil | Aprobada | Sin desbordamiento horizontal a 1280 px ni a 390 × 844 px. |
| Consola y sintaxis | Aprobada | Sin errores en consola; `app.js` fue compilado por el analizador de Node. |

## Reglas que deben permanecer verificadas

- Una interpretación esencial con confianza Baja no se usa silenciosamente.
- La corrección manual queda marcada con confianza Alta.
- Precio unitario y valor total se aceptan como alternativas; un total no se multiplica otra vez por la cantidad.
- Las columnas opcionales de confianza Baja no entran en los cálculos.
- Calidad Baja detiene las recomendaciones.
- Las cifras provienen de sumas y comparaciones reproducibles.
- Los datos ficticios no se mezclan con archivos cargados por el usuario.

## Limitaciones conocidas

- La interpretación semántica es local y basada en reglas, encabezados y muestras; no utiliza un modelo remoto de IA.
- Se procesa únicamente la primera hoja de cada archivo Excel.
- El estado se conserva solo durante la sesión del navegador.
- No se analizan devoluciones, estacionalidad, pedidos pendientes o ventas perdidas.
- El resumen se descarga como HTML; la creación del PDF se realiza con la función de impresión del navegador.
- Las pruebas y casos incluidos usan datos completamente ficticios.
