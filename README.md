# Doorlist

La página principal muestra los eventos publicados y los cupos restantes de sus tipos de entrada. En `/organizador`, un usuario autenticado puede administrar sus eventos y tipos de entrada. La página pública `/eventos/[id]/registro` permite consultar un evento sin iniciar sesión; confirmar un boleto requiere una cuenta de comprador.

`/dashboard` lista los eventos del organizador. Cada evento abre un detalle con disponibilidad por tipo de entrada, una lista de asistentes paginada (50 por página), descarga CSV y una gráfica de registros diarios desde su publicación. La API del detalle y la exportación comprueban la sesión y la propiedad del evento y consultan con el token del usuario, respetando RLS y sin `service_role`. La gráfica diaria conserva su implementación previa, que requiere `SUPABASE_SERVICE_ROLE_KEY` solo en el servidor. Los datos se actualizan al recuperar el foco. El acceso y la administración de eventos siguen en `/organizador`. Antes de desplegar, aplica `20261106000001_registration_history.sql`.

## Exportación de asistentes y disponibilidad

Desde el detalle de un evento propio, «Descargar asistentes CSV» descarga todas sus entradas con `tickets.estado = 'valid'`, independientemente de la página visible. No incluye entradas `used` ni `revoked`. El estado `valid` es el criterio de esta lista, también si el evento ya comenzó o volvió a borrador; no se aplica la clasificación de boletos activos del comprador. Un registro sin entrada no se exporta. No se exportan códigos QR, identificadores de compradores ni claves de idempotencia.

`GET /api/organizador/eventos/[id]/asistentes/exportar` exige el token Bearer y verifica la propiedad además de RLS, incluso para eventos publicados o compradores con acceso a sus propios registros. Responde CSV privado sin caché; errores JSON `{ error: string }` con 400 (UUID inválido), 401 (sin sesión), 404 (evento inexistente o ajeno) o 503 (consulta/datos no disponibles). El servidor acumula el resultado antes de responder para evitar archivos parciales ante errores de consulta.

| Columna CSV, en orden | Procedencia y significado |
| --- | --- |
| Nombre del asistente | `registrations.nombre_titular`, ingresado para el titular; no se toma del perfil del comprador. |
| Correo electrónico | `registrations.correo_titular`, normalizado al registrar; no acredita propiedad verificada del correo. |
| Tipo de entrada | Nombre actual `ticket_types.nombre`, mediante `registrations.tipo_entrada_id`. |
| Estado de entrada | `tickets.estado`, mediante `tickets.registro_id`; etiqueta compartida «Válida». |
| Fecha de compra | `registrations.created_at`, fecha de confirmación del registro, no de un pago: actualmente no hay cobros. Se muestra en `America/Guatemala`, usando el formato compartido. |

El archivo usa UTF-8 con BOM, coma como separador y CRLF entre filas. Todos los campos se entrecomillan y las comillas se duplican; comas, Unicode y saltos de línea conservan su celda. Los valores que podrían iniciar fórmulas se prefijan con apóstrofo, también con espacios o controles antes de `=`, `+`, `-` o `@`; los valores ausentes de nombre/correo se representan vacíos. Sin entradas válidas se descarga únicamente el encabezado. En hojas configuradas con otro separador, importar explícitamente como CSV separado por comas.

La consulta avanza por ID de entrada en lotes de hasta 500 y continúa hasta un lote vacío, tolerando límites de filas del servidor inferiores. Es una lectura viva, no una instantánea transaccional: cambios concurrentes pueden afectar el resultado y una entrada puede usarse o revocarse después de descargarla. El archivo no sustituye la comprobación de validez al ingresar. Volúmenes muy grandes siguen sujetos a memoria y tiempo del alojamiento.

Las tarjetas muestran capacidad, ocupadas, disponibles y porcentaje. **Cada registro ocupa un cupo**, incluso con entrada usada, revocada o ausente: esta es la misma regla de `eventos_disponibles` y `confirmar_registro`. Disponibles = `max(0, capacidad − registros)`; porcentaje = `registros / capacidad × 100`, mostrado con hasta un decimal. La barra se limita visualmente a 100 %, pero ante exceso conserva las cantidades reales y muestra una advertencia. Capacidades cero/nulas/no enteras o recuentos inválidos producen un error controlado, no disponibilidad inventada; el esquema exige capacidad positiva y no nula.

