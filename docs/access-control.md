# Control de ingreso: etapa 2

## Uso

La organizadora consulta su enlace fijo desde **Personal de acceso → Consultar enlace fijo** y lo comparte con el equipo. El enlace identifica la organización, pero exige usuario y contraseña. Los nombres de usuario se normalizan con las reglas de la etapa 1 y pueden repetirse entre organizadoras.

El personal inicia sesión en `/acceso/[identificador]`, elige uno de sus eventos disponibles y activa la cámara o introduce los 64 caracteres del código. Enter y el botón envían el mismo validador. El QR inicia automáticamente la solicitud; después se detiene la cámara. El resultado permanece visible hasta pulsar **Escanear siguiente**. Una confirmación muestra titular, tipo y momento del ingreso. No se permite reingreso ni validación sin servidor.

Los eventos no publicados o fuera de horario se muestran sin acción de ingreso. La ventana comienza a las 00:00 del día local del evento y termina, de forma exclusiva, a medianoche del día siguiente más el margen. La zona persistida es `America/Guatemala`. Crear/editar evento permite un margen de 0 a 12 horas, en pasos de 30 minutos, inicialmente 2 horas. La hora del teléfono no autoriza operaciones.

**Historial de ingreso** muestra ingresos y rechazos de la propia organizadora. Permite filtrar por evento —incluidos eliminados— y resultado, con páginas de 50 filas mediante cursor. El detalle de cada evento enlaza a su historial. Los registros de auditoría sobreviven a la eliminación de eventos y boletos.

## Autenticación y permisos

Se conserva Supabase Auth y las identidades `<uuid>@staff.invalid`. Las altas siguen bloqueadas; el login operativo resuelve organización/usuario en servidor, comprueba la identidad y retira el bloqueo individual con Admin Auth antes de comprobar la contraseña. No se ejecuta una habilitación masiva. Una cuenta no lista, desactivada o eliminada no es habilitable por el login.

La habilitación y la comprobación de contraseña no son una transacción distribuida. Antes de devolver tokens, la RPC comprueba nuevamente los datos persistidos. Ante un fallo de Auth la respuesta es recuperable, sin conceder permisos operativos. Reactivar en el panel no desbloquea Auth por sí mismo. Restablecer contraseña invalida accesos anteriores antes de llamar al proveedor y vuelve a solicitar el bloqueo; el siguiente login elegible puede retirarlo.

El cliente operativo usa almacenamiento `sessionStorage` y una clave diferente a la cuenta normal. Los tokens de Auth son credenciales del SDK: nunca se guardan en auditoría ni logs. Se conservan las restricciones de la etapa 1 sobre compra, organización y consulta de datos privados. Los endpoints verifican Bearer con `getUser`; PostgreSQL deriva el personal de `auth.uid()` y comprueba los metadatos administrados actuales, la identidad técnica, cuenta activa y relación de organización.

La sesión operativa está ligada a `auth.sessions.id`, verifica `created_at` contra `access_invalid_before`, `not_after` y existencia de la sesión real. No usa `iat` del JWT para recuperar acceso después de una renovación. Termina a los 30 minutos desde la actividad registrada por el servidor. Interacciones explícitas y nuevas validaciones cuentan; consultas automáticas, recuperación, foco, cámara abierta y refresh del SDK no cuentan. La RPC de actividad no revive una sesión vencida; volver a iniciar con el mismo `session_id` tampoco. El logout revoca la sesión operativa antes de intentar cerrar Auth.

## Persistencia y atomicidad

Migraciones versionadas y aplicadas con autorización en desarrollo:

- `supabase/migrations/20261110061418_ticket_access_control.sql`: estructuras, restricciones, funciones y políticas de la etapa.
- `supabase/migrations/20261110061553_access_audit_cascade_integrity.sql`: difiere la comprobación de la FK al boleto hasta el final de la transacción para permitir ambas rutas de cascada al eliminar el evento.
- `supabase/migrations/20261110064319_access_confirmed_rejections.sql`: distingue el resultado histórico confirmado de una denegación de autorización actual al recuperar una operación.
- `supabase/migrations/20261110064939_access_audit_foreign_key_indexes.sql`: cubre las referencias anulables de evento y boleto para evitar recorridos completos de auditoría durante las cascadas.

La CLI creó inicialmente los archivos locales; sus nombres se alinearon después con las versiones asignadas por MCP. El contenido de la primera migración aplicada no se reescribió para ocultar la corrección.

