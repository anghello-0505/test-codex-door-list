# Estructura de componentes

- Usa Server Components por defecto. Añade `"use client"` solo cuando haga
  falta estado, efectos, eventos o APIs del navegador.
- Deja junto a su ruta los componentes usados por una sola ruta. Mueve a
  `src/components/` los que se usen desde dos o más rutas.
- Comparte variantes visuales repetidas mediante componentes; no dupliques
  clases en pantallas distintas.
- No abstraigas un caso único sin una necesidad concreta.
- Reutiliza tipos y helpers compartidos de `src/lib/`.
- Revisa `src/app/globals.css` y los componentes existentes antes de crear
  tokens, estilos o componentes duplicados.
- Sigue la estructura y convenciones de `AGENTS.md` para rutas, idioma y
  vocabulario del dominio.
