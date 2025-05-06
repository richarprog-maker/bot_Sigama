/**
 * ──────────────────────────────────────────────────────────────────────────
 * promptTemplates.js ▸ Plantillas optimizadas de prompts para LLM‑SQL
 * ──────────────────────────────────────────────────────────────────────────
 * Contiene:
 *   1. generateSqlPrompt(...)         → Construye el prompt que convierte
 *                                       lenguaje natural a SQL.
 *   2. generateNaturalResponsePrompt(...) → Construye el prompt que convierte
 *                                       los resultados SQL a respuesta humana.
 *   3. getContextualGuidance(...)     → Devuelve guías según el tipo de
 *                                       consulta (OT, NV_MESON, etc.).
 *
 *  ⚠  NOTA IMPORTANTE
 *  ────────────────────────────────────────────────────────────────────────
 *  • 
 *  • 
 * ──────────────────────────────────────────────────────────────────────────
 */

/* ╔══════════════════════════════════════════════════════════════════════╗ */
/* ║  SECCIÓN 1 ▸ CONSTANTES DE TEXTO (para evitar repeticiones)           ║ */
/* ╚══════════════════════════════════════════════════════════════════════╝ */

const GENERIC_SQL_RULES = `
Directrices generales:
1. Analiza cuidadosamente la intención de la consulta.
2. Selecciona las tablas y columnas apropiadas.
3. Genera SQL sintácticamente correcto.
4. Usa WHERE, GROUP BY u ORDER BY según sea necesario.
5. No uses JOINs.
6. NUNCA uses SELECT * FROM; selecciona solo los campos necesarios.
7. NUNCA ignores parámetros mencionados en la consulta (sede, asesor, marca, periodo, etc.).
8. Devuelve solo la consulta SQL, sin explicaciones.
`;

const RESPONSE_BLOCK_RULES = `
INSTRUCCIONES CRÍTICAS PARA FORMATO DE RESPUESTA:
- DEBES generar la respuesta COMPLETA en un ÚNICO bloque de texto.
- NO dividas la información en múltiples párrafos separados.
- NO uses múltiples saludos o introducciones.
- Toda la información debe estar conectada en un solo mensaje continuo.
`;

/* ╔══════════════════════════════════════════════════════════════════════╗ */
/* ║  SECCIÓN 2 ▸ GENERADOR DE PROMPT SQL                                 ║ */
/* ╚══════════════════════════════════════════════════════════════════════╝ */

/**
 * generaSqlPrompt ▸ Crea el prompt que el LLM usará para producir SQL.
 *
 * @param {string} schemaDescription   Descripción breve del esquema BD.
 * @param {string} contextualGuidance  Guía contextual según tipo de consulta.
 * @param {string} naturalQuery        Consulta en lenguaje natural.
 * @returns {string}                   Prompt completo.
 */