- Agrega `access_time_zone` y `access_grace_minutes` a `events`, con valores por defecto y restricciones.
- `organization_access_links`: una ruta fija por propietaria, identificador aleatorio de 32 bytes generado mediante pgcrypto.
- `staff_access_sessions`: sesión de Auth, personal y actividad/revocación. Sin acceso directo del navegador.
- `ticket_validation_attempts`: resultado, motivo, responsable, referencias históricas y datos mínimos de confirmación. Sin código completo, correo del titular, contraseña o tokens. Usa SHA-256 del código para vincular reintentos.
- `private.access_rate_limits`: contadores persistidos para login, validación y recuperación; limpieza oportunista limitada y sin esperar por filas bloqueadas.

RLS limita enlaces y auditoría a su propietaria y exige cuenta estándar vigente. No hay permisos de escritura directa para personal. Wrappers públicos `SECURITY INVOKER` delegan a funciones privadas con `search_path` vacío y permisos explícitos. La resolución de usuario solo es ejecutable con `service_role`; las validaciones se ejecutan con el JWT del personal, no con esa clave.

`staff_access` serializa por personal/operación y bloquea personal, sesión de Auth, sesión operativa, evento y asignación. Bloquea el boleto `FOR UPDATE`, comprueba ventana con `clock_timestamp()` después del bloqueo y actualiza únicamente si sigue `valid`. El cambio y la inserción de auditoría pertenecen a la misma transacción. Hay unicidad por personal/operación e índice único parcial de ingreso exitoso por referencia del boleto. Un error de auditoría revierte el consumo.

El código ajeno a un evento e inexistente tienen la misma respuesta. Solo se devuelven estados específicos de boletos dentro del evento autorizado. Las denegaciones atribuibles a una identidad persistida del contexto se registran sin exponer datos ajenos. Cuerpos inválidos antes de procesar, credenciales no verificables, límites y fallos técnicos no generan rechazos ficticios de boletos.

La RPC anterior `cambiar_estado_ticket` ahora admite exclusivamente `revoked`; solicitar `used` devuelve `datos_invalidos`. La revocación y las reglas de capacidad permanecen. No se reconstruye evidencia histórica para entradas utilizadas antes de esta migración. La consulta pública por código secreto mantiene su comportamiento, pero el escáner no la utiliza.

## API

Contratos compartidos en `src/lib/domain.ts`, camelCase y errores `{ error: string }`. Respuestas privadas sin caché ni mensajes crudos del proveedor.

| Método y ruta | Contrato |
| --- | --- |
| `POST /api/organizador/acceso` | Asegura idempotentemente enlace propio; devuelve `{ path }` |
| `POST /api/acceso/[identificador]/sesion` | `{ username, password }` → `{ session, tokens: { accessToken, refreshToken } }` |
| `GET /api/acceso/[identificador]/sesion` | Identidad operativa, `expiresAt`, `serverTime`; no renueva actividad |
| `DELETE /api/acceso/[identificador]/sesion` | Revoca sesión operativa y cierra sesión local de Auth |
| `POST /api/acceso/[identificador]/actividad` | Renueva sesión vigente por interacción explícita; no recibe hora del cliente |
| `GET /api/acceso/[identificador]/eventos` | `{ events, serverTime }`; eventos con disponibilidad, `opensAt`, `closesAt` |
| `POST /api/acceso/[identificador]/validaciones` | `{ eventId, code, operationId, source }` → resultado confirmado o error funcional |
| `GET /api/acceso/[identificador]/validaciones/[operationId]?eventId=…` | Recupera operación propia bajo autorización actual |
| `GET /api/organizador/validaciones` | Filtros `eventId`, `result`, `cursor`; `{ entries, nextCursor }` |
| `GET /api/organizador/validaciones?view=events` | Opciones propias de eventos actuales y eliminados con auditoría |

Éxito de validación: `{ operationId, result: "accepted", holderName, ticketTypeName, validatedAt, replayed }`. HTTP 400: datos inválidos; 401: sesión/credenciales; 403/404: acceso; 409: boleto usado/revocado, ventana/estado o clave incompatible; 429: límite; 503: fallo operativo.

## Idempotencia y pérdida de conexión

Antes del envío se persisten únicamente organización implícita en la clave, personal, evento, UUID de operación y huella del código. Una respuesta perdida no autoriza ni rechaza el ingreso. El lector permanece detenido y exige comprobar la operación o releer **la misma entrada** con la misma clave. Otra entrada no puede ocupar esa operación pendiente.

