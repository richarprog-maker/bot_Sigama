/**
 * Servicio para procesar consultas en lenguaje natural y convertirlas a SQL
 * 
 */

const { openai } = require('../../../config/openaiConfig.js');
const { getConnection } = require('../../../config/dbConnection.js');
const logger = require('console');
const promptTemplates = require('./promptTemplates.js');

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
        
        // Obtener la guía contextual desde las plantillas
        const contextualGuidance = promptTemplates.getContextualGuidance(currentContext);
        
        // Generar el prompt utilizando la plantilla
        const prompt = promptTemplates.generateSqlPrompt(schemaDescription, contextualGuidance, naturalQuery);

        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4.1-mini-2025-04-14",
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
            OT: ['ots', 'orden de trabajo', 'orden trabajo', 'servicio', 'asesor', 'asesores'],
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
     * @param {Object} queryParams Parámetros estructurados de la consulta (opcional)
     * @returns {Promise<Object>} Respuesta procesada
     */
    async processNaturalLanguageQuery(query, maxResults = 10, conversationHistory = [], queryParams = null) {
        // Si no tenemos un contexto establecido y hay historial, analizarlo
        if (!this.getQueryContext() && conversationHistory && conversationHistory.length > 0) {
            this.analyzeConversationContext(conversationHistory);
        }
        
        // Enriquecer la consulta con los parámetros estructurados si están disponibles
        let enrichedQuery = query;
        if (queryParams) {
            // Construir una consulta enriquecida con los parámetros explícitos
            const paramParts = [];
            
            if (queryParams.placa) paramParts.push(`placa: ${queryParams.placa}`);
            if (queryParams.numero_ot) paramParts.push(`número de OT: ${queryParams.numero_ot}`);
            if (queryParams.numero_nv) paramParts.push(`número de NV: ${queryParams.numero_nv}`);
            if (queryParams.asesor) paramParts.push(`asesor: ${queryParams.asesor}`);
            if (queryParams.sede) paramParts.push(`sede: ${queryParams.sede}`);
            if (queryParams.marca) paramParts.push(`marca: ${queryParams.marca}`);
            if (queryParams.fecha_inicio) paramParts.push(`desde: ${queryParams.fecha_inicio}`);
            if (queryParams.fecha_fin) paramParts.push(`hasta: ${queryParams.fecha_fin}`);
            if (queryParams.tipo_fecha) paramParts.push(`tipo de fecha: ${queryParams.tipo_fecha}`);
            if (queryParams.cod_repuesto) paramParts.push(`código de repuesto: ${queryParams.cod_repuesto}`);
            
            if (paramParts.length > 0) {
                enrichedQuery = `${query}. Parámetros adicionales: ${paramParts.join(', ')}`;
            }
            
            console.log(`Consulta enriquecida con parámetros: ${enrichedQuery}`);
        }
        
        // Registrar el contexto actual para depuración
        console.log(`Procesando consulta con contexto: ${this.getQueryContext() || 'No hay contexto específico'}`);
        
        const sqlQuery = await this.generateSqlQuery(enrichedQuery);
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
        
        // Generar el prompt utilizando la plantilla
        const prompt = promptTemplates.generateNaturalResponsePrompt(
            noResults, 
            contextualInstructions, 
            query, 
            sqlQuery, 
            JSON.stringify(serializableResult, null, 2)
        );
        
        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4.1-mini-2025-04-14",
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