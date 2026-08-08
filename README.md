# San José – Transformación Empresarial

MVP académico funcional que demuestra el recorrido:

`datos → interpretación → confirmación → prioridad → acción → seguimiento`

## Cómo abrirlo

1. Abre la carpeta `san-jose`.
2. Haz doble clic en `index.html`.
3. Si Windows pregunta con qué programa abrirlo, elige Chrome, Edge o Firefox.

No hay que instalar nada ni ejecutar comandos.

## Credenciales de demostración

- Correo: `demo@sanjose.com`
- Contraseña: `SanJose2026`

Son credenciales locales para presentar el recorrido; no crean una cuenta real.

## Recorrido recomendado

1. Ingresa con las credenciales de demostración.
2. Pulsa **Comenzar recorrido**.
3. Completa el contexto empresarial con respuestas ficticias.
4. Usa un caso ficticio o carga dos archivos propios de prueba.
5. Revisa la pantalla **Así entendimos tus datos**.
6. Corrige las correspondencias si alguna columna fue interpretada de forma incorrecta.
7. Confirma y revisa la calidad, los hallazgos, la prioridad y el plan de acción.

## Archivos admitidos

- Excel moderno: `.xlsx`
- Excel tradicional: `.xls`
- Texto separado por comas o punto y coma: `.csv`
- Tamaño máximo: 5 MB por archivo
- Se analiza la primera hoja de cada libro de Excel.

El sistema no exige encabezados rígidos. Examina el nombre de cada columna y una muestra de sus valores para proponer correspondencias como fecha, producto, cantidad, precio, valor total, existencias y costo. Cada propuesta muestra confianza **Alta**, **Media** o **Baja**.

Antes de calcular resultados, la empresa debe confirmar la interpretación. Una correspondencia esencial ausente o de confianza Baja bloquea el análisis y explica cómo corregirla. Las columnas opcionales, como costo o canal, no bloquean el proceso y se informan como limitaciones.

La lectura local de Excel usa SheetJS 0.20.3, incluido en `assets/xlsx.full.min.js`; por eso el MVP no necesita conexión a internet para procesar archivos.

## Plantillas y archivos de prueba

La pantalla de carga permite descargar plantillas de ventas e inventario. En `datos/` también se incluyen CSV con nombres alternativos y un archivo al que le falta una columna esencial para probar el bloqueo controlado.

## Privacidad y alcance

- Los archivos se procesan en el navegador y no se envían a un servidor.
- No uses información personal, sensible o financiera real durante la prueba.
- Las correspondencias son sugerencias semánticas locales, no afirmaciones infalibles.
- Los resultados se calculan con reglas deterministas después de la confirmación.
- La decisión final siempre corresponde al empresario.
- El MVP no incluye cuentas reales, persistencia empresarial, pagos ni integraciones.

## Si algo falla

- Conserva juntos `index.html`, `app.js`, los estilos y las carpetas `assets` y `datos`.
- Comprueba mayúsculas de la contraseña: `SanJose2026`.
- Confirma que cada archivo pese como máximo 5 MB.
- En Excel, coloca la tabla que quieres analizar en la primera hoja.
- Si una pantalla parece desactualizada, recarga con `Ctrl + F5`.

Consulta `RESULTADOS_PRUEBAS.md` para la evidencia funcional.
