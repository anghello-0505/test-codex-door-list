<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Contexto

- Asume que la versión instalada de Next.js puede ser diferente de la que conoces y consulta la documentación oficial incluida en `node_modules/next/dist/docs/` antes de escribir código de Next.js.
- Usa Server Components por defecto y añade `"use client"` solo cuando exista una razón concreta.
- Edita archivos dentro del proyecto sin pedir confirmación por cada edición, pero pide confirmación y espera aprobación antes de instalar dependencias.

## Estructura

- Usa `app/` para las rutas, `components/` para la UI compartida, `lib/` para la lógica y las utilidades compartidas, `lib/supabase/` para los clientes de Supabase y `supabase/migrations/` para el esquema de la base de datos.
- Coloca junto a su ruta todo componente usado por una sola ruta y muévelo a `components/` cuando lo usen dos o más rutas.

## Vocabulario

- Usa `Event`, `TicketType`, `Ticket` y `Registration` con el mismo significado en todo el repositorio y no los uses como sinónimos entre sí.
- Nombra las tablas en plural y `snake_case`, con el mismo nombre que su entidad.

## Idioma

- Escribe el código, los nombres y los tipos en inglés, y el copy de la interfaz en español.
- Escribe las rutas públicas en español y los componentes que las sirven en inglés.

## Fuente única de verdad

- Define en `lib/` los tipos compartidos entre API, email y UI, y no los redefinas por archivo.
- Define en `lib/` los helpers compartidos de fecha y formato, y no los copies entre pantallas.

## Errores

- Devuelve toda respuesta de error de la API como JSON con `{ error: string }` y los errores de negocio con su código HTTP real, nunca con `200`.
- Revisa `response.ok` en el cliente antes de interpretar el cuerpo y no muestres en la UI mensajes crudos del proveedor.

## Base de datos

- Implementa toda migración en un archivo versionado dentro de `supabase/migrations/`, no ejecutes ni conserves SQL suelto fuera de una migración versionada y habilita RLS en toda tabla expuesta.
- Pide confirmación y espera aprobación antes de ejecutar comandos que accedan o modifiquen una base de datos.

## Casing

- Usa `snake_case` solo dentro de la capa de persistencia.
- Define todos los contratos de API, tanto request como response, en `camelCase`.

## Documentación de mejoras

- Cada mejora debe incluir un archivo Markdown en `docs/` que describa la funcionalidad y cómo utilizarla. Si amplía una funcionalidad ya documentada, actualiza su archivo para mantener una única fuente de verdad.
- Documenta las reglas de negocio, los endpoints y sus contratos, los cambios de base de datos y migraciones, y los controles de seguridad cuando correspondan.
- Registra las verificaciones ejecutadas, sus resultados y las limitaciones pendientes. Distingue las migraciones creadas localmente de las aplicadas y no declares verificaciones que no se hayan ejecutado.
- Mantén la documentación en español, proporcional al cambio y actualizada con el comportamiento implementado.

## Skills del proyecto

- Mantén las Skills completas y compartidas en `.codex/skills/door-list-ui/` y `.codex/skills/impeccable/`, incluidos sus agentes, referencias, scripts y ejecutables.
- Las entradas de `.agents/skills/` sirven para el descubrimiento de Codex y remiten a los `SKILL.md` canónicos de `.codex/skills/`. Lee los canónicos y resuelve sus recursos desde esas carpetas; no mantengas copias independientes de sus instrucciones.
- Incluye las Skills, sus entradas de descubrimiento y `.codex/hooks.json` en los commits y PR que las incorporen o cambien. No vuelvas a ignorar esas rutas completas ni las retires del índice de Git como archivos locales.
- Versiona `.codex/config.toml` como configuración compartida del proyecto, usando referencias a variables de entorno para credenciales. Conserva ignorados los demás estados y configuraciones locales de `.codex/` y `.agents/`; no agregues credenciales ni tokens a estos archivos.

## Eficiencia del desarrollo y verificación

