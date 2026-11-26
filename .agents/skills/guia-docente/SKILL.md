---
name: guia-docente-rompe-el-algoritmo
description: Guía pedagógica, técnica y de gestión de aula para docentes y co-programadoras de Rompe el Algoritmo Maipú (panel docente, modos de guardado, exportación de informes Excel/CSV y justificación TPACK / Aprendizaje Multimedia / Ley 21.719).
---

# Guía Docente y Co-Programadora — Rompe el Algoritmo Maipú

Este documento explica cómo utilizar la versión publicada en **Vercel + Supabase (PostgreSQL)**, cómo gestionar cursos con o sin guardado de progreso, y cuál es la fundamentación **TPACK**, de **Aprendizaje Multimedia (Mayer / Karpicke & Roediger)** y **Legal (Ley 21.719 / Ley 21.855)** detrás de cada decisión.

> [!IMPORTANT]
> **Acceso al sitio publicado:**
> - **URL pública para estudiantes:** `https://rompe-el-algoritmo-maipu-sndmp.vercel.app/`
> - **URL directa al panel docente:** `https://rompe-el-algoritmo-maipu-sndmp.vercel.app/?admin=1`
> - **Clave docente (`ADMIN_KEY`):** Se entrega por canal privado (guardada localmente en `data/admin.key` en el equipo de despliegue y como variable secreta en Vercel; **nunca se sube a GitHub**).

---

## 1. Cómo entrar al Panel Docente

1. Abre `https://rompe-el-algoritmo-maipu-sndmp.vercel.app/?admin=1` (o entra a la página principal y selecciona la pestaña **«Docente / administración»**).
2. Ingresa el **Código de administración** privado que te compartió tu compañero de equipo.
3. Verás el **Panel docente** con:
   - Resumen de códigos creados, códigos vigentes y niveles completados.
   - Selector de **Curso activo y retención**.
   - Generador de códigos individuales pseudónimos.
   - Probador de los 12 niveles (modo depuración docente que no altera datos de estudiantes).
   - Tabla de avance del curso y botones de exportación en **CSV** y **Excel (`.xls`)**.

---

## 2. Las dos modalidades de uso por curso

Antes de iniciar con un curso, debes elegir cómo trabajará ese grupo según la planificación didáctica y la autorización del establecimiento:

### Modalidad 1: Práctica sin guardado (Recomendada para taller de 1 sesión)
- **¿Cómo funciona?** Los estudiantes entran directamente pulsando **«▶ Probar el juego sin guardar progreso»** en la portada (o el curso se configura en modo `Práctica sin guardado`).
- **Privacidad:** No se generan códigos ni se guarda ningún dato en la base de datos. Al cerrar o recargar la pestaña, la partida se reinicia.
- **Cuándo usarla:** Clases únicas, muestras abiertas o primera aproximación exploratoria.

### Modalidad 2: Retomar otro día (Guardado pseudónimo con fecha de borrado)
- **¿Cómo funciona?**
  1. En **«Crear nuevo curso»** (o en el curso activo `7B-MUSICA-2026`), selecciona el modo **«2. Retomar otro día (con fecha de borrado)»**.
  2. Define:
     - **Vencimiento de códigos (máximo 30 días):** Plazo durante el cual los estudiantes pueden entrar con su código y avanzar en los 12 niveles.
     - **Borrado definitivo de datos (máximo 45 días):** Fecha en que la base de datos eliminará automáticamente el curso, todos sus códigos, sesiones y avances. Esto te deja una ventana de hasta **15 días** después de cerrada la actividad para descargar el informe en Excel o CSV.
  3. En **«Generar códigos»**, elige la cantidad (por ejemplo, `40` para un curso completo), los días de vigencia (máx. `30`) y el tipo de etiqueta neutra (`Estudiante`, `Equipo`, `Puesto` o `Grupo`).
  4. Pulsa **«Generar códigos»** y descarga de inmediato el archivo con **«Descargar Excel (.xls)»** o **«Descargar CSV»**.
     - *Nota de seguridad:* El servidor solo guarda una huella criptográfica (`SHA-256`) del código, por lo que los códigos en texto plano se muestran **una sola vez** al crearlos.

---

## 3. Regla de oro sobre la identidad de los estudiantes

- **Nunca se ingresan nombres, apellidos, RUT, correo ni número de lista en la página web.**
- El sistema asigna etiquetas secuenciales neutras (`Estudiante 1`, `Estudiante 2`, …) que nunca se repiten dentro del mismo curso, incluso si borras un código perdido y creas uno nuevo (`Estudiante 41`).
- **¿Cómo sabe la docente quién es `Estudiante 1`?**
  - Si necesitas vincular el avance con una evaluación formativa o sumativa, mantén esa relación (**Nombre del estudiante ↔ Código / Etiqueta**) en tu **cuaderno docente o planilla privada local**, completamente fuera de la plataforma web y de GitHub.

---

## 4. Cómo descargar el informe de avance (Excel y CSV)

