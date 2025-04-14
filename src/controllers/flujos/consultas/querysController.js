/**
 * Controlador para procesar consultas a la base de datos desde el chatbot
 * Integra el servicio de consultas con el flujo principal
 */

const queryService = require('./querysService.js');
const logger = require('console');
const openaiService = require('../../../services/openaiService.js');


async function processQuery(query, sender) {
    try {
        logger.info(`Procesando consulta de base de datos: ${query}`);
        logger.info(`Remitente: ${sender}`);

        // Obtener el historial de conversación del estado global
        const conversationState = require('../../main/flujoPrincipal.js').getOrCreateConversationState(sender);
        const conversationHistory = conversationState ? conversationState.messages : [];
        
        // Pasar el historial de conversación al servicio de consultas
        const result = await queryService.processNaturalLanguageQuery(query, 10, conversationHistory);

        // Agregar console.log para ver la consulta SQL y los resultados en la terminal
        console.log('===== CONSULTA SQL Y RESULTADOS =====');
        console.log('Contexto detectado:', queryService.getQueryContext());
        console.log('SQL Query:', result.sql_query);
        console.log('Resultados:', JSON.stringify(result.query_result.results, null, 2));
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
        logger.error(`Error procesando consulta: ${error.message}`);
        return {
            success: false,
            response: "Lo siento, no pude procesar tu consulta a la base de datos. Por favor, intenta con otra pregunta.",
            error: error.message
        };
    }
}


function getQueryHistory() {
    return queryService.getQueryHistory();
}


async function isDatabaseQuery(message) {
    try {
        // Crear un prompt específico para detectar si es una consulta a base de datos
        const messages = [
            {
                role: "system",
                content: "Eres un asistente especializado en detectar si un mensaje contiene una intención de consulta a una base de datos. Debes responder únicamente 'true' si el mensaje parece solicitar información de una base de datos o 'false' si no lo es."
            },
            {
                role: "user",
                content: `¿El siguiente mensaje es una consulta a base de datos? Responde solo con 'true' o 'false': "${message}"`
            }
        ];

        const result = await openaiService.getOpenAIResponse(messages);
        return result.trim().toLowerCase() === 'true';
    } catch (error) {
        logger.error(`Error al evaluar si es consulta de base de datos: ${error.message}`);
        // En caso de error, usar el método de palabras clave como fallback
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
    getQueryHistory,
    isDatabaseQuery
};