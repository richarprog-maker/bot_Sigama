# Sistema de Analizadores Dinámicos de Consultas

Este módulo proporciona un sistema flexible para analizar diferentes tipos de consultas de usuarios y enriquecerlas con contexto adicional antes de procesarlas. El sistema está diseñado para ser fácilmente extensible, permitiendo agregar nuevos tipos de analizadores sin modificar el código base.

## Estructura del Sistema

El sistema se compone de los siguientes elementos principales:

1. **otAnalyzer.js**: Contiene la implementación base del sistema de analizadores dinámicos.
2. **ejemploNuevoAnalizador.js**: Muestra cómo crear y registrar un nuevo analizador (en este caso, para consultas de inventario).

## Cómo Funciona

Cada analizador se registra en el sistema con una configuración específica que incluye:

- **name**: Nombre descriptivo del tipo de consulta
- **contextDescription**: Descripción del contexto relevante para este tipo de consulta
- **typeOptions**: Posibles subtipos de consultas que puede identificar
- **enrichMessage**: Función para enriquecer el mensaje original con el contexto identificado

El sistema utiliza OpenAI para analizar las consultas y determinar si son relevantes para un tipo específico de analizador y, en caso afirmativo, qué subtipo de consulta es.

## Cómo Agregar un Nuevo Analizador

1. Crea un nuevo archivo para tu analizador o utiliza uno existente
2. Importa la función `registerAnalyzer` desde `otAnalyzer.js`
3. Define la configuración de tu analizador siguiendo la estructura requerida
4. Registra tu analizador con una clave única

Ejemplo:

```javascript
const { registerAnalyzer } = require('./otAnalyzer.js');

// Configuración del analizador
const miAnalizador = {
    name: 'Mi Tipo de Consulta',
    contextDescription: `
    Contexto importante:
    - Información relevante para este tipo de consulta
    - Más información contextual
    `,
    typeOptions: ['tipo1', 'tipo2', 'tipo3'],
    enrichMessage: (message, type) => {
        // Lógica para enriquecer el mensaje según el tipo
        return `Consulta de ${type}: ${message}`;
    }
};

// Registrar el analizador
registerAnalyzer('miClave', miAnalizador);
```

## Cómo Utilizar un Analizador

Para utilizar un analizador registrado:

```javascript
const { analyzeQuery } = require('./otAnalyzer.js');

async function procesarConsulta(mensaje) {
    const resultado = await analyzeQuery(mensaje, 'miClave');
    
    if (resultado.isRelevantQuery) {
        // La consulta es relevante para este analizador
        console.log(`Tipo detectado: ${resultado.queryType}`);
        console.log(`Mensaje enriquecido: ${resultado.enrichedMessage}`);
        // Procesar la consulta con el contexto enriquecido
    } else {
        // No es una consulta relevante para este analizador
        // Procesar normalmente
    }
}
```

## Compatibilidad con Código Existente

Para mantener la compatibilidad con el código existente, la función `analyzeOtQuery` sigue disponible y funciona de la misma manera que antes, pero ahora utiliza internamente el nuevo sistema de analizadores dinámicos.

## Funciones Disponibles

- **analyzeOtQuery(message)**: Analiza si una consulta está relacionada con OTs (mantiene compatibilidad)
- **analyzeQuery(message, analyzerKey)**: Analiza una consulta con un analizador específico
- **registerAnalyzer(key, analyzerConfig)**: Registra un nuevo analizador en el sistema
- **getAvailableAnalyzers()**: Devuelve la lista de analizadores disponibles