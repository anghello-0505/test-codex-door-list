# Agentes reutilizables de Doorlist

Los tres perfiles convierten las especialidades de las tareas anteriores en instrucciones persistentes del repositorio. No guardan la memoria, resultados ni aprobaciones de los subagentes anteriores. Se identifican por `name` y están definidos como TOML independientes en `.codex/agents/`, según la [documentación oficial de agentes personalizados](https://learn.chatgpt.com/docs/agent-configuration/subagents#custom-agents).

| Perfil | Rol y alcance | Archivo canónico |
| --- | --- | --- |
| `door_accessibility` | Accesibilidad y operación de puerta: QR, código manual, búsqueda por email y estados de UI | [door_accessibility.toml](../.codex/agents/door_accessibility.toml) |
| `ticket_email` | Entradas, revocación, avisos al titular, PDF/QR y recuperación de entrega | [ticket_email.toml](../.codex/agents/ticket_email.toml) |
| `end_to_end` | Recorridos HTTP, fixtures, recepción del correo, admisión y limpieza | [end_to_end.toml](../.codex/agents/end_to_end.toml) |

Cada perfil declara sus rutas de escritura, exclusiones, coordinación, verificaciones y formato de entrega. Puede leer implementación relacionada, pero solo editar dentro de su lista y del encargo recibido. Los patrones `**` incluyen descendientes; `[id]` representa el directorio literal de una ruta dinámica Next.js, no un patrón de shell.

## Cómo invocarlos

Abre el repositorio en una versión de Codex que soporte agentes personalizados. Inicia una sesión nueva si el cliente no descubre los perfiles recién creados. Solicítalos por nombre en lenguaje natural; no son comandos slash ni skills `$nombre`.

```text
Usa el agente door_accessibility para revisar /scan con foco en teclado,
lectores de pantalla y objetivos táctiles. Solo revisión, sin editar archivos.
```

```text
Usa el agente ticket_email para corregir el reintento del aviso de revocación.
Limita los cambios a los archivos de entrega y sus pruebas permitidas.
No envíes correos reales ni accedas a bases de datos en esta tarea.
```

```text
Usa el agente end_to_end para ampliar el recorrido HTTP con el rechazo
de una entrada revocada. Prepara las pruebas y documenta qué entorno
y autorizaciones faltan antes de ejecutar integración real.
```

Para trabajo paralelo, solicítalo expresamente y asigna archivos disjuntos:

```text
Lanza exactamente tres subagentes en paralelo: door_accessibility para
revisar la UI de puerta; ticket_email para revisar la entrega y revocación;
end_to_end para revisar cobertura del recorrido. Solo lectura.
Espera a los tres y reúne hallazgos con referencias de archivo.
```

Para implementación, indica objetivo, archivos asignados, contrato esperado y verificaciones. Una petición de revisión no habilita cambios. Una asignación explícita puede ampliar el alcance de escritura por archivo; los permisos del usuario y del sandbox siguen siendo necesarios cuando correspondan.

## Coordinación y límites

- El principal asigna un único responsable a archivos compartidos antes de editarlos, especialmente tipos, mappers, detalle/API general del evento, pruebas compartidas y package.json. Un agente informa la dependencia y no se atribuye esa propiedad por su cuenta.
- El perfil de puerta se concentra en UI y accesibilidad; el de entradas, en el dominio y la entrega; el E2E reproduce defectos sin alterar producción para hacer pasar una prueba.
- No hay modelo ni nivel de razonamiento fijados: se heredan de la sesión. No se configura un nuevo MCP ni se amplían capacidades.
- Los límites de archivos son instrucciones operativas, **no una ACL impuesta por el sistema**. Los perfiles heredan los permisos de la sesión; no crean un sandbox independiente. [Permisos y agentes personalizados](https://learn.chatgpt.com/docs/agent-configuration/subagents#approvals-and-sandbox-controls).
- Se mantienen AGENTS.md y las skills aplicables, la aprobación previa de dependencias y bases de datos y las restricciones de navegador. Las autorizaciones previas solo se reutilizan si siguen vigentes dentro del mismo alcance.
- Ningún perfil autoriza nuevos subagentes, commits, despliegues o envío real de correo de forma automática. Mailpit acredita recepción local; un opt-in de tests no reemplaza aprobación del entorno.

## Versionado y verificación

`.gitignore` permite únicamente estos tres archivos dentro de `.codex/agents/`; los demás estados locales siguen ignorados. No se guardan snapshots, tokens ni credenciales en los perfiles.

Verificaciones ejecutadas y aprobadas: parser TOML de Python para los tres perfiles y la configuración compartida; tres nombres únicos y campos `name`, `description` y `developer_instructions`; enlaces relativos existentes, UTF-8 y ausencia de espacios finales; `git check-ignore --no-index` sin perfiles ignorados; `git status` mostrando los tres archivos nuevos y `git diff --check` sin errores. No se instalaron dependencias ni se ejecutaron la app, Docker, consultas SQL o pruebas de negocio.

Estas comprobaciones son estáticas. No se han lanzado agentes para probar su descubrimiento en una sesión nueva ni se afirma que un cliente concreto los haya cargado. No se modificaron funcionalidades, contratos HTTP ni esquema de base de datos.
