/**
 * Servicio para procesar consultas en lenguaje natural y convertirlas a SQL
 * 
 */

const { openai } = require('../../../config/openaiConfig.js');
const { getConnection } = require('../../../config/dbConnection.js');
const logger = require('console');

class EnhancedNaturalLanguageMySQLInterface {
    constructor() {
        this._schemaCache = null;
        this.queryHistory = [];
        this.currentQueryContext = null;
    }

    /**
     * Obtiene y cachea el esquema de la base de datos
     * @returns {Promise<Object>} Esquema de la base de datos
     */
    async getDatabaseSchema() {
        if (this._schemaCache) {
            return this._schemaCache;
        }

        const schema = {};
        let conn;

        try {
            conn = await getConnection();
            const [tables] = await conn.query('SHOW TABLES');
            
            for (const tableRow of tables) {
                const tableName = Object.values(tableRow)[0];
                const [columns] = await conn.query(`DESCRIBE ${tableName}`);
                
                schema[tableName] = columns.map(col => ({
                    name: col.Field,
                    type: col.Type,
                    null: col.Null === 'YES',
                    key: col.Key,
                    default: col.Default,
                    extra: col.Extra
                }));
            }
            
            this._schemaCache = schema;
            return schema;
        } catch (error) {
            logger.error(`Error al obtener esquema: ${error.message}`);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    }


    async generateSchemaDescription() {
        const schema = await this.getDatabaseSchema();
        let schemaDesc = "Esquema de la Base de Datos:\n";
        
        for (const [table, columns] of Object.entries(schema)) {
            schemaDesc += `\nTabla: ${table}\nColumnas:\n`;
            
            for (const col of columns) {
                schemaDesc += `  - ${col.name} (${col.type})`;
                if (col.key === 'PRI') schemaDesc += ' [PK]';
                if (!col.null) schemaDesc += ' [No Nulo]';
                schemaDesc += '\n';
            }
        }
        
        return schemaDesc;
    }

 
    async generateSqlQuery(naturalQuery) {
        const schemaDescription = await this.generateSchemaDescription();
        
        // Obtener el contexto actual de la consulta
        const currentContext = this.getQueryContext();
        console.log(`Generando SQL con contexto: ${currentContext || 'No hay contexto específico'}`);
        
        // Añadir información de contexto al prompt
        let contextualGuidance = '';
        if (currentContext) {
            switch(currentContext) {
                case 'OT':
                    contextualGuidance = `
                    IMPORTANTE: El contexto actual de la conversación indica que estamos hablando sobre ÓRDENES DE TRABAJO (OT).
                    Prioriza las tablas relacionadas con OTs como "otsfacturadas" y "otsconsultadas".
                    Si la consulta es sobre asesores, asegúrate de buscar asesores relacionados con OTs, no de otras áreas.
                    `;
                    break;
                case 'NV_MESON':
                    contextualGuidance = `
                    IMPORTANTE: El contexto actual de la conversación indica que estamos hablando sobre NOTAS DE VENTA DE MESÓN.
                    busca la tabla de "meson".
                    `;
                    break;
                case 'REPUESTOS':
                    contextualGuidance = `
                    IMPORTANTE: El contexto actual de la conversación indica que estamos hablando sobre REPUESTOS y su disponibilidad.
                    Busca en la tabla de consultas_repuestos
                    `;
                    break;
                case 'HISTORIA_CLINICA':
                    contextualGuidance = `
                    IMPORTANTE: El contexto actual de la conversación indica que estamos hablando sobre HISTORIAS CLÍNICAS de vehículos busca en la tabla de "historial_clinica".
                    Prioriza las tablas relacionadas con historial de servicios y reparaciones.
                    `;
                    break;
                default:
                    contextualGuidance = `
                    IMPORTANTE: El contexto actual de la conversación indica que estamos hablando sobre ${currentContext}.
                    Prioriza las tablas y campos relacionados con ${currentContext} en tu consulta SQL.
                    `;
            }
        }
        
        const prompt = `
        Eres un experto generador de consultas SQL. Convierte la consulta en lenguaje natural a una consulta SQL precisa.
        ${schemaDescription}
        ${contextualGuidance}
        
        INSTRUCCIONES ESPECÍFICAS PARA CONSULTAS DE OTs:
        
        Cuando la consulta sea sobre una OT específica (por número o placa), DEBES asegurarte de incluir TODOS estos campos en tu consulta:
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
         ** Si quiere quiero consultar la historia clínica de la placa [placa].
        la condicion where debe de ser por numero de plca no por num_ot
        reponde de la siguiente manera  con los primeros 5 conultas de la tabla de historial clinica 
       
        
        Si la consulta es por número de NV MESÓN, busca en las tabla de "meson".
        Si la consulta histortial clinica ce un vehiculo busca en , busca en las tabla de "hitorial_clinica".
        Si  la consulta es sobre REPUESTOS busca en la tabla de "consultas_repuestos".
        Si la consulta es sobre OTS  busca en la tabla de "ots_faturadas".        
        Directrices generales:
        1. Analiza cuidadosamente la intención de la consulta
        2. Selecciona las tablas y columnas apropiadas
        3. Genera SQL sintácticamente correcto
        4. Usa  WHERE, GROUP BY, ORDER BY según sea necesario
        5. No uses JOINs
        6. Optimiza el rendimiento cuando sea posible
        7. Devuelve solo la consulta SQL, sin explicaciones
        
        Consulta en Lenguaje Natural: ${naturalQuery}
        `;

        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini-2024-07-18",
                messages: [{ role: "user", content: prompt }],
                max_tokens: 200,
                temperature: 0.2
            });