No se requieren nuevas dependencias, migraciones ni cambios de políticas. Si el entorno desplegado difiere de las migraciones RLS versionadas, investigar y solicitar autorización antes de cambiar políticas; no reintroducir un cliente privilegiado como alternativa.

`npm test` cubre escape/fórmulas, descarga, autorización de rutas con Supabase simulado, filtros, lotes de más de 1000 entradas, fallo intermedio y cálculos de disponibilidad. `supabase/tests/organizer_event_access.sql` prepara verificaciones de RLS real, propietario/ajeno/comprador, borradores y conservación de cupos usados/revocados con rollback. Requiere aprobación previa y una base desechable con todas las migraciones; no envía correos. Las pruebas simuladas no sustituyen esa comprobación de políticas desplegadas.

Verificación manual: revisar detalle en móvil y escritorio, navegación por teclado y foco, progreso accesible, descarga y apertura del CSV, ausencia de entradas válidas, reintentos y cambio/cierre de sesión durante una petición. Comprobar que una cuenta compradora o una organizadora ajena no puede usar directamente el endpoint de exportación para otro evento.

## Configuración

1. Configura un proyecto de Supabase y aplica en orden las migraciones de `supabase/migrations` mediante el procedimiento de despliegue de tu proyecto.
2. Copia `.env.example` a `.env.local` en la raíz y configura `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Nunca uses la clave `service_role` en el navegador. Reinicia el servidor de desarrollo después de cambiar estas variables.
3. Crea una cuenta de organizador en Supabase Auth y habilita el acceso con correo y contraseña. Cualquier usuario autenticado puede organizar sus propios eventos; las políticas RLS limitan la edición al propietario.
4. Ejecuta `npm run dev` y abre `http://localhost:3000/organizador`.

Para el registro de compradores, habilita las altas con correo y contraseña en Supabase Auth. Configura Site URL con el origen de la aplicación y autoriza las URL de retorno `/eventos/*/registro` y `/mis-boletos` de los orígenes de desarrollo y producción en Redirect URLs. La aplicación usa el flujo implícito de Supabase en el navegador para recuperar la sesión al verificar el correo. Si la confirmación de correo está habilitada, el comprador debe verificarlo antes de confirmar boletos. No desactives esa verificación para resolver errores de configuración.

Los eventos comienzan como borrador y necesitan al menos un tipo de entrada para publicarse. La suma de los aforos de los tipos no puede superar el aforo del evento; la base de datos valida este límite incluso ante cambios simultáneos. La fecha se introduce y muestra en la zona horaria del navegador y se almacena como instante UTC.

En PowerShell, si la política de ejecución bloquea npm.ps1, usa `npm.cmd`.

## Registro y seguridad

Aplica `20261104000000_registros_publicos.sql` después de las migraciones existentes y antes de desplegar esta versión. La portada utiliza la nueva función de disponibilidad. La migración y las pruebas de base de datos necesitan aprobación del propietario antes de ejecutarse.

Cada operación registra un boleto con `nombre_titular` y `correo_titular`, independientes de `comprador_id`. Un comprador puede registrar varias personas con el mismo correo; no hay cobros. Cada registro confirmado dispone de una entrada con código QR y tareas de envío por correo. El correo del titular se guarda normalizado, pero no implica que se haya verificado su identidad o propiedad de ese correo.

- Solo los eventos publicados y anteriores a su hora de inicio aceptan registros. La hora de la base de datos decide; el navegador solo anticipa el cierre visual.
- `confirmar_registro` exige `auth.uid()`, valida los datos del titular y bloquea el evento para comprobar estado, entrada y cupos dentro de la misma transacción. No admite escrituras directas desde roles de la aplicación.
- Cada operación tiene una clave de idempotencia ligada al comprador. Reintentar una operación de resultado incierto devuelve el mismo folio; cambiar su contenido con la misma clave se rechaza. Los reintentos se conservan mientras la página permanezca abierta; no recargues ni cierres la página si hay un resultado pendiente de comprobar.
- RLS limita la lectura de registros a su comprador o al propietario del evento. La consulta pública expone únicamente datos del evento y disponibilidad agregada. Las funciones privilegiadas fijan `search_path` y restringen explícitamente sus permisos de ejecución.
- No se puede reducir el aforo de un tipo por debajo de sus boletos registrados ni eliminarlo si tiene registros. Eliminar el evento elimina sus entradas y registros; el diálogo del organizador lo advierte.
- No se incluyen cambios a los roles existentes: cualquier cuenta autenticada puede seguir organizando sus propios eventos. Supabase Auth gestiona las contraseñas y sus límites de uso; esta versión no añade CAPTCHA ni límites por comprador para registros de boletos.

