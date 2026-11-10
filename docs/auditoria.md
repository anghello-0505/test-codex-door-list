Sí: hay una base razonablemente consistente, pero varias convenciones se han definido sobre la marcha. No parece una arquitectura previamente acordada. La mayor inconsistencia está en el manejo de errores y en las fronteras entre módulos, más que en Next.js.

## Inconsistencias importantes

1. Los contratos de error de las APIs no siguen un mismo formato.

- Confirmación responde con `{ estado: "datos_invalidos" | "sesion_requerida" | ... }`: [route.ts](<C:/Users/anghe/OneDrive/Escritorio/door-list/src/app/api/registros/confirmar/route.ts:8>).
- Correo responde con `{ error: "mensaje para humanos" }`: [route.ts](<C:/Users/anghe/OneDrive/Escritorio/door-list/src/app/api/entradas/correo/route.ts:7>).
- Algunos clientes ni siquiera consumen ese mensaje y sustituyen cualquier fallo por uno genérico: [ticket-email-delivery.tsx](<C:/Users/anghe/OneDrive/Escritorio/door-list/src/components/ticket-email-delivery.tsx:35>).

Deberíamos elegir un contrato común, por ejemplo:

```ts
{ ok: false, error: { code: "INVALID_REGISTRATION", message: "..." } }
```

2. En unas pantallas se muestran errores internos de Supabase; en otras se ocultan.

El organizador muestra directamente `error.message` de Supabase: [page.tsx](<C:/Users/anghe/OneDrive/Escritorio/door-list/src/app/organizador/page.tsx:79>) y [page.tsx](<C:/Users/anghe/OneDrive/Escritorio/door-list/src/app/organizador/page.tsx:100>).

En registro, boletos y correo se usan mensajes controlados. Esa segunda estrategia es mejor para UX y evita filtrar detalles internos. Hoy el comportamiento depende de qué pantalla falle.

3. Hay demasiados `catch` silenciosos.

Ejemplos:

- La entrega por Resend convierte cualquier excepción en un resultado genérico: [resend-delivery.ts](<C:/Users/anghe/OneDrive/Escritorio/door-list/src/lib/resend-delivery.ts:7>).
- La orquestación del correo descarta fallos de preparación, consultas y finalización: [email-server.ts](<C:/Users/anghe/OneDrive/Escritorio/door-list/src/lib/email-server.ts:24>).
- La API de confirmación absorbe cualquier excepción y responde `503`: [route.ts](<C:/Users/anghe/OneDrive/Escritorio/door-list/src/app/api/registros/confirmar/route.ts:20>).

Está bien no registrar datos personales, pero ahora tampoco queda información segura como operación, código de error o identificador interno. En producción será difícil distinguir configuración ausente, JSON inválido, fallo de Supabase o error de programación.

4. Faltan límites de error de Next.js.

Existe un `not-found.tsx`, lo cual está bien, pero no hay ningún `error.tsx` ni `global-error.tsx`. Los errores esperados se manejan localmente, pero una excepción inesperada durante renderizado queda en el fallback genérico de Next.

5. Las fronteras de módulos están borrosas.

[email-server.ts](<C:/Users/anghe/OneDrive/Escritorio/door-list/src/lib/email-server.ts:1>) contiene:

- autenticación de compradores;
- creación de clientes Supabase;
- formato de respuestas HTTP;
- comprobación de configuración;
- coordinación de trabajos;
- generación y envío de correos.

El nombre sugiere solo correo, pero el módulo funciona como infraestructura compartida de toda la API.

Algo similar ocurre en [supabase.ts](<C:/Users/anghe/OneDrive/Escritorio/door-list/src/lib/supabase.ts:1>): configura el cliente y, además, define el modelo de dominio `PublicEvent`.

6. Mezclamos vocabulario inglés y español sin una frontera clara.

Ejemplos:

- `PublicEvent`, `BuyerTicket`, `BuyerEvent`, `TicketCategory`.
- Sus propiedades son `titulo`, `fecha`, `boletos`, `nombre_titular`.
- `TicketCategory` usa valores `"activos"`, `"historial"` y `"noDisponibles"`: [my-tickets.ts](<C:/Users/anghe/OneDrive/Escritorio/door-list/src/lib/my-tickets.ts:21>).
- En el organizador existen tipos muy genéricos llamados `Event` y `Ticket`: [page.tsx](<C:/Users/anghe/OneDrive/Escritorio/door-list/src/app/organizador/page.tsx:9>).

No es un problema que la base de datos use español y el código inglés, pero habría que mantener esa frontera consistentemente o adoptar español para todo el dominio.

7. Hay duplicación que ya empieza a divergir.

- El patrón UUID está en [email-server.ts](<C:/Users/anghe/OneDrive/Escritorio/door-list/src/lib/email-server.ts:7>) y nuevamente en [registro.tsx](<C:/Users/anghe/OneDrive/Escritorio/door-list/src/app/eventos/[id]/registro/registro.tsx:15>).
- `field`, `button` y `secondary` aparecen con variantes en varias páginas.
- El formato de fecha alterna entre `toLocaleString`, `Intl.DateTimeFormat` con zona implícita y formato explícito de Guatemala. Esto puede producir fechas distintas según dónde se ejecute.
- Hay tres implementaciones separadas de observación de sesión, aunque ya existe `useBuyerSession`.

8. Los imports tampoco siguen una regla única.

Algunos imports relativos incluyen `.ts`:

- [ticket-qr.ts](<C:/Users/anghe/OneDrive/Escritorio/door-list/src/lib/ticket-qr.ts:2>)
- [ticket-email.ts](<C:/Users/anghe/OneDrive/Escritorio/door-list/src/lib/ticket-email.ts:6>)
- [resend-delivery.ts](<C:/Users/anghe/OneDrive/Escritorio/door-list/src/lib/resend-delivery.ts:1>)

El resto usa imports sin extensión. Compila, pero da la impresión de que se adaptó código para los tests de Node sin fijar una convención general.

## Lo que sí está consistente

- La estructura básica de App Router sigue las convenciones instaladas de Next 16.
- Los archivos generales usan mayormente `kebab-case`.
- Los componentes React usan nombres PascalCase.
- Las rutas y campos de dominio en español son comprensibles.
- Los errores esperados normalmente se presentan en la interfaz con `role="alert"` o `role="status"`.
- Hay cuidado real con idempotencia, privacidad del código del boleto y estados inciertos del proveedor de correo.

## Verificación

- ESLint: limpio.
- TypeScript: limpio.
- 16 pruebas ejecutadas individualmente: todas pasan.
- `npm test` no pudo lanzar los archivos en paralelo por un `spawn EPERM` del entorno, no por fallos de los casos.
- Node también advierte que falta definir explícitamente el tipo de módulo del paquete durante esas pruebas.

Mi conclusión honesta: la funcionalidad está más cuidada que la arquitectura. No es un caos, pero sí hay deuda temprana y señales claras de crecimiento incremental. Antes de añadir otro módulo grande, convendría fijar por escrito cuatro decisiones: idioma del dominio, contrato de errores, separación por feature y estrategia de observabilidad.
