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
    
    // Check cache first
    const cachedAnalysis = cache.get(cacheKey);
    if (cachedAnalysis) {
        return cachedAnalysis;
    }

    // Build prompt for OpenAI
    const resultsText = results.map(r => `Title: ${r.title}\nDescription: ${r.snippet}`).join('\n\n');
    const prompt = `Analyze these ${category} rebate programs and provide a summary of the top 3 programs in this exact format:

    Category: ${category} Rebate Programs
    
    1. [Program Name]
       Price: [Extract or estimate the rebate amount, format as "Up to $X,XXX" or "Fixed $X,XXX"]
       Key Requirements:
       - [Requirement 1]
       - [Requirement 2]
       - [Requirement 3]
       Deadline: [Extract deadline if mentioned, otherwise "Ongoing" or "Not specified"]

    2. [Program Name]
       Price: [Extract or estimate the rebate amount]
       Key Requirements:
       - [Requirement 1]
       - [Requirement 2]
       - [Requirement 3]
       Deadline: [Extract deadline if mentioned]

    3. [Program Name]
       Price: [Extract or estimate the rebate amount]
       Key Requirements:
       - [Requirement 1]
       - [Requirement 2]
       - [Requirement 3]
       Deadline: [Extract deadline if mentioned]

    Here are the programs to analyze:

    ${resultsText}`;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "You are a helpful assistant that analyzes rebate programs. Always format the price as a dollar amount with commas and dollar signs (e.g., '$1,000' or 'Up to $8,000'). Keep requirements concise and actionable. Only include deadline if specifically mentioned. Return the analysis in a structured format with exactly 3 programs."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7,
            max_tokens: 500
        });

        // Parse the OpenAI response into structured format
        const content = completion.choices[0].message.content;
        const programs = [];
        
        // Split content into program sections
        const sections = content.split(/\d+\.\s+/).filter(Boolean);
        
        for (const section of sections) {
            const lines = section.trim().split('\n').map(line => line.trim());
            const program = {
                name: lines[0],
                price: lines.find(l => l.startsWith('Price:'))?.replace('Price:', '').trim() || 'Not specified',
                requirements: lines
                    .filter(l => l.startsWith('-'))
                    .map(l => l.replace('-', '').trim()),
                deadline: lines.find(l => l.startsWith('Deadline:'))?.replace('Deadline:', '').trim() || 'Not specified'
            };
            programs.push(program);
        }

        const analysis = {
            category: `${category} Rebate Programs`,
            programs: programs,
            timestamp: new Date().toISOString(),
            disclaimer: "Note: Please verify all information with the official program websites. Terms and conditions may have changed."
        };

        // Cache the results
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