## Panel del comprador

`/mis-boletos` muestra los boletos adquiridos desde la cuenta autenticada, agrupados por evento: activos (publicados y futuros), historial (fecha de inicio alcanzada) y no disponibles (futuros en borrador). Incluye cantidad por evento, nombre y correo de cada titular, tipo de entrada y folio. Los eventos eliminados no se conservan en el historial porque sus registros se eliminan en cascada.

La página de registro muestra el total y los titulares adquiridos para ese evento, incluso después de confirmar o si el evento deja de aceptar registros. Las listas se actualizan después de confirmar, al recuperar el foco y cada 30 segundos; un fallo de consulta no impide registrar y no invalida una confirmación existente.

Antes de desplegar el panel, aplica con aprobación `20261105000000_mis_boletos.sql`. La función `mis_boletos` obtiene el comprador exclusivamente de `auth.uid()`, solo permite ejecución a `authenticated` y filtra tanto eventos como boletos por ese comprador. Incluso un organizador ve únicamente sus propias adquisiciones en este panel. El correo del titular no concede acceso a otra cuenta. La función usa privilegios limitados por su consulta y `search_path` vacío para devolver al comprador los detalles mínimos de sus boletos cuando un evento pasa a borrador; las políticas RLS existentes permanecen vigentes.

Los datos del panel permanecen en memoria del componente, sin almacenamiento persistente ni caché compartida. Al cerrar sesión o cambiar de cuenta se descartan las listas y las respuestas pendientes. Los destinos de verificación del formulario de acceso se restringen al mismo origen de la aplicación.

## Emisión y consulta de entradas

Antes de desplegar esta función, aplica con aprobación `20261105000001_emision_tickets.sql`, después de las migraciones anteriores. La migración crea `tickets` y emite una entrada `valid` para cada registro existente, conservando su folio y el cupo ocupado. El enlace «Ver entrada y QR» aparece tanto al confirmar como en el listado privado del comprador.

La tabla relaciona cada entrada con un único registro y guarda un código único de 64 caracteres hexadecimales, estado (`valid`, `used`, `revoked`) y fechas de creación/actualización. Los códigos se generan con dos UUIDv4 criptográficos independientes (244 bits aleatorios); no se derivan de identificadores del registro ni de datos del titular. La identidad y el código de una entrada son inmutables.

La emisión se realiza mediante un trigger en la misma transacción del registro: si falla la entrada, no queda un registro confirmado sin ella. La RPC pública `confirmar_registro` reutiliza su implementación anterior dentro del esquema privado y añade `ticket: { codigo, estado }` al resultado confirmado. No se duplican las validaciones de disponibilidad ni de idempotencia: un reintento devuelve el mismo folio y la misma entrada, incluso si ya está usada o revocada. `mis_boletos` conserva su autorización y su respuesta anterior, ampliando cada boleto con ese mismo objeto `ticket`. El contador de activos solo incluye entradas `valid` de eventos publicados futuros; el total adquirido y el historial conservan todas las entradas.

`/entradas/[codigo]` permite al asistente consultar sin sesión su nombre, correo, tipo de entrada, evento y estado actual. El código se renderiza como QR SVG con `qrcode`, en el propio servidor y sin servicios externos. El QR contiene únicamente el código opaco, sin datos personales. La página muestra las fechas en America/Guatemala con su zona indicada y actualiza el estado cada 30 segundos, al recuperar el foco y mediante un botón.

