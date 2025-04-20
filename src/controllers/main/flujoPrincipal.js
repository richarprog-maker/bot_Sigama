const { getOpenAIResponse } = require('../../services/openaiService.js');
const { getConversationFlowsText } = require('../../model/conversationFlows.js');
const { processQuery } = require('../flujos/consultas/querysController.js');
const { processChartRequest } = require('../flujos/graficas/chartController');
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
  
  
  const fechaHoraActual = obtenerFechaHoraActual();
  const fechaActualISO = `${fechaHoraActual.año}-${String(fechaHoraActual.mes).padStart(2, '0')}-${String(fechaHoraActual.dia).padStart(2, '0')}`;
  const hora = `${fechaHoraActual.hora}:${fechaHoraActual.minuto}`;

  const systemPrompt = `

**Fecha actual:** ${fechaActualISO}
**Hora actual:** ${hora}

**Servicios Disponibles:**


**Precios:**


**Seguridad:**


**Restricciones importantes:**
🔴 SOLO responde a preguntas relacionadas a las conultas no de otras areas ni de musica ni infomaciones generales 

**CRÍTICO: SIEMPRE debes incluir la información en formato JSON al final del mensaje cuando detectes una consulta específica, precedida por "===CONULTAR_DATOS_SIGMA===":*

**Instrucciones para consultas específicas:**
Cuando un cliente solicite información relacionada a alguna de estas categorías, DEBES OBLIGATORIAMENTE incluir el formato JSON para consultar la base de datos, incluso si el mensaje no contiene un saludo previo. NO menciones al usuario que estás generando un JSON:

1. **Seguimiento Facturación OTs y Mesón**: Cuando pregunten sobre el estado de facturación, pagos pendientes o historial de facturación.
   Ejemplo: "¿Cuál es el estado de facturación de la OT 12345?" o "cuantas asesores hay en ots facturadas"
   IMPORTANTE: SIEMPRE genera el JSON para este tipo de consultas, incluso si son preguntas directas sin saludo.

2. **Consulta por OT**: Cuando pregunten por una Orden de Trabajo específica por su número.
   Ejemplo: "Necesito información sobre la OT 54321" o "¿En qué estado está mi orden 54321?"

3. **Consulta por NV Mesón**: Cuando pregunten por una Nota de Venta de Mesón.
   Ejemplo: "¿Puedes verificar la nota de venta 98765?" o "Quiero saber el detalle de mi NV 98765"

4. **Consulta de stock de repuestos**: Cuando pregunten por disponibilidad de repuestos.
   Ejemplo: "¿Tienen disponible el repuesto XYZ-123?" o "Necesito saber si hay stock del componente ABC"

5. **Historia clínica**: Cuando soliciten el historial de servicios o reparaciones.
   Ejemplo: "¿Cuál es el historial de reparaciones del cliente Juan Pérez?" o "Necesito la historia clínica del vehículo con placa ABC-123"

6. **Generación de gráficas**: Cuando soliciten visualizar datos en forma de gráfica.
   Ejemplo: "Muéstrame una gráfica de las ventas por mes" o "Necesito un gráfico de pastel con los repuestos más vendidos"

===CONULTAR_DATOS_SIGMA===
{
  "message": "consulta_detectada",
  "tipo": "[tipo_de_consulta]"
}

**Cuando detectes una solicitud de gráfica, ya sea por ejemplo quiero grafica o algo relacionado si encaso no identifiques grafica no devulvas ese json, incluye la información en formato JSON al final del mensaje, precedida por "===GENERAR_GRAFICA_SIGMA===":*
===GENERAR_GRAFICA_SIGMA===
{
  "message": "grafica_solicitada",
  "query": "[consulta_para_datos]",
  "chartType": "[tipo_de_grafica]",
  "title": "[titulo_opcional]"
}

Para el campo chartType, usa 'bar' para gráficas de barras o 'pie' para gráficas de pastel.
Ejemplos de solicitudes de gráficas:
- "Muéstrame una gráfica de barras con las OTs por asesor"
- "Genera un gráfico de pastel con los repuestos más vendidos"
- "Quiero ver una gráfica de las ventas por mes"
- "Necesito visualizar en una gráfica la distribución de OTs por estado"
${getConversationFlowsText()}
`.trim();

  const messagesForOpenAI = [
    { role: "system", content: systemPrompt },
    ...state.messages,
    { role: "user", content: message }
  ];

  const response = await getOpenAIResponse(messagesForOpenAI);
  
  // Procesar la respuesta de OpenAI
  let cleanResponse = response;
  try {

    if (response.includes("===CONULTAR_DATOS_SIGMA===")) {
      console.log("Detectada consulta en formato JSON");
      const jsonStartIndex = response.indexOf("===CONULTAR_DATOS_SIGMA===") + "===CONULTAR_DATOS_SIGMA===".length;
      const jsonString = response.substring(jsonStartIndex).trim();
      
      try {
        const jsonData = JSON.parse(jsonString);
        console.log("Datos JSON extraídos:", jsonData);
       
        if (jsonData && jsonData.message === "consulta_detectada" && jsonData.tipo) {
          console.log("Tipo de consulta detectada:", jsonData.tipo);
          
          // Procesar la consulta usando el tipo detectado
          const queryResult = await processQuery(message, sender);
          
          if (queryResult.success) {
            // Guardar la consulta en el historial de conversación
            state.messages.push({ role: "user", content: message });
            state.messages.push({ role: "assistant", content: queryResult.response });
            if (state.messages.length > 10) state.messages = state.messages.slice(-10);
            
            cleanResponse = queryResult.response;
          }
        }
      } catch (jsonError) {
        console.error("Error al parsear JSON de la respuesta:", jsonError);
      }
    } else if (response.includes("===GENERAR_GRAFICA_SIGMA===")) {
      console.log("Detectada solicitud de gráfica en formato JSON");
      const jsonStartIndex = response.indexOf("===GENERAR_GRAFICA_SIGMA===") + "===GENERAR_GRAFICA_SIGMA===".length;
      const jsonString = response.substring(jsonStartIndex).trim();
      
      try {
        const jsonData = JSON.parse(jsonString);
        console.log("Datos de gráfica extraídos:", jsonData);
        
        if (jsonData && jsonData.message === "grafica_solicitada") {
          console.log("Solicitud de gráfica detectada:", jsonData.query);
          
          cleanResponse = "Estoy generando la gráfica solicitada. Te la enviaré en un momento...";
          
          // Guardar la consulta en el historial de conversación
          state.messages.push({ role: "user", content: message });
          state.messages.push({ role: "assistant", content: cleanResponse });
          
          // Procesar la solicitud de gráfica en segundo plano
          setTimeout(async () => {
            try {
              // Procesar la solicitud de gráfica usando el controlador
              await processChartRequest(
                jsonData.query,
                sender,
                jsonData.chartType || 'bar',
                jsonData.title || ''
              );
              console.log("Gráfica procesada y enviada exitosamente");
            } catch (error) {
              console.error("Error al procesar gráfica en segundo plano:", error);
            }
          }, 100);
          
          return cleanResponse;
        }
      } catch (jsonError) {
        console.error("Error al parsear JSON de la solicitud de gráfica:", jsonError);
      }
    }
  } catch (error) {
    console.error("Error al procesar respuesta OpenAI:", error);
    cleanResponse = "Lo siento, hubo un problema al procesar tu solicitud. Por favor, intenta de nuevo.";
  }

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
  },
  // Exportar la función para acceder al estado de conversación
  getOrCreateConversationState
}
