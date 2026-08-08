# San José – Transformación Empresarial

MVP académico funcional para propietarios y gerentes de pequeñas empresas colombianas de comercio y distribución. Convierte información de ventas e inventario en una orientación inicial, explicable y accionable.

`contexto → datos → calidad → prioridades → acción → seguimiento`

## Cómo abrirlo

1. Abre la carpeta `san-jose`.
2. Haz doble clic en `index.html`.
3. Elige Chrome, Edge o Firefox si Windows pregunta con qué programa abrirlo.

No hay cuentas, credenciales, instalación ni comandos obligatorios. En la bienvenida institucional pulsa **Iniciar demostración**.

Para evitar restricciones del navegador al probar cargas locales, también puedes iniciar un servidor en esta carpeta con `python -m http.server 8765` y abrir `http://localhost:8765/`.

## Recorrido de la versión 2

El recorrido visible se organiza en cuatro etapas:

1. **Conoce tu negocio:** contexto empresarial breve y sin datos personales.
2. **Analiza tus datos:** casos ficticios o archivos propios, interpretación de columnas y calidad.
3. **Descubre tus prioridades:** tres hallazgos ordenados; la prioridad número 1 explica qué ocurre, por qué importa, qué evidencia la sustenta y qué hacer primero.
4. **Actúa y haz seguimiento:** plan con responsable editable, plazo e indicador; cierre con continuidad.

La aplicación usa lenguaje consultivo y reglas deterministas. No afirma utilizar inteligencia artificial. Cuando la evidencia no alcanza, muestra: **“Todavía no tenemos suficiente información para recomendar con confianza.”**

## Archivos admitidos

- Excel moderno: `.xlsx`
- Excel tradicional: `.xls`
- CSV separado por comas o punto y coma: `.csv`
- Máximo: 5 MB por archivo
- En Excel se analiza la primera hoja.

El alcance inicial es únicamente **Ventas** e **Inventario**. El sistema examina encabezados y una muestra de valores para proponer fecha, producto, cantidad, precio o valor total, existencias y costo. Antes del análisis muestra:

- columna encontrada;
- interpretación propuesta;
- confianza Alta, Media o Baja;
- muestra de valores;
- corrección manual.

Una correspondencia esencial ausente o de confianza Baja bloquea el análisis y explica cómo corregirla. Las columnas opcionales no bloquean el proceso; su ausencia se informa como limitación.

La lectura de Excel usa SheetJS 0.20.3 incluido en `assets/xlsx.full.min.js`, por lo que no requiere internet.

## Casos, plantillas y resumen ejecutivo

`datos/` incluye plantillas CSV, archivos con nombres alternativos y un caso al que le falta una columna esencial. La interfaz también ofrece tres casos ficticios: inventario detenido, ventas concentradas e información insuficiente.

Desde la pantalla de prioridades se descarga `resumen-ejecutivo-san-jose.html`, con contexto, calidad, hallazgos, prioridad principal, evidencia, plan, limitaciones y fecha. Al abrirlo se puede imprimir o guardar como PDF desde el navegador.

## Privacidad y principio de verdad

- Los archivos se procesan localmente en el navegador y no se envían ni almacenan en un servidor.
- No uses información personal, sensible o financiera real durante la demostración.
- Las interpretaciones son sugerencias locales basadas en reglas, no afirmaciones infalibles.
- Los resultados proceden de cálculos deterministas después de la confirmación.
- San José no inventa respuestas cuando falta evidencia.
- La decisión final siempre corresponde al empresario.
- No hay cuentas, persistencia empresarial, pagos ni integraciones.

## Si algo falla

- Conserva juntos `index.html`, `app.js`, `styles.css`, `overrides.css` y las carpetas `assets` y `datos`.
- Confirma que cada archivo pese máximo 5 MB y que la tabla esté en la primera hoja.
- Revisa la correspondencia propuesta y corrige manualmente una columna dudosa.
- Si una pantalla parece desactualizada, recarga con `Ctrl + F5`.

Consulta `RESULTADOS_PRUEBAS.md` para la matriz de validación de esta versión.
