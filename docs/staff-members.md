# Personal de acceso: etapa 1

> Estado actualizado: `20261110042901_staff_members` está aplicada, verificado mediante MCP. La etapa 2 incorpora login y validación según [Control de ingreso](access-control.md), con sus cuatro migraciones aplicadas tras autorización. La administración de personal conserva el bloqueo inicial; únicamente el login operativo puede retirar el bloqueo de una identidad elegible.

## Identidad y permisos

Una cuenta normal conserva el estándar actual: puede comprar y organizar sus propios eventos. No se introduce un rol nuevo de organizadora. `StaffMember` es personal de control de acceso, independiente de `Registration` y del titular de una entrada.

Supabase Auth almacena y verifica las contraseñas. Se descartaron otro proveedor/proyecto y hashes propios porque añaden infraestructura y una superficie de seguridad innecesaria. Cada asistente recibe una identidad independiente con UUID fijo y correo técnico `<uuid>@staff.invalid`. Ese alias no es secreto, correo de contacto ni dirección de recuperación; no cambia al editar el usuario. La entrada por enlace de organizadora resuelve organizadora + usuario hacia esa identidad.

El servidor crea la identidad con `email_confirm: true`, `ban_duration: 876000h` y `app_metadata` administrados (`account_type: access_staff`, organizadora y asistente). El bloqueo se solicita en la misma llamada de creación. Este plazo es finito, no una promesa de bloqueo perpetuo; la denegación en la aplicación y base de datos es independiente. Ninguna operación administrativa de personal levanta el bloqueo, tampoco reactivar una cuenta. El login operativo de etapa 2 es la única excepción y exige una identidad lista, activa e íntegra. Confirmar este correo técnico no acredita posesión de un buzón ni modifica la verificación de las cuentas normales.

`src/lib/staff-auth.ts` concentra las operaciones privilegiadas de identidad: consultar, crear bloqueada, cambiar contraseña manteniendo el bloqueo y habilitar de forma estrecha para el login operativo. Su cliente usa `server-only`, no conserva sesiones ni recibe el token del navegador. Las rutas administrativas verifican Bearer con `getUser`, clase de cuenta vigente y propiedad antes de usarlo; el login resuelve primero una identidad elegible mediante la operación reservada al servidor. Nunca aceptan ID de organizadora, ID de Auth, correo técnico, rol o metadatos desde el formulario. Se verifica UUID + correo técnico + metadatos, y bloqueo cuando corresponde al aprovisionamiento. Una coincidencia de correo no permite adoptar otra cuenta.

Las tablas públicas tienen RLS y acceso autenticado únicamente de lectura por propietaria. Todas las escrituras pasan por RPC transaccionales con la propietaria derivada de `auth.uid()`. Los wrappers públicos son `SECURITY INVOKER`; las operaciones privilegiadas indispensables están en `private`, con `search_path` vacío, permisos explícitos y comprobación de identidad. La comprobación de cuenta estándar consulta la fila actual de Auth y la relación persistida de personal; no confía en `user_metadata` ni en roles potencialmente antiguos del JWT.

Las políticas restrictivas excluyen al personal de las tablas actuales. Las RPC `confirmar_registro`, `mis_boletos`, `cambiar_estado_ticket` y `estado_envios_entrada` incorporan el mismo control porque sus funciones privilegiadas omiten RLS. Las cuentas normales mantienen sus reglas anteriores. La consulta pública por código secreto y el catálogo continúan siendo públicos: no son permisos de organización o escaneo.

## Datos y validaciones

- `staff_members`: identidad, propietaria, nombre, usuario, actividad, eliminación lógica, reserva de creación, aprovisionamiento y fechas. No contiene contraseñas, hashes ni cuerpos de solicitudes.
- `staff_event_assignments`: relación de asistente y evento con propietaria común mediante claves foráneas compuestas. Su clave primaria impide duplicados. El reemplazo completo valida y bloquea los eventos antes de modificar relaciones; cualquier fallo revierte toda la operación.
- Usuario normalizado con trim y minúsculas; 3–32 caracteres ASCII `[a-z0-9._-]`. La unicidad por organizadora se mantiene al desactivar y se libera después de eliminar lógicamente. La identidad anterior nunca se reutiliza.
- Nombre de 1–200 caracteres, con Unicode y sin controles. Contraseña sin recortar, de al menos 8 caracteres y un máximo de 72 bytes UTF-8; el proveedor puede exigir mayor seguridad.
- Hasta 1000 asignaciones por asistente y solicitudes de hasta 64 KiB. La lectura de relaciones y eventos recorre lotes para evitar truncamientos del Data API.

Desactivar conserva asignaciones; eliminar mantiene la identidad y las relaciones históricas, pero impide nuevas modificaciones. El listado operativo excluye eliminados. Borrar un evento retira sus relaciones de personal sin borrar al asistente. `access_invalid_before` avanza al cambiar actividad, eliminar y antes de restablecer contraseña. La etapa 2 comprueba sesión vigente, fecha de creación de sesión posterior a la invalidación, cuenta lista/activa/no eliminada y asignación actual. Refrescar un JWT antiguo no recupera permisos. Sus operaciones y auditoría se documentan en `docs/access-control.md`.

## Recuperación proporcionada al alcance

La creación tiene dos sistemas con transacciones independientes. La RPC reserva una fila, un UUID y sus asignaciones con una clave de idempotencia por organizadora; después Auth crea la identidad; finalmente una RPC comprueba su correspondencia y la marca lista. Una interrupción conserva una creación pendiente y bloqueada. `Completar creación` reutiliza el UUID y nunca cambia la contraseña si la identidad ya existe. Si se desconoce la contraseña inicial, se completa la cuenta y se establece una nueva de forma explícita.