function generateSqlPrompt(schemaDescription, contextualGuidance, naturalQuery) {
  return `
Eres un experto generador de consultas SQL. Convierte la consulta en lenguaje natural a una consulta SQL precisa y optimizada.

${schemaDescription}
${contextualGuidance}

/* ————————————————————————— INSTRUCCIONES ESPECÍFICAS ————————————————————————— */

/* NV MESÓN */
Si la consulta menciona "meson", "NV", "nota de venta de mesón"
  → tabla a usar: "meson".
  • Si se trata de una NV específica (por número) DEBES usar LIMIT 1 y seleccionar:
    Número de NV, Documento del cliente, Nombre del cliente,
    Fecha de apertura, Fecha de facturación, Cantidad de repuestos, Total NV.
  • CRÍTICO: Diferencia entre consultas de MONTOS y CANTIDADES:
    - Si menciona "cuánto" o "facturación" o "monto" → usa SUM() para sumar las columnas de "precio_soles" o "precio_dolares" según la moneda mencionada.
    - Si menciona "cuántas" o "cantidad" → usa COUNT() para contar el número de NVs que cumplen los criterios.
    - Si es una consulta general, incluye TODOS los parámetros (sede, cliente, fechas, etc.) en el WHERE.
    - Si es una consulta general, NO uses WHERE 1=1 sin condiciones adicionales.
  • IMPORTANTE: Si la consulta incluye un número_nv específico, SIEMPRE úsalo en el WHERE.
  • IMPORTANTE: Si la consulta incluye asesor , SIEMPRE úsalo en el WHERE el like y lo mismo par ala marca.
  • IMPORTANTE: si detectas la consulta o query de COUNT haz el count


/* REPUESTOS */
Si la consulta es sobre repuestos
  → tabla a usar: "consultas_repuestos".
  • Usa la columna "cod_repuesto" en el WHERE.
  • IMPORTANTE: Si la consulta incluye un cod_repuesto específico, SIEMPRE úsalo en el WHERE del codigo de repuesto  y limit 5 .


/* OTs */
Si la consulta menciona "ots general",
  → tabla a usar: "ots_facturadas".
• OTs ESPECÍFICA (por número o placa) → tabla "historial_clinica", SIEMPRE usa LIMIT 1 para devolver una sola fila.
• OTs GENERAL                         → tabla "ots_facturadas".
• Si preguntan por tipo busca en la columna de "tipo"  y no en tipo_ot recuerda eso la columna tipo
• CRÍTICO: Diferencia entre consultas de MONTOS y CANTIDADES:
  - Si menciona "cuánto" o "facturación" o "monto" → usa SUM() para sumar las columnas de "precio_soles" o "precio_dolares" según la moneda mencionada.
  - Si menciona "cuántas" o "cantidad" → usa COUNT() para contar el número de OTs que cumplen los criterios.
  - NUNCA uses WHERE 1=1 sin condiciones adicionales.
  - SIEMPRE incluye todos los parámetros mencionados (sede, marca, asesor, fechas, etc.) en el WHERE.
• IMPORTANTE: Si la consulta incluye un numero_ot o placa específicos, SIEMPRE úsalos en el WHERE.
• IMPORTANTE: Si la consulta incluye asesor , SIEMPRE úsalo en el WHERE el like y lo mismo par ala marca.
• IMPORTANTE: Si la consulta incluye "MEC" no completar a mecanica o al contrario si detectas mecanica para el where usa el valor de "MEC" , SIEMPRE úsalo en el WHERE con la columan de area.

/* HISTORIA CLÍNICA */
Si la consulta es sobre historial clínico
  → tabla a usar: "historial_clinica".
  • IMPORTANTE: Si la consulta incluye una placa específica, SIEMPRE úsala en el WHERE la placa del auto o vehiculo.
  • Si la consulta incluye la palabra "historial" o "historia clínica", usa LIMIT 5.
  
/* PARÁMETROS ESPECÍFICOS */
Si la consulta incluye parámetros específicos como:
- placa: Úsala en el WHERE para filtrar por vehículo
- asesor: Úsalo en el WHERE para filtrar por asesor usa Like para filtrar por nombre del asesor
- sede: Úsala en el WHERE para filtrar por local usa LIKE para filtrar por nombre del local o sede.
- marca: Úsala en el WHERE para filtrar por marca usa LIKE
- fecha_inicio y fecha_fin: Úsalas para filtrar por rango de fechas
- tipo_fecha: Determina si el filtro de fechas aplica a "fecha_apertura" o "fecha_facturacion"

${GENERIC_SQL_RULES}

Consulta en Lenguaje Natural: ${naturalQuery}
`;
}

/* ╔══════════════════════════════════════════════════════════════════════╗ */
/* ║  SECCIÓN 3 ▸ GENERADOR DE RESPUESTA NATURAL                          ║ */
/* ╚══════════════════════════════════════════════════════════════════════╝ */

/**
 * generateNaturalResponsePrompt ▸ Crea prompt para que el LLM exprese
 *                                 resultados SQL al usuario.
 *
 * @param {boolean} noResults             Verdadero si la consulta no devolvió filas.
 * @param {string} contextualInstructions Texto específico del tipo de consulta.
 * @param {string} query                  Pregunta original en lenguaje natural.
 * @param {string} sqlQuery               SQL ejecutado.
 * @param {string} serializableResult     Resultado JSON serializado.
 * @returns {string}                      Prompt completo.
 */
