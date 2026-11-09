# Design pass: entrada pública

| # | Hallazgo | Archivo:línea | Decisión | Razón |
| --- | --- | --- | --- | --- |
| 1 | El QR permanece visible cuando la entrada está usada o revocada, contradiciendo el estado y favoreciendo intentos de acceso fallidos. | `src/app/entradas/[codigo]/page.tsx` | atender|  |
| 2 | El estado y el QR de una entrada válida aparecen después de información personal, en lugar de priorizar la tarea de mostrar la entrada. | `src/app/entradas/[codigo]/page.tsx` | atender |  |
| 3 | La navegación global (Dashboard, Mis boletos y Eventos) distrae y confunde en un enlace privado de entrada. | `src/app/entradas/[codigo]/page.tsx` |  |  |
| 4 | El refresco no muestra cuándo se consultó el estado por última vez ni comunica visiblemente las actualizaciones automáticas. | `src/app/entradas/[codigo]/page.tsx` | atender |  |
| 5 | Se exponen códigos internos de estado como `(valid)`, `(used)` y `(revoked)`, que no aportan claridad a la persona compradora. | `src/components/ticket-status.tsx` | atender |  |
| 6 | En móvil, la persona debe desplazarse por datos personales antes de alcanzar el QR, que es la acción central en puerta. | `src/app/entradas/[codigo]/page.tsx` | atender |  |
| 7 | El QR no ofrece una alternativa útil para personas que no pueden verlo. | `src/app/entradas/[codigo]/page.tsx` | atender |  |
| 8 | La actualización automática puede cambiar el estado sin un anuncio claramente asociado para tecnologías de asistencia. | `src/app/entradas/[codigo]/page.tsx` |atender  |  |
| 9 | La página no indica cómo resolver una entrada usada o revocada. | `src/app/entradas/[codigo]/page.tsx` |  atender|  |
| 10 | El mensaje «Comprueba el enlace completo con el comprador» puede confundir cuando el titular de la entrada es una persona distinta del comprador. | `src/app/entradas/[codigo]/page.tsx` |atender  |  |
| 11 | Se muestra el código opaco completo, aunque aporta poco al flujo normal e incentiva compartirlo. | `src/app/entradas/[codigo]/page.tsx` |  atender|  |
| 12 | Los avisos «Evento no publicado» y «Evento pasado» pueden competir visualmente con el estado principal de la entrada. | `src/app/entradas/[codigo]/page.tsx` | atender |  |
| 13 | El contenedor de error usa un marco visual distinto al de la entrada pública. | `src/app/entradas/[codigo]/page.tsx` | atender |  |
