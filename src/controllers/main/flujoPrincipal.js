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
 * Intenta parsear JSON, devuelve null si falla
 * @param {string} jsonStr - La cadena JSON a intentar parsear
 * @returns {object|null} - El objeto JSON o null si falló
 */
function tryParseJSON(jsonStr) {
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    return null;
  }
}

/**
 * Sanitiza el texto JSON para asegurar que se pueda parsear correctamente
 * @param {string} jsonText - El texto JSON a sanitizar
 * @returns {string} - El texto JSON sanitizado
 */
function sanitizeJsonText(jsonText) {
  if (!jsonText) return "{}";
  
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
  
  // Verificar balance de llaves
  let openBraces = 0;
  let closeBraces = 0;
  for (let i = 0; i < jsonText.length; i++) {
    if (jsonText[i] === '{') openBraces++;
    if (jsonText[i] === '}') closeBraces++;
  }
  
  // Añadir llaves de cierre faltantes
  while (openBraces > closeBraces) {
    jsonText += '}';
    closeBraces++;
  }
  
  // Eliminar llaves de cierre extra al final
  while (closeBraces > openBraces && jsonText.endsWith('}')) {
    jsonText = jsonText.substring(0, jsonText.length - 1);
    closeBraces--;
  }
  
  // Asegurar que el JSON esté completo (debe empezar con { y terminar con })
  if (!jsonText.startsWith('{')) jsonText = '{' + jsonText;
  if (!jsonText.endsWith('}')) jsonText = jsonText + '}';
  
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
  
  **CRÍTICO – JSON BIEN FORMATEADO** 
  El JSON que devuelvas DEBE respetar estas reglas estrictas:
  - Debe ser un objeto JSON válido y completo
  - Debe utilizar comillas dobles para las claves y valores de texto
  - Debe contener TODOS los corchetes de apertura y cierre: cada { debe tener su } correspondiente
  - No debe contener comentarios ni texto explicativo dentro del JSON
  - No debe contener saltos de línea ni caracteres especiales no escapados

  **CRÍTICO – Detección de consultas específicas**  
  Cuando identifiques una consulta *válida*, termina tu respuesta con un bloque de JSON siguiendo este formato EXACTO:
  
  ===CONULTAR_DATOS_SIGMA===
  {
    "message": "consulta_detectada",
    "tipo": "[tipo_de_consulta]"
  }
  
  Para consultas de historia clínica usa:
  
  ===CONULTAR_DATOS_SIGMA===
  {
    "message": "consulta_detectada", 
    "tipo": "historia_clinica",
    "placa": "[NÚMERO_DE_PLACA]"
  }
  
  * NO incluyas la etiqueta "contexto" en el JSON a menos que sea necesario
  * Asegúrate de que el JSON tenga TODAS las llaves de cierre correspondientes.
  * NO añadas texto adicional después del JSON.
  
  **CRÍTICO – Detección de solicitudes de gráficas**  
  Si el usuario pide una gráfica, termina con este formato EXACTO:
  
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
      
      // Regex mejorado para extraer JSON completo incluso con objetos anidados
      const jsonRegex = /(\{(?:[^{}]|(?:\{(?:[^{}]|(?:\{[^{}]*\}))*\}))*\})/gm;
      const jsonMatch = jsonText.match(jsonRegex);
      
      if (jsonMatch && jsonMatch[0]) {
        jsonText = jsonMatch[0];
      } else {
        // Si no se encuentra el patrón completo, intentar encontrar el último corchete de cierre
        // Contamos las llaves para encontrar el JSON correctamente
        let openBraces = 0;
        let closeBraces = 0;
        let startPos = jsonText.indexOf('{');
        let endPos = -1;
        
        if (startPos >= 0) {
          for (let i = startPos; i < jsonText.length; i++) {
            if (jsonText[i] === '{') openBraces++;
            if (jsonText[i] === '}') {
              closeBraces++;
              if (openBraces === closeBraces) {
                endPos = i + 1;
                break;
              }
            }
          }
          
          if (endPos > 0) {
            jsonText = jsonText.substring(startPos, endPos);
          }
        }
      }
      
      let jsonData;
      try {
        jsonText = sanitizeJsonText(jsonText);
        // Verificación adicional para JSON incompleto
        if (!jsonText.endsWith('}')) {
          jsonText = jsonText + '}';
        }
        jsonData = JSON.parse(jsonText);
      } catch (jsonError) {
        console.error('Error al parsear JSON de consulta:', jsonError);
        console.error('Texto JSON problemático:', jsonText);
        console.error('Respuesta completa:', response);
        
        // Intentar extraer solo las partes importantes del JSON en caso de fallo
        const simplifiedJSON = {
          message: "consulta_detectada",
          tipo: "desconocido",
          contexto: message
        };
        
        // Intentar extraer el tipo de la consulta
        const tipoMatch = jsonText.match(/"tipo"\s*:\s*"([^"]+)"/);
        if (tipoMatch && tipoMatch[1]) {
          simplifiedJSON.tipo = tipoMatch[1];
        }
        
        // Intentar extraer el contexto
        const contextoMatch = jsonText.match(/"contexto"\s*:\s*"([^"]+)"/);
        if (contextoMatch && contextoMatch[1]) {
          simplifiedJSON.contexto = contextoMatch[1];
        }
        
        // Intentar extraer los filtros si existen
        const filtersStart = jsonText.indexOf('"filters"');
        if (filtersStart > 0) {
          const filtersText = jsonText.substring(filtersStart);
          const filtersMatch = filtersText.match(/"filters"\s*:\s*(\{[^}]+\})/);
          if (filtersMatch && filtersMatch[1]) {
            const parsedFilters = tryParseJSON(filtersMatch[1]);
            if (parsedFilters) {
              simplifiedJSON.filters = parsedFilters;
            }
          }
        }
        
        jsonData = simplifiedJSON;
      }

      /* Aseguramos contexto */
      if (!jsonData.contexto) {
        jsonData.contexto = message;
      }

      if (jsonData.message === 'consulta_detectada' && jsonData.tipo) {
        /* Procesamos la consulta directamente */
        cleanResponse = "Procesando tu consulta...";
        
        try {
          /* Enviamos la consulta para procesamiento */
          const queryResult = await processQuery(jsonData, sender);

          if (queryResult.success) {
            cleanResponse = queryResult.response;
            state.lastProcessedMessage = message;
          }
        } catch (queryError) {
          console.error('Error al procesar la consulta:', queryError);
          cleanResponse = "Lo siento, hubo un error al procesar tu consulta. Por favor, inténtalo de nuevo.";
        }
      }
    }

    /* ---------- GENERAR_GRAFICA_SIGMA ---------- */
    else if (response.includes('===GENERAR_GRAFICA_SIGMA===')) {
      const jsonStart = response.indexOf('===GENERAR_GRAFICA_SIGMA===') + '===GENERAR_GRAFICA_SIGMA==='.length;
      let jsonText = response.slice(jsonStart).trim();
      
      // Regex mejorado para extraer JSON completo incluso con objetos anidados
      const jsonRegex = /(\{(?:[^{}]|(?:\{(?:[^{}]|(?:\{[^{}]*\}))*\}))*\})/gm;
      const jsonMatch = jsonText.match(jsonRegex);
      
      if (jsonMatch && jsonMatch[0]) {
        jsonText = jsonMatch[0];
      } else {
        // Si no se encuentra el patrón completo, intentar encontrar el último corchete de cierre
        // Contamos las llaves para encontrar el JSON correctamente
        let openBraces = 0;
        let closeBraces = 0;
        let startPos = jsonText.indexOf('{');
        let endPos = -1;
        
        if (startPos >= 0) {
          for (let i = startPos; i < jsonText.length; i++) {
            if (jsonText[i] === '{') openBraces++;
            if (jsonText[i] === '}') {
              closeBraces++;
              if (openBraces === closeBraces) {
                endPos = i + 1;
                break;
              }
            }
          }
          
          if (endPos > 0) {
            jsonText = jsonText.substring(startPos, endPos);
          }
        }
      }
      
      let jsonData;
      try {
        jsonText = sanitizeJsonText(jsonText);
        // Verificación adicional para JSON incompleto
        if (!jsonText.endsWith('}')) {
          jsonText = jsonText + '}';
        }
        jsonData = JSON.parse(jsonText);
      } catch (jsonError) {
        console.error('Error al parsear JSON de gráfica:', jsonError);
        console.error('Texto JSON problemático:', jsonText);
        console.error('Respuesta completa:', response);
        
        // Intentar extraer solo las partes importantes del JSON en caso de fallo
        const simplifiedJSON = {
          message: "grafica_solicitada",
          query: message,
          chartType: "bar"
        };
        
        // Intentar extraer la consulta
        const queryMatch = jsonText.match(/"query"\s*:\s*"([^"]+)"/);
        if (queryMatch && queryMatch[1]) {
          simplifiedJSON.query = queryMatch[1];
        }
        
        // Intentar extraer el tipo de gráfica
        const chartTypeMatch = jsonText.match(/"chartType"\s*:\s*"([^"]+)"/);
        if (chartTypeMatch && chartTypeMatch[1]) {
          simplifiedJSON.chartType = chartTypeMatch[1];
        }
        
        // Intentar extraer el título
        const titleMatch = jsonText.match(/"title"\s*:\s*"([^"]+)"/);
        if (titleMatch && titleMatch[1]) {
          simplifiedJSON.title = titleMatch[1];
        }
        
        jsonData = simplifiedJSON;
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
