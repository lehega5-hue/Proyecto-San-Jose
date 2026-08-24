# ConsultorIA · un producto de San José

ConsultorIA es una demostración funcional de consultoría gerencial digital para pequeñas empresas colombianas. Convierte archivos de ventas e inventario en una prioridad sustentada, un plan de acción y una forma de comprobar si la situación mejoró.

> **Decide qué atender primero. Actúa. Mide qué cambió.**

San José – Transformación Estratégica es la firma; ConsultorIA es el producto digital.

## Abrir la aplicación

La aplicación es estática y compatible con GitHub Pages. No requiere compilación ni backend:

- Sitio público: <https://lehega5-hue.github.io/Proyecto-San-Jose/>
- Servidor local: `python -m http.server 4173` y abrir <http://127.0.0.1:4173/>

## Modelo visible del producto

- **Explora — Gratis:** una prueba, una prioridad y un plan.
- **Enfoque — COP 180.000 por ciclo:** hasta dos prioridades y dos planes, seguimiento, retroalimentación, memoria local entre ciclos y nueva carga manual.
- **Gestión — COP 300.000 al mes:** próxima fase con dos ciclos mensuales, memoria persistente, tableros, indicadores, alertas y conectores estándar ERP/POS/API.
- **Dirección — COP 500.000 al mes:** futura conversación gerencial con contexto, memoria ampliada y bolsa mensual de IA.

No existen cobros, conectores ni chat gerencial reales en esta versión. La interfaz los identifica como **Próximamente** o **Disponible en Gestión/Dirección**.

## Recorrido funcional

1. **Probar gratis** abre Explora sin solicitar cuenta ni contraseña.
2. Contexto breve del negocio y comentario libre opcional.
3. Carga manual de XLS, XLSX o CSV, o uso del ejemplo ficticio incluido.
4. Revisión y corrección del tipo de cada hoja y de las columnas identificadas.
5. Validación calculada de calidad y construcción del conjunto canónico.
6. Diagnóstico reproducible de Ventas, Inventario o ambos.
7. Explora presenta una prioridad y un plan; Enfoque presenta hasta dos.
8. Registro de avance, retroalimentación y resultado del ciclo.
9. Cierre de Explora con continuidad hacia Enfoque; sin cobro real.

**Iniciar sesión** permanece como un flujo separado para recuperar el progreso del único usuario ficticio de demostración.

El principio de funcionamiento es: **IA entiende → Código calcula → ConsultorIA explica → Empresario ejecuta → Resultado se mide.** La interpretación semántica no calcula resultados ni decide por el empresario.

## Dominios

- Ventas: disponible.
- Inventario: disponible.
- Cartera de clientes: próximamente.
- Cuentas por pagar a proveedores: próximamente.
- Gastos: próximamente.
- Caja: próximamente.

## Persistencia y memoria

Explora anónimo utiliza únicamente el estado interno de la página. No crea una cuenta, no guarda contraseñas y no escribe su avance en `localStorage`. El avance se pierde al cerrar o recargar la página.

El progreso del usuario demo autenticado se conserva en `localStorage`, bajo la clave `sanJose.users.demo-san-jose`. Incluye contexto, estado del recorrido, decisiones de interpretación, ciclos, planes y retroalimentación. El flujo anónimo no lee, modifica ni elimina ese historial. No existe una base de datos ni memoria multiusuario.

Esta memoria es local al navegador: no se sincroniza entre equipos, puede perderse al borrar los datos del sitio y no debe utilizarse con información empresarial sensible. Gestión y Dirección necesitarán autenticación y persistencia segura en servidor antes de trabajar con usuarios reales.

## Login de demostración

El acceso actual es una simulación del frontend. El correo ficticio y el hash de su contraseña están en el JavaScript entregado al navegador, por lo que no constituyen seguridad real. No dan acceso a APIs, bases de datos ni servicios externos. Las credenciales no se muestran en la interfaz.

Antes de admitir usuarios reales se requiere autenticación del lado servidor, sesiones seguras, recuperación y rotación de credenciales, aislamiento por empresa, autorización, trazabilidad y políticas de retención y eliminación.

## Privacidad e interpretación remota

- Los archivos se procesan localmente en el navegador.
- El modo semántico local no envía ni almacena archivos.
- El dictado depende del navegador; ConsultorIA no conserva el audio.
- El adaptador remoto está desactivado por defecto y solo admite una URL HTTPS propia.
- La solicitud remota excluye filas, nombres de archivo, nombres de hoja, encabezados originales y contexto empresarial. Solo usa identificadores efímeros y señales estructurales no identificables.
- Una respuesta remota inválida, parcial o incompatible restaura exactamente la interpretación local.
- Las credenciales de un proveedor deben existir únicamente como variables de entorno de una función serverless.

Consulta [ARQUITECTURA_IA.md](ARQUITECTURA_IA.md) antes de habilitar un servicio remoto.

## Seguridad analítica

- Ausencia de información no se convierte en cero.
- Solo Ventas no produce afirmaciones de Inventario.
- Solo Inventario no produce afirmaciones de Ventas.
- Las relaciones entre dominios exigen referencias de producto compatibles y cobertura suficiente.
- Información insuficiente detiene recomendaciones no sustentadas.
- Los cálculos, la calidad y la prioridad son determinísticos.
- La decisión final y la ejecución corresponden al empresario.

## Desarrollo y pruebas

No hay proceso de build. Para ejecutar la suite:

```powershell
node tests/run-tests.js
```

Archivos principales:

- `index.html`: landing, acceso y estructura base.
- `app.js`: flujo, persistencia, carga, análisis, planes y PDF.
- `ai-interpreter.js`: interpretación semántica opcional y fallback local.
- `overrides.css`: identidad visual y responsive.
- `landing-motion.js`: animaciones sobrias de la landing.
- `assets/`: logos y librerías locales para Excel y PDF.
- `tests/run-tests.js`: suite funcional reproducible.

## Limitaciones actuales

- El login no ofrece seguridad de producción.
- La memoria existe solo en el navegador del usuario demo.
- No hay pagos, backend, conectores, chat gerencial ni analítica de nuevos dominios.
- La carga depende de hojas con encabezados y filas utilizables.
- No calcula rentabilidad si no hay costos o utilidad confiables.
- La voz depende del soporte y permisos del navegador.
- La revisión visual responsive y la descarga deben comprobarse en el navegador antes de cada publicación.
