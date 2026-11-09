---
name: Doorlist
description: "La puerta iluminada: identidad nocturna, directa y enérgica, con controles sobrios."
colors:
  accent: "#bef264"
  background: "#171321"
  foreground: "#f6f4fa"
  secondary: "rgba(255, 255, 255, 0.70)"
  surface: "rgba(255, 255, 255, 0.05)"
  border: "rgba(255, 255, 255, 0.15)"
  control-border: "rgba(255, 255, 255, 0.20)"
  secondary-button-border: "rgba(255, 255, 255, 0.25)"
  raised-background: "#211b2e"
  white: "#fff"
  error-text: "oklch(88.5% 0.062 18.334)"
  error-base: "oklch(70.4% 0.191 22.216)"
  destructive: "oklch(63.7% 0.237 25.331)"
  revoked-base: "oklch(80.8% 0.114 19.571)"
  warning-text: "oklch(92.4% 0.12 95.746)"
  warning-base: "oklch(87.9% 0.169 91.605)"
typography:
  display:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "36px"
    fontWeight: 800
    lineHeight: "40px"
    letterSpacing: "-0.025em"
  display-wide:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "48px"
    fontWeight: 800
    lineHeight: "48px"
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: "32px"
  title:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: "28px"
  body:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
  body-small:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  label:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: "16px"
    letterSpacing: "0.2em"
  button:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: "24px"
  button-small:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: "20px"
rounded:
  xl: "12px"
  2xl: "16px"
  3xl: "24px"
  full: "3.40282e38px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
  "12": "48px"
  "16": "64px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.background}"
    typography: "{typography.button}"
    rounded: "{rounded.full}"
    padding: "12px 20px"
  button-primary-hover:
    backgroundColor: "color-mix(in oklab, #bef264 90%, transparent)"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    typography: "{typography.button-small}"
    rounded: "{rounded.full}"
    padding: "8px 16px"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.white}"
    typography: "{typography.button}"
    rounded: "{rounded.full}"
    padding: "12px 20px"
  input-account:
    backgroundColor: "{colors.raised-background}"
    textColor: "{colors.white}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "12px 16px"
  input-organizer:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.white}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "12px 16px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.2xl}"
    padding: "24px"
  chip-valid:
    backgroundColor: "color-mix(in oklab, #bef264 10%, transparent)"
    textColor: "{colors.accent}"
    rounded: "{rounded.full}"
    padding: "4px 12px"
  chip-used:
    backgroundColor: "color-mix(in oklab, oklch(87.9% 0.169 91.605) 10%, transparent)"
    textColor: "{colors.warning-text}"
    rounded: "{rounded.full}"
    padding: "4px 12px"
  chip-revoked:
    backgroundColor: "color-mix(in oklab, oklch(80.8% 0.114 19.571) 10%, transparent)"
    textColor: "{colors.error-text}"
    rounded: "{rounded.full}"
    padding: "4px 12px"
---

# Design System: Doorlist

## Overview

**Creative North Star: "La puerta iluminada"**

Una señal lima destaca sobre el fondo nocturno y orienta las acciones. La identidad es nocturna, directa y enérgica, con controles sobrios: la fuerza está en el contraste, los títulos de peso alto y las acciones reconocibles.

Acciones claras y firmes, superficies suaves y controles sobrios. Las tarjetas agrupan información con bordes sutiles y capas de color; menús y diálogos se separan mediante sombras. La densidad es moderada, con información alineada a la izquierda y espacios mayores entre secciones que entre elementos relacionados.

**Key Characteristics:**

- Fondo Violeta noche y acento Lima señal.
- Una familia tipográfica; jerarquía por tamaño, peso y espaciado.
- Acciones en píldoras y contenedores de esquinas suaves.
- Capas sobrias; sombras para separar menús y diálogos.
- Estados identificados mediante texto y color.

Este documento registra la implementación existente y el lenguaje descriptivo confirmado. Fuentes: `src/app/globals.css`, las rutas de `src/app/`, los componentes de `src/components/` y los valores de `node_modules/tailwindcss/theme.css`. No hubo verificación del sitio renderizado en esta ejecución: el acceso del navegador no estaba disponible. No se ha acreditado conformidad de accesibilidad ni consistencia visual de todos los estados.

