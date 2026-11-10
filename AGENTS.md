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
- Conserva ignorados los demás estados y configuraciones locales de `.codex/` y `.agents/`; no agregues credenciales ni tokens a estos archivos.
