/**
 * Servicio para procesar consultas en lenguaje natural y convertirlas a SQL
 * Basado en la implementación de querys.py pero adaptado para Node.js
 */

const { openai } = require('../../../config/openaiConfig.js');
const { getConnection } = require('../../../config/dbConnection.js');
const logger = require('console');

class EnhancedNaturalLanguageMySQLInterface {
    constructor() {
        this._schemaCache = null;
        this.queryHistory = [];
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
        
        const prompt = `
        Eres un experto generador de consultas SQL. Convierte la consulta en lenguaje natural a una consulta SQL precisa.
        ${schemaDescription}
        Directrices:
        1. Analiza cuidadosamente la intención de la consulta
        2. Selecciona las tablas y columnas apropiadas
        3. Genera SQL sintácticamente correcto
        4. Usa JOINs, WHERE, GROUP BY, ORDER BY según sea necesario
        5. Optimiza el rendimiento cuando sea posible
        6. Devuelve solo la consulta SQL, sin explicaciones
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
     * Procesa la consulta completa con respuesta natural optimizada
     * @param {string} query Consulta en lenguaje natural
     * @param {number} maxResults Número máximo de resultados a mostrar
     * @returns {Promise<Object>} Respuesta procesada
     */
    async processNaturalLanguageQuery(query, maxResults = 10) {
        const sqlQuery = await this.generateSqlQuery(query);
        const queryResult = await this.executeQuery(sqlQuery);
        const serializableResult = this.makeSerializable(queryResult);
        
        if (serializableResult.success && serializableResult.results.length > maxResults) {
            serializableResult.results = serializableResult.results.slice(0, maxResults);
            serializableResult.note = `Mostrando primeros ${maxResults} de ${queryResult.row_count} resultados`;
        }
        
        const prompt = `Analista de datos amigable: Resume estos resultados SQL de manera natural en español.
        Consulta: ${query}
        SQL: ${sqlQuery}
        Resultados: ${JSON.stringify(serializableResult, null, 2)}
        Da un resumen conciso.`;
        
        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini-2024-07-18",
                messages: [{ role: "user", content: prompt }],
                max_tokens: 300,
                temperature: 0.5
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