## Colors

Un único acento de marca, Lima señal, convive con neutros teñidos de violeta y colores semánticos para estados. Los valores normativos están en el frontmatter; los nombres siguientes explican su aplicación.

### Primary

- **Lima señal** (`accent`): botones principales, enlaces de acción, disponibilidad, barras de ocupación y el punto del logotipo tipográfico.

### Neutral

- **Violeta noche** (`background`): fondo de página y texto oscuro sobre acciones lima.
- **Blanco suave** (`foreground`): texto principal heredado del documento.
- **Blanco secundario** (`secondary`): texto de apoyo. El código también usa blanco con opacidades de 55–75 % y valores menores en metadatos y pie de página; no hay una escala semántica consolidada.
- **Velo de superficie** (`surface`) y **Borde sutil** (`border`): tarjetas y separadores sobre fondo oscuro.
- **Bordes de control** (`control-border`, `secondary-button-border`): delimitan campos y acciones secundarias.
- **Violeta de superficie elevada** (`raised-background`): campos de acceso/registro, menú de cuenta y diálogo.
- **Blanco puro** (`white`): texto de controles y fondo del QR. El QR conserva módulos negros sobre blanco.

### Semantic States

- **Rojo de error** (`error-text`, `error-base`): texto claro con fondo al 10 % y borde al 40 % del rojo base en alertas recurrentes.
- **Rojo de eliminación** (`destructive`): confirmación destructiva; el hover usa el rojo base de error.
- **Rojo de revocación** (`revoked-base`): fondo al 10 % y borde al 30 % en entradas revocadas.
- **Ámbar de estado** (`warning-text`, `warning-base`): entradas usadas, eventos pasados y avisos; las insignias usan fondo al 10 % y borde al 30 % del ámbar base.
- Las confirmaciones y las entradas válidas usan Lima señal con fondo al 10 % y borde al 30–40 %.

**The Semantic Color Rule.** Mantener cada color en su función actual y acompañar el estado de una etiqueta legible.

La variable `--danger` está declarada pero no se encontró uso en la UI revisada; no sustituye a los rojos que utilizan los componentes. La referencia local de UI menciona otro rojo de texto; aquí se conserva el valor que usa la implementación de Tailwind instalada. Estos desajustes se registran, sin normalizarlos durante esta documentación.

## Typography

**Display Font / Body Font:** Arial, Helvetica, sans-serif. No existe una fuente de marca separada para títulos. Noto Sans en `src/assets/fonts/` sirve a los PDF; no es la fuente de la interfaz web.

**Character:** voz directa mediante pesos fuertes y títulos compactos. La escala usa pasos de Tailwind y no una proporción única.

### Hierarchy

- **Display / Display wide:** títulos de página; la variante amplia aparece desde el breakpoint pequeño en portada y paneles. La portada añade interlineado de 1.25, por lo que no comparte exactamente el interlineado del panel.
- **Headline:** títulos de sección y tarjetas destacadas.
- **Title:** títulos de tarjetas del comprador y contenido subordinado.
- **Body:** contenido general; algunos párrafos introductorios usan 18 px con interlineado relajado.
- **Body small:** ayudas, fechas, celdas y metadatos.
- **Label:** etiquetas de sección en mayúsculas; el espaciado de 0.2em se usa en paneles y cabeceras de tabla. Existen variantes de 0.1em y 0.18em en otras superficies.
- **Button / Button small:** acción principal y controles secundarios, respectivamente. La acción de acceso en la portada usa una variante pequeña de peso 700.

**The Single Family Rule.** Conservar la familia web existente al extender el sistema; distinguir jerarquías mediante las variantes documentadas.

No hay un ancho de lectura global en caracteres: la portada limita el título y la introducción con contenedores propios. Los códigos de entrada usan el tratamiento monoespaciado nativo de `code`.

## Layout