La recuperación sin fila confirmada responde **202 `{ result: "unconfirmed" }`**: no equivale a un boleto rechazado ni garantiza que no exista una transacción en curso. Un reintento concurrente espera por el bloqueo idempotente y devuelve el resultado original. Mismo UUID con otro código/evento devuelve 409. Cambiar cámara/manual al reintentar no cambia el origen histórico inicial.

El mismo miembro puede recuperar el resultado después de un nuevo login o de cerrar la ventana, mientras conserve autorización actual al evento. La UI identifica el resultado como **Ingreso confirmado previamente**. Si perdió autorización o se eliminó el evento, la organizadora debe consultar el historial. No se reabre el ingreso ni se altera un boleto para recuperar evidencia.

Los rechazos leídos de una fila de auditoría incluyen la cabecera `X-Access-Operation-Confirmed: true`, conservando su código HTTP y cuerpo `{ error }`. Permite cerrar una operación rechazada originalmente por sesión vencida después de un nuevo login. Una denegación de la sesión actual no recibe esa cabecera y no permite asumir el resultado pendiente.

## Límites y conservación

Login: 10 intentos por organización/usuario cada 15 minutos y protección global de 600/minuto. Nuevas validaciones: 120/minuto por miembro. Recuperación: 120/minuto por sesión. Un duplicado confirmado no crea otra fila. Los límites de Auth siguen aplicando además de estos controles.

La auditoría no tiene purga automática. Sus índices permiten consultar por organizadora, evento y fecha. Los nombres del responsable/evento y, en ingresos exitosos, titular/tipo se conservan como evidencia mínima. El historial no incorpora estadísticas avanzadas.

## Verificación y despliegue

El proyecto remoto de desarrollo/pruebas es `fhyngffqlqyqlmlbuyda`. **Las cuatro migraciones de Etapa 2 están aplicadas**, después de aprobar expresamente la aplicación y las pruebas. No se habilitó ninguna identidad existente. Las identidades de prueba fueron creadas, habilitadas y eliminadas únicamente dentro del script autorizado. Se comprobó después de limpiar que seguía existiendo una cuenta original de personal y continuaba bloqueada, sin enlaces, sesiones operativas ni auditoría de los fixtures.

Verificaciones locales ejecutadas: **67 pruebas aprobadas**, ESLint aprobado, TypeScript con `--noEmit --incremental false` aprobado y build de producción aprobado. Los ejecutores requirieron salir del sandbox por `spawn EPERM`. Un build posterior encontró un directorio generado de `.next/static` marcado por OneDrive como punto de reanálisis; se limpió únicamente ese directorio, tras comprobar su ruta absoluta, y la compilación terminó correctamente. El lockfile anterior contenía JSON inválido; npm lo regeneró al instalar `@zxing/browser` 0.2.1. Se conservó la versión anterior de la dependencia ajena `@napi-rs/wasm-runtime`; no se ejecutó `npm audit fix`.

Pruebas remotas ejecutadas con autorización:

- `supabase/tests/access_control.sql`: **aprobada**. RLS/permisos, ventanas, idempotencia, rechazos, invalidación, rollback de auditoría y conservación histórica; fixtures SQL dentro de `BEGIN/ROLLBACK`, sin credenciales utilizables. La primera ejecución detectó el fallo de cascada; la suite completa pasó tras aplicar la migración correctiva.
- `supabase/tests/staff_members.sql`, `tickets.sql` y `organizer_event_access.sql`: **aprobadas** con rollback. Se adaptó la preparación privilegiada de estados `used` en las pruebas antiguas a la eliminación aprobada de esa vía de ingreso; la validación operativa real se prueba aparte.
- `scripts/verify-access-control.mjs`: **aprobada** para login real, aislamiento, concurrencia con dos sesiones de Auth distintas y distintos UUID, idempotencia, recuperación, RLS, revocación/reactivación/eliminación, restablecimiento de contraseña, logout, ventana temporal, boleto revocado e historial de organizadora. Limpieza de fixtures confirmada. El script crea dos organizadoras y dos identidades de personal sintéticas, un evento y una entrada; requiere `--project-ref`, servidor local explícito y `--allow-test-fixtures`. No envía correos. Los contadores temporales de límites pueden persistir hasta su limpieza oportunista; no contienen contraseñas ni QR completos.
- La última ejecución también aprobó vencimiento por inactividad y recuperación de su rechazo histórico tras un nuevo login, conservando HTTP 401 y la marca de resultado confirmado. Se adelantó la inactividad únicamente sobre las sesiones sintéticas del script; no se esperaron físicamente 30 minutos.
- Comando explícito después de aprobar aplicación de migración y fixtures: `node --env-file=.env.local scripts/verify-access-control.mjs --project-ref=fhyngffqlqyqlmlbuyda --base-url=http://localhost:3000 --allow-test-fixtures`.

