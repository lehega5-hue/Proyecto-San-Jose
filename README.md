# San José – Transformación Estratégica · MVP V3

San José recibe la información que una pequeña empresa ya utiliza y muestra qué debería atender primero.

> **Tus datos te muestran qué atender primero.**

**ARCHIVO → COMPRENSIÓN → EVIDENCIA → PRIORIDAD → 3 ACCIONES**

## Qué demuestra esta versión

El MVP se concentra únicamente en **ventas e inventario**:

1. recibe uno o varios archivos Excel o CSV;
2. inspecciona todas las hojas;
3. identifica ventas, inventario e información adicional;
4. propone correspondencias de columnas y muestra su confianza;
5. calcula calidad y cifras con código determinístico;
6. presenta un hallazgo principal, dos secundarios y tres acciones.

No hay login, backend, base de datos, pagos ni almacenamiento de archivos.

## Cómo abrirlo

Desde la carpeta del proyecto ejecuta **python -m http.server 8765** y abre **http://localhost:8765/**.

También puede abrirse **index.html** directamente, aunque algunos navegadores aplican restricciones adicionales a archivos locales.

## Recorrido

1. **Cuéntanos lo esencial:** tres preguntas obligatorias y una cuarta condicional.
2. **Sube tu información:** una sola zona admite uno o varios archivos XLSX, XLS o CSV.
3. **Mira qué atender primero:** calidad explicada con cifras y una prioridad dominante.
4. **Sigue un plan sencillo:** Hoy, Esta semana y En 14 días.

Casos ficticios:

- Caso A: productos almacenados que casi no se venden.
- Caso B: gran parte de las ventas depende de pocos productos.
- Caso C: información insuficiente; el análisis debe detenerse.

## Analista San José

El componente **AIDataInterpreter**, en **ai-interpreter.js**, tiene dos modos:

- **remote-ai:** servicio seguro configurado fuera de GitHub Pages;
- **local-fallback:** motor semántico local siempre disponible.

La demostración funciona sin IA externa. Si no hay endpoint, tarda demasiado o responde con JSON inválido, el fallback local toma el control.

Responsabilidades:

- IA o motor semántico: interpreta hojas y columnas.
- Código determinístico: limpia datos y calcula cifras.
- Reglas determinísticas: ordenan la importancia.
- San José: explica el resultado.
- Empresario: toma y ejecuta la decisión final.

No se guardan API keys en JavaScript. Consulta **ARQUITECTURA_IA.md** antes de conectar un servicio remoto.

## Interpretación y confirmación

Después de una carga real se muestra **Esto es lo que encontramos**:

- archivo y hoja;
- clasificación como ventas, inventario o información adicional;
- nivel de confianza;
- columna propuesta;
- ejemplo de valores.

Confianza Media o Baja solicita confirmación. Confianza Alta permanece visible y puede corregirse mediante **Cambiar interpretación**.

Clientes, proveedores, nómina, impuestos y resúmenes se clasifican como información adicional y no se analizan.

## Calidad de la información

Los niveles Alta, Media y Baja se explican con cifras calculadas:

- registros encontrados;
- porcentaje de datos esenciales completos;
- productos relacionados entre ventas e inventario;
- días cubiertos;
- valores negativos;
- cobertura de costos.

Calidad Baja detiene la recomendación y explica qué falta y qué puede hacer el empresario.

## Privacidad

- Los archivos se procesan localmente.
- No se envían ni almacenan en un servidor.
- Deben usarse datos ficticios o anonimizados.
- La decisión final y su ejecución corresponden al empresario.

## Archivos principales

- **index.html:** estructura y landing.
- **app.js:** recorrido, motor local, cálculos y priorización.
- **ai-interpreter.js:** adaptador remoto opcional y fallback.
- **overrides.css:** identidad visual y responsive.
- **assets/logo-san-jose-v3.png:** logo oficial proporcionado.
- **RESULTADOS_PRUEBAS.md:** evidencia de QA.

## Limitaciones actuales

- No conserva estado después de actualizar.
- No analiza devoluciones, pedidos pendientes, estacionalidad o ventas perdidas.
- No calcula rentabilidad si no existen costos.
- El endpoint remoto de IA no está desplegado.
- El resumen se descarga como HTML y se guarda como PDF mediante impresión.

## Si algo falla

- Recarga con Ctrl + F5.
- Confirma que cada archivo pese máximo 5 MB.
- Cada hoja debe tener encabezados y al menos una fila.
- Confirma las correspondencias de confianza Media o Baja.
- Si falta ventas o inventario, agrega la hoja o el dato que indique la aplicación.
