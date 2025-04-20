/**
 * Plantillas de prompts para el servicio de consultas en lenguaje natural
 * Este archivo contiene todas las plantillas de prompts utilizadas por el servicio
 */

/**
 * Genera el prompt para convertir consultas en lenguaje natural a SQL
 * @param {string} schemaDescription Descripción del esquema de la base de datos
 * @param {string} contextualGuidance Guía contextual basada en el tipo de consulta
 * @param {string} naturalQuery Consulta en lenguaje natural
 * @returns {string} Prompt completo para generar SQL
 */
function generateSqlPrompt(schemaDescription, contextualGuidance, naturalQuery) {
    return `
        Eres un experto generador de consultas SQL. Convierte la consulta en lenguaje natural a una consulta SQL precisa.
        ${schemaDescription}
        ${contextualGuidance}
        
        INSTRUCCIONES ESPECÍFICAS PARA CONSULTAS DE OTs GENERAL:
        busca en la tabla "ots_facturadas" HAS UN SELECT DE LAS SIGUINTES COLUMNAS:
        Periodo: [periodo] 
        Local: [local]
        Marca: [marca]
        Estado: [estado]
        Área: [área]
        Moneda: [moneda] (Sin impuestos)

        INSTRUCCIONES ESPECÍFICAS PARA CONSULTAS DE OTs ESPECÍFICAS O ESPECIFICO SIEPRE EN CUANDO INCLUYA LA PLACA O EL NUMERO DE OT:
        - Si la consulta es sobre una OT específica (por número de OT o placa), DEBES buscar en la tabla "historial_clinica" y usar LIMIT 1.
          Asegúrate de incluir TODOS estos campos en tu consulta:
          - Número de OT
          - Sede/Local
          - Nombre del asesor
          - Documento del cliente
          - Nombre del cliente
          - Fecha de apertura
          - Fecha de facturación o cierre
          - Área
          - Tipo de OT
          - Estado actual
          - Total facturado (monto)
          - Placa (si aplica)
        - Si la consulta es general sobre OTs facturadas (sin especificar número o placa), DEBES buscar en la tabla "ots_facturadas".
          IMPORTANTE: DEBES incluir TODOS los parámetros mencionados en la consulta como condiciones en el WHERE, por ejemplo:
          - Si se menciona una sede/local específica (ej. "Los Olivos"), incluir "local = 'Los Olivos'" en el WHERE
          - Si se menciona un área específica (ej. "mecánica"), incluir "area = 'mecánica'" en el WHERE
          - Si se menciona una marca específica (ej. "NISSAN"), incluir "marca = 'NISSAN'" en el WHERE
          - Para el periodo, considera que puede ser:
            * Fecha de apertura ("fecha_apertura = 'YYYY-MM-DD'")
        
            * O un rango de fechas ("fecha_apertura BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'" o "fecha_facturacion BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'")
        - Si la consulta es sobre la historia clínica de una placa específica, la condición WHERE debe ser por número de placa (placa = '[placa]') en la tabla "historial_clinica".

        Si la consulta es por número de NV MESÓN o simplemente meson, busca en la tabla "meson".
        - Si la consulta es sobre una NV MESÓN específica (por número), DEBES buscar en la tabla "meson" y usar LIMIT 1.
          Asegúrate de incluir TODOS estos campos en tu consulta:
          - Número de NV
          - Documento del cliente
          - Nombre del cliente
          - Fecha de apertura
          - Fecha de facturación o cierre
          - Cantidad de repuestos
          - Total NV (monto)
        - Si la consulta es general sobre NV MESÓN (sin especificar número), DEBES buscar en la tabla "meson".
          IMPORTANTE: DEBES incluir TODOS los parámetros mencionados en la consulta como condiciones en el WHERE, por ejemplo:
          - Si se menciona una sede/local específica, incluir "local = '[local]'" en el WHERE
          - Si se menciona un cliente específico, incluir "cliente = '[cliente]'" en el WHERE
          - Si se menciona un documento específico, incluir "documento = '[documento]'" en el WHERE
          - Para el periodo, considera que puede ser:
            * Fecha de apertura ("fecha_apertura = 'YYYY-MM-DD'")
            * O un rango de fechas ("fecha_apertura BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'" o "fecha_facturacion BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'")
        Si la consulta es sobre historial clinica de un vehículo, busca en la tabla "historial_clinica".
        Si la consulta es sobre REPUESTOS, busca en la tabla "consultas_repuestos" y reliza el WHERE por la columna de cod_repuesto.
        Si la consulta es general sobre OTs, busca en la tabla "ots_facturadas".
                
        Directrices generales:
        1. Analiza cuidadosamente la intención de la consulta
        2. Selecciona las tablas y columnas apropiadas
        3. Genera SQL sintácticamente correcto
        4. Usa WHERE, GROUP BY, ORDER BY según sea necesario
        5. No uses JOINs
        6. Optimiza el rendimiento cuando sea posible
        7. NUNCA ignores parámetros mencionados en la consulta (sede, área, marca, periodo, etc.)
        8. Devuelve solo la consulta SQL, sin explicaciones
        
        Consulta en Lenguaje Natural: ${naturalQuery}
    `;
}