Contenedores centrados y fluidos hasta un ancho máximo. El patrón general de portada y paneles alcanza 1152 px, con padding horizontal de 20 px y 40 px desde 640 px. Registro usa un máximo de 1024 px; la entrada pública, 672 px con padding de 20 px y 32 px desde 640 px.

La base del espaciado es de 4 px; el frontmatter recoge los pasos recurrentes. Las tarjetas suelen tener 24 px de padding, con variantes de 20 px y ampliaciones a 28–36 px en superficies públicas. Las separaciones entre tarjetas suelen ser de 16–20 px; los formularios y agrupaciones mayores, de 32 px. Los paneles empiezan a 48 px del límite superior de su contenido.

- **640 px / sm:** aumentan gutters y algunos títulos/paddings.
- **768 px / md:** portada, registro y disponibilidad pasan a dos columnas.
- **1024 px / lg:** administración y boletos del comprador pueden pasar a dos columnas; la portada aumenta su espacio vertical.
- **400 px, excepción local:** los tres indicadores de capacidad se distribuyen en columnas; por debajo se apilan.

Las tablas conservan sus columnas y permiten desplazamiento horizontal con un ancho mínimo de 640 px. La gráfica diaria también tiene desplazamiento horizontal propio. Navegación y grupos de acciones permiten salto de línea. Nombres y códigos largos usan reglas de ruptura para evitar desbordes.

## Elevation & Depth

**Capas sobrias; sombras para separar menús y diálogos.** Las tarjetas de contenido no tienen sombra: la profundidad se expresa mediante el velo claro sobre el fondo y bordes de un píxel. El menú de cuenta utiliza la sombra `xl` de Tailwind; el diálogo de eliminación, `2xl`, acompañado por un backdrop negro al 75 %. Los valores exactos de sombra están en `.impeccable/design.json`.

**The Overlay Depth Rule.** Reservar las sombras existentes para las capas superpuestas, manteniendo las tarjetas de contenido sin elevación artificial.

El CSS conserva una ilustración radial con órbitas y una esfera, pero no se encontraron usos en las rutas revisadas. No constituye un patrón visual activo ni una indicación de añadir degradados a los paneles.

## Shapes

Esquinas suaves con funciones diferenciadas: campos y elementos internos usan `xl`; paneles y tablas, `2xl`; algunas tarjetas públicas y la entrada, `3xl`. Los botones y las insignias tienen silueta de píldora. El token `full` conserva el valor generado por Tailwind; expresa redondeo completo, no una dimensión de layout.

Los bordes son normalmente de un píxel. Las barras de ocupación también terminan en redondeo completo. El favicon (`src/app/icon.svg`) representa una puerta lima sobre un cuadrado violeta redondeado; el wordmark de la UI se construye con texto en negrita y un punto lima.

## Components

### Buttons

Acciones claras y firmes. La acción principal usa Lima señal con texto Violeta noche y padding de 12 px por 20 px; su hover reduce el fondo al 90 %. Las acciones secundarias usan borde claro al 25 %, tamaño de texto pequeño y padding de 8 px por 16 px; al pasar el puntero cambian borde y texto al acento.

La acción destructiva del diálogo usa rojo y texto blanco, con hover en un rojo más claro. La reducción de opacidad deshabilitada suele ser del 50 %, con una variante de 40 % en paginación. Los textos cambian durante operaciones pendientes. No hay una transición o transformación animada común definida.

El foco global usa outline lima de 2 px con separación de 3 px; algunos controles lo especializan con separación de 2 o 4 px. El estado de foco se conserva en los snippets del sidecar.

### Chips

Las insignias de `TicketStatus` tienen texto de 14 px en peso 700, borde de un píxel y padding de 4 px por 12 px. Distinguen válida, usada y revocada con texto explícito además del color. Son informativas y no actúan como filtros ni botones. La implementación actual incluye el código interno del estado entre paréntesis.

### Cards / Containers

Paneles con superficie translúcida, borde sutil y radio `2xl`. Las tarjetas públicas pueden aumentar su radio a `3xl`. Agrupan título, metadatos, contenido y acciones; las separaciones interiores y divisores marcan la jerarquía. No se encontró un comportamiento general de elevación al hover.

