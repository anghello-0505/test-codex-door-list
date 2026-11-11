# Pruebas de extremo a extremo

`npm run test:e2e` ejecuta la suite HTTP de `tests/e2e/registration-to-admission.test.mjs` con el runner de Node y el cliente Supabase ya instalados. No instala dependencias y queda **omitida por defecto**. `npm test` conserva las pruebas locales existentes.

## Alcance y contratos

La suite usa la aplicación Next.js en ejecución, Auth y PostgreSQL reales, el envío configurado en la aplicación y un buzón real de Mailosaur. No sustituye rutas, RPC, persistencia ni transportes por mocks. Mailosaur es un requisito de esta suite, no una dependencia de producción; se requiere un buzón previamente disponible para pruebas.

1. Crea organizador y comprador efímeros, confirmados mediante Auth Admin, e inicia sus sesiones por contraseña. El registro de cuenta y la verificación de email quedan fuera del recorrido.
2. Crea un `Event` como borrador y un `TicketType` de aforo uno mediante el mismo cliente público autenticado que usa `/organizador`. Comprueba que el borrador no es público y rechaza el registro con `409 eventUnavailable`. Publica con el permiso del organizador bajo RLS, sin emplear service role para publicar.
3. Llama a `POST /api/registros/confirmar` con `{ eventId, ticketTypeId, name, email, idempotencyKey }`. Sin sesión espera `401 sessionRequired`; dos solicitudes concurrentes con la misma clave deben devolver el mismo `registrationId` y `ticket.code`, con una sola `Registration`. Exige `emailConfigured: true` y `Ticket.status: valid`.
4. Busca un mensaje realmente recibido por el destinatario exclusivo de la ejecución, a partir de su hora de inicio. Comprueba evento, titular destinatario, código emitido y adjunto `entrada-doorlist.pdf` con MIME PDF. Espera hasta 90 segundos con sondeo acotado; una tarea en estado `accepted` por sí sola no satisface la prueba.
5. Crea staff asignado al evento mediante `POST /api/organizador/asistentes`, obtiene el enlace con `POST /api/organizador/acceso` e inicia la sesión con `POST /api/acceso/{identificador}/sesion`.
6. Envía **el código extraído del correo** a `POST /api/acceso/{identificador}/validaciones` con `{ eventId, code, operationId, source: "camera" }`. Exige aceptación, recuperación por `GET /validaciones/{operationId}?eventId=...`, reintento idempotente y rechazo `409 accessTicketUsed` con una operación diferente. Finalmente comprueba el estado persistido `used`.

Es E2E de servicios por HTTP, no automatización de interfaz. No comprueba clics, navegación cliente, permisos de cámara, decodificación óptica del QR ni contenido binario del PDF. `source: "camera"` ejercita el contrato que recibe el resultado decodificado; no acredita uso de una cámara física. No toma control del navegador. La recepción del email sí se verifica externamente, sin confundirla con la aceptación de Resend.

## Preparación y autorización

Antes de ejecutar con servicios reales, obtener aprobación explícita para el proyecto de pruebas, las acciones y la limpieza. No apuntar a producción. La variable de habilitación registra la decisión del operador; **no sustituye esa aprobación**.

Preparar una instancia de la aplicación con todas las migraciones existentes aplicadas en el entorno autorizado y correo Resend funcional. Esta tarea no añade ni aplica migraciones. Los secretos de la instancia y del runner deben corresponder al mismo proyecto Supabase. El runner no carga `.env.local` automáticamente: inyectar las variables desde el entorno o un gestor de secretos, sin versionarlas.

| Variable | Uso |
| --- | --- |
| `DOORLIST_E2E_AUTHORIZED` | `yes` solo después de aprobar el entorno y las acciones; cualquier otro valor omite la prueba sin conexiones. |
| `E2E_BASE_URL` | URL de la aplicación de pruebas en ejecución; HTTPS salvo localhost. |
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase del runner y de la aplicación. |
| `E2E_EXPECTED_SUPABASE_URL` | URL explícitamente autorizada; debe coincidir con el origen Supabase antes de cualquier mutación. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave pública del proyecto de pruebas. |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo en el runner servidor para identidades y limpieza; también debe estar configurada en el servidor de la aplicación para staff y correo. |
| `MAILOSAUR_SERVER_ID` | Identificador del buzón de pruebas existente. |
| `MAILOSAUR_API_KEY` | Secreto para buscar, leer y eliminar exclusivamente los mensajes de esta ejecución. |

El servidor necesita además su configuración habitual de Resend (`RESEND_API_KEY`, `RESEND_FROM_EMAIL` y demás variables documentadas en `docs/environment-variables.md`). Resend debe permitir entregar al dominio del buzón. Los destinatarios usan `e2e-{uuid}@{server}.mailosaur.net`; no se envía a asistentes existentes.

Con las variables ya inyectadas y la instancia iniciada:

```powershell
# Solo después de obtener la autorización del entorno y de los fixtures.
$env:DOORLIST_E2E_AUTHORIZED = 'yes'
npm run test:e2e
Remove-Item Env:DOORLIST_E2E_AUTHORIZED
```

La fecha del evento se fija al final del día actual en Guatemala: permite registrarse para un evento futuro y validar dentro del día de acceso sin manipular relojes ni modificar registros después de emitir el boleto. La suite rechaza el inicio en los últimos cinco minutos del día antes de crear fixtures. El tiempo máximo total es cuatro minutos; cada petición HTTP tiene un límite propio.

## Fixtures, seguridad y limpieza

Cada ejecución usa UUID distintos, un organizador exclusivo, un comprador exclusivo, una contraseña aleatoria, un staff y un evento de aforo uno. La clave privilegiada solo prepara identidades y elimina estos fixtures; el comportamiento se ejerce con sesiones de usuario reales. No se imprimen cuerpos de respuestas, contraseñas ni tokens.

La limpieza se registra antes de la primera mutación y se intenta también si un paso falla: elimina mensajes del destinatario único de esta ejecución, el evento con su propietario exacto (y sus cascadas de registros, tickets y envíos), sesiones del staff, auditoría de validaciones, asignaciones, staff, enlace de acceso e identidades Auth. Las tablas sin cascada se eliminan antes de las identidades referenciadas. No vacía buzones ni tablas completas. Un fallo de limpieza hace fallar la prueba e identifica `run`, `organizerId` y `eventId` para una recuperación autorizada. Las limitaciones de borrado concurrente con una entrega aún en curso pueden exigir limpieza posterior de mensajes tardíos. Una interrupción forzada del proceso tampoco garantiza que los hooks terminen; revisar esos identificadores en el entorno autorizado.

## Verificación de esta incorporación

- `npm run test:e2e`, con ejecución real desactivada: carga correcta, una prueba omitida, cero fallos. La primera ejecución dentro del sandbox falló con `spawn EPERM`; la misma comprobación fuera del sandbox, con `DOORLIST_E2E_AUTHORIZED=no`, terminó correctamente y no accedió a la base de datos.
- `npx eslint tests/e2e/registration-to-admission.test.mjs`: aprobado.
- La integración real aún no se ejecutó: falta seleccionar y autorizar el entorno y proporcionar un buzón Mailosaur con sus secretos. No se declara probado el envío, RLS, las cascadas ni el ingreso real por el solo hecho de cargar la suite.

Referencias consultadas: [Supabase Auth por contraseña](https://supabase.com/docs/guides/auth/passwords), [Auth Admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [API de Mailosaur](https://mailosaur.com/docs/api) y documentación de Route Handlers de Next.js instalada en `node_modules/next/dist/docs/`.