/**
 * Genera el prompt para obtener respuestas en lenguaje natural a partir de resultados SQL
 * @param {boolean} noResults Indica si no se encontraron resultados
 * @param {string} contextualInstructions Instrucciones contextuales basadas en el tipo de consulta
 * @param {string} query Consulta original en lenguaje natural
 * @param {string} sqlQuery Consulta SQL generada
 * @param {string} serializableResult Resultados serializados de la consulta
 * @returns {string} Prompt completo para generar respuesta natural
 */
function generateNaturalResponsePrompt(noResults, contextualInstructions, query, sqlQuery, serializableResult) {
    return `
        Eres un analista de datos especializado en presentar información de manera clara y estructurada.
        
        ${noResults ? "IMPORTANTE: No se encontraron resultados para esta consulta. Debes responder indicando que no se encontró información para la consulta realizada." : ""}
        ${contextualInstructions}
        
        INSTRUCCIONES CRÍTICAS PARA FORMATO DE RESPUESTA:
        - DEBES generar una respuesta COMPLETA en un ÚNICO bloque de texto.
        - NO dividas la información en múltiples párrafos separados.
        - NO uses múltiples saludos o introducciones.
        - Toda la información debe estar conectada en un solo mensaje continuo.
        INSTRUCCIONES ESPECÍFICAS PARA CONSULTAS DE OTs ESOECIFICAS
        - PARA LA CONSULTAS DE OTS GENERAL QUIERO LOS SIGUNETES CAMPOS:
        Periodo: [periodo] 
        Local: [local]
        Marca: [marca]
        Estado: [estado]
        Área: [área]
        Moneda: [moneda] (Sin impuestos)

        INSTRUCCIONES ESPECÍFICAS PARA CONSULTAS DE OTs ESPECIFICAS O ESPECIFICO SIEPRE EN CUANDO INCLUYA LA PLACA O EL NUMERO DE OT:

        - **Para consultas sobre una OT específica (por número o placa):**
          IMPORTANTE: DEBES presentar la información en EXACTAMENTE este formato:
          Por supuesto. Aquí tienes la información de la OT [número]:\nOT: [número]\nSede: [local]\nAsesor: [Nombre del asesor]\nDoc. Cliente: [Número de documento]\nCliente: [cliente]\nF. Apertura OT: [fecha de apertura]\nF. Facturación o Cierre: [Fecha de facturación o cierre]\nÁrea: [área]\nTipo de OT: [Tipo de OT]\nEstado actual: [estado]\nTotal OT: [moneda facturada]
          Si algún dato no está disponible, indica "No disponible" en ese campo, pero NUNCA omitas ningún campo del formato.
          Si la consulta es por placa, usa el mismo formato pero agrega la placa al inicio de la respuesta.

        - **Para consultas generales sobre OTs (que NO mencionen un número específico de OT o placa):**
          IMPORTANTE: DEBES presentar la información en EXACTAMENTE este formato:
          Aquí está la información solicitada para OTs en [local] de marca [marca] en el área de [área]:\n[Incluir aquí los resultados de la consulta en formato tabular o lista según corresponda]\n\nTotal de OTs encontradas: [número]
          Si algún dato no está disponible, indica "No disponible" en ese campo correspondiente.
        
        INSTRUCCIONES ESPECÍFICAS PARA CONSULTAS DE NV MESÓN:
        
        - **Para consultas sobre una NV MESÓN específica (por número):**
          Cuando la consulta sea sobre una NV MESÓN (Nota de Venta de Mesón) por número, DEBES presentar la información en EXACTAMENTE este formato:
          
          Por supuesto. Aquí tienes la información de la NV MESÓN [número]:\nNV: [número]\nDoc. Cliente: [Número de documento]\nCliente: [nombre del cliente]\nF. Apertura: [fecha de apertura]\nF. Facturación o Cierre: [fecha de facturación]\nCantidad de repuestos: [cantidad]\nTotal NV: [moneda] (Sin impuestos)
        
        - **Para consultas generales sobre NV MESÓN (que NO mencionen un número específico):**
          IMPORTANTE: DEBES presentar la información en un formato claro y estructurado:
          Aquí está la información solicitada para NV MESÓN:\n[Incluir aquí los resultados de la consulta en formato tabular o lista según corresponda]\n\nTotal de NV MESÓN encontradas: [número]
          Si algún dato no está disponible, indica "No disponible" en ese campo correspondiente.

        INSTRUCCIONES ESPECÍFICAS PARA CONSULTAS DE REPUESTOS O CONSULAS REPUESTOS:

        Cuando la consulta sea sobre un repuesto o consulta de repuestos, DEBES presentar la información en EXACTAMENTE este formato:

        cliente : en soles\nPrecio unitario: [moneda] (Sin impuestos)\nICC: [ICC]\nStock disponible:\nLocal 1: 5 - Ubicación: A/A\nLocal 2: 5 - Ubicación: A/A\nLocal 4: 5 - Ubicación: A/A

        eso agrega en el prompt  se refiere a la tabla de  cosnultas repuestos

        y devuelve en soles y dolares el precio
        
        Si algún dato no está disponible, indica "No disponible" en ese campo, pero NUNCA omitas ningún campo del formato.
        
        Para otras consultas que no sean sobre OTs o NV MESÓN específicas, presenta la información de manera clara y concisa.
        
        Si es historial clinica responde de la siguiente manera:
        Sede: [fecha] | Asesor:[Nombre del asesor] | OT: [OT] |Tipo OT: [moneda] | Kilometraje: [Kilometraje] | F. Factura: [fecha] | F. Facturación o cierre: [fecha]
        
        Consulta: ${query}
        SQL: ${sqlQuery}
        Resultados: ${serializableResult}
    `;
}