En la sección inferior **«Avance del curso»**, tienes dos botones de exportación:
- **«Descargar informe Excel (.xls)»** (abre directamente en Microsoft Excel, LibreOffice Calc o Google Sheets con encabezados en negrita).
- **«Exportar CSV»** (compatible con cualquier software estadístico o de planillas).

El informe incluye por cada código del curso:
1. **Curso** (ej. `7B-MUSICA-2026`).
2. **Etiqueta (Pseudónimo)** (ej. `Estudiante 1`).
3. **Niveles Completados (de 12)**.
4. **Campaña Completada (`Sí` / `No`)**.
5. **Próximo Nivel / Punto de Retorno** (indica exactamente en qué artista y número de pregunta o fase de ritmo quedó el estudiante).
6. **Visibilidad Total Acumulada** (puntaje de la Fase 1 de comprensión y contexto).
7. **Aprobación Ritmo Promedio (%)** (desempeño en la Fase 2 musical).
8. **Mejor Racha Modo Infinito**.
9. **Sesiones Activas**, **Fecha de Vencimiento** y **Fecha de Borrado Automático**.

---

## 5. Acciones de gestión en sala de clases

En la tabla de avance puedes ejecutar cuatro acciones sobre cualquier estudiante:
- **Cerrar sesiones:** Útil si un estudiante dejó su sesión abierta en un computador del laboratorio. Cierra el acceso en ese PC sin invalidar su código.
- **Reiniciar avance:** Vuelve el progreso de ese código a cero conservando el mismo código.
- **Desactivar código:** Revoca el código (por ejemplo, si quedó expuesto) para que nadie más pueda entrar con él.
- **Borrar registro:** Elimina inmediatamente ese código y todo su progreso de la base de datos.

Si además deseas borrar todos los datos de un curso apenas terminada la unidad (sin esperar a la fecha de borrado automático), puedes pulsar **«Desactivar guardado y borrar progreso»** o **«Eliminar curso»**.

---

## 6. Fundamentación Pedagógica (TPACK + Mayer) y Legal (Ley 21.719)

| Decisión de Diseño | Justificación TPACK (Tecnología, Pedagogía y Contenido) | Aprendizaje Multimedia (Mayer, 2002) y Recuperación (Karpicke & Roediger, 2008) | Respaldo Legal Chileno (Ley 21.719 y Ley 21.855 - Protección de NNA) |
| --- | --- | --- | --- |
| **Códigos de 10 caracteres sin `0, O, 1, I` (`ABCDE-12345`) y sin registro con correo** | **TK + PK (Gestión de aula):** En 7° Básico, iniciar sesión con correo y contraseña suele tomar 10 a 15 minutos de la clase por olvidos. El código sin letras ambiguas permite entrar en 15 segundos y cambiar de PC en el laboratorio sin perder el avance. | **Reducción de carga cognitiva extrínseca (Mayer):** Elimina la fricción técnica previa y permite que toda la atención se enfoque en el contenido musical, territorial y biográfico de las 12 artistas. | **Minimización de datos y protección reforzada de menores:** El servidor en la nube jamás recibe datos personales identificables de niños, niñas o adolescentes. |
| **Dos modos por curso (*Sin guardado* vs *Retomar otro día*)** | **PK + CK (Flexibilidad curricular):** Adapta la herramienta tanto a una actividad exploratoria de 45 minutos como a una secuencia didáctica de varias clases. | **Principio de Segmentación y Ritmo Propio (Mayer):** Guardar el `checkpoint` exacto (artista, fase y pregunta pendiente) permite pausar la lectura del contexto y retomarla en la siguiente clase sin sobrecarga. | **Principio de finalidad:** Solo se almacenan registros pseudónimos cuando el objetivo pedagógico exige continuidad entre sesiones. |
| **Tope de 30 días de vigencia y borrado automático hasta 45 días** | **PK (Evaluación formativa):** Cubre un mes de clases para la unidad, cierra el ingreso de modificaciones al día 30 y entrega hasta 15 días extra a la docente para descargar su planilla Excel antes del borrado total. | **Práctica de Recuperación Espaciada (Karpicke & Roediger):** Favorece que el estudiante recupere información en distintas sesiones dentro de una ventana acotada, priorizando la retroalimentación explicativa sobre el puntaje aislado. | **Limitación del plazo de conservación y derecho de supresión:** La base ejecuta borrado en cascada (`ON DELETE CASCADE`) al cumplirse la fecha de eliminación. |
| **Etiquetas neutras forzadas y contador monótono por curso** | **TPK:** Impide que por error se tipee el nombre de un alumno en la interfaz, y garantiza que si se borra un código extraviado y se crea otro, el número de etiqueta nunca se duplique. | **Señalización clara:** Mantiene orden y trazabilidad limpia entre el panel web y el cuaderno privado de la docente. | **Seudonimización por diseño (*Privacy by Design*):** Cumple con separar técnicamente los datos de progreso del identificador real de la persona. |
