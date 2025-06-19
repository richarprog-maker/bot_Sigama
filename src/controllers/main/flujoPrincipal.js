const { getOpenAIResponse } = require('../../services/openaiService.js');
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


function flattenConversation(messages) {
  return messages
    .map(m => `${m.role === 'user' ? 'U' : 'A'}: ${m.content}`)
    .join('\n');
}

/* ─────────── Controlador ─────────── */
async function processWithOpenAI(message, sender) {
  try {
    const state = getOrCreateConversationState(sender);

  /* ── prompt del sistema (añadimos instrucción de "contexto") ── */
  const fechaActual = new Date().toISOString();
  const systemPrompt = `
  **Fecha y hora actual (ISO):** ${fechaActual}
  
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
  
  **🚨 CRÍTICO – DETECCIÓN AUTOMÁTICA DE PARÁMETROS 🚨**
  ANTES de responder, ANALIZA si el mensaje del usuario YA CONTIENE:
  
  ✅ PLACAS: Secuencias de 6 caracteres alfanuméricos (CHY014, BDM290, ABC123)
  ✅ NÚMEROS OT: "OT" seguido de números (OT 23277, OT23277)
  ✅ FECHAS: Referencias temporales (01/01/2023, enero, este mes)
  ✅ MONEDA: Menciones de "SOLES" o "DOLARES"
  
  🚫 NUNCA PIDAS INFORMACIÓN QUE YA ESTÁ EN EL MENSAJE
  
  **EJEMPLOS OBLIGATORIOS:**
  ❌ INCORRECTO: Usuario: "placa CHY014" → Responder: "necesito la placa"
  ✅ CORRECTO: Usuario: "placa CHY014" → Detectar CHY014 → Generar JSON inmediatamente
  
  ❌ INCORRECTO: Usuario: "OT 23277" → Responder: "necesito el número"
  ✅ CORRECTO: Usuario: "OT 23277" → Detectar 23277 → Generar JSON inmediatamente
  
  **CRÍTICO – Manejo de contexto conversacional y reutilización de parámetros:**
  Si el usuario modifica SOLO UN PARÁMETRO de una consulta anterior (ejemplo: "ahora con placa HTYUO", "con fecha enero", "en dólares", "del 1 al 15", etc.), debes:
  
  1. 🔄 ANALIZAR el historial de conversación para identificar la consulta anterior
  2. 🔄 REUTILIZAR todos los parámetros de esa consulta anterior (tipo de consulta, parámetros ya especificados)
  3. 🔄 ACTUALIZAR únicamente el parámetro que el usuario está modificando
  4. 🔄 GENERAR inmediatamente el JSON de consulta con los parámetros combinados (anteriores + nuevo)
  5. 🔄 NO volver a preguntar por información ya proporcionada anteriormente
  
  **Ejemplos de modificaciones contextuales:**
  - Usuario: "Consulta información de placa CHY014" → [primera consulta]
  - Usuario: "ahora con placa HTYUO" → REUTILIZAR tipo de consulta anterior, cambiar solo placa
  - Usuario: "en enero" → REUTILIZAR consulta anterior, agregar/cambiar fecha
  - Usuario: "en soles" → REUTILIZAR consulta anterior, cambiar/agregar moneda
  - Usuario: "del 1 al 15" → REUTILIZAR consulta anterior, cambiar rango de fechas
  - Usuario: "en sede Lima" → REUTILIZAR consulta anterior, agregar/cambiar sede
  
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
      try {
        // Extraer solo el bloque JSON, eliminando todo lo demás del mensaje
        const jsonStart = response.indexOf('===CONULTAR_DATOS_SIGMA===') + '===CONULTAR_DATOS_SIGMA==='.length;
        let jsonText = response.slice(jsonStart).trim();
        
        // Limpiar posibles caracteres adicionales al final
        const jsonEndIndex = jsonText.lastIndexOf('}');
        if (jsonEndIndex !== -1) {
          jsonText = jsonText.substring(0, jsonEndIndex + 1);
        }
        
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
      } catch (jsonError) {
        console.error('Error al procesar JSON de consulta:', jsonError);
        cleanResponse = 'Lo siento, hubo un problema al procesar tu consulta. Por favor, intenta reformularla.';
      }
    }

    /* ---------- GENERAR_GRAFICA_SIGMA ---------- */
    else if (response.includes('===GENERAR_GRAFICA_SIGMA===')) {
      try {
        // Extraer solo el bloque JSON
        const jsonStart = response.indexOf('===GENERAR_GRAFICA_SIGMA===') + '===GENERAR_GRAFICA_SIGMA==='.length;
        let jsonText = response.slice(jsonStart).trim();
        
        // Limpiar posibles caracteres adicionales al final
        const jsonEndIndex = jsonText.lastIndexOf('}');
        if (jsonEndIndex !== -1) {
          jsonText = jsonText.substring(0, jsonEndIndex + 1);
        }
        
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
      } catch (jsonError) {
        console.error('Error al procesar JSON de gráfica:', jsonError);
        cleanResponse = 'Lo siento, hubo un problema al procesar tu solicitud de gráfica. Por favor, intenta de nuevo.';
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
  } catch (error) {
    console.error('Error en processWithOpenAI:', error);
    return 'Lo siento, algo salió mal. ¿Puedes intentarlo de nuevo?';
  }
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