/**
 * Genera instrucciones contextuales basadas en el tipo de consulta
 * @param {string} contextType Tipo de contexto (OT, NV_MESON, REPUESTOS, etc.)
 * @returns {string} Instrucciones contextuales
 */
function getContextualGuidance(contextType) {
    if (!contextType) return '';
    
    switch(contextType) {
        case 'OT':
            return `
            IMPORTANTE: El contexto actual de la conversación indica que estamos hablando sobre ÓRDENES DE TRABAJO (OT).
            Prioriza las tablas relacionadas con OTs como "ots_facturadas" y "otsconsultadas".
            Si la consulta es sobre asesores, asegúrate de buscar asesores relacionados con OTs, no de otras áreas.
            
            INSTRUCCIONES CRÍTICAS PARA CONSULTAS GENERALES DE OTs:
            - SIEMPRE incluye en el WHERE todos los parámetros mencionados en la consulta:
              * Si se menciona una sede/local específica (ej. "Los Olivos"), incluye "local = 'Los Olivos'" en el WHERE
              * Si se menciona un área específica (ej. "mecánica"), incluye "area = 'mecánica'" en el WHERE
              * Si se menciona una marca específica (ej. "NISSAN"), incluye "marca = 'NISSAN'" en el WHERE
            - Para el periodo, considera que puede ser:
              * Fecha de apertura ("fecha_apertura = 'YYYY-MM-DD'")
              * Fecha de cierre/facturación ("fecha_facturacion = 'YYYY-MM-DD'")
              * O un rango de fechas ("fecha_apertura BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'" o "fecha_facturacion BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'")
            `;
        case 'NV_MESON':
            return `
            IMPORTANTE: El contexto actual de la conversación indica que estamos hablando sobre NOTAS DE VENTA DE MESÓN.
            Busca en la tabla de "meson".
            
            INSTRUCCIONES CRÍTICAS PARA CONSULTAS GENERALES DE NV MESÓN:
            - SIEMPRE incluye en el WHERE todos los parámetros mencionados en la consulta:
              * Si se menciona una sede/local específica, incluye "local = '[local]'" en el WHERE
              * Si se menciona un cliente específico, incluye "cliente = '[cliente]'" en el WHERE
              * Si se menciona un documento específico, incluye "documento = '[documento]'" en el WHERE
            - Para el periodo, considera que puede ser:
              * Fecha de apertura ("fecha_apertura = 'YYYY-MM-DD'")
              * Fecha de cierre/facturación ("fecha_facturacion = 'YYYY-MM-DD'")
              * O un rango de fechas ("fecha_apertura BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'" o "fecha_facturacion BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'")
            - Para consultas generales, selecciona los campos relevantes que puedan responder a la pregunta del usuario
             quiero que solo relices los select de los que desaa el cliente no toda las columnas nunca  hagas el select * from  de las tablas 
            `;
        case 'REPUESTOS':
            return `
            IMPORTANTE: El contexto actual de la conversación indica que estamos hablando sobre REPUESTOS y su disponibilidad.
            Busca en la tabla de "consultas_repuestos" usa la columna "cod_repuesto" para el WHERE.
            `;
        case 'HISTORIA_CLINICA':
            return `
            IMPORTANTE: El contexto actual de la conversación indica que estamos hablando sobre HISTORIAS CLÍNICAS de vehículos.
            Busca en la tabla de "historial_clinica".
            Prioriza las tablas relacionadas con historial de servicios y reparaciones.
            `;
        default:
            return `
            IMPORTANTE: El contexto actual de la conversación indica que estamos hablando sobre ${contextType}.
            Prioriza las tablas y campos relacionados con ${contextType} en tu consulta SQL.
            `;
    }
}

module.exports = {
    generateSqlPrompt,
    generateNaturalResponsePrompt,
    getContextualGuidance
};