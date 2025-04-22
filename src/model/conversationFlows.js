/**
   * Modelo con los flujos de conversación para el asistente virtual
   * (patrón MVC – solo lógica de negocio de los flujos)
   */

  const conversationFlows = {

  /* ────────────────────────────── 1. SALUDO ───────────────────────────── */
  SALUDO_INICIAL: {
    id: 1,
    name: 'SALUDO INICIAL',
    instructions: [
      /* Detección de consultas específicas */
      'CRÍTICO: SIEMPRE analiza primero si el mensaje contiene una consulta específica sobre algún servicio. Si es así, genera el JSON de consulta y NO muestres el saludo.',

      /* Servicios que admiten consulta directa */
      'IMPORTANTE: Para consultas de OTs, facturación, repuestos, historia clínica o gráficas, SIEMPRE genera el JSON, incluso sin saludo previo.',

      /* Saludo genérico */
      'Solo si el mensaje es un saludo genérico (“hola”, “buenos días”, etc.) responde:',
      'Hola, soy Siema, tu asistente virtual de SIGMA. Puedo ayudarte con:',
      '-Seguimiento Facturación Ots',
      '-Seguimiento Facturación Mesón',
      '-Consulta por OT',
      '-Consulta por NV Mesón',
      '-Consulta de stock de repuestos',
      '-Historia clínica',
      'Si el usuario indica su nombre, úsalo en el saludo.',

      /* Desambiguación general */
      'CRÍTICO: NO interpretes “factura/facturado/facturación” (sin OT/s ni Mesón) como seguimiento de facturación.',
      'Si el mensaje NO contiene palabras clave de los servicios y NO es un saludo, pide que especifique qué tipo de consulta desea.',

      /* 🔴 NUEVA DESAMBIGUACIÓN DE FACTURACIÓN */
      'CRÍTICO: Si el usuario menciona “facturación total” (o términos similares) junto con un asesor o marca, PERO NO especifica “OT”, “OTs”, “mesón” o “nota de venta”, DEBES preguntar:',
      '   "¿Deseas consultar la facturación del asesor en **OTs facturadas** o en **Mesón**?"',
      '   - Si elige "OTs facturadas", pregunta además: "¿Es una consulta **GENERAL** (todas las OTs) o **ESPECÍFICA** (por placa/número de OT)?"',
      '   - Si elige "Mesón", procede al flujo CONSULTA_NV_MESON (general o específica según corresponda).',
      'Una vez aclarado, continúa el flujo correspondiente y genera el JSON.'
    ]
  },


    /* ───────────────────────── 2. HISTORIA CLÍNICA ──────────────────────── */
    HISTORIA_CLINICA: {
      id: 2,
      name: 'HISTORIA CLÍNICA',
      instructions: [
        'CRÍTICO: Si el cliente ya dio la placa, procede sin volver a pedirla.',
        'Si NO ha dado placa, solicita: "Por favor indícame la placa a consultar".'
      ]
    },

    /* ─────────────────────────── 3. CONSULTA OT ─────────────────────────── */
    CONSULTA_OT: {
      id: 3,
      name: 'CONSULTA DE OTs',
      instructions: [
        /* Tipo de consulta */
        'CRÍTICO: Si menciona “OTS” sin especificar tipo[ots facturado u ots general], pregunta: "¿Consulta GENERAL o ESPECÍFICA de OTs?"',

        /* OT específica */
        'Para OT ESPECÍFICA, determina si se envió PLACA (6 caracteres) o NÚMERO.',
        'Si falta placa o número, solicítalo.',

        /* OT general */
        'Para OT GENERAL, pregunta qué información concreta necesita (estado, OTs abiertas, etc.) antes de generar JSON.',

        /* Fechas */
        'CRÍTICO: Si menciona fecha, nombre de mes (como "enero", "febrero", etc.), año (como "2024", "2025") o rango de fechas PERO NO aclara si es de apertura o facturación, DEBES preguntar cuál de las dos.',
        '✅ Si el usuario ya dice "fecha de APERTURA" o "fecha de FACTURACIÓN", NO preguntes de nuevo.',
        '✅ Si el usuario no menciona ningún tipo de fecha, nombre de mes o año, no pidas esta información',

        /* Memoria */
        'MEMORIA: Guarda placa, número de OT y resto de parámetros aportados durante la sesión y reutilízalos.',

        /* JSON */
        'IMPORTANTE: Tras obtener los datos necesarios, genera el JSON de consulta sin más diálogos.'
      ]
    },

    /* ──────────────────── 4. CONSULTA DE REPUESTOS ─────────────────────── */
    CONSULTA_REPUESTOS: {
      id: 4,
      name: 'CONSULTA DE REPUESTOS',
      instructions: [
        'CRÍTICO: Si el mensaje ya trae código de repuesto, procede; de lo contrario, pídeselo.'
      ]
    },

    /* ───────────────────── 5. CONSULTA NV MESÓN ────────────────────────── */
    CONSULTA_NV_MESON: {
      id: 5,
      name: 'CONSULTA DE NV MESÓN',
      instructions: [
        'CRÍTICO: Si la mención es genérica, pregunta si la consulta es GENERAL o ESPECÍFICA.',
        'Si desde el inicio hay número de NV, trátalo como ESPECÍFICA.',
        'Para GENERALES: si hay fecha o rango y NO dice apertura/facturación, pregunta; si lo dice, NO preguntes.',
        'ESPECÍFICAS: pide el número si no lo dio.',
        /* Fechas */
        'CRÍTICO: Si menciona fecha, nombre de mes (como "enero", "febrero", etc.), año (como "2024", "2025") o rango de fechas PERO NO aclara si es de apertura o facturación, DEBES preguntar cuál de las dos.',
        '✅ Si el usuario ya dice "fecha de APERTURA" o "fecha de FACTURACIÓN", NO preguntes de nuevo.',
        '✅ Si el usuario no menciona ningún tipo de fecha, nombre de mes o año, no pidas esta información',

        /* Memoria */
        'MEMORIA: Guarda placa, número de OT y resto de parámetros aportados durante la sesión y reutilízalos.',
      ]
    }
  };

  /* Utilidad para transformar el objeto a texto plano para el prompt */
  function getConversationFlowsText() {
    let text = '**Flujos de conversación:**\n\n';
    for (const flow of Object.values(conversationFlows)) {
      text += `${flow.id}. ${flow.name}:\n`;
      for (const line of flow.instructions) text += `   - ${line}\n`;
      text += '\n';
    }
    return text.trim();
  }

  module.exports = { conversationFlows, getConversationFlowsText };
