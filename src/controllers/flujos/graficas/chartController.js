/**
 * Controlador para manejar la generación y envío de gráficas
 */

const chartService = require('../../../services/chartService');
const axios = require('axios');
const { puertoInit } = require('../../../../config.js');

/**
 * Procesa una solicitud de gráfica y la envía al usuario
 * @param {string} query - Consulta para generar la gráfica
 * @param {string} sender - ID del remitente
 * @param {string} chartType - Tipo de gráfica ('bar' o 'pie')
 * @param {string} title - Título opcional para la gráfica
 * @returns {Promise<Object>} - Resultado del procesamiento
 */
async function processChartRequest(query, sender, chartType = 'bar', title = '') {
    try {
        console.log(`Procesando solicitud de gráfica: ${query}`);
        console.log(`Tipo de gráfica: ${chartType}`);
        
        // Determinar título si no se proporcionó
        if (!title) {
            title = chartType === 'pie' ? 
                'Distribución de datos' : 
                'Análisis de datos';
        }
        
        // Determinar etiquetas para gráficas de barras
        const xLabel = 'Categorías';
        const yLabel = 'Valores';
        
        // Generar la gráfica
        const chartUrl = await chartService.generateChartFromQuery(
            query, 
            chartType, 
            title, 
            xLabel, 
            yLabel
        );
        
        // Preparar mensaje para enviar con la gráfica
        const message = `Aquí está la gráfica solicitada: ${title}`;
        
        // Enviar la gráfica al usuario a través del endpoint
        const phone = sender.includes('@') ? sender : `${sender}@s.whatsapp.net`;
        
        // Llamar al endpoint local para enviar la gráfica
        const response = await axios.post(`http://localhost:${puertoInit}/send-media-bot`, {
            phoneid: phone,
            message: message,
            url: chartUrl
        });
        
        console.log('Gráfica enviada exitosamente:', response.data);
        
        return {
            success: true,
            message: 'Gráfica generada y enviada exitosamente',
            chartUrl: chartUrl
        };
    } catch (error) {
        console.error('Error al procesar solicitud de gráfica:', error);
        return {
            success: false,
            error: error.message || 'Error al generar la gráfica',
            message: 'No se pudo generar la gráfica solicitada. Por favor, intenta con otra consulta.'
        };
    }
}

module.exports = {
    processChartRequest
};