Los reintentos con la misma clave deben mantener los datos no secretos de la reserva. Eliminar una reserva pendiente no habilita una identidad que pudiera llegar a crearse después: mantiene su distinción de personal y su bloqueo. No se eliminan automáticamente identidades ante resultados inciertos.

No hay cola, cron, tabla genérica de operaciones ni copia de la contraseña para recuperar solicitudes. Un cambio de contraseña afecta al proveedor; la invalidación local se escribe primero y falla de forma segura. Si Auth no confirma el resultado, la API responde 503 `staffPasswordUnconfirmed` y pide establecerla nuevamente. No promete atomicidad distribuida ni convierte un timeout en éxito. Cambios simultáneos de contraseña siguen la última escritura aceptada por Auth; cada llamada conserva el bloqueo y nunca puede reactivar una fila eliminada. El formulario evita envíos simultáneos y descarta resultados después de cambiar de cuenta o desmontarse.

## Rutas y contratos

Pantalla `/organizador/asistentes`, botón `Agregar asistente` en el panel y enlace `Personal de acceso` en la navegación. Página Server Component y componentes cliente locales para sesión, formularios y acciones. Los estados incluyen tabla de carga, vacío, error con reintento, confirmación de desactivación y eliminación, y confirmación de reemplazo de contraseña. La tabla conserva encabezados y desplazamiento horizontal en móvil.

API bajo `/api/organizador/asistentes`:

| Método y ruta | Función |
| --- | --- |
| `GET /` | Personal propio no eliminado, 50 por página |
| `POST /` | Reservar/crear con nombre, usuario, contraseña, eventos e idempotencia |
| `PATCH /[id]` | Nombre/usuario o actividad |
| `DELETE /[id]` | Eliminación lógica |
| `POST /[id]/completar` | Completar una reserva propia |
| `POST /[id]/contrasena` | Establecer contraseña nueva |
| `PUT /[id]/eventos` | Reemplazar asignaciones de forma atómica |
| `GET /eventos` | Eventos propios, incluidos borradores y pasados |

Contratos compartidos en `src/lib/domain.ts`, camelCase y respuestas `{ error: string }` con HTTP 400/401/403/404/409/413/503 según la causa. Recurso ajeno e inexistente comparten 404. No se devuelve el objeto de Auth. Respuestas privadas sin caché. Errores españoles propios; no se registran cuerpos, tokens, contraseñas ni mensajes crudos del proveedor.

## Entorno, despliegue y reversión

El usuario identificó `door-list-data-base` (`fhyngffqlqyqlmlbuyda`, `us-east-1`) como **desarrollo/pruebas**. La configuración de la aplicación y el enlace CLI apuntan al mismo proyecto remoto principal; no se encontró una rama Supabase separada. Esta clasificación no convierte las escrituras en automáticamente autorizadas.

`supabase/migrations/20261110042901_staff_members.sql` fue creada mediante la CLI y su aplicación remota se verificó por MCP. Las migraciones nuevas requieren autorización específica según `AGENTS.md`; usar el contenido exacto versionado y volver a comprobar proyecto e historial inmediatamente antes. No usar `db push`, SQL suelto o cambios manuales de políticas para saltarse esta separación.

La migración es aditiva: dos tablas, restricciones/índices, funciones y políticas; conserva las tablas y datos existentes. Las cuatro definiciones de RPC conservan su comportamiento normal y añaden la denegación de personal. No se cambian configuración global de Auth, claves, SMTP, protección de contraseñas filtradas ni las ocho migraciones anteriores.

Para retirar la funcionalidad con datos reales, retirar los enlaces/rutas y conservar tablas, identidades bloqueadas y restricciones de personal. No quitar esas restricciones mientras existan identidades de personal, porque recuperarían permisos de cuenta normal. Una reversión física exige aprobación expresa, copia de seguridad y un entorno desechable; no se distribuye una migración destructiva automática.

## Verificación

- `npm.cmd test`: pruebas locales sin red, rutas reales con límites externos simulados; incluyen autorización, campos rechazados, creación pendiente, idempotencia, errores, bloqueo y credenciales.
- `npm.cmd run lint` y `npm.cmd run build`.
- `supabase/tests/staff_members.sql`: RLS, RPC, restricciones, aislamiento, estados, asignaciones y reutilización de usuario con fixtures y `ROLLBACK`. Requiere aprobación antes de acceder a la base.
- `node --env-file=.env.local scripts/verify-staff-auth.mjs --project-ref=fhyngffqlqyqlmlbuyda --allow-test-account`: prueba explícita que crea UNA identidad bloqueada, verifica alias/contraseña/bloqueo y la elimina; requiere aprobación separada para crear y limpiar esa identidad. No se ejecuta mediante `npm test` ni imprime credenciales.
- Revisión visual en escritorio y móvil, teclado, errores, formularios y confirmaciones. Las capturas con datos simulados no prueban RLS ni Auth real.

Fuentes consultadas: documentación instalada de Next.js 16.4.2; Context7 y [Supabase Auth admin](https://supabase.com/docs/reference/javascript/auth-admin-createuser); código de [Auth v2.197.0](https://github.com/supabase/auth/blob/v2.197.0/internal/api/admin.go); [dominio `.invalid`](https://www.rfc-editor.org/rfc/rfc2606.html). La versión de Auth en `.temp` es metadato local, no una prueba de la versión desplegada. La aceptación y el bloqueo deben confirmarse con la prueba real autorizada.
