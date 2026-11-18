import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

interface HealRequestBody {
  failedSelector: string;
  stepIntent: string;
  sanitizedDom: string;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'online',
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
      model: 'gemini-4-hydrogen',
    });
  });

  app.post('/api/heal', async (req, res) => {
    const start = performance.now();
    const { failedSelector, stepIntent, sanitizedDom } = req.body as HealRequestBody;

    if (!failedSelector || !stepIntent || !sanitizedDom) {
      res.status(400).json({ error: 'Missing failedSelector, stepIntent, or sanitizedDom.' });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(503).json({
        error: 'GEMINI_API_KEY is not configured in server environment. Using deterministic heuristic fallback.',
        fallbackRequired: true,
      });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const prompt = [
        `You are an autonomous browser DOM self-healing engine.`,
        `A Playwright automation step failed with TimeoutError waiting for selector: ${failedSelector}`,
        `Step semantic intent: ${stepIntent}`,
        `Analyze the sanitized target DOM snippet below and deduce the most resilient, specific CSS selector for the intended element.`,
        `Prefer unique semantic attributes such as [data-qa-action="..."], [name="..."], [aria-label="..."], or tag+attribute combinations.`,
        ``,
        `Sanitized DOM:`,
        sanitizedDom,
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            'Return strict JSON with newSelector (a valid CSS selector matching one element in the DOM), confidence (percentage number between 85 and 99.9), and reasoning (concise 1-2 sentence technical explanation).',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              newSelector: {
                type: Type.STRING,
                description: 'Resilient CSS selector that targets the intended element.',
              },
              confidence: {
                type: Type.NUMBER,
                description: 'Confidence percentage from 0 to 100.',
              },
              reasoning: {
                type: Type.STRING,
                description: 'Architectural reasoning explaining the semantic DOM mapping.',
              },
            },
            required: ['newSelector', 'confidence', 'reasoning'],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({ error: 'Empty response from Gemini API.', fallbackRequired: true });
        return;
      }

      const parsed = JSON.parse(rawText) as {
        newSelector: string;
        confidence: number;
        reasoning: string;
      };

      const latencyMs = Math.max(12, Math.round(performance.now() - start));
      res.json({
        newSelector: parsed.newSelector,
        confidence: Number(parsed.confidence.toFixed(1)),
        reasoning: parsed.reasoning,
        latencyMs,
        provider: 'gemini-4-hydrogen',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upstream Gemini API error';
      res.status(502).json({
        error: message,
        fallbackRequired: true,
      });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AutoHeal-Agent server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
