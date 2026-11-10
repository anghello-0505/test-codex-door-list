# Doorlist

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Organizadores y compradores tienen la misma prioridad. Los organizadores crean y administran eventos; los compradores descubren eventos y registran boletos para sí mismos o para otros titulares.

El personal de acceso opera el ingreso de los eventos que le asigna su organizadora, mediante una cuenta independiente con usuario y contraseña.

El tamaño de los eventos y los segmentos prioritarios del mercado están por definir. El copy actual alude a vida nocturna, pero no confirma una restricción del producto a ese ámbito.

## Product Purpose

Ofrecer una plataforma ágil para registrar y publicar eventos, facilitar la elección de boletos y ayudar a las personas a descubrir eventos mediante una página inicial llamativa.

El objetivo de la experiencia en la puerta es hacer el check-in muy rápido. El repositorio implementa lectura QR y código manual con comprobación del servidor; no hay evidencia para prometer tiempos concretos.

## Positioning

La agilidad es el diferenciador buscado: facilitar el trabajo del organizador, la elección del comprador y el ingreso del asistente. No hay evidencia disponible para afirmar superioridad frente a otras plataformas ni prometer tiempos concretos.

## Operating Context

- El organizador administra eventos y tipos de entrada desde `/organizador`; consulta disponibilidad, asistentes, exportación CSV e historial diario de registros desde `/dashboard`.
- El comprador descubre eventos publicados en `/`, consulta y registra boletos en `/eventos/[id]/registro` y revisa sus adquisiciones en `/mis-boletos`.
- Consultar un evento no requiere iniciar sesión; confirmar un registro requiere una cuenta autenticada. El comprador puede registrar a un titular distinto de sí mismo.
- Cada registro confirmado emite una entrada QR. La entrada se consulta mediante un enlace secreto en `/entradas/[codigo]`; el envío por correo y PDF depende de la configuración del servicio.
- La organizadora consulta el enlace fijo de su equipo desde `/organizador/asistentes`. El personal inicia sesión en `/acceso/[identificador]`, elige un evento asignado y valida por cámara o código manual. El resultado permanece visible y la cámara requiere una acción explícita para leer la siguiente entrada.
- El historial de ingreso en `/organizador/validaciones` permite a la organizadora consultar ingresos y rechazos propios, filtrar por evento y resultado y conservar evidencia de eventos eliminados.

## Capabilities and Constraints

Estado actual documentado en el repositorio:

- No hay cobros implementados. La incorporación futura de pagos está por decidir; no presentar un registro como un pago realizado.
- Los eventos comienzan como borrador y requieren un tipo de entrada para publicarse. Solo los publicados y futuros aceptan nuevos registros, sujetos a disponibilidad.
- Cada registro ocupa un cupo, incluso si su entrada se usa o revoca. La confirmación y los reintentos conservan la integridad del cupo y evitan duplicados mediante idempotencia.
- Las entradas pueden estar válidas, usadas o revocadas. La consulta pública no las consume. En el control de ingreso, leer el QR envía automáticamente la validación al servidor; el ingreso autorizado cambia una entrada válida a usada y registra la auditoría en la misma transacción. No se permite reingreso.
- El ingreso exige cuenta activa, asignación vigente, evento publicado y horario autorizado por el servidor: día del evento en `America/Guatemala` más un margen configurable de 0 a 12 horas, en pasos de 30 minutos, inicialmente 2 horas.
- La sesión del personal termina tras 30 minutos sin actividad registrada por el servidor. El ingreso necesita conexión: una respuesta perdida exige recuperar la operación o reintentar con la misma entrada; no equivale a ingreso autorizado ni rechazo confirmado. La idempotencia evita consumirla de nuevo al recuperar el resultado.
- La sesión y la propiedad limitan el acceso a los datos privados. El enlace secreto de una entrada permite consultar sus datos a quien lo posea; el QR contiene un código opaco, sin datos personales.
- `Event` es el evento; `TicketType` define un tipo de entrada y su capacidad; `Registration` conserva la inscripción y los datos del titular; `Ticket` es la entrada emitida y su estado. Mantener estas entidades diferenciadas.
- La interfaz y las rutas públicas usan español; los nombres de código y los contratos usan inglés. Los contratos de API usan camelCase y la persistencia snake_case, según `AGENTS.md`.
- La aplicación existente usa Next.js, React, TypeScript y Supabase. Consultar la documentación de Next.js instalada antes de modificar su código. Las instalaciones de dependencias y los comandos que accedan a una base de datos requieren aprobación previa.

## Brand Commitments

El nombre existente es Doorlist. La página inicial debe llamar la atención de quienes buscan eventos. No se ha confirmado una nueva dirección visual, tono de marca adicional ni cambio de identidad.

## Evidence on Hand

- `README.md`: flujos, capacidades, límites de seguridad y condiciones de operación documentados.
- `docs/access-control.md`: uso, contratos, permisos, auditoría y estado de despliegue y verificación del control de ingreso. La implementación local no acredita por sí sola una migración aplicada ni operación remota.
- `src/lib/domain.ts`: entidades y contratos compartidos existentes.
- `src/app/` y `src/components/`: interfaz y recorridos actuales; no se modifica su diseño durante init.
- `supabase/migrations/` y `tests/`: esquema versionado y verificaciones existentes; su presencia no acredita el estado de una base desplegada.

No se han aportado testimonios, métricas de conversión, tiempos de check-in ni pruebas comparativas. No inventar estos datos ni presentar funciones planificadas como disponibles.

Las capturas de revisión del control de ingreso con datos sintéticos muestran los componentes reales en estados preparados. No prueban una cámara física ni la operación completa. Se observó el login en Edge y el foco por teclado hasta la contraseña; cámara en iPhone/Android y conformidad completa de accesibilidad siguen sin acreditarse.

## Product Principles

1. Dar la misma importancia a organizar eventos y adquirir boletos.
2. Reducir esfuerzo y pasos para crear eventos y elegir entradas.
3. Hacer que descubrir eventos resulte atractivo sin ocultar los datos necesarios para decidir.
4. Favorecer un ingreso rápido con comprobación fiable del servidor, resultados persistentes y recuperación explícita cuando no se puede confirmar una operación.
5. Comunicar con precisión disponibilidad, confirmación y validez; proteger los datos del titular y el acceso privado.

## Open Decisions

- Segmentos de público y tamaño de eventos prioritarios.
- Objetivos medibles de rapidez del check-in y verificación de cámara en dispositivos físicos iPhone/Android. El flujo implementado exige conexión y limita al personal a sus eventos asignados.
- Evolución hacia pagos u otras funciones comerciales.
- Requisitos específicos de accesibilidad, además de las prácticas aplicables a la interfaz web.
