const { getOpenAIResponse }   = require('../../services/openaiService.js');
const { getConversationFlowsText } = require('../../model/conversationFlows.js');
const { processQuery }        = require('../flujos/consultas/querysController.js');
const { processChartRequest } = require('../flujos/graficas/chartController.js');

const conversationState = new Map();

/* ─────────── Helpers ─────────── */
function getOrCreateConversationState(sender) {
  let state = conversationState.get(sender);
  if (!state) {
    state = { 
      data: {}, 
      lastUpdated: Date.now(), 
      messages: [], 
      datosCita: {}, 
      citaGuardada: false,
      // --- MODIFICACIÓN CLAVE: Añadir un estado para rastrear el éxito de la última consulta de datos ---
      lastSuccessfulDataQuery: false 
    };
    conversationState.set(sender, state);
  }
  state.lastUpdated = Date.now();
  return state;
}

function obtenerFechaHoraActual() {
  const ahora = new Date();
  return {
    año:  ahora.getFullYear(),
    mes:  ahora.getMonth() + 1,
    dia:  ahora.getDate(),
    hora: ahora.getHours().toString().padStart(2, '0'),
    minuto: ahora.getMinutes().toString().padStart(2, '0')
  };
}

function flattenConversation(messages) {
  return messages
    .map(m => `${m.role === 'user' ? 'U' : 'A'}: ${m.content}`)
    .join('\n');
}

