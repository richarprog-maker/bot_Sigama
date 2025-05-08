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

/**
 * Sanitiza el texto JSON para asegurar que se pueda parsear correctamente
 * @param {string} jsonText - El texto JSON a sanitizar
 * @returns {string} - El texto JSON sanitizado
 */
function sanitizeJsonText(jsonText) {
  // Eliminar cualquier texto antes del primer '{'
  const firstBrace = jsonText.indexOf('{');
  if (firstBrace > 0) {
    jsonText = jsonText.substring(firstBrace);
  }
  
  // Eliminar cualquier texto después del último '}'
  const lastBrace = jsonText.lastIndexOf('}');
  if (lastBrace >= 0 && lastBrace < jsonText.length - 1) {
    jsonText = jsonText.substring(0, lastBrace + 1);
  }
  
  // Reemplazar caracteres especiales que puedan causar problemas
  jsonText = jsonText.replace(/[\u0000-\u0019]+/g, '');
  
  return jsonText;
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
  
  **CRÍTICO – Detección de consultas específicas**  
  Cuando identifiques una consulta *válida*, termina tu respuesta con el bloque en contexto debe de ir las consultas que se realiza. Debes hacer un resumen y enviar las preguntas en contexto.
  
  IMPORTANTE: Asegúrate de que el JSON esté correctamente formateado y no contenga caracteres adicionales.
  
  ===CONULTAR_DATOS_SIGMA===
  {
    "message": "consulta_detectada",
    "tipo": "[tipo_de_consulta]",
    "contexto": "[TODO EL HISTORIAL EN TEXTO PLANO – hasta 4 KB]"
  }
  
  *El campo **contexto** debe contener todo lo conversado pero resume recuerda que eres una asistente que brinda información para responder consultas.
  
  
  **CRÍTICO – Detección de solicitudes de gráficas**  
  Si el usuario pide una gráfica, termina con:
  
  IMPORTANTE: Asegúrate de que el JSON esté correctamente formateado y no contenga caracteres adicionales.
  
  ===GENERAR_GRAFICA_SIGMA===
  {
    "message": "grafica_solicitada",
    "query": "[consulta_para_datos]",
    "chartType": "[bar|pie]",
    "title": "[título_opcional]"
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
      const jsonStart = response.indexOf('===CONULTAR_DATOS_SIGMA===') + '===CONULTAR_DATOS_SIGMA==='.length;
      let jsonText = response.slice(jsonStart).trim();
      
      // Try to extract just the JSON object using regex
      const jsonMatch = jsonText.match(/(\{[\s\S]*?\})/);
      if (jsonMatch && jsonMatch[1]) {
        jsonText = jsonMatch[1];
      } else {
        // Fallback to finding the end bracket
        const possibleEndIndex = jsonText.indexOf('}') + 1;
        if (possibleEndIndex > 0) {
          jsonText = jsonText.substring(0, possibleEndIndex);
        }
      }
      
      let jsonData;
      try {
        jsonText = sanitizeJsonText(jsonText);
        jsonData = JSON.parse(jsonText);
      } catch (jsonError) {
        console.error('Error al parsear JSON de consulta:', jsonError);
        console.error('Texto JSON problemático:', jsonText);
        console.error('Respuesta completa:', response);
        throw new Error('Formato de respuesta inválido');
      }

      /* Aseguramos contexto */
      if (!jsonData.contexto) {
        jsonData.contexto = flattenConversation([
          ...state.messages,
          { role: 'user', content: message }
        ]);
      }

      if (jsonData.message === 'consulta_detectada' && jsonData.tipo) {
        /* ⬇️ Aquí enviamos SOLO EL CONTEXTO como "message" */ 
        const queryResult = await processQuery(jsonData.contexto, sender);

        if (queryResult.success) {
          cleanResponse = queryResult.response;
          state.lastProcessedMessage = message;
        }
      }
    }

    /* ---------- GENERAR_GRAFICA_SIGMA ---------- */
    else if (response.includes('===GENERAR_GRAFICA_SIGMA===')) {
      const jsonStart = response.indexOf('===GENERAR_GRAFICA_SIGMA===') + '===GENERAR_GRAFICA_SIGMA==='.length;
      let jsonText = response.slice(jsonStart).trim();
      
      // Try to extract just the JSON object using regex
      const jsonMatch = jsonText.match(/(\{[\s\S]*?\})/);
      if (jsonMatch && jsonMatch[1]) {
        jsonText = jsonMatch[1];
      } else {
        // Fallback to finding the end bracket
        const possibleEndIndex = jsonText.indexOf('}') + 1;
        if (possibleEndIndex > 0) {
          jsonText = jsonText.substring(0, possibleEndIndex);
        }
      }
      
      let jsonData;
      try {
        jsonText = sanitizeJsonText(jsonText);
        jsonData = JSON.parse(jsonText);
      } catch (jsonError) {
        console.error('Error al parsear JSON de gráfica:', jsonError);
        console.error('Texto JSON problemático:', jsonText);
        console.error('Respuesta completa:', response);
        throw new Error('Formato de respuesta inválido');
      }

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
