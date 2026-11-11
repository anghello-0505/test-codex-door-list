# Revocación de entradas

## Contrato y casos críticos

La administradora de un evento puede revocar únicamente una entrada `valid`, indicando un motivo de 1 a 1000 caracteres. El motivo se comunica al correo del titular del registro, aunque el comprador sea otra persona. Revocar no libera el cupo ni permite reactivar la entrada.

El contrato es `POST /api/organizador/eventos/[id]/entradas/[registrationId]/revocar`, con sesión Bearer y JSON `{ reason: string }`. El éxito devuelve `{ ticketStatus: "revoked", reason, emailStatus }`; la aceptación del proveedor no acredita recepción en la bandeja del titular.

Antes de integrar la UI se contemplan estos casos:

- Éxito: autorización de la propietaria, bloqueo del boleto, cambio de estado y creación del aviso en una transacción.
- Rechazo: sesión vencida/revocada, cuenta de staff, evento ajeno, motivo vacío o excesivo y boleto usado o revocado históricamente sin aviso. No se modifica nada.
- Concurrencia: escaneo y revocación compiten por el mismo bloqueo; gana una transición desde `valid`. Dos revocaciones con el mismo motivo recuperan el mismo aviso; otro motivo devuelve conflicto.
- Fallo técnico: sin configuración de correo se rechaza antes de revocar; tras confirmar la transacción, un fallo de correo conserva la revocación y permite reintentar el aviso.
- Resultado incierto: un timeout usa el mismo identificador de aviso y payload al reintentar. Tras 23 horas de incertidumbre se requiere revisión para evitar duplicar fuera de la ventana de idempotencia del proveedor.
- Cambio de cuenta: el formulario se desmonta al cambiar la sesión y los endpoints vuelven a comprobar autorización. La sesión de Auth debe existir todavía en el servidor.
- Horario: la revocación administrativa no depende del horario de acceso ni de que el evento esté publicado. La admisión sigue comprobando el estado actual.
- Cascadas: al eliminar evento, registro o cuenta propietaria se elimina el aviso pendiente asociado. Una entrega que ya comenzó puede llegar al proveedor aunque la entrada se elimine durante la llamada; un correo aceptado no puede retirarse.

## Uso y configuración

En `/dashboard/eventos/[id]`, busca el registro en **Asistentes registrados** y pulsa **Revocar entrada** en la columna **Estado y acciones**. Escribe el motivo que recibirá el titular y pulsa **Confirmar revocación**. Las entradas usadas y revocadas no ofrecen esta acción.

La misma columna conserva el motivo y el estado del aviso. **Comprobar y reintentar aviso** recupera el aviso existente y puede volver a enviarlo después del intervalo mínimo de un minuto. El bloqueo de envío dura tres minutos. Si se pierde la respuesta, conserva el motivo y reintenta la misma operación. Una entrada revocada históricamente sin motivo no genera un aviso nuevo ni admite modificar su motivo.

Se requieren `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` y `RESEND_FROM_EMAIL`, además de las variables públicas de Supabase. El remitente debe estar habilitado por Resend. El correo incluye titular, evento, motivo y la indicación de que la entrada ya no permite ingresar; no adjunta un nuevo QR.

El primer intento se ejecuta desde la petición de revocación. La tarea persistente permite recuperarla desde el panel si el proceso termina o el proveedor falla; no hay un trabajador periódico nuevo. Un aviso en `review` exige revisar la entrega en el proveedor antes de decidir una actuación manual.

## API y seguridad

- `200`: revocación confirmada; `emailStatus` puede ser `pending`, `sending`, `accepted`, `failed` o `review`.
- `400`: IDs, motivo o JSON inválidos; `413`: tamaño declarado mayor de 8 KiB. El lector también limita el cuerpo real a 8 KiB y rechaza campos adicionales.
- `401`: sesión ausente, no válida o revocada; `404`: entrada o evento inaccesibles; `409`: entrada usada, revocación histórica o motivo diferente; `503`: configuración o fallo técnico. Los errores conservan `{ error: string }` sin datos del proveedor.
- La RPC vuelve a comprobar cuenta estándar, sesión activa en `auth.sessions`, propiedad del evento y estado del boleto. Los identificadores de titular, destinatario y organizadora no se aceptan del cliente.
- `ticket_revocations` tiene RLS, lectura exclusiva de su propietaria y ninguna escritura directa para `authenticated`. Solo `service_role` puede reclamar, iniciar y finalizar avisos. La clave de servicio permanece en código de servidor.
- Se retiró el permiso de la RPC antigua `cambiar_estado_ticket` para `authenticated`, evitando revocar sin motivo ni aviso.
- El detalle del evento añade el estado del ticket y `revocation?: { reason, emailStatus }` a cada registro; los contratos HTTP usan camelCase.

## Migración y verificaciones

`supabase/migrations/20261111032934_ticket_revocations.sql` se creó localmente, se revisó y **se aplicó** por MCP al proyecto `door-list-data-base` (`fhyngffqlqyqlmlbuyda`), con versión remota `20261111032934`. La versión local quedó alineada con el historial remoto. No se instalaron dependencias; la CLI no estaba disponible en PATH ni en caché.

La migración crea la tabla y sus índices de boleto único y organizadora, la política RLS, la RPC transaccional de revocación y las tres RPC de entrega. Las referencias a boleto y propietaria eliminan el aviso en cascada. Motivo, destinatario y contenido del aviso no se editan mediante contratos públicos.

Verificaciones ejecutadas:

- `node --test tests/ticket-revocation.test.mjs tests/revoke-ticket-control.test.mjs tests/organizer-dashboard.test.mjs`: 17/17 aprobadas. Incluyen contratos, errores seguros, destinatario titular, idempotencia de entrega, UI válida/usada/revocada, respuesta perdida y descarte al desmontar.
- `supabase/tests/ticket_revocations.sql`: aprobada en el proyecto autorizado con fixtures sintéticos y `rollback`; comprobó `valid` exclusivamente, rechazo de ajenos y sesiones revocadas, idempotencia, motivo inmutable, exclusión de reclamaciones repetidas, payload fijo, revisión tras incertidumbre de 23 horas, permisos, RLS y cascada.
- Regresión Node final: 83/83 aprobadas. `npm run lint`, `npx tsc --noEmit` y `npm run build`: aprobados. El primer build encontró `EPERM` en un subdirectorio generado de `.next/static` de OneDrive; tras confirmar que no había servidor y retirar únicamente ese artefacto, el build terminó correctamente.
- Regresiones SQL `supabase/tests/staff_members.sql` y `supabase/tests/organizer_event_access.sql`: aprobadas con `rollback`. Se actualizaron sus comprobaciones/fixtures para no depender del permiso retirado de la RPC antigua.
- Asesores de seguridad y rendimiento consultados después de la migración: sin hallazgos sobre los objetos nuevos. Persisten avisos previos fuera del alcance, entre ellos RPC públicas existentes, protección de contraseñas filtradas deshabilitada e índice de asignaciones de staff. Referencias: [seguridad](https://supabase.com/docs/guides/database/database-linter) y [contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

No se envió correo real ni se acreditó recepción en bandeja; el proveedor se simuló en pruebas. No se controló el navegador ni se realizó revisión visual de anchos o foco; se revisaron código, estados, etiquetas y comportamiento mediante pruebas. La competencia entre escaneo y revocación se protege con el mismo bloqueo del ticket; no se ejecutó una carrera con conexiones simultáneas.
