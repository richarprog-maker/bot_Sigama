const { getOpenAIResponse } = require('../../services/openaiService.js');
const { getConversationFlowsText } = require('../../model/conversationFlows.js');
const { processQuery, isDatabaseQuery } = require('../flujos/consultas/querysController.js');
const conversationState = new Map();

function getOrCreateConversationState(sender) {
  let state = conversationState.get(sender);
  if (!state) {
    state = { data: {}, lastUpdated: Date.now(), messages: [], datosCita: {}, citaGuardada: false };
    conversationState.set(sender, state);
  }
  state.lastUpdated = Date.now();
  return state;
}

function obtenerFechaHoraActual() {
  const ahora = new Date();
  return {
    año: ahora.getFullYear(),
    mes: ahora.getMonth() + 1,
    dia: ahora.getDate(),
    hora: ahora.getHours().toString().padStart(2, '0'),
    minuto: ahora.getMinutes().toString().padStart(2, '0')
  };
}


async function processWithOpenAI(message, sender, nombreCliente) {
  // Obtener o crear el estado de conversación para este remitente
  const state = getOrCreateConversationState(sender);
  
  // Verificar si es una consulta a la base de datos
  const isDbQuery = await isDatabaseQuery(message);
  if (isDbQuery) {
    console.log("Detectada consulta a base de datos:", message);
    try {
      const queryResult = await processQuery(message, sender);
      
      if (queryResult.success) {
        // Guardar la consulta en el historial de conversación
        state.messages.push({ role: "user", content: message });
        state.messages.push({ role: "assistant", content: queryResult.response });
        if (state.messages.length > 10) state.messages = state.messages.slice(-10);
        
        return queryResult.response;
      }
    } catch (error) {
      console.error("Error procesando consulta a base de datos:", error);
      // Si falla, continuamos con el flujo normal de OpenAI
    }
  }
  
  const fechaHoraActual = obtenerFechaHoraActual();
  const fechaActualISO = `${fechaHoraActual.año}-${String(fechaHoraActual.mes).padStart(2, '0')}-${String(fechaHoraActual.dia).padStart(2, '0')}`;
  const hora = `${fechaHoraActual.hora}:${fechaHoraActual.minuto}`;

  const systemPrompt = `
Eres Sigma AI, experta en atención al cliente de un servicio.

**Fecha actual:** ${fechaActualISO}
**Hora actual:** ${hora}

**Servicios Disponibles:**


**Precios:**


**Seguridad:**


**Restricciones importantes:**
🔴 SOLO responde a preguntas relacionadas a las conultas no de otras areas ni de musica ni infomaciones generales 

${getConversationFlowsText()}
`.trim();

  const messagesForOpenAI = [
    { role: "system", content: systemPrompt },
    ...state.messages,
    { role: "user", content: message }
  ];

  const response = await getOpenAIResponse(messagesForOpenAI);
  
  // Procesar la respuesta de OpenAI
  const cleanResponse = response;

  state.messages.push({ role: "user", content: message });
  state.messages.push({ role: "assistant", content: cleanResponse });
  if (state.messages.length > 10) state.messages = state.messages.slice(-10);

  return cleanResponse;
}

module.exports = {
  getResponseText: async (type, message, sender) => {
    try {
      console.log("Mensaje recibido:", message);
      console.log("Sender:", sender);
      return await processWithOpenAI(message, sender, null);
    } catch (error) {
      console.error("Error:", error);
      return "Lo siento, algo salió mal. ¿Puedes intentarlo de nuevo?";
    }
  }
}