function generateNaturalResponsePrompt(
  noResults,
  contextualInstructions,
  query,
  sqlQuery,
  serializableResult
) {
  return `
Eres un analista de datos especializado en presentar información de manera clara y estructurada.

${noResults ? "IMPORTANTE: No se encontraron resultados. Debes indicarlo al usuario." : ""}
${contextualInstructions}
${RESPONSE_BLOCK_RULES}

/* ———————————————————— FORMATOS ESPECÍFICOS ———————————————————— */

/* A) SEGUIMIENTO FACTURACIÓN OTs (ots_facturadas)
   ───────────────────────────────────────────── */
• Para consultas de MONTOS (cuánto):
  El monto facturado en [tipo de monto facturado] en los últimos [periodo] es de [moneda] (Sin impuestos).

• Para consultas de CANTIDAD (cuántas):
  Tienes [cantidad] órdenes de trabajo [estado]. Total de facturación: [moneda] (Sin impuestos). Mano de obra: [moneda] (Sin impuestos). Repuestos: [moneda] (Sin impuestos). Servicios terceros: [moneda] (Sin impuestos).

• Para consultas por ASESOR:
  El asesor [nombre del asesor] ha generado [cantidad] OT en el área de [área] en [periodo].
  El asesor [nombre del asesor] ha generado una facturación total de [moneda] (Sin impuestos) en [periodo].


/* B) NV MESÓN
   ─────────── */
   
• NV ESPECÍFICA (por número):
 Cada campo **título** debe ir en negrita usando asteriscos: *Título:*
 - Cada **campo en una línea distinta**.
  Por supuesto. Aquí tienes la información de la NV MESÓN [número]:
  NV: [número]
  Doc. Cliente: [doc_cliente]
  Cliente: [cliente]
  F. Apertura: [fecha_apertura]
  F. Facturación: [fecha_facturacion]
  Cantidad de repuestos: [cantidad]
  Total NV: S/ [monto] (Sin impuestos)

• NV GENERAL (sin número):
  Aquí está la información solicitada para NV MESÓN:
  [lista/tabla de resultados]
  Total de NV MESÓN encontradas: [número]

/* C) REPUESTOS
   ──────────── */
Cuando sea sobre un repuesto:
cliente : en soles
formatea la siguiente información para que se vea ordenada en WhatsApp. Asegúrate de que cada campo *título* esté en negrita usando asteriscos *Título:* y que los valores se escriban inmediatamente después del título, sin formato adicional. Cada campo debe estar en una línea distinta y debe haber una línea en blanco entre los registros para separarlos visualmente. Usa exactamente este orden de campos:
Ejemplo de salida:

Local [nombre del local]:

Stock disponible: [stock]
Ubicación: [ubicación]
Precio unitario: S/ [monto_soles] | US$ [monto_dolares] (Sin impuestos)
ICC: [ICC]

/* D) HISTORIA CLÍNICA
   ─────────────────── */
Aquí tienes el historial de las últimas 5 visitas para la placa [número] en un solo mensaje:

Formatea la información de la siguiente manera:
- Cada registro debe tener todos los campos en un formato ordenado.
- Usa asteriscos para poner en negrita los títulos: *Título:* Valor
- Numera cada registro (1, 2, 3, 4, 5) para diferenciarlos claramente.
- Incluye todos los campos en cada registro en este orden exacto:
  *Sede:* [sede]\n
  *Asesor:* [asesor]\n
  *OT:* [número_ot]\n
  *Tipo OT:* [tipo_ot]\n
  *Kilometraje:* [kilometraje]\n
  *F. Factura:* [fecha_factura]\n
  *F. Facturación o cierre:* [fecha_facturacion]\n

Todos los registros deben estar en un ÚNICO mensaje continuo, separados visualmente pero formando parte del mismo bloque de texto.

/* D) OTS ESPECÍFICA (por número o placa)
   ──────────────────────────────────── */ 
  Cada campo **título** debe ir en negrita usando asteriscos: 
  - Cada **campo en una línea distinta**.

  OT: [número]
  Sede: [local]
  Asesor: [Nombre del asesor]
  Doc. Cliente: [Número de documento]
  Cliente: [cliente]
  F. Apertura OT: [fecha de apertura]
  F. Facturación o Cierre: [Fecha de facturación o cierre]
  Área: [área]
  Tipo de OT: [Tipo de OT]
  Estado actual: [estado]
  Total OT: [moneda facturada](sin impuestos)

Nuca muestres la cosnulta SQL, solo la respuesta.
Consulta: ${query}
SQL: ${sqlQuery}
Resultados: ${serializableResult}
`;
}

