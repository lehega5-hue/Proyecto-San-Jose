# Resultados de pruebas del MVP

Fecha de ejecución: 8 de agosto de 2026.

Entorno: navegador integrado basado en Chromium, escritorio de 1280 px y móvil de 390 × 844 px.

## Resumen

Resultado: **21 de 21 pruebas aprobadas**.

| Prueba | Resultado | Evidencia observada |
|---|---|---|
| Login correcto | Aprobada | Las credenciales demostrativas abren la bienvenida. |
| Contraseña incorrecta | Aprobada | Se muestra un mensaje claro y no se permite el acceso. |
| Formulario | Aprobada | Los campos obligatorios permiten continuar. |
| Pregunta condicional | Aprobada | La pregunta adicional aparece únicamente cuando corresponde. |
| Caso de inventario detenido | Aprobada | Calidad Alta; prioriza liberar inventario detenido. |
| Caso de ventas concentradas | Aprobada | Calidad Alta; identifica la concentración comercial. |
| Caso de información insuficiente | Aprobada | Calidad Baja; se abstiene de recomendar. |
| Carga `.xlsx` | Aprobada | Leyó la primera hoja de los libros de ventas e inventario. |
| Carga `.xls` | Aprobada | Leyó libros en formato Excel tradicional. |
| Carga `.csv` | Aprobada | Aceptó separadores por coma y punto y coma. |
| Inferencia semántica | Aprobada | Interpretó encabezados como “Fecha factura”, “Descripción artículo”, “Unidades despachadas”, “Vr. neto” y “Saldo bodega”. |
| Muestra de valores | Aprobada | Diferenció columnas de fecha, texto y números usando valores de ejemplo. |
| Confianza visible | Aprobada | Mostró confianza Alta, Media o Baja y el motivo de cada propuesta. |
| Confirmación previa | Aprobada | Mostró **Así entendimos tus datos** antes de calcular resultados. |
| Corrección manual | Aprobada | Una columna ambigua `U` pudo asignarse manualmente a Cantidad vendida. |
| Campo esencial dudoso | Aprobada | Bloqueó Continuar y explicó cómo identificar la cantidad faltante. |
| Campo opcional ausente | Aprobada | La ausencia de costo no bloqueó; informó la limitación sobre margen. |
| Cálculo determinista | Aprobada | Tras confirmar, obtuvo calidad Alta, 5 ventas, 2 productos de inventario y 100 % de correspondencia. |
| Tres prioridades | Aprobada | Generó prioridades ordenadas con evidencia y limitaciones. |
| Plan y seguimiento | Aprobada | Mostró acción de corto plazo e indicador verificable. |
| Escritorio y móvil | Aprobada | No presentó desplazamiento horizontal en los anchos verificados. |

## Reglas verificadas

- Una interpretación esencial con confianza Baja no se usa silenciosamente.
- La corrección manual queda marcada con confianza Alta.
- Precio unitario y valor total de venta se aceptan como alternativas; el valor total no se multiplica nuevamente por la cantidad.
- Las columnas opcionales de confianza Baja no entran en los cálculos.
- Calidad Baja detiene las recomendaciones.
- Las cifras provienen de sumas y comparaciones reproducibles.
- Los datos ficticios no se mezclan con archivos cargados por el usuario.

## Limitaciones conocidas

- La interpretación semántica es local y basada en reglas, encabezados y muestras; no utiliza un modelo remoto de IA.
- Se procesa únicamente la primera hoja de cada archivo Excel.
- El login es demostrativo y no protege información real.
- El estado se conserva solo durante la sesión del navegador.
- No se analizan devoluciones, estacionalidad, pedidos pendientes o ventas perdidas.
- Las pruebas usan datos completamente ficticios.