### Inputs / Fields

Campos de ancho completo, radio `xl`, borde claro al 20 % y padding de 12 px por 16 px. Acceso y registro usan Violeta de superficie elevada; organización usa la superficie translúcida. Las etiquetas permanecen visibles sobre el campo. Al enfocar, el borde se vuelve lima; los campos deshabilitados de acceso/registro reducen su opacidad al 60 %.

`select` y `textarea` comparten la apariencia de campo. Los errores suelen mostrarse como mensaje o alerta del formulario, sin un patrón uniforme de error por campo. No inventar un estado individual de validación al describir el sistema actual.

### Navigation

El wordmark combina texto de peso 800 y punto lima. La navegación de cuenta es horizontal con salto de línea, tamaño de 14 px y peso 600; sus enlaces son lima. No tiene una distinción visual implementada para la ruta activa: no documentar un indicador seleccionado inexistente.

La cuenta se abre mediante `details`/`summary` como menú alineado a la derecha, de 256 px de ancho, con fondo sólido, radio `2xl` y sombra. La navegación pública varía por ruta; no hay un único header compartido para todas las pantallas.

### Availability and Daily Registrations

La tarjeta de disponibilidad combina nombre, porcentaje y tres cantidades etiquetadas. Una barra lima de 8 px de alto expresa ocupación sobre un carril blanco al 10 %; el ancho se limita visualmente al 100 % y el exceso conserva una advertencia textual. El progreso tiene nombre y valores accesibles.

La gráfica diaria usa barras lima con esquinas superiores suaves, cantidades visibles y fechas pequeñas; no representa una nueva paleta de visualización. Sus etiquetas de fecha llegan a 10 px: es una excepción observada, no un tamaño general de texto auxiliar.

### Tables and Data States

Tabla semántica alineada a la izquierda, en contenedor redondeado con borde y superficie translúcida. Cabeceras pequeñas en mayúsculas, separadores horizontales y celdas con 16 px de padding. La carga mantiene los encabezados y muestra tres filas de marcadores con pulso de dos segundos; la carga de disponibilidad usa tarjetas con marcadores equivalentes.

El vacío se muestra con texto dentro del marco de tabla, después de una consulta correcta. El error tiene mensaje propio y reintento cuando procede. Carga y errores usan `role="status"` y `role="alert"` según el caso. No se añade aquí una garantía de soporte de movimiento reducido: no se encontró una adaptación específica en el código revisado.

### Dialog and Public QR

El diálogo destructivo es nativo, centrado, con ancho `min(94vw, 36rem)`, alto máximo de 90vh, scroll interior y padding de 24–32 px. Contiene resumen, advertencia y confirmación escrita del nombre antes de habilitar la eliminación.

El QR de la entrada se centra, conserva negro sobre blanco y se limita a 288 px de ancho con altura proporcional. No aplicar el acento de marca a sus módulos ni retirar su margen de lectura.

## Do's and Don'ts

### Do:

- **Do** mantener Lima señal para acciones, disponibilidad y estados válidos, acompañado de etiquetas claras.
- **Do** reutilizar la familia Arial/Helvetica y la jerarquía de títulos y textos existente.
- **Do** distinguir paneles con bordes y capas de color; separar menús y diálogos con las sombras documentadas.
- **Do** conservar etiquetas de campo, foco visible, encabezados de tabla y mensajes específicos de carga, vacío y error.
- **Do** mantener el QR negro sobre blanco con su margen de lectura.

### Don't:

- **Don't** introducir otra paleta o fuente al extender esta identidad sin una decisión de diseño explícita.
- **Don't** convertir insignias informativas en controles ni comunicar validez solamente mediante color.
- **Don't** describir una ruta activa, un hover elevado o una animación general que los componentes actuales no implementan.
- **Don't** promover el CSS de órbitas sin uso o la variable de peligro sin uso como patrones activos del sistema.
- **Don't** ocultar el ancho de una tabla recortando columnas; mantener su contenedor desplazable.