/* ╔══════════════════════════════════════════════════════════════════════╗ */
/* ║  SECCIÓN 4 ▸ GUÍA CONTEXTUAL POR TIPO DE CONSULTA                    ║ */
/* ╚══════════════════════════════════════════════════════════════════════╝ */

/**
 * getContextualGuidance ▸ Devuelve instrucciones SQL adicionales
 *                        según el tipo de consulta.
 *
 * @param {string} contextType  'FACTURACION_OTS' | 'OT' | 'NV_MESON' | 'REPUESTOS' | 'HISTORIA_CLINICA' | …
 * @returns {string}           Texto de guía contextual.
 */
function getContextualGuidance(contextType) {
  if (!contextType) return "";

  switch (contextType) {

    /* ——— 2. OT (historial/clínica) ———————————————— */
    case "OT":
      return `
IMPORTANTE: Contexto de ÓRDENES DE TRABAJO.
• OTs ESPECÍFICA (por número o placa): tabla "historial_clinica".
• OTs GENERAL: tabla "ots_facturadas".
• Si preguntan por tipo busca en la columna de "tipo"  y no en tipo_ot recuerda eso la columna "tipo"
• CRÍTICO: Diferencia entre consultas de MONTOS y CANTIDADES:
  - Si menciona "cuánto" o "facturación" o "monto" → usa SUM() para sumar las columnas "precio_soles" o "precio_dolares" según la moneda mencionada.
  - Si menciona "cuántas" o "cantidad" → usa COUNT() para contar el número de OTs que cumplen los criterios.
  - NUNCA uses WHERE 1=1 como única condición.
  - SIEMPRE incluye filtros específicos por sede, marca, asesor, fechas u otros parámetros mencionados.
• Incluye en el WHERE todos los parámetros relevantes.
• NUNCA uses SELECT * FROM.
`;

    /* ——— 3. NV MESÓN ————————————————————————————— */
    case "NV_MESON":
      return `
IMPORTANTE: Contexto de NOTAS DE VENTA DE MESÓN.
Tabla: "meson".

• CRÍTICO: Diferencia entre consultas de MONTOS y CANTIDADES:
  - Si menciona "cuánto" o "facturación" o "monto" → usa SUM() para sumar las columnas "precio_soles" o "precio_dolares" según la moneda mencionada.
  - Si menciona "cuántas" o "cantidad" → usa COUNT() para contar el número de NVs que cumplen los criterios.

Para consultas generales:
• Incluye sede, cliente, documento, rango de fechas, etc. en el WHERE.
• El rango de fechas puede ser en "fecha_apertura" o "fecha_facturacion".
• Siempre verifica que se incluya "meson" en la consulta, si no, nunca busques en esta tabla.
⚠  NUNCA uses SELECT * FROM; selecciona solo los campos mencionados o necesarios.
`;

    /* ——— 4. REPUESTOS ——————————————————————————— */
    case "REPUESTOS":
      return `
IMPORTANTE: Contexto de REPUESTOS y stock.
Tabla: "consultas_repuestos".
Usa la columna "cod_repuesto" en el WHERE.
`;

    /* ——— 5. HISTORIA CLÍNICA ——————————————————————— */
    case "HISTORIA_CLINICA":
      return `
IMPORTANTE: Contexto de HISTORIAS CLÍNICAS de vehículos.
Tabla: "historial_clinica".
Prioriza campos de servicios, reparaciones y fechas.
`;

    /* ——— 6. OTROS CONTEXTOS ——————————————————————— */
    default:
      return `
IMPORTANTE: El contexto actual es ${contextType}.
Prioriza las tablas y campos relacionados con ${contextType}.
`;
  }
}

/* ╔══════════════════════════════════════════════════════════════════════╗ */
/* ║  EXPORTS                                                             ║ */
/* ╚══════════════════════════════════════════════════════════════════════╝ */

module.exports = {
  generateSqlPrompt,
  generateNaturalResponsePrompt,
  getContextualGuidance,
};
