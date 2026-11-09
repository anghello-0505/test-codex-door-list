# QR: generación en servidor y lectura por cámara

## Decisión pendiente de implementación

- **Generación:** conservar el paquete ya instalado `qrcode` y el helper `src/lib/ticket-qr.ts`.
- **Lectura desde cámara:** incorporar `@zxing/browser` en un componente aislado con `"use client"` cuando se implemente el flujo de acceso.

No se debe instalar la dependencia del lector sin la aprobación requerida para nuevas dependencias.

## Generación en servidor

La página de la entrada es un Server Component y llama a `ticketQr(code)`. El helper usa `QRCode.create(code, { errorCorrectionLevel: "M" })` y construye un SVG mediante JSX. Por tanto, el QR ya se calcula y se renderiza en el servidor.

| Opción | Evaluación |
| --- | --- |
| Mantener `QRCode.create()` y el SVG actual | **Elegida.** No incorpora dependencias, permite controlar el SVG y evita introducir una cadena SVG completa en el DOM. |
| Usar `QRCode.toString(code, { type: "svg" })` | Más breve, pero produce el SVG entero como cadena. Aporta poco al diseño actual y requeriría tratar cuidadosamente su inserción. |

La API actual de `qrcode` soporta `toString` con salida SVG y `toBuffer` para una imagen PNG de servidor. Referencia consultada: [Node QRCode, API de servidor](https://github.com/soldair/node-qrcode/blob/master/_autodocs/api-reference/server-api.md).

## Lector de cámara en el navegador

| Opción | Evaluación |
| --- | --- |
| `@zxing/browser` | **Elegida.** Da control de la interfaz propia: el elemento `<video>`, la selección de cámara, el manejo de resultados y la detención explícita del lector. `decodeFromVideoDevice` usa la cámara trasera cuando no se indica un dispositivo, y devuelve controles con `stop()`. |
| `html5-qrcode` | Alternativa válida si se prefiere una interfaz de lector ya resuelta. Permite iniciar con `{ facingMode: "environment" }` y detenerse con `stop()`, pero su UI y comportamiento son más opinados. |

Referencias consultadas mediante Context7:

- [ZXing JS Browser: lectura desde cámara](https://github.com/zxing-js/browser/blob/master/_autodocs/api-reference/BrowserCodeReader-video.md)
- [html5-qrcode: configuración y ciclo de cámara](https://github.com/mebjas/html5-qrcode/blob/master/README.md)

## Reglas de implementación

1. Crear un componente cliente exclusivamente para el lector; conservar la ruta y la validación de negocio en el servidor.
2. Preferir la cámara trasera y mostrar estados claros para permiso denegado, cámara no disponible y error de lectura.
3. Detener el stream inmediatamente después de una lectura válida y también al desmontar el componente.
4. Codificar únicamente el `Ticket` code en el QR; no incluir datos personales ni el estado de la entrada.
5. Tratar el texto decodificado como entrada no confiable. Enviar el código a una API del servidor que valide formato, consulte el `Ticket` y marque el ingreso de forma atómica.
6. La decisión de permitir o rechazar el acceso pertenece al servidor: una decodificación correcta en el navegador nunca equivale a una entrada válida.
