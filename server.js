import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { fetch } from 'undici';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Route to serve the main page
app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'index.html'));
});

// Route to handle the generate endpoint
app.post('/generate', async (req, res) => {
    try {
        const { prompt } = req.body;
        
        // Validate the prompt
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        console.log('Sending request to Ollama...');
        const ollamaResponse = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "llama2:7b",
                prompt: prompt,
                stream: true
            })
        });

        if (!ollamaResponse.ok) {
            throw new Error(`Ollama API error: ${ollamaResponse.status}`);
        }

        // Set headers for streaming
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Transfer-Encoding', 'chunked');

        // Stream the response
        const decoder = new TextDecoder();
        for await (const chunk of ollamaResponse.body) {
            const text = decoder.decode(chunk);
            res.write(text + '\n');
        }
        res.end();

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            details: error.message 
        });
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