El enlace funciona como un secreto de acceso: cualquier persona que lo reciba podrá ver los datos de esa entrada. No hay listado público, búsqueda por correo ni consulta por folio, UUID de registro o prefijo. `consultar_ticket(p_codigo)` solo admite el código completo y devuelve el mismo resultado vacío para formatos inválidos y códigos inexistentes. La tabla no admite lectura anónima ni escrituras directas de usuarios; RLS limita su lectura al comprador o al propietario del evento. Las funciones privilegiadas fijan `search_path` vacío y permisos explícitos. Las páginas públicas no se prerenderizan con datos de entradas ni comparten sus respuestas: consulta sin caché, `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer` y exclusión de indexación. No se usan códigos o datos personales en metadatos ni se registran explícitamente en logs de la aplicación; la infraestructura de hosting debe tratar las rutas de entradas como sensibles y evitar registrar sus códigos completos.

Consultar o escanear el QR no consume una entrada. La RPC `cambiar_estado_ticket(p_codigo, p_estado)` exige sesión y propiedad del evento: admite solo `used` o `revoked`, bloquea la entrada durante el cambio y rechaza un segundo uso o la reactivación de una entrada usada/revocada. Puede revocarse una entrada ya usada. No se añade una interfaz de escaneo en este cambio. La revocación no elimina el registro ni libera su cupo; eliminar el evento conserva el comportamiento previo y elimina también sus entradas.

## Comprobaciones

```bash
npm run lint
npm run build
npm test
```

La compilación y lint no necesitan consultar la base de datos. Después de aprobar y aplicar las migraciones en un entorno de pruebas, `supabase/tests/registros.sql` verifica con rollback validación, cupos, idempotencia, permisos y eliminación. No ejecutarlo sin aprobación: crea datos de prueba dentro de una transacción.

Las pruebas locales (`npm test`, Node 24 o una versión con soporte de TypeScript nativo) comprueban el límite horario, clasificación y orden de los eventos, así como la conservación de varios boletos con un mismo correo. No necesitan base de datos ni dependencias nuevas. `supabase/tests/mis_boletos.sql` prepara pruebas con rollback de la RPC privada, incluyendo aislamiento entre compradores, organizadores, coincidencia de correo del titular y acceso limitado a detalles de eventos en borrador; requiere aprobación y una base de datos de pruebas con todas las migraciones aplicadas.

Las pruebas locales de entradas también verifican el rechazo de folios y códigos parciales, los módulos SVG del QR con su margen de lectura y la exclusión de entradas usadas/revocadas del contador activo. `supabase/tests/tickets.sql` prepara con rollback pruebas de backfill, emisión atómica, códigos únicos, reintentos, consulta pública limitada, RLS y cambios de estado. No ejecutarlo sin aprobación. Para verificar concurrencia, dos llamadas del organizador a `cambiar_estado_ticket` con el mismo código y estado `used` deben producir un solo `actualizado` y un `ya_usada`; dos confirmaciones simultáneas con la misma clave deben devolver el mismo folio y código. La consulta pública nunca debe alterar el estado.

Para verificar el panel en el navegador, iniciar sesión con dos cuentas distintas y comprobar que un cambio de cuenta o cierre de sesión elimina los titulares anteriores, incluso con una petición en curso. Revisar historial, ausencia de boletos, errores con reintento y que registrar otra persona actualice el contador y conserve la confirmación si falla la consulta del resumen. Probar también alta desde `/mis-boletos` con confirmación de correo y retorno a esa página.

Comprobar además en el navegador: acceso anónimo; alta y verificación de correo; inicio de sesión; titular distinto del comprador; datos inválidos; estados de carga y error; éxito y nuevo registro; pérdida de conexión con reintento; sesión caducada; cambios del evento mientras el formulario está abierto. Para concurrencia, enviar desde dos sesiones autenticadas solicitudes con claves distintas por el último cupo: solo una debe devolver `confirmado`, la otra `entrada_agotada`. Verificar también que un cambio simultáneo de aforo no lo deje por debajo del número de boletos.


## Correo de entradas con Resend