- Antes de implementar flujos con Auth o persistencia, define sus contratos y casos críticos de éxito, rechazo, fallo técnico y resultado incierto. Incluye concurrencia, idempotencia, recuperación de rechazos históricos, sesiones vencidas o revocadas, cambios de cuenta, horario y eliminación en cascada cuando correspondan. No dejes estos casos para el cierre de la implementación.
- En funcionalidades que combinan base de datos, autenticación y UI, verifica primero el núcleo transaccional y de autorización con pruebas dirigidas en un entorno autorizado. Integra después la UI sobre ese contrato estable para reducir correcciones tardías y rondas de migraciones.
- Revisa restricciones, orden de cascadas, permisos e índices antes de aplicar una migración. No uses el entorno remoto como primera comprobación de aspectos que puedan revisarse localmente. Conserva las correcciones de migraciones ya aplicadas en nuevas migraciones versionadas.
- Agrupa las verificaciones por cambios relevantes: pruebas dirigidas mientras se desarrolla y una pasada final de regresión, lint, tipos y build. Una comprobación aprobada solo se repite si hubo cambios que puedan afectarla, un fallo o una duda concreta pendiente. No repitas toda la integración por cambios únicamente documentales o visuales sin relación con ella.
- Agrupa las solicitudes previsibles de autorización, indicando proyecto, acciones, fixtures y limpieza. Reutiliza las aprobaciones vigentes dentro de su alcance; no vuelvas a pedir permiso para la misma operación autorizada. Los límites reales del sandbox y las acciones que excedan ese alcance siguen requiriendo aprobación.
- Si una herramienta falla, identifica primero la causa y usa la alternativa más pequeña que resuelva la comprobación necesaria. Evita encadenar reintentos o montar infraestructura de revisión que aporte poco valor. En Windows/OneDrive, detén los servidores de prueba antes de recompilar y verifica la ruta antes de limpiar exclusivamente artefactos generados; no limpies cachés preventivamente si no existe un problema.
- Conserva UTF-8 al editar archivos desde PowerShell u otros procesos; evita tuberías que sustituyan los acentos por `?`. Revisa el diff para detectar corrupción de texto, cambios de lockfile ajenos al objetivo y modificaciones accidentales.
- Mantén el alcance acordado y comunica las limitaciones con precisión. No conviertas mejoras cosméticas o advertencias ajenas a la funcionalidad en nuevas rondas de trabajo. No declares ejecutadas verificaciones que solo estén preparadas o simuladas.

## Control del navegador y revisiones visuales

- Por preferencia explícita del usuario, **no tomes control de su navegador ni de aplicaciones de escritorio para revisiones visuales rutinarias**. No es una fase obligatoria de cada cambio de UI.
- Utiliza ese control solo si el usuario lo solicita expresamente, si es estrictamente necesario para resolver un bloqueo concreto sin una alternativa de menor costo, o si permite resolver una auditoría crítica de seguridad, privacidad, integridad de datos o un flujo esencial que no pueda comprobarse adecuadamente de otra manera.
- Antes de utilizarlo, comunica qué incertidumbre concreta resolverá y por qué la lectura del código o las pruebas disponibles no bastan. Limita la sesión a ese objetivo y detente al obtener la evidencia necesaria. La disponibilidad de una herramienta o la conveniencia de una captura no justifican por sí solas su uso.
- Para cambios habituales, prioriza componentes y convenciones existentes, revisión del código y pruebas automatizadas pertinentes. No crees galerías, capturas sintéticas, infraestructura adicional ni rondas de agentes visuales solo para cumplir una ceremonia de revisión. Si el acceso al navegador falla, no pases automáticamente a automatización nativa: vuelve a evaluar si la comprobación merece ese costo.
- Esta preferencia del usuario prevalece sobre los pasos genéricos de las Skills que pidan capturas o control del navegador. Conserva sus reglas de diseño y accesibilidad, pero omite la automatización visual que no cumpla los criterios anteriores y documenta qué no se verificó. No presentes una revisión estática como prueba visual o de cámara física.
