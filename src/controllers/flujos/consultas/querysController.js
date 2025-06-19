/**
 * Controlador para procesar consultas a la base de datos desde el chatbot
 * Integra el servicio de consultas con el flujo principal
 */

const queryService = require('./querysService.js');
const openaiService = require('../../../services/openaiService.js');

async function processQuery(queryData, sender) {
    try {
        let query, queryType, queryParams = {};
        
        if (typeof queryData === 'object') {
            console.info(`Procesando consulta estructurada: ${JSON.stringify(queryData)}`);
            
            if (queryData.tipo === 'historia_clinica' && queryData.placa) {
                query = `Consulta la historia clínica del vehículo con placa ${queryData.placa}`;
                queryType = 'HISTORIA_CLINICA';
                queryParams = { placa: queryData.placa };
                
            } else if (queryData.tipo && queryData.contexto) {
                query = queryData.contexto;
                queryType = queryData.tipo.toUpperCase();
                
                if (queryData.placa) queryParams.placa = queryData.placa;
                if (queryData.numero_ot) queryParams.numero_ot = queryData.numero_ot;
                if (queryData.numero_nv) queryParams.numero_nv = queryData.numero_nv;
                if (queryData.filters) {
                    Object.assign(queryParams, queryData.filters);
                }
            } else {
                query = queryData.contexto || queryData.message || "consulta información";
                queryType = queryData.tipo || null;
            }
            
            queryService.setQueryContext(queryType);
            
            console.info(`Tipo de consulta detectado: ${queryType}`);
            console.info(`Query procesada: ${query}`);
            console.info(`Parámetros de consulta: ${JSON.stringify(queryParams)}`);
            
        } else {
            console.info(`Procesando consulta de base de datos en formato texto: ${queryData}`);
            query = queryData;
            
            const conversationState = require('../../main/flujoPrincipal.js').getOrCreateConversationState(sender);
            const conversationHistory = conversationState ? conversationState.messages : [];
            
            queryService.setQueryContext(null);
        }
        
        const conversationState = require('../../main/flujoPrincipal.js').getOrCreateConversationState(sender);
        const conversationHistory = conversationState ? conversationState.messages : [];
        
        const result = await queryService.processNaturalLanguageQuery(query, 10, conversationHistory, queryParams);

        console.log('===== CONSULTA SQL Y RESULTADOS =====');
        console.log('Contexto detectado:', queryService.getQueryContext());
        console.log('SQL Query:', result.sql_query);
        console.log('====================================');

        return {
            success: true,
            response: result.natural_response,
            details: {
                sql_query: result.sql_query,
                results: result.query_result.results
            }
        };
    } catch (error) {
        console.error(`Error procesando consulta: ${error.message}`);
        return {
            success: false,
            response: "Lo siento, no pude procesar tu consulta a la base de datos. Por favor, intenta con otra pregunta.",
            error: error.message
        };
    }
}

async function isDatabaseQuery(message) {
    try {
        const systemContent = "Eres un asistente especializado en detectar si un mensaje contiene una intención de consulta a una base de datos. Debes responder únicamente 'true' si el mensaje parece solicitar información de una base de datos o 'false' si no lo es.";
        
        const messages = [
            {
                role: "user",
                content: `¿El siguiente mensaje es una consulta a base de datos? Responde solo con 'true' o 'false': "${message}"`
            }
        ];

        const result = await openaiService.getOpenAIResponse([
            { role: "system", content: systemContent },
            ...messages
        ]);
        return result.trim().toLowerCase() === 'true';
    } catch (error) {
        console.error(`Error al evaluar si es consulta de base de datos: ${error.message}`);
        
        const databaseKeywords = [
            'base de datos', 'consulta', 'query', 'sql', 'tabla', 'datos',
            'registros', 'información de', 'busca en', 'muestra', 'lista',
            'cuántos', 'cuántas', 'quién', 'cuál', 'dónde', 'cuándo',
            'citas', 'clientes', 'asesores', 'horarios', 'estadísticas'
        ];

        const lowercaseMessage = message.toLowerCase();
        return databaseKeywords.some(keyword => lowercaseMessage.includes(keyword));
    }
}

module.exports = {
    processQuery,
    isDatabaseQuery
};