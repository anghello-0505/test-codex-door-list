# Estados de datos

Modela explícitamente los estados de una consulta: carga, datos listos (con
resultados o sin ellos) y error. No muestres vacío mientras los datos cargan.

## Tablas

- Usa HTML semántico (`table`, `thead`, `tbody`, `th`, `td`) y permite
  desplazamiento horizontal en pantallas estrechas.
- Conserva los encabezados durante carga y vacío.
- Vacío solo aparece tras carga correcta sin resultados. Con filtros activos,
  informa que no hay coincidencias.
- Carga muestra tres filas de marcadores y una indicación accesible de carga.
- Error es independiente de vacío. Muestra copy en español y ofrece reintento
  si la operación se puede repetir. No expongas mensajes del proveedor.

No hagas que el color sea el único indicador. El contenido y las acciones
cambian según el estado, pero el marco de la tabla permanece estable.
