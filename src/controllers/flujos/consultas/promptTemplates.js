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
/* ║  SECCIÓN 1 ▸ CONSTANTES DE TEXTO (para evitar repeticiones)          ║ */
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
INSTRUCCIONES EXTREMADAMENTE CRÍTICAS PARA FORMATO DE RESPUESTA:
- DEBES generar la respuesta COMPLETA en un ÚNICO bloque de texto continuo.
- NUNCA dividas la información en múltiples párrafos separados.
- NO uses múltiples saludos o introducciones.

- Para respuestas con múltiples registros (como historia clínica), usa numeración simple (1., 2., 3.) y evita asteriscos decorativos o símbolos especiales entre registros.
- Toda la información debe estar conectada en un solo mensaje continuo sin saltos de línea excesivos.
- Si la respuesta contiene múltiples registros, DEBES asegurarte de que sean parte del mismo mensaje, sin separaciones que puedan causar fragmentación.
`;

const FORMAT_GUIDELINES = `
INSTRUCCIONES CRÍTICAS PARA FORMATOS DE MONEDA Y FECHAS:
- MONEDAS: 
  * Soles: Formato "S/ 1,234.56" (con símbolo S/ al inicio, coma como separador de miles, punto para decimales)
  * Dólares: Formato "US$ 1,234.56" (con símbolo US$ al inicio, coma como separador de miles, punto para decimales)
- FECHAS: 
  * Siempre usa el formato DD/MM/YYYY (día/mes/año)
  * Ejemplo: 25/01/2023 para el 25 de enero de 2023
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
    - IMPORTANTE: Si menciona "cuánto" o "facturación" o "monto" pero NO menciona una moneda específica (soles/dolares) → usa SUM(precio_total_factura) para sumar el monto total.
    - Si menciona "cuántas" o "cantidad" → usa COUNT() para contar el número de NVs que cumplen los criterios.
    - Si es una consulta general, incluye TODOS los parámetros (sede, cliente, fechas, etc.) en el WHERE.
    - Si es una consulta general, NO uses WHERE 1=1 sin condiciones adicionales.
  • IMPORTANTE: Si la consulta incluye un número_nv específico, SIEMPRE úsalo en el WHERE.
  • IMPORTANTE: Si la consulta incluye asesor , SIEMPRE úsalo en el WHERE el like y lo mismo par ala marca.
  • IMPORTANTE: si detectas la consulta o query de COUNT haz el count


/* REPUESTOS */
Si la consulta es sobre stock, disponibilidad o información de un repuesto específico
  → tabla a usar: "consultas_repuestos".
  • Usa la columna "cod_repuesto" en el WHERE.
  • IMPORTANTE: Si la consulta incluye un cod_repuesto específico haz un select * from , SIEMPRE úsalo en el WHERE del codigo de repuesto  y limit 5 .

/* IMPORTANTE: DIFERENCIA ENTRE CONSULTAS */
• Si la consulta menciona "cuánto he facturado en tipo repuestos" o similar, NO es una consulta de repuestos sino una CONSULTA DE OTs GENERAL donde se filtra por la columna "tipo" con valor "REPUESTOS" → usa tabla "ots_facturadas".
• CRÍTICO: Las consultas sobre facturación o montos de "repuestos" deben tratarse como consultas de OTs generales, no como consultas de stock de repuestos.


/* HISTORIA CLÍNICA */
Si la consulta es sobre historial clínico
  → tabla a usar: "historial_clinica".
  • IMPORTANTE: Si la consulta incluye una placa específica, SIEMPRE úsala en el WHERE la placa del auto o vehiculo.
  • Si la consulta incluye la palabra "historial", "historia clínica", "clínica", usa LIMIT 5.
  

/* OTs */
Si la consulta menciona "ots general",
  → tabla a usar: "ots_facturadas".