            let sqlQuery = response.choices[0].message.content.trim();
            
            // Limpiar formato de código si está presente
            if (sqlQuery.startsWith('```') && sqlQuery.endsWith('```')) {
                sqlQuery = sqlQuery.substring(3, sqlQuery.length - 3).trim();
            } else if (sqlQuery.startsWith('```sql') && sqlQuery.includes('```', 6)) {
                sqlQuery = sqlQuery.substring(6, sqlQuery.lastIndexOf('```')).trim();
            }
            
            if (sqlQuery.toLowerCase().startsWith('sql')) {
                sqlQuery = sqlQuery.substring(3).trim();
            }
            
            // Verificar consultas potencialmente peligrosas
            const dangerousCommands = ['DROP', 'DELETE', 'UPDATE', 'INSERT'];
            if (dangerousCommands.some(cmd => sqlQuery.toUpperCase().includes(cmd))) {
                throw new Error("Consulta potencialmente peligrosa detectada");
            }
            
            this.queryHistory.push({ query: naturalQuery, sql: sqlQuery });
            return sqlQuery;
        } catch (error) {
            logger.error(`Error generando SQL: ${error.message}`);
            throw error;
        }
    }

    /**
     * Ejecuta la consulta SQL con manejo robusto de errores
     * @param {string} sqlQuery Consulta SQL a ejecutar
     * @returns {Promise<Object>} Resultado de la consulta
     */
    async executeQuery(sqlQuery) {
        let conn;
        try {
            conn = await getConnection();
            const [results] = await conn.query(sqlQuery);
            return {
                success: true,
                results,
                row_count: results.length,
                query: sqlQuery
            };
        } catch (error) {
            logger.error(`Error ejecutando query: ${error.message}`);
            return {
                success: false,
                error: error.message,
                query: sqlQuery
            };
        } finally {
            if (conn) conn.release();
        }
    }

    /**
     * Convierte objetos no serializables a formatos compatibles con JSON
     * @param {any} obj Objeto a convertir
     * @returns {any} Objeto serializable
     */
    makeSerializable(obj) {
        if (obj === null || obj === undefined) {
            return obj;
        }
        
        if (typeof obj === 'object') {
            if (obj instanceof Date) {
                return obj.toISOString();
            }
            
            if (Array.isArray(obj)) {
                return obj.map(item => this.makeSerializable(item));
            }
            
            const result = {};
            for (const [key, value] of Object.entries(obj)) {
                result[key] = this.makeSerializable(value);
            }
            return result;
        }
        
        return obj;
    }

    /**
     * Establece el contexto actual de la consulta
     * @param {string} context Tipo de contexto (OT, NV_MESON, REPUESTOS, etc.)
     */
    setQueryContext(context) {
        this.currentQueryContext = context;
        console.log(`Contexto de consulta establecido: ${context}`);
    }

    /**
     * Obtiene el contexto actual de la consulta
     * @returns {string|null} Contexto actual o null si no hay contexto
     */
    getQueryContext() {
        return this.currentQueryContext;
    }
    
    /**
     * Analiza el contexto de la conversación para determinar el tipo de consulta
     * @param {Array} conversationHistory Historial de conversación
     */
    analyzeConversationContext(conversationHistory) {
        // Tipos de consulta que podemos detectar
        const queryTypes = {
            OT: ['ot', 'orden de trabajo', 'orden trabajo', 'servicio', 'asesor', 'asesores'],
            NV_MESON: ['nv', 'nota de venta', 'mesón', 'meson', 'repuesto vendido'],
            REPUESTOS: ['repuesto', 'stock', 'inventario', 'disponibilidad'],
            HISTORIA_CLINICA: ['historia', 'clínica', 'historial', 'reparaciones']
        };

        // Analizar los últimos 10 mensajes (o menos si hay menos)
        const recentMessages = conversationHistory.slice(-10);
        
        // Contar menciones de cada tipo de consulta
        const typeCounts = {};
        
        for (const message of recentMessages) {
            const content = message.content ? message.content.toLowerCase() : '';
            
            for (const [type, keywords] of Object.entries(queryTypes)) {
                if (keywords.some(keyword => content.includes(keyword))) {
                    typeCounts[type] = (typeCounts[type] || 0) + 1;
                }
            }
        }
        
        // Determinar el tipo de consulta más mencionado
        let dominantType = null;
        let maxCount = 0;
        
        for (const [type, count] of Object.entries(typeCounts)) {
            if (count > maxCount) {
                maxCount = count;
                dominantType = type;
            }
        }
        
        if (dominantType) {
            this.setQueryContext(dominantType);
            console.log(`Contexto detectado del historial de conversación: ${dominantType}`);
        }
    }

    /**
     * Procesa la consulta completa con respuesta natural optimizada
     * @param {string} query Consulta en lenguaje natural
     * @param {number} maxResults Número máximo de resultados a mostrar
     * @param {Array} conversationHistory Historial de conversación para contexto
     * @returns {Promise<Object>} Respuesta procesada
     */
    async processNaturalLanguageQuery(query, maxResults = 10, conversationHistory = []) {
        // Analizar el contexto de la conversación si está disponible
        if (conversationHistory && conversationHistory.length > 0) {
            this.analyzeConversationContext(conversationHistory);
        }
        
        // Registrar el contexto actual para depuración
        console.log(`Procesando consulta con contexto: ${this.getQueryContext() || 'No hay contexto específico'}`);
        
        const sqlQuery = await this.generateSqlQuery(query);
        const queryResult = await this.executeQuery(sqlQuery);
        const serializableResult = this.makeSerializable(queryResult);
        
        // Guardar el tipo de consulta en el historial
        const queryType = this.getQueryContext() || 'GENERAL';
        this.queryHistory.push({ query, sql: sqlQuery, type: queryType });
        console.log(`Consulta guardada en historial con tipo: ${queryType}`);
        
        if (serializableResult.success && serializableResult.results.length > maxResults) {
            serializableResult.results = serializableResult.results.slice(0, maxResults);
            serializableResult.note = `Mostrando primeros ${maxResults} de ${queryResult.row_count} resultados`;
        }
        
        // Verificar si hay resultados
        const noResults = !serializableResult.success || serializableResult.results.length === 0;
        
        // Obtener el contexto actual para personalizar la respuesta
        const currentContext = this.getQueryContext();
        let contextualInstructions = '';
        
        if (currentContext) {
            contextualInstructions = `
            IMPORTANTE: El contexto actual de la conversación indica que estamos hablando sobre ${currentContext}.
            Prioriza la información relacionada con ${currentContext} en tu respuesta.
            `;
        }
        
        const prompt = `
        Eres un analista de datos especializado en presentar información de manera clara y estructurada.
        
        ${noResults ? "IMPORTANTE: No se encontraron resultados para esta consulta. Debes responder indicando que no se encontró información para la consulta realizada." : ""}
        ${contextualInstructions}
        
        INSTRUCCIONES CRÍTICAS PARA FORMATO DE RESPUESTA:
        - DEBES generar una respuesta COMPLETA en un ÚNICO bloque de texto.
        - NO dividas la información en múltiples párrafos separados.
        - NO uses múltiples saludos o introducciones.
        - Toda la información debe estar conectada en un solo mensaje continuo.
        
        INSTRUCCIONES ESPECÍFICAS PARA CONSULTAS DE OTs:
        
        Cuando la consulta sea sobre una OT por número o placa, DEBES presentar la información en EXACTAMENTE este formato:
        
        Por supuesto. Aquí tienes la información de la OT [número]:\nOT: [número]\nSede: [local]\nAsesor: [Nombre del asesor]\nDoc. Cliente: [Número de documento]\nCliente: [cliente]\nF. Apertura OT: [fecha de apertura]\nF. Facturación o Cierre: [Fecha de facturación o cierre]\nÁrea: [área]\nTipo de OT: [Tipo de OT]\nEstado actual: [estado]\nTotal OT: [moneda facturada]
        
        Si algún dato no está disponible, indica "No disponible" en ese campo, pero NUNCA omitas ningún campo del formato.
        Si la consulta es por placa, usa el mismo formato pero agrega la placa al inicio de la respuesta.
        
        INSTRUCCIONES ESPECÍFICAS PARA CONSULTAS DE NV MESÓN:
        
        Cuando la consulta sea sobre una NV MESÓN (Nota de Venta de Mesón) por número, DEBES presentar la información en EXACTAMENTE este formato:
        
        Por supuesto. Aquí tienes la información de la NV MESÓN [número]:\nNV: [número]\nDoc. Cliente: [Número de documento]\nCliente: [nombre del cliente]\nF. Apertura: [fecha de apertura]\nF. Facturación o Cierre: [fecha de facturación]\nCantidad de repuestos: [cantidad]\nTotal NV: [moneda] (Sin impuestos)

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
        Resultados: ${JSON.stringify(serializableResult, null, 2)}
        `;
        
        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini-2024-07-18",
                messages: [{ role: "user", content: prompt }],
                max_tokens: 1000,
                temperature: 0.3,
                presence_penalty: 0.6,
                frequency_penalty: 0.5
            });
            
            return {
                natural_response: response.choices[0].message.content.trim(),
                query_result: queryResult,
                sql_query: sqlQuery
            };
        } catch (error) {
            logger.error(`Error generando respuesta natural: ${error.message}`);
            throw error;
        }
    }

    /**
     * Devuelve el historial de consultas
     * @returns {Array} Historial de consultas
     */
    getQueryHistory() {
        return this.queryHistory;
    }
}

// Exportar una instancia única del servicio
const queryService = new EnhancedNaturalLanguageMySQLInterface();

module.exports = queryService;