# San José – Transformación Estratégica · MVP V4

San José ayuda a propietarios y gerentes de pequeñas empresas colombianas a entender qué merece atención primero a partir de sus ventas e inventario.

> **Tus datos te muestran qué atender primero.**

**ARCHIVO → COMPRENSIÓN → EVIDENCIA → PRIORIDAD → 3 ACCIONES**

## Abrir la aplicación

La aplicación es estática y compatible con GitHub Pages. No requiere cuenta, backend ni `localhost`:

- Sitio público: <https://lehega5-hue.github.io/Proyecto-San-Jose/>
- Alternativa local opcional: `python -m http.server 8765` y abrir <http://localhost:8765/>

## Recorrido V4

1. Responde tres preguntas estructuradas: actividad, forma de administrar la información y antigüedad.
2. Opcionalmente agrega contexto libre por texto o dictado. El navegador transcribe el audio y no lo almacena.
3. Sube uno o varios XLS, XLSX o CSV en una única entrada. Se leen todas las hojas.
4. Revisa cómo se interpretaron las hojas y responde una pregunta sencilla si una columna es ambigua.
5. Continúa con ventas, inventario o ambos. La aplicación limita sus conclusiones según la información disponible.
6. Revisa cuatro cifras principales, calidad calculada, dos gráficos sencillos, una prioridad y hasta dos hallazgos adicionales.
7. Marca avances, registra comentarios y consulta el resumen de prueba.

## Qué cambió en V4

- Contexto reducido a tres preguntas obligatorias y un campo libre opcional.
- Dictado opcional controlado por el usuario, con transcripción intermedia y reinicio automático mientras siga escuchando.
- Un único ejemplo visible de ventas para demostrar el análisis sin inventario.
- Flujos parciales: ventas sin inventario e inventario sin ventas.
- Revisión simple de cada columna con **Sí, está bien**, **Cambiar** y **No lo tengo**.
- Todas las tarjetas muestran siempre el selector con las columnas reales agrupadas por archivo y hoja, sin valores de muestra.
- Prevención de columnas duplicadas en datos principales y recálculo inmediato del alcance tras una corrección.
- Estados simples y uniformes: **🟢 Parece correcto**, **🟠 Revisa este dato**, **⚪ No la encontramos** y **✓ Confirmado por ti**.
- Una corrección manual vuelve a requerir **Sí, está bien**; la calidad aparece solo después de esa confirmación.
- Ventas requiere Fecha, Producto y al menos una medida: Cantidad vendida o Valor de la venta; no exige ambas.
- Cliente, Comercial / vendedor y Utilidad usan la misma tarjeta y su sección conserva el estado abierto hasta que la persona la cierre.
- Contador dinámico de datos principales pendientes.
- Medida de ventas flexible: cantidad, valor total o valor calculado como cantidad × precio.
- Clasificación explícita de hojas como ventas, inventario, complementaria o desconocida.
- Detección de caída reciente sostenida en ventas.
- Priorización reproducible por impacto, urgencia, alcance y confianza.
- Pregunta adaptativa solo cuando una caída prioritaria necesita contexto adicional.
- Calidad respaldada por cantidades y porcentajes calculados.
- La pantalla **Esto muestran tus datos** explica cifras, gráficos y prioridad con unidades y lenguaje cotidiano.
- Batería automatizada de 50 casos en `tests/run-tests.js`, incluidos los diez escenarios obligatorios de la Etapa 3.

## Calidad de la información en la Etapa 3

El porcentaje es determinístico y reproducible:

- 35 % completitud: información necesaria disponible para el alcance completo.
- 30 % validez: fechas, cantidades, valores y existencias que pueden utilizarse.
- 20 % consistencia: registros repetidos, valores imposibles y relación entre ventas e inventario.
- 15 % cobertura: cantidad de registros, periodo observado y meses con información.

Los niveles son **Alta** entre 85 % y 100 %, **Media** entre 65 % y 84 %, y **Baja** entre 0 % y 64 %. Los gráficos monetarios solo se muestran cuando al menos 70 % de los registros tiene un valor utilizable; si no, la aplicación usa cantidades cuando alcanzan ese mismo nivel. Un mes sin registros nunca se convierte automáticamente en ventas iguales a cero.

## Reglas de seguridad analítica

- Solo ventas: puede analizar cambios y concentración; no afirma inventario acumulado ni faltantes.
- Solo inventario: informa existencias y cobertura de costo; no afirma ventas, rotación ni productos de bajo movimiento.
- Información parcial: reduce la completitud y limita el alcance de las conclusiones.
- Información insuficiente: detiene la recomendación y explica qué falta.
- La interpretación semántica no calcula cifras; los cálculos y la priorización son determinísticos.
- La decisión final corresponde al empresario.

## IA opcional y secretos

`ai-interpreter.js` funciona en modo local por defecto. Puede consultar un servicio remoto propio únicamente si se configura una URL HTTPS pública.

**No se guardan API keys, tokens, contraseñas ni secretos en el repositorio ni en el navegador.** Si se conecta un proveedor de IA, la credencial debe existir exclusivamente como variable de entorno de una función serverless. Ante error, timeout o respuesta inválida, la aplicación vuelve al modo local.

Consulta [ARQUITECTURA_IA.md](ARQUITECTURA_IA.md) antes de habilitar ese servicio.

## Privacidad

- Los archivos se procesan en el navegador.
- El modo local no envía ni almacena archivos.
- El dictado usa la capacidad disponible del navegador y San José no conserva el audio.
- Para pruebas deben utilizarse datos ficticios o anonimizados.
- Si se habilita IA remota, deben enviarse solo metadatos y muestras mínimas anonimizadas.

## Desarrollo y pruebas

No hay proceso de compilación. Para ejecutar las pruebas automatizadas:

```powershell
node tests/run-tests.js
```

Archivos principales:

- `index.html`: estructura y landing.
- `app.js`: recorrido, carga, cálculos, calidad y priorización.
- `ai-interpreter.js`: adaptador remoto opcional y fallback local.
- `overrides.css`: identidad visual y diseño adaptable.
- `assets/logo-san-jose-v3.png`: logo oficial proporcionado.
- `tests/run-tests.js`: cincuenta pruebas reproducibles.
- `RESULTADOS_PRUEBAS.md`: evidencia consolidada de QA.

## Limitaciones actuales

- El estado se pierde al actualizar la página; esto evita conservar datos empresariales.
- La precisión de la carga depende de que cada hoja tenga encabezados y al menos una fila.
- No analiza devoluciones, pedidos pendientes, ventas perdidas ni estacionalidad externa.
- No calcula rentabilidad si no existen costos confiables.
- La transcripción por voz depende del soporte y permisos del navegador.
- El endpoint remoto de IA no forma parte de este repositorio.
