import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import OpenAI from 'openai';
import path from 'path';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import { GoogleSheetsCache } from './services/sheets-cache.js';

// Initialize environment variables
dotenv.config();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Initialize cache
const cache = new GoogleSheetsCache();
cache.initialize().catch(console.error);

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// CORS configuration
const corsOptions = {
    origin: '*', // Allow all origins for testing
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Serve static files from the root directory
app.use(express.static(path.join(__dirname, '..'))); // Go up one level from /backend

// Root route - serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Debug middleware to log all requests
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`, req.query || req.body);
    next();
});

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Test endpoint
app.get('/test', (req, res) => {
    res.json({ message: 'Server is running!' });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

// Cache endpoint
app.get('/api/cache', async (req, res) => {
    try {
        const { query, category } = req.query;
        if (!query || !category) {
            return res.status(400).json({ error: 'Missing query or category parameter' });
        }

        const cachedResults = await cache.get(query, category);
        if (cachedResults) {
            console.log('Cache hit for:', query, category);
            return res.json(cachedResults);
        }

        console.log('Cache miss for:', query, category);
        res.status(404).json({ error: 'Not found in cache' });
    } catch (error) {
        console.error('Cache error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/cache', async (req, res) => {
    console.log('POST /api/cache called with body:', req.body);
    try {
        const { query, category, results } = req.body;
        if (!query || !category || !results) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        const success = await cache.set(query, category, results);
        if (success) {
            console.log('Successfully cached results for:', query);
            res.json({ message: 'Successfully cached results' });
        } else {
            console.error('Failed to cache results for:', query);
            res.status(500).json({ error: 'Failed to cache results' });
        }
    } catch (error) {
        console.error('Cache storage error:', error);
        res.status(500).json({ error: 'Failed to store in cache' });
    }
});

// Google Search API configuration
const GOOGLE_API_KEY = 'AIzaSyD0k6vrMlYwCXlzKC-iqCOp2O-X6xT-gkU';
const GOOGLE_SEARCH_ENGINE_ID = '50cffa222875141dd';

// Helper function to perform Google search
async function performGoogleSearch(query) {
    const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}`;
    console.log('🔍 Performing Google search with URL:', url);
    
    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Google Search failed:', response.status, errorText);
            throw new Error(`Google Search failed: ${response.status} - ${errorText}`);
        }
        const data = await response.json();
        console.log('✅ Google Search raw results:', JSON.stringify(data, null, 2));
        
        if (!data.items || data.items.length === 0) {
            console.warn('⚠️ No items found in Google Search response');
            return [];
        }
        
        console.log(`📊 Found ${data.items.length} search results`);
        return data.items;
    } catch (error) {
        console.error('❌ Google Search Error:', error);
        throw error;
    }
}

