const { openai } = require('../config/openaiConfig.js');

async function getOpenAIResponse(messages) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            max_tokens: 1000,
            temperature: 0.7,
            messages: messages
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

module.exports = {
    getOpenAIResponse
};