# Configuración del MCP de GitHub en el proyecto

El archivo compartido de configuración está en `.codex/config.toml`, relativo a la raíz de Doorlist. Es independiente de la configuración de usuario de la máquina; esta restauración no modifica esa configuración global.

Se recuperó la copia del proyecto conservada en el commit `40de711`. Declara el servidor MCP de GitHub con la URL `https://api.githubcopilot.com/mcp/` y toma su credencial de la variable de entorno `GITHUB_PAT_TOKEN`. El archivo no contiene el valor del token. No guardar credenciales en el TOML ni en archivos versionados.

`.gitignore` permite ahora versionar expresamente `.codex/config.toml`. Para que el archivo llegue a otras ramas o máquinas mediante Git, debe incluirse en un commit y ese commit debe integrarse en la rama destino. La restauración local por sí sola no lo publica.

La presencia de este archivo configura un servidor MCP del proyecto; no equivale a instalar el plugin GitHub de ChatGPT. El cliente debe cargar la configuración de un proyecto de confianza y disponer de la variable de entorno al iniciar. Si la sesión abierta no muestra el servidor después de restaurarlo, abrir una sesión nueva o reiniciar el cliente y comprobar su lista de servidores MCP.

## Verificación realizada

- Se comprobó que el archivo del proyecto estaba ausente y que Git conservaba su copia histórica.
- Se restauró únicamente `.codex/config.toml` dentro del repositorio.
- Se valida el TOML y su referencia a `GITHUB_PAT_TOKEN` sin mostrar credenciales.
- Se comprobó la conexión al servidor mediante el protocolo MCP: se consultaron sus herramientas y los PR abiertos, y se creó el [PR #3](https://github.com/anghello-0505/test-codex-door-list/pull/3). La credencial se obtuvo de la variable de entorno sin mostrarla ni guardarla en el repositorio.

Referencia: [configuración de Codex](https://learn.chatgpt.com/docs/config-file/config-basic).