// API endpoint for analysis
app.post('/api/analyze', async (req, res) => {
    try {
        const { query, category } = req.body;
        console.log('📝 Analyze request:', { query, category });
        
        if (!query || !category) {
            console.error('❌ Missing parameters:', { query, category });
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        // First check cache
        const cachedResults = await cache.get(query, category);
        if (cachedResults) {
            console.log('💾 Cache hit in analyze endpoint');
            return res.json(cachedResults);
        }

        // Perform Google search
        const searchQuery = `${query} ${category === 'Federal' ? 'federal' : category} energy rebate program`;
        console.log('🔍 Starting search for:', searchQuery);
        
        const searchResults = await performGoogleSearch(searchQuery);
        console.log('📊 Search results count:', searchResults.length);
        
        if (!searchResults || searchResults.length === 0) {
            console.warn('⚠️ No search results found for:', searchQuery);
            return res.status(404).json({ error: 'No search results found' });
        }

        // Map search results to our format
        const results = searchResults.map(item => ({
            title: item.title,
            snippet: item.snippet,
            link: item.link
        }));
        console.log('🔄 Mapped results:', JSON.stringify(results, null, 2));

        const analysis = await analyzeResults(results, category);
        console.log('✨ Analysis results:', JSON.stringify(analysis, null, 2));
        
        if (!analysis || !analysis.programs || analysis.programs.length === 0) {
            console.warn('⚠️ No programs found in analysis');
            return res.status(404).json({ error: 'No programs found in analysis' });
        }
        
        // Store in cache
        await cache.set(query, category, analysis);
        console.log('💾 Results cached successfully');
        
        res.json(analysis);
    } catch (error) {
        console.error('❌ Analysis Error:', error);
        res.status(500).json({ error: 'Analysis failed: ' + error.message });
    }
});

// Helper function to analyze results
async function analyzeResults(results, category) {
    try {
        const resultsText = results.map(r => `Title: ${r.title}\nDescription: ${r.snippet}`).join('\n\n');
        console.log('📝 Sending to OpenAI:', resultsText);
        const prompt = `Analyze these ${category} rebate programs and extract detailed information about all programs. For each program, provide the following information in this exact format:

Title: [Program Name]

Summary: Provide a concise 320-character summary focusing on the program's key benefits and eligibility criteria.

Program Type: Specify if it's a rebate, grant, tax credit, or low-interest loan. This helps categorize the program.

Amount: Format as exact amount (e.g., "$5,000") or range (e.g., "Up to $X,XXX"). Always include dollar signs and commas.

Eligible Projects: List specific projects that qualify, such as:
- Solar panels
- HVAC systems
- Insulation
- Electric vehicles
- Energy-efficient appliances
- Home improvements

Eligible Recipients: Specify who can apply, including:
- Type of applicant (homeowners, businesses, municipalities)
- Income requirements if any
- Other qualifying criteria

Geographic Scope: Specify the exact coverage area:
- Nationwide
- State-specific (specify which state)
- County or city-specific
- Utility service area

Requirements: List all required documents and conditions, such as:
- Application forms
- Proof of purchase/installation
- Contractor requirements
- Energy audits
- Income verification
- Property documentation

Application Process: Provide a clear 1-2 line description of how to apply (e.g., "Apply online through government portal" or "Submit application to local utility company")

Deadline: Specify the application deadline or if it's ongoing. Include exact date if available.

Website Link: Provide the official program URL for more information or application.

Contact Information: Include phone numbers, email addresses, or office locations for support.

Processing Time: Specify how long it typically takes to receive funds or approval (e.g., "6-8 weeks" or "30 days after approval")

If any field's information is not found in the source text, use these defaults:
- Summary: "This program offers financial incentives for energy-efficient home improvements. Contact program administrator for specific details."
- Program Type: "Rebate"
- Amount: "Amount varies"
- Eligible Projects: "Contact administrator for eligible projects"
- Eligible Recipients: "Contact administrator for eligibility requirements"
- Geographic Scope: "Contact administrator for coverage area"
- Requirements: ["Contact program administrator for specific requirements"]
- Application Process: "Contact administrator for application details"
- Deadline: "Ongoing"
- Processing Time: "Contact administrator for processing time details"

Here are the programs to analyze:

${resultsText}`;

        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "You are a helpful assistant that analyzes rebate programs and extracts structured information. Be precise in extracting monetary values and always include the dollar sign ($) for amounts. If an amount is a percentage, format it clearly (e.g., '30% of cost')."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7,
            max_tokens: 1500
        });

        const content = completion.choices[0].message.content;
        console.log('OpenAI Response:', content);

        // Split content into program sections and parse
        const sections = content.split(/\n\n(?=Title:)/g).filter(Boolean);
        const programs = sections.map(section => {
            const lines = section.split('\n');
            return {
                name: lines.find(l => l.startsWith('Title:'))?.replace('Title:', '').trim(),
                summary: lines.find(l => l.startsWith('Summary:'))?.replace('Summary:', '').trim() ||
                    'This program offers financial incentives for energy-efficient home improvements. Contact program administrator for specific details.',
                programType: lines.find(l => l.startsWith('Program Type:'))?.replace('Program Type:', '').trim() || 'Rebate',
                amount: lines.find(l => l.startsWith('Amount:'))?.replace('Amount:', '').trim() || 'Amount varies',
                eligibleProjects: lines.find(l => l.startsWith('Eligible Projects:'))?.replace('Eligible Projects:', '').trim(),
                eligibleRecipients: lines.find(l => l.startsWith('Eligible Recipients:'))?.replace('Eligible Recipients:', '').trim(),
                geographicScope: lines.find(l => l.startsWith('Geographic Scope:'))?.replace('Geographic Scope:', '').trim(),
                requirements: lines.find(l => l.startsWith('Requirements:'))?.replace('Requirements:', '').trim(),
                applicationProcess: lines.find(l => l.startsWith('Application Process:'))?.replace('Application Process:', '').trim(),
                deadline: lines.find(l => l.startsWith('Deadline:'))?.replace('Deadline:', '').trim() || 'Ongoing',
                websiteLink: lines.find(l => l.startsWith('Website Link:'))?.replace('Website Link:', '').trim(),
                contactInfo: lines.find(l => l.startsWith('Contact Information:'))?.replace('Contact Information:', '').trim(),
                processingTime: lines.find(l => l.startsWith('Processing Time:'))?.replace('Processing Time:', '').trim()
            };
        });

        const result = {
            category: category,
            programs: programs || [],
            timestamp: new Date().toISOString(),
            disclaimer: "Note: Please verify all information with the official program websites. Terms and conditions may have changed."
        };

        return result;
    } catch (error) {
        console.error('Analysis Error:', error);
        throw new Error('Failed to analyze results');
    }
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
