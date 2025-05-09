const { claude } = require('../config/claudeConfig.js');
const { openai } = require('../config/openaiConfig.js');

async function getOpenAIResponse(messages) {
    try {
        // Extract system message if present
        const systemMessage = messages.find(msg => msg.role === 'system')?.content || '';
        
        // Filter out system messages and format user/assistant messages
        const formattedMessages = messages
            .filter(msg => msg.role !== 'system')
            .map(msg => ({
                role: msg.role,
                content: msg.content
            }));

        const response = await openai.chat.completions.create({
            model: "gpt-4.1-2025-04-14",
            max_tokens: 1000,
            temperature: 0.7,
            messages: [
                { role: "system", content: systemMessage },
                ...formattedMessages
            ]
        });

        if (!response.choices || !response.choices[0] || !response.choices[0].message || !response.choices[0].message.content) {
            throw new Error("La respuesta de OpenAI no tiene el formato esperado.");
        }

        return response.choices[0].message.content;

    } catch (error) {
        console.error("Error al obtener respuesta de OpenAI:", error);
        throw error;
    }
}

async function getClaudeResponse(messages) {
    try {
        // Extract system message if present
        const systemMessage = messages.find(msg => msg.role === 'system')?.content || '';
        
        // Filter out system messages and format user/assistant messages
        const formattedMessages = messages
            .filter(msg => msg.role !== 'system')
            .map(msg => ({
                role: msg.role,
                content: msg.content
            }));

        const response = await claude.messages.create({
            model: "claude-3-opus-20240229",
            max_tokens: 1000,
            temperature: 0.7,
            system: systemMessage,
            messages: formattedMessages
        });

        if (!response.content || !response.content[0] || !response.content[0].text) {
            throw new Error("La respuesta de Claude AI no tiene el formato esperado.");
        }

        return response.content[0].text;

    } catch (error) {
        console.error("Error al obtener respuesta de Claude AI:", error);
        throw error;
    }
}

module.exports = {
    getOpenAIResponse,
    getClaudeResponse
};