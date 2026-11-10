# Ejemplo canónico: tabla de asistentes

Usa este patrón de estructura para tablas del producto. Cambia las columnas y
el copy según el dominio, conservando las reglas visuales y la separación
entre carga, vacío y error.

## Estructura y datos

- Panel con fondo `rgba(255, 255, 255, 0.05)`, borde de 1 px
  `rgba(255, 255, 255, 0.15)` y radio de 16 px.
- Encabezados de ejemplo: “Nombre”, “Correo” y “Estado”.
- Encabezados alineados a la izquierda, tamaño 12 px, peso 700,
  mayúsculas, color secundario y padding de 16 px.
- Celdas con tamaño 14 px y padding de 16 px.
- Separa filas con borde inferior de `rgba(255, 255, 255, 0.15)`.
- Envuelve la tabla en un contenedor con desplazamiento horizontal.
- Muestra una fila por asistente. El estado incluye texto legible, como
  “Confirmado”; el color no es el único indicador.

## Carga

Conserva encabezados y muestra tres filas de marcadores. Cada fila tiene tres
bloques de 12 px de alto, con anchos de 128, 192 y 80 px. Los marcadores son
decorativos. Expón una sola indicación `role="status"` con el texto
“Cargando asistentes…”.

## Vacío

Tras carga correcta sin resultados, conserva encabezados y muestra una celda
que abarque las tres columnas, con padding de 32 px y texto centrado:
“Aún no hay asistentes.”

Con filtros activos, usa: “No hay asistentes que coincidan con los filtros.”
Muestra una acción para crear asistentes solo si es válida en esa pantalla.

## Error

Muestra “No pudimos cargar los asistentes.” y, si es posible reintentar, un
botón “Volver a intentar”. No muestres el mensaje técnico del proveedor.
