const { getOpenAIResponse }   = require('../../services/openaiService.js');
const { getConversationFlowsText } = require('../../model/conversationFlows.js');
const { processQuery }        = require('../flujos/consultas/querysController.js');
const { processChartRequest } = require('../flujos/graficas/chartController.js');

const conversationState = new Map();

/* ─────────── Helpers ─────────── */
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

  /* ── prompt del sistema (añadimos instrucción de "contexto") ── */
  const { año, mes, dia, hora, minuto } = obtenerFechaHoraActual();
  const systemPrompt = `
  **Fecha actual:** \${año}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}
  **Hora actual:** \${hora}:${minuto}
  
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
  
  **CRÍTICO – Detección de consultas específicas**  
  Cuando identifiques una consulta *válida*, termina tu respuesta con el bloque en contexto debe de ir las consulats que se reliza debes de ahcer un reumen y enviar las preguntas en contexto: 
  
  ===CONULTAR_DATOS_SIGMA===
  {
    "message": "consulta_detectada",
    "tipo": "[tipo_de_consulta]",
    "contexto": "<TODO EL HISTORIAL EN TEXTO PLANO – hasta 4 KB>"
  }
  
  *El campo **contexto** debe contener todo lo conversado pero resume recuerda que eres una sistente que brinda informacion para reponder consultas 
  
  
  **CRÍTICO – Detección de solicitudes de gráficas**  
  Si el usuario pide una gráfica, termina con:
  
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

  const response = await getOpenAIResponse(messagesForOpenAI);

  /* ── Procesamiento ── */
  let cleanResponse = response;

  try {
    /* ---------- CONSULTAR_DATOS_SIGMA ---------- */
    if (response.includes('===CONULTAR_DATOS_SIGMA===')) {
      // Extraer solo el bloque JSON, eliminando todo lo demás del mensaje
      const jsonStart = response.indexOf('===CONULTAR_DATOS_SIGMA===') + '===CONULTAR_DATOS_SIGMA==='.length;
      const jsonText = response.slice(jsonStart).trim();
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
          // Usamos solo la respuesta procesada, sin el JSON original
          cleanResponse = queryResult.response;
          state.lastProcessedMessage = message;
        }
      }
    }

    /* ---------- GENERAR_GRAFICA_SIGMA ---------- */
    else if (response.includes('===GENERAR_GRAFICA_SIGMA===')) {
      // Extraer solo el bloque JSON
      const jsonStart = response.indexOf('===GENERAR_GRAFICA_SIGMA===') + '===GENERAR_GRAFICA_SIGMA==='.length;
      const jsonText = response.slice(jsonStart).trim();
      const jsonData = JSON.parse(jsonText);

      if (jsonData.message === 'grafica_solicitada') {
        cleanResponse = 'Estoy generando la gráfica solicitada. Te la enviaré en un momento…';
        setTimeout(() =>
          processChartRequest(
            jsonData.query,
            sender,
            jsonData.chartType || 'bar',
            jsonData.title     || ''
          ), 100);
        return cleanResponse;
      }
    } else {
      // Si no contiene ninguno de los JSON especiales, solo limpiamos la respuesta
      // de cualquier texto de formato JSON que pudiera contener
      cleanResponse = response
        .replace(/===CONULTAR_DATOS_SIGMA===[\s\S]*$/g, '')
        .replace(/===GENERAR_GRAFICA_SIGMA===[\s\S]*$/g, '')
        .trim();
    }
  } catch (err) {
    console.error('Error al procesar respuesta OpenAI:', err);
    cleanResponse = 'Lo siento, hubo un problema al procesar tu solicitud. Por favor, inténtalo de nuevo.';
  }

  /* ── Actualiza historial ── */
  if (state.lastProcessedMessage !== message) {
    state.messages.push({ role: 'user', content: message });
    state.messages.push({ role: 'assistant', content: cleanResponse });
    if (state.messages.length > 10) state.messages = state.messages.slice(-10);
  } else {
    const idx = state.messages.findIndex(m => m.role === 'assistant');
    if (idx !== -1) state.messages[idx].content = cleanResponse;
  }
  state.lastProcessedMessage = null;

  return cleanResponse;
}

/* ── Exports ── */
module.exports = {
  getResponseText: async (type, message, sender) => {
    try {
      return await processWithOpenAI(message, sender);
    } catch (err) {
      console.error('Error:', err);
      return 'Lo siento, algo salió mal. ¿Puedes intentarlo de nuevo?';
    }
  },
  getOrCreateConversationState
};
