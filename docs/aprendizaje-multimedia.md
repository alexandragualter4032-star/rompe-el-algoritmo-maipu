# Diseño pedagógico del juego

Referencia principal: Richard E. Mayer, “Multimedia Learning”, *The Psychology of Learning and Motivation*, vol. 41 (2002), pp. 85–139. Se revisó el PDF proporcionado por el equipo: `MULTIMEDIA LEARNING by Richard E. Mayer.pdf`.

Mayer plantea tres supuestos: procesamos información visual y auditiva por canales parcialmente distintos, cada canal tiene capacidad limitada y aprender exige seleccionar, organizar e integrar información. Por eso, añadir imágenes, música o video no mejora el aprendizaje por sí solo; deben ayudar a entender el contenido de la pregunta.

## Aplicación al juego

| Principio | Decisión aplicada | Límite actual |
| --- | --- | --- |
| Contigüidad espacial | La portada y el título del disco o single aparecen juntos en el nivel. El contexto y la pregunta comparten pantalla. | Aún faltan portadas de siete niveles. En Javiera Mena, la portada de *Esquemas Juveniles* y el video de *Mena* deben presentarse como obras distintas. |
| Segmentación y entrenamiento previo | Una explicación breve precede a cada fase; el cuestionario muestra una pregunta a la vez y no impone tiempo. | Se puede hacer aún más breve el texto introductorio cuando se pruebe con el curso. |
| Señalización | “Contexto”, “Pregunta”, letras de opciones y respuesta explicada tienen zonas claras. | Conviene comprobar con estudiantes qué etiquetas ayudan realmente. |
| Coherencia | Los reproductores de YouTube están identificados y tienen controles propios; el juego puede pausarse. | La reproducción automática puede competir con la lectura. Se mantiene por decisión del equipo y debe probarse en clase. |
| Procesamiento activo | Hay que responder antes de ver la explicación. Las opciones se mezclan para evitar aprender el patrón de la letra A. | La mayoría de preguntas son de reconocimiento; faltan algunas tareas breves de explicación o comparación. |

La investigación de Karpicke y Roediger sobre práctica de recuperación respalda pedir al estudiante que recuerde y use información, en vez de solo volver a leerla. En este juego, la retroalimentación tras responder es más valiosa que el puntaje por sí solo. Fuente: Karpicke y Roediger, “The Critical Importance of Retrieval for Learning”, *Science* 319 (2008), pp. 966–968, DOI 10.1126/science.1152408.

El mapa ofrece una referencia espacial para Maipú, Santiago y Viña del Mar, y mantiene ocultos los nombres de artistas aún no descubiertas. Solo marca la ciudad o comuna indicada en los datos del juego; no atribuye barrios desconocidos. Puede apoyar la relación entre música y territorio si las preguntas invitan a usarlo, pero esa relación aún debe comprobarse con estudiantes.

## Qué no conviene afirmar todavía

La fase de ritmo genera notas aleatorias según velocidad e intervalo configurados por artista. No analiza el audio ni sincroniza las notas con una canción. Puede motivar y dar variedad al juego, pero hoy no demuestra por sí sola aprendizaje musical sobre el disco. Para lograrlo haría falta una secuencia de notas diseñada para cada grabación y una actividad que pida escuchar alguna característica musical concreta.

El rostro flotante añade un dato curioso. También puede interrumpir la lectura de las preguntas. La prueba con estudiantes debería observar si ayuda a recordar a la artista o solo distrae. Mantener el dato opcional y dar tiempo sin límite para responder reduce esa presión.

## Próxima prueba con el curso

1. Pedir a un grupo pequeño que juegue dos niveles, sin explicarles cada botón.
2. Observar dónde se detienen, si leen el contexto y si el video dificulta escuchar o pensar.
3. Hacer dos preguntas breves de recuerdo al final y repetirlas días después.
4. Ajustar volumen, duración del texto y dificultad según lo observado.

Las fotos, portadas, grabaciones y videos deben usarse conforme a los permisos de sus titulares. El juego enlaza reproductores de YouTube y no copia los videos al repositorio. Antes de usar los datos curiosos como contenido evaluado, conviene verificar sus afirmaciones con fuentes primarias.

## Justificación TPACK, Aprendizaje Multimedia y Privacidad Legal (Retención y Base de Datos)

Las decisiones técnicas de persistencia (`src/server/db.ts`), panel docente (`src/react/AdminPanel.jsx`) y despliegue se articulan bajo el marco **TPACK** (Conocimiento Tecnológico, Pedagógico y de Contenido), la **Teoría Cognitiva del Aprendizaje Multimedia** (Mayer, 2002), la **Práctica de Recuperación** (Karpicke & Roediger, 2008) y el **marco chileno de protección de datos personales de niños, niñas y adolescentes (Ley 21.719 y Ley 21.855)**:

| Decisión de diseño | Justificación TPACK (Aula y Contenido) | Aprendizaje Multimedia y Recuperación | Respaldo Legal y Ético (Ley 21.719 / Ley 21.855) |
| --- | --- | --- | --- |
| **1. Práctica principal sin códigos ni cuentas** | **TK + PK:** En 7° Básico, iniciar sin repartir credenciales ahorra tiempo de clase y permite dedicarlo a la actividad musical. | **Reducción de carga cognitiva extrínseca (Mayer):** El juego comienza sin pasos de registro ni necesidad de recordar una clave. | **Minimización de datos y protección reforzada de NNA:** La actividad no solicita identidad ni guarda progreso en el servidor. |
| **2. Guardado opcional para retomar otro día** | **PK + CK:** El modo técnico permite continuidad en varias sesiones cuando el docente decide que justifica el tiempo de gestión. | **Segmentación y ritmo propio (Mayer):** El guardado de `checkpoint` (nivel, fase y pregunta pendiente) permite pausar y distribuir el estudio en varias sesiones. | **Principio de finalidad:** La actividad usual de una sesión no requiere cuentas ni recolección de datos en el servidor. |
| **3. Vigencia máxima de 30 días (`expires_at`) y borrado automático hasta 45 días (`delete_at`)** | **PK (Evaluación formativa):** Una unidad escolar dura entre 2 y 4 semanas. Al vencer los 30 días, el código se cierra para nuevos cambios, y el docente dispone de hasta 15 días adicionales para descargar el informe en **CSV o Excel (`.xls`)** antes de la purga definitiva. | **Práctica de recuperación espaciada (Karpicke & Roediger):** Delimita una ventana pedagógica clara de práctica y permite al docente analizar el avance acumulado por nivel. | **Limitación del plazo de conservación y derecho de supresión:** Al cumplirse `delete_at`, la base ejecuta `ON DELETE CASCADE` eliminando curso, códigos, sesiones y progreso. |
| **4. Contador monótono por curso (`next_student_seq`) y prevención de colisiones** | **TPK:** Si un estudiante pierde su código y el docente lo elimina para generar uno nuevo, el sistema asigna el siguiente número (`Estudiante 41`) sin reutilizar etiquetas anteriores, evitando confusiones en la planilla privada del docente. | **Señalización consistente:** Mantiene una correspondencia unívoca y ordenada en los informes descargables. | **Integridad y seudonimización:** Restricciones `UNIQUE (code_hash)` sobre $32^{10}$ combinaciones y `UNIQUE (course_id, label)`. |

