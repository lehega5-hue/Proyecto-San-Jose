# Resultados de pruebas · San José

Fecha: 8 de agosto de 2026.

Entorno: Chromium integrado, Node.js 24 incluido en Codex y servidor HTTP estático local.

## Resultado

**10 de 10 pruebas automatizadas aprobadas.** La demostración visible utiliza un único ejemplo de ventas; los controles técnicos restantes usan datos creados dentro de la prueba y no aparecen en la interfaz.

Comando reproducible:

```powershell
node tests/run-tests.js
```

## Pruebas solicitadas

| Prueba | Resultado | Evidencia técnica |
|---|---|---|
| VOZ 1 · Hablar durante 30 segundos | Aprobada | `continuous` permanece activo y un fin automático reinicia el reconocimiento mientras `isListening` sea verdadero. |
| VOZ 2 · Hacer pausas breves | Aprobada | El evento `no-speech` conserva el modo escucha y `onend` reinicia la sesión. |
| VOZ 3 · Pulsar Terminar | Aprobada | Cambia `isListening` a falso, ejecuta `stop()` y conserva la transcripción en el textarea. |
| VOZ 4 · Iniciar nuevamente | Aprobada | El segundo dictado se agrega al texto previo sin borrarlo. |
| DEMO 1 · Seleccionar ejemplo de ventas | Aprobada | Existe un único dataset visible, contiene 12 ventas de seis meses y cero registros de inventario. |
| DEMO 2 · Continuar sin inventario | Aprobada | Produce Calidad Media, prioriza una caída sostenida de 30 % y mantiene inventario en cero. |

## Comprobaciones internas de regresión

| Prueba | Resultado |
|---|---|
| Calidad parcial | Nunca supera 78 ni se presenta como Alta. |
| Priorización | Conserva la fórmula determinística de impacto, urgencia, alcance y confianza. |
| Columna esencial ambigua | Elegir “No sé” mantiene bloqueado el análisis de una carga real. |
| Columna opcional ausente | No bloquea una carga real con datos esenciales completos. |

## Recorrido observado

### Dictado

- Estado inicial: **🎙️ Empezar a hablar**.
- Estado activo: **■ Terminar** y “Te estamos escuchando…”.
- Configuración: español de Colombia, resultados intermedios y escucha continua.
- Una pausa breve no termina el modo escucha.
- Si el navegador finaliza el reconocimiento, se reinicia solo mientras el usuario no haya pulsado Terminar.
- Al terminar, el texto permanece editable y se muestra el mensaje de confirmación solicitado.
- Permiso rechazado y micrófono no disponible muestran mensajes diferentes y nunca bloquean el formulario.
- Sin soporte de `SpeechRecognition`, el botón permanece oculto y el textarea funciona normalmente.

### Ejemplo de ventas

- La interfaz muestra únicamente **Probar con un ejemplo**.
- Nombre: **Ejemplo de ventas**.
- Acción: **Probar con ejemplo de ventas**.
- La aplicación informa que encontró ventas y no inventario.
- Pregunta si el usuario desea continuar solo con ventas.
- Permite analizar ventas o agregar inventario.
- El resultado analiza tendencia, productos relevantes y concentración sin afirmar existencias, acumulación ni faltantes.

## Validaciones técnicas

- `app.js` y `ai-interpreter.js` pasan `node --check`.
- Las diez pruebas pasan en `tests/run-tests.js`.
- `git diff --check` no reporta errores de espacios.
- El escaneo no encuentra API keys, access tokens, client secrets ni contraseñas incrustadas.
- La carga de archivos reales, lectura multioja, interpretación y corrección manual no fueron modificadas.
- El motor de calidad, priorización, plan de tres acciones y retroalimentación permanecen sin cambios funcionales.
- Los recursos mantienen rutas relativas compatibles con GitHub Pages.

## Limitación de aceptación de voz

La duración, las pausas y el reinicio se verifican automáticamente simulando el ciclo estándar de `SpeechRecognition`. Antes de una prueba piloto conviene hacer además una comprobación manual de 30 segundos en Chrome o Edge con permiso de micrófono, porque la disponibilidad del servicio de reconocimiento depende del navegador y del sistema operativo.