• OTs ESPECÍFICA (por número o placa) → tabla "historial_clinica", SIEMPRE usa LIMIT 1 para devolver una sola fila, tambien usa el SELECT * FROM para devolver todas las columnas siempre en cuando no incluya historia clinca o algo similar.
• OTs GENERAL                         → tabla "ots_facturadas".
• Si preguntan por tipo busca en la columna de "tipo"  y no en tipo_ot recuerda eso la columna tipo
• CRÍTICO: Diferencia entre consultas de MONTOS y CANTIDADES:
  - Si menciona "cuánto" o "facturación" o "monto" → usa SUM() para sumar las columnas de "precio_soles" o "precio_dolares" según la moneda mencionada.
  - IMPORTANTE: Si menciona "cuánto" o "facturación" o "monto" pero NO menciona una moneda específica (soles/dolares) → usa SUM(precio_total_factura) para sumar el monto total.
  - Si menciona "cuántas" o "cantidad" → usa COUNT() para contar el número de OTs que cumplen los criterios.
  - simenciono tipo mo, haz en el where Tipo = "MO"
  - Si menciona "desglosar" o "desglose" o frases como "dame el desglose" → debes generar una consulta SQL que calcule 
  - recuerda solo si menciona desglose o desglosar o frases como "dame el desglose" → debes generar una consulta SQL que calcule  sino nnca uses esta consulta
    separadamente los montos para cada categoría usando la columna "tipo". Ejemplo para una consulta de desglose:
    
    SELECT 
      SUM(CASE WHEN tipo = 'MO' THEN precio_dolares ELSE 0 END) as mano_obra,
      SUM(CASE WHEN tipo = 'REPUESTOS' THEN precio_dolares ELSE 0 END) as repuestos,
      SUM(CASE WHEN tipo = 'SERVICIOS TERCEROS' THEN precio_dolares ELSE 0 END) as servicios_terceros
    FROM ots_facturadas
    WHERE 
      sede LIKE '%los olivos%' AND 
      marca LIKE '%nissan%' AND
      fecha_facturacion LIKE '%enero%2025%' AND
      moneda = 'DOLARES'
    
    • IMPORTANTE: Adapta los WHERE según los parámetros específicos de la consulta (sede, marca, fechas, etc.).
    • Si la consulta es sobre "dolares", usa la columna precio_dolares; si es sobre "soles", usa la columna precio_soles.
    • SIEMPRE filtra por la moneda adecuada en el WHERE con "moneda = 'DOLARES'" o "moneda = 'SOLES'".
  
  - NUNCA uses WHERE 1=1 sin condiciones adicionales.
  - SIEMPRE incluye todos los parámetros mencionados (sede, marca, asesor, fechas, etc.) en el WHERE.
• IMPORTANTE: Si la consulta incluye un numero_ot o placa específicos, SIEMPRE úsalos en el WHERE.
• IMPORTANTE: Si la consulta incluye asesor , SIEMPRE úsalo en el WHERE el like y lo mismo par ala marca.
• IMPORTANTE: Si la consulta incluye "MEC" no completar a mecanica o al contrario si detectas mecanica para el where usa el valor de "MEC" , SIEMPRE úsalo en el WHERE con la columan de area.


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
  // Detectar si es una consulta de desglose específicamente
  const isDesglose = query.toLowerCase().includes("desglos") || 
                    (sqlQuery.toLowerCase().includes("mano_obra") && 
                     sqlQuery.toLowerCase().includes("repuestos") && 
                     sqlQuery.toLowerCase().includes("servicios_terceros"));
                   
  return `
Eres un analista de datos especializado en presentar información de manera clara y estructurada.

${noResults ? "IMPORTANTE: No se encontraron resultados. Debes indicarlo al usuario." : ""}
${contextualInstructions}
${RESPONSE_BLOCK_RULES}
${FORMAT_GUIDELINES}

/* ———————————————————— FORMATOS ESPECÍFICOS ———————————————————— */

/* A) SEGUIMIENTO FACTURACIÓN OTs (ots_facturadas)
   ───────────────────────────────────────────── */
• Para consultas de MONTOS (cuánto):
  El monto facturado en [tipo de monto facturado] en los últimos [periodo] es de [S/ XX,XXX.XX o US$ XX,XXX.XX] (Sin impuestos).

• Para consultas de CANTIDAD (cuántas):
  Tienes [cantidad] órdenes de trabajo [estado]. Total de facturación: [S/ XX,XXX.XX o US$ XX,XXX.XX] (Sin impuestos). Mano de obra: [S/ XX,XXX.XX o US$ XX,XXX.XX] (Sin impuestos). Repuestos: [S/ XX,XXX.XX o US$ XX,XXX.XX] (Sin impuestos). Servicios terceros: [S/ XX,XXX.XX o US$ XX,XXX.XX] (Sin impuestos).

• Para consultas por ASESOR:
  El asesor [nombre del asesor] ha generado [cantidad] OT en el área de [área] en [periodo].
  El asesor [nombre del asesor] ha generado una facturación total de [S/ XX,XXX.XX o US$ XX,XXX.XX] (Sin impuestos) en [periodo].

• Para consultas de DESGLOSE de facturación:
  Por supuesto. Aquí tienes el desglose:
  Mano de obra: [S/ XX,XXX.XX o US$ XX,XXX.XX] (Sin impuestos)
  Repuestos: [S/ XX,XXX.XX o US$ XX,XXX.XX] (Sin impuestos)
  Servicios terceros: [S/ XX,XXX.XX o US$ XX,XXX.XX] (Sin impuestos)

${isDesglose ? `
CRÍTICO: Esta consulta es específicamente para un desglose de facturación. DEBES proporcionar la respuesta exactamente en este formato:

Por supuesto. Aquí tienes el desglose:
Mano de obra: US$ [X,XXX.XX] (Sin impuestos)
Repuestos: US$ [X,XXX.XX] (Sin impuestos)
Servicios terceros: US$ [X,XXX.XX] (Sin impuestos)

