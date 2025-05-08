const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Error: La variable de entorno ANTHROPIC_API_KEY no está definida.");
  process.exit(1);
}

const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

module.exports = {
  claude
}; 