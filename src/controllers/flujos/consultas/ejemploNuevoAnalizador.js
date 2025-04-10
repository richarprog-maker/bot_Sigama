/**
 * Ejemplo de cómo agregar un nuevo analizador al sistema
 * Este archivo muestra cómo registrar un nuevo analizador para consultas relacionadas con inventario
 */

const { registerAnalyzer } = require('./otAnalyzer.js');
const logger = require('console');

/**
 * Función para inicializar y registrar el analizador de inventario
 */
function initInventarioAnalyzer() {
    try {
        // Configuración del analizador de inventario
        const inventarioAnalyzer = {
            name: 'Inventario',
            contextDescription: `
            Contexto importante:
            - El inventario se gestiona en la tabla "inventario" de la base de datos
            - Existen diferentes categorías de productos: electrónicos, muebles, herramientas, etc.
            - Se pueden realizar consultas sobre stock disponible, precios, ubicaciones, etc.
            `,
            typeOptions: ['stock', 'precios', 'ubicaciones', 'general'],
            enrichMessage: (message, type) => {
                if (type === 'stock') {
                    return `Consulta sobre stock de inventario: ${message}`;
                } else if (type === 'precios') {
                    return `Consulta sobre precios de inventario: ${message}`;
                } else if (type === 'ubicaciones') {
                    return `Consulta sobre ubicaciones de inventario: ${message}`;
                } else {
                    return `Consulta general sobre inventario: ${message}`;
                }
            }
        };

        // Registrar el analizador en el sistema
        registerAnalyzer('inventario', inventarioAnalyzer);
        logger.info('Analizador de inventario registrado correctamente');
    } catch (error) {
        logger.error(`Error al registrar analizador de inventario: ${error.message}`);
    }
}

/**
 * Ejemplo de uso del analizador de inventario
 * @param {string} message - Mensaje del usuario
 */
async function ejemploUsoInventarioAnalyzer(message) {
    const { analyzeQuery } = require('./otAnalyzer.js');
    
    try {
        // Analizar la consulta utilizando el analizador de inventario
        const result = await analyzeQuery(message, 'inventario');
        
        if (result.isRelevantQuery) {
            logger.info(`Consulta de inventario detectada. Tipo: ${result.queryType}`);
            logger.info(`Mensaje enriquecido: ${result.enrichedMessage}`);
            // Aquí se procesaría la consulta con el contexto enriquecido
        } else {
            logger.info('No es una consulta relacionada con inventario');
            // Procesar normalmente
        }
    } catch (error) {
        logger.error(`Error al analizar consulta de inventario: ${error.message}`);
    }
}

module.exports = {
    initInventarioAnalyzer,
    ejemploUsoInventarioAnalyzer
};