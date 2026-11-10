# Doorlist

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Organizadores y compradores tienen la misma prioridad. Los organizadores crean y administran eventos; los compradores descubren eventos y registran boletos para sí mismos o para otros titulares.

El tamaño de los eventos y los segmentos prioritarios del mercado están por definir. El copy actual alude a vida nocturna, pero no confirma una restricción del producto a ese ámbito.

## Product Purpose

Ofrecer una plataforma ágil para registrar y publicar eventos, facilitar la elección de boletos y ayudar a las personas a descubrir eventos mediante una página inicial llamativa.

El objetivo de la experiencia en la puerta es hacer el check-in muy rápido. Es una dirección de producto confirmada, no una capacidad de escaneo ya implementada.

## Positioning

La agilidad es el diferenciador buscado: facilitar el trabajo del organizador, la elección del comprador y el ingreso del asistente. No hay evidencia disponible para afirmar superioridad frente a otras plataformas ni prometer tiempos concretos.

## Operating Context

- El organizador administra eventos y tipos de entrada desde `/organizador`; consulta disponibilidad, asistentes, exportación CSV e historial diario de registros desde `/dashboard`.
- El comprador descubre eventos publicados en `/`, consulta y registra boletos en `/eventos/[id]/registro` y revisa sus adquisiciones en `/mis-boletos`.
- Consultar un evento no requiere iniciar sesión; confirmar un registro requiere una cuenta autenticada. El comprador puede registrar a un titular distinto de sí mismo.
- Cada registro confirmado emite una entrada QR. La entrada se consulta mediante un enlace secreto en `/entradas/[codigo]`; el envío por correo y PDF depende de la configuración del servicio.
- El futuro flujo de check-in debe favorecer un ingreso rápido. Roles de puerta, dispositivos, conectividad y metas de tiempo siguen por definir.

## Capabilities and Constraints

Estado actual documentado en el repositorio:

- No hay cobros implementados. La incorporación futura de pagos está por decidir; no presentar un registro como un pago realizado.
- Los eventos comienzan como borrador y requieren un tipo de entrada para publicarse. Solo los publicados y futuros aceptan nuevos registros, sujetos a disponibilidad.
- Cada registro ocupa un cupo, incluso si su entrada se usa o revoca. La confirmación y los reintentos conservan la integridad del cupo y evitan duplicados mediante idempotencia.
- Las entradas pueden estar válidas, usadas o revocadas. Consultar o escanear su código no las consume. Existe una operación de servidor para cambiar el estado, pero no una interfaz de escaneo para check-in.
- La sesión y la propiedad limitan el acceso a los datos privados. El enlace secreto de una entrada permite consultar sus datos a quien lo posea; el QR contiene un código opaco, sin datos personales.
- `Event` es el evento; `TicketType` define un tipo de entrada y su capacidad; `Registration` conserva la inscripción y los datos del titular; `Ticket` es la entrada emitida y su estado. Mantener estas entidades diferenciadas.
- La interfaz y las rutas públicas usan español; los nombres de código y los contratos usan inglés. Los contratos de API usan camelCase y la persistencia snake_case, según `AGENTS.md`.
- La aplicación existente usa Next.js, React, TypeScript y Supabase. Consultar la documentación de Next.js instalada antes de modificar su código. Las instalaciones de dependencias y los comandos que accedan a una base de datos requieren aprobación previa.

## Brand Commitments

El nombre existente es Doorlist. La página inicial debe llamar la atención de quienes buscan eventos. No se ha confirmado una nueva dirección visual, tono de marca adicional ni cambio de identidad.

## Evidence on Hand

- `README.md`: flujos, capacidades, límites de seguridad y condiciones de operación documentados.
- `src/lib/domain.ts`: entidades y contratos compartidos existentes.
- `src/app/` y `src/components/`: interfaz y recorridos actuales; no se modifica su diseño durante init.
- `supabase/migrations/` y `tests/`: esquema versionado y verificaciones existentes; su presencia no acredita el estado de una base desplegada.

No se han aportado testimonios, métricas de conversión, tiempos de check-in ni pruebas comparativas. No inventar estos datos ni presentar funciones planificadas como disponibles.

## Product Principles

1. Dar la misma importancia a organizar eventos y adquirir boletos.
2. Reducir esfuerzo y pasos para crear eventos y elegir entradas.
3. Hacer que descubrir eventos resulte atractivo sin ocultar los datos necesarios para decidir.
4. Diseñar el futuro check-in para un ingreso rápido, conservando una comprobación fiable del estado de la entrada.
5. Comunicar con precisión disponibilidad, confirmación y validez; proteger los datos del titular y el acceso privado.

## Open Decisions

- Segmentos de público y tamaño de eventos prioritarios.
- Alcance, roles, dispositivos y conectividad del check-in; objetivos medibles de rapidez.
- Evolución hacia pagos u otras funciones comerciales.
- Requisitos específicos de accesibilidad, además de las prácticas aplicables a la interfaz web.
