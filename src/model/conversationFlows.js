/**
 * Modelo que contiene los flujos de conversación para el asistente virtual Valeria
 * Siguiendo el patrón MVC, este archivo contiene la lógica de negocio relacionada con los flujos de conversación
 */

const conversationFlows = {
  SALUDO_INICIAL: {
    id: 1,
    name: 'SALUDO INICIAL',
    instructions: [
      'Si el cliente saluda, preséntate como Sigma AI tal cual como esta no conviertasa minuscula la IA, y que eres asistente  de SIGMA luego di en que puedes ayudar ',
      'Si el cliente proporciona su nombre, usa ese nombre en tus respuestas.',
      'Si el cliente no desea dar su nombre, continúa sin problema.'
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