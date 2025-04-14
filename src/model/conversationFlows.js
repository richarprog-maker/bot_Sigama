/**
 * Modelo que contiene los flujos de conversación para el asistente virtual Valeria
 * Siguiendo el patrón MVC, este archivo contiene la lógica de negocio relacionada con los flujos de conversación
 */

const conversationFlows = {
  SALUDO_INICIAL: {
    id: 1,
    name: 'SALUDO INICIAL',
    instructions: [
      'Hola, soy Siena, tu asistente virtual de SIGMA. Puedo brindarte información acerca de consultas relacionadas a:',
      '-Seguimiento Facturación Ots y Mesón',
      '-Consulta por OT',
      '-Consulta por NV Mesón', 
      '-Consulta de stock de repuestos',
      '-Historia clínica',
      'Si el cliente proporciona su nombre, personaliza el saludo usando su nombre.',
      'Si el cliente no proporciona su nombre, continuar con el flujo normal.'
    ]
  },
  HISTORIA_CLINICA: {
    id: 2,
    name: 'HISTORIA CLÍNICA',
    instructions: [
      'Cuando el cliente solicite consultar la historia clínica por nombre del cliente o solo historia clinica, responde:',
      'Las búsquedas de historia clínica se realizan por placa. Por favor indícame la placa de la historia clínica que deseas consultar.'
    ]
  },
};

/**
 * Función para generar el texto de los flujos de conversación para el prompt del sistema
 * @returns {string} Texto formateado con los flujos de conversación
 */
function getConversationFlowsText() {
  let flowsText = '**Flujos de conversación:**\n\n';
  
  Object.values(conversationFlows).forEach(flow => {
    flowsText += `${flow.id}. ${flow.name}:\n`;
    flow.instructions.forEach(instruction => {
      flowsText += `   - ${instruction}\n`;
    });
    flowsText += '\n';
  });
  
  return flowsText.trim();
}

module.exports = {
  conversationFlows,
  getConversationFlowsText
};