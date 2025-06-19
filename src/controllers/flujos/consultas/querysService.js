/**
 * Servicio optimizado para procesar consultas en lenguaje natural y convertirlas a SQL
 */

const { openai } = require('../../../config/openaiConfig.js');
const { claude } = require('../../../config/claudeConfig.js');
const { getConnection } = require('../../../config/dbConnection.js');
const promptTemplates = require('./promptTemplates.js');

class EnhancedNaturalLanguageMySQLInterface {
    constructor() {
        this._schemaCache = null;
        this.currentQueryContext = null;
    }

    /**
     * Obtiene y cachea el esquema de la base de datos
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
            console.error(`Error al obtener esquema: ${error.message}`);
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
        const currentContext = this.getQueryContext();
        const contextualGuidance = promptTemplates.getContextualGuidance(currentContext);
        const prompt = promptTemplates.generateSqlPrompt(schemaDescription, contextualGuidance, naturalQuery);

        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }],
                max_tokens: 150,
                temperature: 0.1
            });

            let sqlQuery = response.choices[0].message.content.trim();
            
            // Limpiar formato de código
            sqlQuery = this.cleanSqlQuery(sqlQuery);
            
            // Verificar consultas peligrosas
            const dangerousCommands = ['DROP', 'DELETE', 'UPDATE', 'INSERT'];
            if (dangerousCommands.some(cmd => sqlQuery.toUpperCase().includes(cmd))) {
                throw new Error("Consulta potencialmente peligrosa detectada");
            }
            
            return sqlQuery;
        } catch (error) {
            console.error(`Error generando SQL: ${error.message}`);
            throw error;
        }
    }

    /**
     * Limpia y normaliza la consulta SQL generada
     */
    cleanSqlQuery(sqlQuery) {
        // Eliminar bloques de código markdown
        if (sqlQuery.startsWith('```') && sqlQuery.endsWith('```')) {
            sqlQuery = sqlQuery.substring(3, sqlQuery.length - 3).trim();
        }
        
        if (sqlQuery.startsWith('```sql')) {
            if (sqlQuery.endsWith('```')) {
                sqlQuery = sqlQuery.substring(6, sqlQuery.length - 3).trim();
            } else if (sqlQuery.includes('```', 6)) {
                sqlQuery = sqlQuery.substring(6, sqlQuery.lastIndexOf('```')).trim();
            }
        }
        
        // Eliminar prefijos comunes
        const commonPrefixes = ['sql', 'consulta sql:', 'consulta:', 'select'];
        for (const prefix of commonPrefixes) {
            if (sqlQuery.toLowerCase().startsWith(prefix) && !sqlQuery.toLowerCase().startsWith('select ')) {
                sqlQuery = sqlQuery.substring(prefix.length).trim();
            }
        }
        
        // Normalizar formato
        sqlQuery = sqlQuery.replace(/\\n/g, ' ')
                          .replace(/\n\s*\n/g, '\n')
                          .replace(/^\s*[\r\n]/gm, '\n');
        
        // Eliminar comillas envolventes
        if ((sqlQuery.startsWith('"') && sqlQuery.endsWith('"')) || 
            (sqlQuery.startsWith("'") && sqlQuery.endsWith("'"))) {
            sqlQuery = sqlQuery.substring(1, sqlQuery.length - 1).trim();
        }
        
        return sqlQuery.replace(/\s+/g, ' ').trim();
    }

    /**
     * Ejecuta la consulta SQL
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
            console.error(`Error ejecutando query: ${error.message}`);
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
     */
    setQueryContext(context) {
        this.currentQueryContext = context;
        if (context) {
            console.log(`Contexto de consulta establecido: ${context}`);
        }
    }

    /**
     * Obtiene el contexto actual de la consulta
     */
    getQueryContext() {
        return this.currentQueryContext;
    }
    
    /**
     * Analiza el contexto de la conversación para determinar el tipo de consulta
     */
    analyzeConversationContext(conversationHistory) {
        const queryTypes = {
            OT: ['ots', 'orden de trabajo', 'orden trabajo', 'servicio', 'asesor', 'asesores'],
            NV_MESON: ['nv', 'nota de venta', 'mesón', 'meson', 'repuesto vendido'],
            REPUESTOS: ['repuesto', 'stock', 'inventario', 'disponibilidad'],
            HISTORIA_CLINICA: ['historia', 'clínica', 'historial', 'reparaciones']
        };

        const recentMessages = conversationHistory.slice(-10);
        const typeCounts = {};
        
        for (const message of recentMessages) {
            const content = message.content ? message.content.toLowerCase() : '';
            
            for (const [type, keywords] of Object.entries(queryTypes)) {
                if (keywords.some(keyword => content.includes(keyword))) {
                    typeCounts[type] = (typeCounts[type] || 0) + 1;
                }
            }
        }
        
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
        }
    }

    /**
     * Procesa la consulta completa con respuesta natural optimizada
     */
    async processNaturalLanguageQuery(query, maxResults = 10, conversationHistory = [], queryParams = null) {
        if (!this.getQueryContext() && conversationHistory && conversationHistory.length > 0) {
            this.analyzeConversationContext(conversationHistory);
        }
        
        let enrichedQuery = query;
        if (queryParams) {
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
        }
        
        const sqlQuery = await this.generateSqlQuery(enrichedQuery);
        const queryResult = await this.executeQuery(sqlQuery);
        const serializableResult = this.makeSerializable(queryResult);
        
        if (serializableResult.success && serializableResult.results.length > maxResults) {
            serializableResult.results = serializableResult.results.slice(0, maxResults);
            serializableResult.note = `Mostrando primeros ${maxResults} de ${queryResult.row_count} resultados`;
        }
        
        const noResults = !serializableResult.success || serializableResult.results.length === 0;
        const currentContext = this.getQueryContext();
        
        let contextualInstructions = '';
        if (currentContext) {
            contextualInstructions = `
            IMPORTANTE: El contexto actual de la conversación indica que estamos hablando sobre ${currentContext}.
            Prioriza la información relacionada con ${currentContext} en tu respuesta.
            `;
        }
        
        const prompt = promptTemplates.generateNaturalResponsePrompt(
            noResults, 
            contextualInstructions, 
            query, 
            sqlQuery, 
            JSON.stringify(serializableResult, null, 2)
        );
        
        try {
            const response = await claude.messages.create({
                model: "claude-3-opus-20240229",
                messages: [{ role: "user", content: prompt }],
                max_tokens: 1000,
                temperature: 0.3
            });
            
            return {
                natural_response: response.content[0].text.trim(),
                query_result: queryResult,
                sql_query: sqlQuery
            };
        } catch (error) {
            console.error(`Error generando respuesta natural: ${error.message}`);
            throw error;
        }
    }
}

// Exportar una instancia única del servicio
const queryService = new EnhancedNaturalLanguageMySQLInterface();

module.exports = queryService;