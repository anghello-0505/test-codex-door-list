---
name: door-list-ui
description: >
  Crear o modificar interfaces de Doorlist, incluidas páginas, formularios,
  componentes, tablas y sus estados de carga, vacío y error. Usar también al
  revisar la consistencia visual de la UI. No aplica a cambios solo de API,
  persistencia o lógica que no afecten la interfaz.
---

# UI de Doorlist

Aplica estas reglas a la interfaz que estés creando o modificando. Respeta
`AGENTS.md` y las instrucciones específicas del usuario. Antes de implementar,
consulta las referencias pertinentes:

- [`references/visual-system.md`](references/visual-system.md) para estilo y diseño adaptable.
- [`references/component-structure.md`](references/component-structure.md) para componentes y arquitectura.
- [`references/data-states.md`](references/data-states.md) para carga, vacío y error.
- [`references/canonical-examples.md`](references/canonical-examples.md) para el patrón de tabla completo.

Revisa primero los estilos y componentes existentes. Reutilízalos si ya expresan
estas reglas; si aún no existen tokens o componentes compartidos, aplica los
valores definidos en las referencias. Una instrucción visual explícita del
usuario prevalece para la tarea actual.

Al finalizar, revisa la pantalla afectada en ancho estrecho y amplio, sus
estados relevantes, el foco por teclado y el contraste. Ejecuta las
comprobaciones del proyecto que correspondan y comunica las que no pudiste
realizar.
