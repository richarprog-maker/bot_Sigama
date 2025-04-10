/**
 * Analizador de consultas relacionadas con OTs (Órdenes de Trabajo)
 * Este módulo se encarga de analizar si una consulta está relacionada con OTs facturadas o consultadas
 * y enriquecer el mensaje con el contexto adecuado antes de procesarlo
 */

const { openai } = require('../../../config/openaiConfig.js');
const logger = require('console');

/**
 * Analiza si una consulta está relacionada con OTs y determina el tipo (facturadas o consultadas)
 * @param {string} message - Mensaje del usuario
 * @returns {Promise<{isOtQuery: boolean, otType: string|null, enrichedMessage: string|null, needsUserChoice: boolean, choiceMessage: string|null}>}
 */
async function analyzeOtQuery(message) {
    try {
        // Prompt específico para analizar consultas de OTs
        const prompt = `
        Eres un asistente especializado en analizar consultas sobre Órdenes de Trabajo (OTs).
        
        Contexto importante:
        - Existen dos tipos de tablas en la base de datos para OTs: "otsfacturadas" y "otsconsultadas"
        - Las OTs facturadas son aquellas que ya han sido procesadas y facturadas al cliente
        - Las OTs consultadas son aquellas que han sido consultadas pero aún no han sido facturadas
        
        Analiza el siguiente mensaje y determina:
        1. Si es una consulta relacionada con OTs
        2. Si es sobre OTs facturadas, OTs consultadas, o si no especifica el tipo
        
        REGLAS IMPORTANTES:
        - Solo debes inferir un tipo específico (facturadas o consultadas) cuando el mensaje lo indique explícitamente o el contexto sea muy claro
        - Si el mensaje menciona OTs pero NO especifica claramente si son facturadas o consultadas, debes establecer otType como "no_especificado"
        
        Responde en formato JSON con esta estructura exacta:
        {
            "isOtQuery": true/false,
            "otType": "facturadas"/"consultadas"/"no_especificado"/null,
            "reasoning": "breve explicación de tu análisis"
        }
        
        Mensaje a analizar: "${message}"
        `;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini-2024-07-18",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            temperature: 0.2
        });

        const analysisResult = JSON.parse(response.choices[0].message.content);
        logger.info(`Análisis de OT: ${JSON.stringify(analysisResult)}`);

        // Si no es una consulta de OT, devolvemos el mensaje original
        if (!analysisResult.isOtQuery) {
            return {
                isOtQuery: false,
                otType: null,
                enrichedMessage: null,
                needsUserChoice: false,
                choiceMessage: null
            };
        }
        
        // Si el tipo de OT no está especificado, solicitamos al usuario que elija
        if (analysisResult.isOtQuery && (analysisResult.otType === "no_especificado" || !analysisResult.otType || analysisResult.otType === "null")) {
            logger.info(`Tipo de OT no especificado, solicitando elección al usuario`);
            
            // Mensaje para que el usuario elija el tipo de OT
            const choiceMessage = "Tu consulta está relacionada con Órdenes de Trabajo (OTs). " +
                "Por favor, indica qué tipo de OTs deseas consultar:\n" +
                "1. OTs Facturadas\n" +
                "2. OTs Consultadas\n" +
                "3. Ambos tipos de OTs";
            
            return {
                isOtQuery: true,
                otType: null,
                enrichedMessage: null,
                needsUserChoice: true,
                choiceMessage: choiceMessage
            };
        }

        // Enriquecer el mensaje con el contexto del tipo de OT
        let enrichedMessage = message;
        if (analysisResult.otType === "facturadas") {
            enrichedMessage = `Consulta sobre OTs facturadas: ${message}`;
        } else if (analysisResult.otType === "consultadas") {
            enrichedMessage = `Consulta sobre OTs consultadas: ${message}`;
        }

        return {
            isOtQuery: true,
            otType: analysisResult.otType,
            enrichedMessage: enrichedMessage,
            needsUserChoice: false,
            choiceMessage: null
        };
    } catch (error) {
        logger.error(`Error analizando consulta de OT: ${error.message}`);
        // En caso de error, devolvemos el mensaje original sin modificar
        return {
            isOtQuery: false,
            otType: null,
            enrichedMessage: null
        };
    }
}

// Importar el manejador de elecciones de OT
const { processOtTypeChoice } = require('./otChoiceHandler.js');

/**
 * Procesa la respuesta del usuario a la solicitud de elección de tipo de OT
 * @param {string} userChoice - Elección del usuario (1, 2, 3 o texto descriptivo)
 * @param {string} originalMessage - Mensaje original que generó la solicitud de elección
 * @returns {Promise<{isOtQuery: boolean, otType: string, enrichedMessage: string}>}
 */
async function processOtChoice(userChoice, originalMessage) {
    const result = processOtTypeChoice(userChoice, originalMessage);
    
    return {
        isOtQuery: true,
        otType: result.otType,
        enrichedMessage: result.enrichedMessage,
        needsUserChoice: false,
        choiceMessage: null
    };
}

module.exports = {
    analyzeOtQuery,
    processOtChoice
};