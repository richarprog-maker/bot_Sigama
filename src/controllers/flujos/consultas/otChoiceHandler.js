/**
 * Manejador de elecciones de tipos de OT
 * Este módulo se encarga de procesar las respuestas del usuario cuando se le solicita
 * elegir un tipo específico de OT (facturadas, consultadas o ambas)
 */

const logger = require('console');

/**
 * Procesa la elección del usuario sobre el tipo de OT
 * @param {string} userChoice - Respuesta del usuario (1, 2, 3 o texto descriptivo)
 * @param {string} originalMessage - Mensaje original que generó la solicitud de elección
 * @returns {Object} Objeto con el tipo de OT elegido y el mensaje enriquecido
 */
function processOtTypeChoice(userChoice, originalMessage) {
    try {
        // Normalizar la entrada del usuario (eliminar espacios, convertir a minúsculas)
        const normalizedChoice = userChoice.toString().trim().toLowerCase();
        let otType = null;
        
        // Determinar el tipo de OT basado en la elección del usuario
        if (
            normalizedChoice === '1' || 
            normalizedChoice === 'facturadas' || 
            normalizedChoice.includes('facturada') ||
            normalizedChoice.includes('opción 1') ||
            normalizedChoice.includes('opcion 1')
        ) {
            otType = 'facturadas';
            logger.info(`Usuario eligió OTs facturadas`);
        } 
        else if (
            normalizedChoice === '2' || 
            normalizedChoice === 'consultadas' || 
            normalizedChoice.includes('consultada') ||
            normalizedChoice.includes('opción 2') ||
            normalizedChoice.includes('opcion 2')
        ) {
            otType = 'consultadas';
            logger.info(`Usuario eligió OTs consultadas`);
        } 
        else if (
            normalizedChoice === '3' || 
            normalizedChoice === 'ambas' || 
            normalizedChoice === 'ambos' ||
            normalizedChoice.includes('ambos tipos') ||
            normalizedChoice.includes('las dos') ||
            normalizedChoice.includes('los dos') ||
            normalizedChoice.includes('opción 3') ||
            normalizedChoice.includes('opcion 3')
        ) {
            otType = 'ambas';
            logger.info(`Usuario eligió ambos tipos de OTs`);
        } 
        else {
            // Si no se puede determinar la elección, asumimos que quiere ambos tipos
            otType = 'ambas';
            logger.info(`No se pudo determinar la elección del usuario, asumiendo ambos tipos de OTs`);
        }
        
        // Enriquecer el mensaje original con el tipo de OT elegido
        let enrichedMessage;
        if (otType === 'facturadas') {
            enrichedMessage = `Consulta sobre OTs facturadas: ${originalMessage}`;
        } else if (otType === 'consultadas') {
            enrichedMessage = `Consulta sobre OTs consultadas: ${originalMessage}`;
        } else {
            enrichedMessage = `Consulta sobre ambos tipos de OTs (facturadas y consultadas): ${originalMessage}`;
        }
        
        return {
            otType,
            enrichedMessage
        };
    } catch (error) {
        logger.error(`Error procesando elección de tipo de OT: ${error.message}`);
        // En caso de error, asumimos ambos tipos
        return {
            otType: 'ambas',
            enrichedMessage: `Consulta sobre ambos tipos de OTs (facturadas y consultadas): ${originalMessage}`
        };
    }
}

module.exports = {
    processOtTypeChoice
};