Aplica, con aprobaci?n del propietario, `20261105000002_envios_entradas.sql` antes de desplegar. Configura `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (remitente autorizado en Resend) y `SUPABASE_SERVICE_ROLE_KEY` en `.env.local` y en el despliegue. Ninguna lleva prefijo `NEXT_PUBLIC_`. Reinicia el proceso despu?s de cambiar variables. No uses una clave secreta en el navegador ni la publiques en el repositorio. La fuente Noto Sans se distribuye con su licencia en `src/assets/fonts` y se incluye mediante el trazado de archivos de Next.

El formulario confirma mediante `POST /api/registros/confirmar`, enviando los mismos cinco par?metros del RPC y el access token de Supabase en Authorization Bearer. El servidor verifica el usuario y reutiliza la validaci?n transaccional existente. Un trigger crea las tareas junto con la entrada; cada entrada/destinatario es ?nico. La respuesta confirma el registro inmediatamente; `after()` intenta enviar dentro del ciclo de vida del servidor, sin depender de otra petici?n del navegador. Configura el alojamiento para soportar `after`/waitUntil y hasta 60 segundos por petici?n. Una interrupci?n deja tareas recuperables desde el panel, sin un cron.

El titular y el comprador reciben mensajes separados para no exponer direcciones entre destinatarios. Se normalizan y deduplican direcciones iguales. El correo y el PDF incluyen los datos del titular, evento, fecha en America/Guatemala, lugar y tipo. El QR es el mismo c?digo opaco de la entrada, generado localmente; el HTML usa PNG adjunto con Content-ID y el PDF lo incorpora. No hay im?genes remotas ni hace falta abrir enlaces. Algunos clientes ocultan im?genes; el mismo QR est? en el PDF. El correo contiene el c?digo secreto: protege tambi?n el acceso a las cuentas de Resend y del destinatario. No se env?an actualizaciones posteriores del evento: el correo refleja la instant?nea del registro y la validez real se comprueba en la base de datos.

`GET /api/entradas/correo?registro=<uuid>` consulta estados y `POST /api/entradas/correo` con `{registro}` solicita reintentar ?nicamente lo pendiente. Ambos requieren el token; solo el comprador puede solicitar env?os. La sesi?n, propiedad y destinatarios se verifican en el servidor; el cliente no elige una direcci?n ni proporciona contenido. La tabla tiene RLS y privilegios por columna: el comprador consulta estados, mientras payloads, adjuntos y operaciones de env?o son exclusivos del servidor. Un organizador no puede enviar una entrada de otro comprador.

Estados: pendiente, enviando, aceptado, fallido, revision y bloqueado. Aceptado significa que Resend acept? el mensaje; no confirma entrega al buz?n. No se incluyen webhooks. El panel actualiza los estados y permite reintentar pendientes o fallidos, con 60 segundos por tarea, hasta 10 reclamaciones por comprador/minuto y bloqueo exclusivo de 3 minutos. Mensajes aceptados no se reenv?an. Los env?os antiguos solo se crean al solicitarlos desde el panel; no hay env?o masivo al aplicar la migraci?n. No se permiten nuevos env?os de entradas usadas/revocadas ni eventos pasados o retirados.

Antes de contactar a Resend se persisten exactamente el mensaje, el PNG y el PDF, con clave `ticket-email/<id-tarea>`. Los reintentos reutilizan todo el contenido aunque cambie el remitente configurado. Si la respuesta se pierde, la idempotencia del proveedor evita duplicados durante su ventana de 24 horas. Por precauci?n, un resultado incierto de m?s de 23 horas pasa a revisi?n: un operador debe comprobarlo en Resend y resolverlo con un procedimiento administrativo antes de volver a enviar; el panel no genera claves nuevas. No se registran tokens, destinatarios, c?digos ni respuestas del proveedor en logs de aplicaci?n.

`npm test` prueba PDF, formato del correo, HTML escapado, zona horaria, claves idempotentes y fallos de Resend con transporte simulado. `supabase/tests/envios_entradas.sql` verifica transacciones, permisos, deduplicaci?n, leases, cooldown y expiraci?n en una base desechable; necesita aprobaci?n antes de ejecutarse y no env?a correos. No ejecutar fixtures contra producci?n. Un env?o real de prueba requiere direcciones autorizadas. La configuraci?n inicial puede estar sujeta a restricciones de dominio y destinatarios de la cuenta de Resend.
