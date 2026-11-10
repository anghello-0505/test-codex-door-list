# Desarrollo y verificación proporcional

Las reglas obligatorias están en `AGENTS.md`, en **Eficiencia del desarrollo y verificación** y **Control del navegador y revisiones visuales**. Este documento registra los motivos; no mantiene una copia independiente de las instrucciones.

## Aprendizajes de la etapa 2

- Se detectaron tarde el comportamiento de las cascadas de auditoría y la recuperación de rechazos por sesión vencida. Eso produjo rondas adicionales de migraciones, compilación e integración. Los contratos y la matriz de fallos deben contemplarlos antes de construir la UI.
- Se repitieron comprobaciones completas entre cambios pequeños. Deben agruparse según las partes afectadas, conservando una pasada final sobre la versión que se entrega.
- El reemplazo del navegador no disponible por automatización nativa, galerías y capturas sintéticas consumió demasiado tiempo frente a su valor. El usuario restringió expresamente ese control a solicitudes suyas, necesidades estrictas o auditorías críticas sin una alternativa adecuada.
- Las restricciones del entorno, OneDrive y las tuberías de texto añadieron trabajo. La respuesta debe corregir la causa concreta y preservar los archivos y procesos del usuario, sin convertir la recuperación de herramientas en un proyecto paralelo.

La optimización no elimina las pruebas necesarias de autorización, concurrencia, integridad o regresión. Evita repetirlas sin motivo y separa lo verificado de los límites de evidencia.

## Verificación de este cambio documental

Se revisaron las instrucciones existentes y el diff de los dos archivos; se ejecutó `git diff --check -- AGENTS.md docs/development-workflow.md`. No se cambió código, no se accedió a la base de datos y no se controló el navegador. No corresponde ejecutar build ni pruebas de aplicación por esta edición documental.