Docker está instalado, pero su motor no está disponible: las pruebas de base de datos se ejecutaron en el proyecto remoto autorizado. La concurrencia se verificó con solicitudes simultáneas de dos sesiones reales, no mediante mocks ni dos teléfonos físicos.

Revisión visual: fixtures etiquetados como sintéticos, renderizados desde los componentes reales y CSS compilado en viewports de 390 y 1440 px mediante Edge nativo. Se inspeccionaron acceso, resultados, incertidumbre, errores de cámara y tabla; la página real compilada cargó y el foco por Tab llegó al campo de contraseña con outline visible. El detector de Impeccable devolvió `[]`. El revisor independiente emitió `ship` limitado a composición/copy de fixtures y accesibilidad de fuente; no certificó contraste calculado, todas las interacciones reales ni scroll del historial móvil. No se modificó la identidad visual.

Cámara física en Safari/iPhone y Chrome/Android requiere HTTPS y dispositivos y **sigue pendiente**. Las capturas de cámara vacía y errores simulados no acreditan decodificación física ni permisos reales. Tampoco se acreditó conformidad integral de accesibilidad. La instalación de npm reportó siete avisos moderados; no se aplicaron correcciones automáticas ajenas al alcance.

Advisors de Supabase: las tablas de sesiones y contadores tienen RLS sin políticas como denegación deliberada de acceso directo. Permanecen avisos preexistentes sobre RPC públicas `SECURITY DEFINER` y protección de contraseñas filtradas desactivada; no se alteró configuración global de Auth ni esas capacidades públicas. Referencias: [RLS sin políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [funciones privilegiadas públicas](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [protección de contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Advisors de rendimiento confirmó que las dos FK nuevas de auditoría ya tienen índices; queda un aviso de FK ajeno a estas estructuras. Los avisos informativos de índices todavía sin uso no justifican retirarlos en un entorno con fixtures recién limpiados. La consulta final confirmó `staffCount=1`, `bannedStaffCount=1`, enlaces/sesiones operativas/auditoría de prueba en cero y ausencia de permiso `TRUNCATE` del rol autenticado sobre los contadores.

Aplicar primero el SQL versionado revisado, ejecutar pruebas aprobadas, desplegar aplicación y habilitar una cuenta existente solo con autorización. La aplicación no se desplegó en esta ejecución. Si se retira la UI, conservar las restricciones de personal y auditoría. No distribuir una reversión destructiva ni devolver la vía antigua de ingreso sin auditoría.

## Archivos afectados

- Flujo operativo y lector: `src/app/acceso/[identificador]/page.tsx`, `access-workspace.tsx` y `camera-scanner.tsx` en esa carpeta; rutas de sesión, actividad, eventos, validación y recuperación bajo `src/app/api/acceso/`.
- Lógica y contratos: `src/lib/access-server.ts`, `access-control.ts`, `domain.ts`, `staff-auth.ts`, `staff-members-server.ts`, `organizer-events.ts`, `persistence-mappers.ts` y `src/lib/supabase/access-client.ts`.
- Panel: `src/app/(workspace)/organizador/page.tsx`, `organizador/asistentes/page.tsx` y su `access-link.tsx`, `organizador/validaciones/`, el detalle `dashboard/eventos/[id]/page.tsx` y `src/components/admin-navigation.tsx`. Nuevas rutas administrativas en `src/app/api/organizador/acceso/` y `validaciones/`.
- Persistencia y pruebas: las cuatro migraciones indicadas, `supabase/tests/access_control.sql`, actualización de `tickets.sql` y `organizer_event_access.sql`, `tests/access-control.test.mjs`, `tests/staff-auth.test.mjs` y el script de integración.
- Configuración/documentación: `next.config.ts`, `package.json`, `package-lock.json`, `PRODUCT.md`, `README.md`, este archivo, `docs/staff-members.md` y `docs/qr-server-and-scanner.md`. `DESIGN.md` no cambió; la evidencia visual local permanece ignorada en `.impeccable/`.
