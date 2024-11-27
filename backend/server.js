const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const cache = new NodeCache({ stdTTL: 24 * 60 * 60 }); // 24 hour cache

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});

// CORS configuration
const corsOptions = {
    origin: ['http://127.0.0.1:3000', 'http://localhost:3000', 'https://green-rebates-calculator.netlify.app'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
};

// Middleware
app.use(cors(corsOptions));
app.use(limiter);
app.use(express.json());

// Helper function to analyze results
async function analyzeResults(results, category) {
    const cacheKey = `${category}-${JSON.stringify(results)}`;
    
    if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
    }

    try {
        const resultsText = results.map(r => `Title: ${r.title}\nDescription: ${r.snippet}`).join('\n\n');
        const prompt = `Analyze these ${category} rebate programs and extract information about the top 3 programs. For each program include:

1. Program Name
2. Rebate Amount (format as "Up to $X,XXX" or "Fixed $X,XXX")
3. Key Requirements (2-3 bullet points)
4. Application Deadline (if mentioned)

Format each program as:

[Program Name]
Amount: [Rebate amount]
Requirements:
- [Requirement 1]
- [Requirement 2]
- [Requirement 3]
Deadline: [Extract deadline if mentioned, otherwise "Ongoing"]

If specific values are not found in the text, use these defaults:
- Amount: "Amount varies"
- Deadline: "Ongoing"
- Requirements: ["Contact program administrator for specific requirements"]

Here are the programs to analyze:

${resultsText}`;

        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "You are a helpful assistant that analyzes rebate programs. Always format amounts with dollar signs and commas (e.g., '$1,000' or 'Up to $8,000'). Keep requirements concise and actionable. Return exactly 3 programs if available."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7,
            max_tokens: 1000
        });

        const content = completion.choices[0].message.content;
        console.log('OpenAI Response:', content);

        // Split content into program sections and parse
        const sections = content.split(/\n\n(?=[A-Z])/g).filter(Boolean);
        const programs = sections.map(section => {
            const lines = section.split('\n');
            return {
                name: lines[0].trim(),
                amount: lines.find(l => l.startsWith('Amount:'))?.replace('Amount:', '').trim() || 'Amount varies',
                requirements: lines
                    .filter(l => l.startsWith('-'))
                    .map(l => l.replace('-', '').trim()),
                deadline: lines.find(l => l.startsWith('Deadline:'))?.replace('Deadline:', '').trim() || 'Ongoing'
            };
        });

        const analysis = {
            programs: programs,
            timestamp: new Date().toISOString()
        };

        cache.set(cacheKey, analysis);
        return analysis;
    } catch (error) {
        console.error('OpenAI API Error:', error);
        throw new Error('Failed to analyze results');
    }
}

// API endpoint for analysis
app.post('/api/analyze', async (req, res) => {
    try {
        const { results, category } = req.body;
        
        if (!results || !category) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        const analysis = await analyzeResults(results, category);
        res.json(analysis);
    } catch (error) {
        console.error('Analysis Error:', error);
        res.status(500).json({ error: 'Analysis failed' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

const PORT = process.env.PORT || 3001;  // Changed to 3001 for local development
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