La respuesta DEBE incluir los tres valores específicos de la consulta SQL separados en tres líneas distintas, EXACTAMENTE en este formato con el formato de moneda correcto.
` : ""}

/* B) NV MESÓN
   ─────────── */
   
• NV ESPECÍFICA (por número):
 Cada campo **título** debe ir en negrita usando asteriscos: *Título:*
 - Cada **campo en una línea distinta**.
  Por supuesto. Aquí tienes la información de la NV MESÓN [número]:
  NV: [número]
  Doc. Cliente: [doc_cliente]
  Cliente: [cliente]
  Fecha Apertura: [DD/MM/YYYY]
  Fecha Facturación: [DD/MM/YYYY]
  Cantidad de repuestos: [cantidad]
  Total NV: S/ [X,XXX.XX] (Sin impuestos)

• NV GENERAL (sin número):
  Aquí está la información solicitada para NV MESÓN:
  [lista/tabla de resultados]
  Total de NV MESÓN encontradas: [número]

/* C) REPUESTOS
   ──────────── */
Cuando sea sobre un repuesto:
Formatea la información para que se vea ordenada en WhatsApp. Primero muestra la información común del repuesto (precio e ICC) y luego lista cada local con su stock y ubicación específicos.

Ejemplo de salida:

*Información del Repuesto:*
Descripción: [nombre del repuesto]
Precio unitario: S/ [X,XXX.XX] | US$ [X,XXX.XX] (Sin impuestos)


*Disponibilidad por Local:*

Local [local_1]:
Stock disponible: [stock_1]
Ubicación: [ubicación_1]

Local [local_2]:
Stock disponible: [stock_2]
Ubicación: [ubicación_2]

/* D) HISTORIA CLÍNICA
   ─────────────────── */
Aquí tienes el historial de las últimas 5 visitas para la placa [número]:

INSTRUCCIONES EXTREMADAMENTE CRÍTICAS PARA FORMATEO:
- DEBES generar TODA la respuesta como UN ÚNICO MENSAJE CONTINUO.

- haz salto de linea  de cada registro para mantener una orden 
- Sigue EXACTAMENTE este formato para cada registro:

HISTORIA CLÍNICA 1
*Sede:* Los Olivos
*Asesor:* NOMBRE COMPLETO salto de linea\n
*OT:* [num OT]salto de linea\n
*Tipo OT:* [TIPO OT] salto de linea\n
*Kilometraje:* [KILOMETRAJE OT] salto de linea\n
*Fecha Apertura:* [DD/MM/YYYY] salto de linea\n
*Fecha Facturación:* [DD/MM/YYYY] salto de linea\n
salto de linea\n
HISTORIA CLÍNICA 2
*Sede:* Los Olivos
... y así sucesivamente

CRÍTICO: La respuesta debe llegar al cliente como UN SOLO MENSAJE, no como mensajes separados. Reduce al mínimo los saltos de línea y el formateo que pueda interrumpir el flujo del texto. Si ves que la respuesta se está dividiendo en partes separadas, simplifica aún más el formato.

/* D) OTS ESPECÍFICA (por número o placa)
   ──────────────────────────────────── */ 
  Cada campo **título** debe ir en negrita usando asteriscos: 
  - Cada **campo en una línea distinta**.

  OT: [número]
  Sede: [sede]
  Asesor: [Nombre del asesor]
  Doc. Cliente: [Número de documento]
  Cliente: [cliente]
  Fecha Apertura OT: [DD/MM/YYYY]
  Fecha Facturación o Cierre: [DD/MM/YYYY]
  Área: [área]
  Tipo de OT: [Tipo de OT]
  Estado actual: [estado]
  Total OT: [S/ XX,XXX.XX o US$ XX,XXX.XX](sin impuestos)

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
  - IMPORTANTE: Si menciona "cuánto" o "facturación" o "monto" pero NO menciona una moneda específica (soles/dolares) → usa SUM(precio_total_factura) para sumar el monto total.
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
  - IMPORTANTE: Si menciona "cuánto" o "facturación" o "monto" pero NO menciona una moneda específica (soles/dolares) → usa SUM(precio_total_factura) para sumar el monto total.
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

CRÍTICO: Diferencia entre consultas:
• CONSULTA DE REPUESTOS: Se refiere a consultas sobre stock, disponibilidad o información de un repuesto específico.
• CONSULTA DE OTs POR TIPO REPUESTOS: Si preguntan por "cuánto he facturado en tipo repuestos" o similar, esto NO es una consulta de repuestos sino una CONSULTA OT GENERAL donde se filtra por la columna "tipo" con valor "REPUESTOS" en la tabla "ots_facturadas".

Si detectas que la consulta es sobre facturación o montos de tipo "repuestos", trátala como CONSULTA OT GENERAL y usa la tabla "ots_facturadas".
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
