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
        
        Para obtener esta información, es OBLIGATORIO que realices los JOINs necesarios entre las tablas relevantes.
        Si la consulta es por número de OT, busca en las tablas "otsfacturadas" y "otsconsultadas".
        Si la consulta es por placa, busca en las tablas relacionadas con vehículos y luego haz JOIN con las tablas de OTs.
        
        INSTRUCCIONES ESPECÍFICAS PARA CONSULTAS DE NV MESÓN:
        
        Cuando la consulta sea sobre una NV MESÓN (Nota de Venta de Mesón) por número, DEBES asegurarte de incluir TODOS estos campos en tu consulta:
        - Número de NV
        - Documento del cliente
        - Nombre del cliente
        - Fecha de apertura
        - Fecha de facturación o cierre
        - Cantidad de repuestos
        - Total NV (sin impuestos)
        
        Para obtener esta información, es OBLIGATORIO que realices los JOINs necesarios entre las tablas relevantes.
        Si la consulta es por número de NV MESÓN, busca en las tablas relacionadas con ventas de mesón y realiza los JOINs necesarios.
        
        Directrices generales:
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
        
        // Verificar si hay resultados
        const noResults = !serializableResult.success || serializableResult.results.length === 0;
        
        const prompt = `
        Eres un analista de datos especializado en presentar información de manera clara y estructurada.
        
        ${noResults ? "IMPORTANTE: No se encontraron resultados para esta consulta. Debes responder indicando que no se encontró información para la consulta realizada." : ""}
        
        INSTRUCCIONES ESPECÍFICAS PARA CONSULTAS DE OTs:
        
        Cuando la consulta sea sobre una OT por número o placa, DEBES presentar la información en EXACTAMENTE este formato:
        
        Por supuesto. Aquí tienes la información de la OT [número]:
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
        Total OT: [moneda facturada]
        
        Si algún dato no está disponible, indica "No disponible" en ese campo, pero NUNCA omitas ningún campo del formato.
        Si la consulta es por placa, usa el mismo formato pero agrega la placa al inicio de la respuesta.
        
        INSTRUCCIONES ESPECÍFICAS PARA CONSULTAS DE NV MESÓN:
        
        Cuando la consulta sea sobre una NV MESÓN (Nota de Venta de Mesón) por número, DEBES presentar la información en EXACTAMENTE este formato:
        
        Por supuesto. Aquí tienes la información de la NV MESÓN [número]:
        NV: [número]
        Doc. Cliente: [Número de documento]
        Cliente: [nombre del cliente]
        F. Apertura: [fecha de apertura]
        F. Facturación o Cierre: [fecha de facturación]
        Cantidad de repuestos: [cantidad]
        Total NV: [moneda] (Sin impuestos)

        INSTRUCCIONES ESPECÍFICAS PARA CONSULTAS DE REPUESTOS O CONSULAS REPUESTOS:

        Cuando la consulta sea sobre un repuesto o consulta de repuestos, DEBES presentar la información en EXACTAMENTE este formato:


        cliente : en soles

        Precio unitario: [moneda] (Sin impuestos)

        ICC: [ICC]

        Stock disponible:

        Local 1: 5 - Ubicación: A/A

        Local 2: 5 - Ubicación: A/A

        Local 4: 5 - Ubicación: A/A

        eso agrega en el prompt  se refiere a la tabla de  cosnultas repuestos

        y devuelve en soles y dolares el precio
        
        Si algún dato no está disponible, indica "No disponible" en ese campo, pero NUNCA omitas ningún campo del formato.
        
        Para otras consultas que no sean sobre OTs o NV MESÓN específicas, presenta la información de manera clara y concisa.
        
        Consulta: ${query}
        SQL: ${sqlQuery}
        Resultados: ${JSON.stringify(serializableResult, null, 2)}
        `;
        
        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini-2024-07-18",
                messages: [{ role: "user", content: prompt }],
                max_tokens: 500,
                temperature: 0.3
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