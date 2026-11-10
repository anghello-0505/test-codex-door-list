# Skills del proyecto: restauración y conservación en Git

## Ubicación y uso

Las dos Skills compartidas tienen su copia canónica completa dentro de `.codex/skills/`:

| Skill | Ubicación | Archivos restaurados |
| --- | --- | --- |
| UI de Doorlist | `.codex/skills/door-list-ui/` | 6 |
| Impecable | `.codex/skills/impeccable/` | 64 |

Se recuperaron las instrucciones, metadatos de agentes, referencias, scripts, datos auxiliares y el ejecutable de Windows. Las fuentes originales están en los commits `e318ebe` y `e86a4ad`; los cambios de ubicación adaptan las referencias a `.codex/skills/impeccable/`.

Codex documenta el descubrimiento de Skills de repositorio bajo `.agents/skills/`. Para conservarlo sin mantener dos cuerpos de instrucciones, allí hay dos archivos `SKILL.md` de entrada que remiten a los canónicos de `.codex/skills/`. Sus referencias relativas se deben resolver desde la Skill canónica. No se requieren enlaces simbólicos ni configuración especial de Windows.

Las copias auxiliares antiguas de recursos que puedan quedar localmente en `.agents/skills/` permanecen ignoradas y no son la fuente de verdad. Una clonación nueva utiliza las entradas versionadas y los recursos canónicos en `.codex/`.

El archivo histórico `.codex/hooks.json` también se restauró y sus comandos apuntan a los lanzadores canónicos. Su presencia no acredita que un cliente concreto haya habilitado los hooks; esa activación depende del soporte y configuración del cliente. No se restauró ni modificó configuración de conexiones MCP ajena a las Skills.

## Conservación entre ramas y PR

La configuración anterior ignoraba `.codex/` y `.agents/` completos. Esto no borraba los archivos por sí mismo, pero impedía incorporar las restauraciones no versionadas a nuevos commits y PR.

La nueva `.gitignore` permite versionar las dos carpetas canónicas completas, `.codex/hooks.json` y las dos entradas de descubrimiento. El resto de estados/configuraciones locales continúa ignorado. Los scripts de las Skills quedan fuera del lint de la aplicación mediante `eslint.config.mjs`.

Para que sobrevivan en el repositorio remoto y lleguen mediante pull, estos archivos deben incluirse en un commit y ese commit debe incorporarse a la rama destino. Cambiar `.gitignore` sin incluir los archivos en el commit no basta. No puede garantizarse su presencia al cambiar a una rama antigua que todavía no contenga ese commit, ni ante una eliminación explícita posterior.

`AGENTS.md` registra las ubicaciones canónicas y exige conservar los recursos en los PR.

## Verificación

La restauración se verifica contando los 70 archivos canónicos, comparando sus contenidos con las copias originales con la única adaptación de rutas, validando las referencias Markdown locales y el JSON de hooks, comprobando la huella SHA-256 del ejecutable frente a `engine-checksums.txt` y ejecutando `engine-probe` desde el lanzador de `.codex/`.

Antes de integrar el cambio, comprobar que `git ls-files --others --exclude-standard .codex .agents` muestra los archivos nuevos y que `git check-ignore` no excluye las rutas compartidas. La configuración local y los recursos antiguos de `.agents/` deben seguir ignorados.

Este mantenimiento no modifica la funcionalidad de eventos, la base de datos, credenciales ni las políticas RLS. No requiere pruebas contra Supabase.

Referencia: [documentación oficial de Skills de Codex](https://learn.chatgpt.com/docs/build-skills).