/* ─────────── Controlador ─────────── */
async function processWithOpenAI(message, sender) {
  const state = getOrCreateConversationState(sender);

  // --- MODIFICACIÓN CLAVE: Interceptar la pregunta "¿Estás segura?" aquí mismo ---
  const lowerCaseMessage = message.toLowerCase();
  if (lowerCaseMessage.includes('estas segura?') || lowerCaseMessage.includes('estás segura?')) {
      if (state.lastSuccessfulDataQuery) {
          // Si la última respuesta fue un dato exitoso, confirma y termina.
          // Resetear el estado para la próxima pregunta, a menos que sea una cadena de confirmaciones.
          state.lastSuccessfulDataQuery = false; // O puedes dejarla en true si quieres que se confirme múltiples veces
          return "Sí, estoy segura. Esa es la información que tengo registrada.";
      } else {
          // Si no hubo una respuesta de datos exitosa previa (ej: error, saludo, gráfica),
          // o si ya se había preguntado antes sin una nueva consulta en el medio.
          return "Estoy aquí para ayudarte. ¿Hay algo más en lo que pueda asistirte?";
      }
  }
  // --- FIN DE INTERCEPCIÓN ---


  /* ── prompt del sistema (añadimos instrucción de "contexto") ── */
  const { año, mes, dia, hora, minuto } = obtenerFechaHoraActual();
  const systemPrompt = `
  **Fecha actual:** ${año}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}
  **Hora actual:** ${hora}:${minuto}
  
  **Servicios Disponibles:**
  - Seguimiento Facturación OTs
  - Seguimiento Facturación Mesón
  - Consulta por OT
  - Consulta por NV Mesón
  - Consulta de stock de repuestos
  - Historia clínica
  - Generación de gráficas (bar | pie)
  
  **Restricciones importantes:**
  🔴 SOLO responde a preguntas relacionadas con las consultas anteriores.  
  🔴 NO converses sobre temas de música ni información general.
  
  **CRÍTICO – Detección de consultas específicas** Cuando identifiques una consulta *válida*, **responde la información solicitada directamente al usuario**. Por ejemplo, "Tienes 39 órdenes de trabajo facturadas...". Luego, termina tu respuesta con el bloque de control para el procesamiento interno: 
  
  ===CONULTAR_DATOS_SIGMA===
  {
    "message": "consulta_detectada",
    "tipo": "[tipo_de_consulta]",
    "contexto": "<TODO EL HISTORIAL EN TEXTO PLANO – hasta 4 KB>"
  }
  
  *El campo **contexto** debe contener todo lo conversado pero resumido. Recuerda que eres una asistente que brinda información para responder consultas.* **CRÍTICO – Detección de solicitudes de gráficas** Si el usuario pide una gráfica, responde primero un mensaje de confirmación (ej. "Estoy generando la gráfica solicitada. Te la enviaré en un momento…") y luego termina con el bloque de control:
  
  ===GENERAR_GRAFICA_SIGMA===
  {
    "message": "grafica_solicitada",
    "query":   "[consulta_para_datos]",
    "chartType": "[bar|pie]",
    "title":     "[título_opcional]"
  }
  
  Para *chartType* usa **bar** (barras) o **pie** (pastel).
  
  ${getConversationFlowsText()}
  `.trim();
  

  const messagesForOpenAI = [
    { role: 'system', content: systemPrompt },
    ...state.messages,
    { role: 'user', content: message }
  ];

  const openaiRawResponse = await getOpenAIResponse(messagesForOpenAI); // Renombrado para claridad

  /* ── Procesamiento de la respuesta de OpenAI ── */
  let cleanResponse = openaiRawResponse; // Valor por defecto
  
  // --- MODIFICACIÓN CLAVE: Reiniciar el estado de la última consulta exitosa antes de procesar una nueva ---
  state.lastSuccessfulDataQuery = false; 

  try {
    /* ---------- CONSULTAR_DATOS_SIGMA ---------- */
    if (openaiRawResponse.includes('===CONULTAR_DATOS_SIGMA===')) {
      // Extraer el texto ANTES del bloque JSON para mostrar al usuario.
      // Esto asume que OpenAI sigue la instrucción de poner la respuesta primero.
      const textBeforeJson = openaiRawResponse.split('===CONULTAR_DATOS_SIGMA===')[0].trim();
      
      // Extraer solo el bloque JSON
      const jsonStart = openaiRawResponse.indexOf('===CONULTAR_DATOS_SIGMA===') + '===CONULTAR_DATOS_SIGMA==='.length;
      const jsonText = openaiRawResponse.slice(jsonStart).trim();
      const jsonData = JSON.parse(jsonText);

      /* Aseguramos contexto */
      if (!jsonData.contexto) {
        jsonData.contexto = flattenConversation([
          ...state.messages,
          { role: 'user', content: message }
        ]);
      }

      if (jsonData.message === 'consulta_detectada' && jsonData.tipo) {
        // Enviar solo los datos de la consulta al procesador
        const queryResult = await processQuery(jsonData.contexto, sender);

        if (queryResult.success) {
          // Usamos la respuesta procesada de queryController.js (ej: "Tienes 39 órdenes...")
          cleanResponse = queryResult.response; 
          state.lastProcessedMessage = message;
          // --- MODIFICACIÓN CLAVE: Marcar que esta consulta fue exitosa en la DB ---
          // Asumimos que queryResult.success ya significa que se encontró un resultado válido para la pregunta.
          state.lastSuccessfulDataQuery = true; 
        } else {
          // Si queryResult.success es false (hubo un error o no se encontró nada por la lógica del controller)
          cleanResponse = queryResult.response || 'Lo siento, no pude procesar tu consulta a la base de datos. Por favor, intenta con otra pregunta.';
          state.lastSuccessfulDataQuery = false; // No fue exitosa
        }
      }
    }

    /* ---------- GENERAR_GRAFICA_SIGMA ---------- */
    else if (openaiRawResponse.includes('===GENERAR_GRAFICA_SIGMA===')) {
      // Extraer el texto ANTES del bloque JSON
      const textBeforeJson = openaiRawResponse.split('===GENERAR_GRAFICA_SIGMA===')[0].trim();
      
      // Extraer solo el bloque JSON
      const jsonStart = openaiRawResponse.indexOf('===GENERAR_GRAFICA_SIGMA===') + '===GENERAR_GRAFICA_SIGMA==='.length;
      const jsonText = openaiRawResponse.slice(jsonStart).trim();
      const jsonData = JSON.parse(jsonText);

      if (jsonData.message === 'grafica_solicitada') {
        cleanResponse = textBeforeJson || 'Estoy generando la gráfica solicitada. Te la enviaré en un momento…';
        state.lastSuccessfulDataQuery = false; // Las gráficas no son una "respuesta de datos" directa para confirmar
        setTimeout(() =>
          processChartRequest(
            jsonData.query,
            sender,
            jsonData.chartType || 'bar',
            jsonData.title     || ''
          ), 100);
        return cleanResponse; // Retorna aquí porque la gráfica es asíncrona
      }
    } else {
      // Si no contiene ninguno de los JSON especiales, es una respuesta directa de OpenAI (ej: saludo).
      cleanResponse = openaiRawResponse
        .replace(/===CONULTAR_DATOS_SIGMA===[\s\S]*$/g, '')
        .replace(/===GENERAR_GRAFICA_SIGMA===[\s\S]*$/g, '')
        .trim();
      state.lastSuccessfulDataQuery = false; // No es una consulta de datos
    }
  } catch (err) {
    console.error('Error al procesar respuesta OpenAI o JSON:', err);
    cleanResponse = 'Lo siento, hubo un problema al procesar tu solicitud. Por favor, inténtalo de nuevo.';
    state.lastSuccessfulDataQuery = false; // Hubo un error, no fue exitosa
  }

  /* ── Actualiza historial ── */
  // Asegúrate de que el historial no se duplique y que se guarde la respuesta correcta.
  if (state.lastProcessedMessage !== message) {
    state.messages.push({ role: 'user', content: message });
    state.messages.push({ role: 'assistant', content: cleanResponse });
    if (state.messages.length > 10) state.messages = state.messages.slice(-10);
  } else {
    // Si es el mismo mensaje que se procesó, solo actualiza la respuesta del asistente.
    const idx = state.messages.findIndex(m => m.role === 'assistant');
    if (idx !== -1) state.messages[idx].content = cleanResponse;
  }
  state.lastProcessedMessage = null; // Reiniciar para el siguiente turno

  return cleanResponse;
}

/* ── Exports ── */
module.exports = {
  getResponseText: async (type, message, sender) => {
    try {
      return await processWithOpenAI(message, sender);
    } catch (err) {
      console.error('Error en getResponseText:', err);
      return 'Lo siento, algo salió mal. ¿Puedes intentarlo de nuevo?';
    }
  },
  getOrCreateConversationState
};