import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import cors from 'cors';
import { GoogleSheetsCache } from './backend/services/sheets-cache.js';
import OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, 'backend', '.env') });

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Initialize cache
let cache;
try {
    cache = new GoogleSheetsCache();
    await cache.initialize();
    console.log('Server → Cache | Initialization complete');
} catch (error) {
    console.error('Server → Cache | Initialization failed:', error);
}

const app = express();

// Middleware
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Log all incoming requests
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} | ${req.method} ${req.url}`);
    next();
});

// Store connected clients for SSE
const clients = new Set();

// Helper function for logging
const sendLogToClient = (message, details = null) => {
    const logData = {
        message,
        details,
        timestamp: new Date().toISOString()
    };
    
    // Log to console
    console.log(JSON.stringify(logData, null, 2));
    
    // Send to all connected clients
    clients.forEach(client => {
        client.write(`data: ${JSON.stringify(logData)}\n\n`);
    });
};

// SSE endpoint for logs
app.get('/api/logs', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Send initial connection message
    const data = `data: ${JSON.stringify({
        message: 'Connected to log stream',
        timestamp: new Date().toISOString()
    })}\n\n`;
    res.write(data);
    
    // Add client to the set
    clients.add(res);
    
    // Remove client when connection closes
    req.on('close', () => {
        clients.delete(res);
    });
});

// Function to search Google
async function searchGoogle(query, maxResults = 10) {
    const searchUrl = new URL('https://customsearch.googleapis.com/customsearch/v1');
    searchUrl.searchParams.append('key', process.env.GOOGLE_API_KEY);
    searchUrl.searchParams.append('cx', process.env.GOOGLE_SEARCH_ENGINE_ID);
    searchUrl.searchParams.append('q', query);
    searchUrl.searchParams.append('num', maxResults.toString());

    try {
        const response = await fetch(searchUrl.toString());
        return await response.json();
    } catch (error) {
        console.error('Google search error:', error);
        throw error;
    }
}

// Function to get search queries
function getSearchQueries(category, userQuery) {
    if (category === 'Federal') {
        return [
            'Federal energy rebate programs california',
            'US government energy incentives california'
        ];
    } else if (category === 'State') {
        return [
            'California state energy rebate programs',
            'California state government energy incentives'
        ];
    } else if (category === 'County') {
        return [
            `${userQuery} County energy rebate programs california`,
            `${userQuery} County utility incentives california`
        ];
    }
    return [userQuery];
}

// Function to analyze search results with OpenAI
async function analyzeWithOpenAI(results, category) {
    try {
        // Log the incoming request to OpenAI
        console.log('\nAPI → OpenAI | Analysis Request:', {
            category,
            resultCount: results.length,
            timestamp: new Date().toISOString()
        });

        const prompt = `Extract information about ${category} energy rebate programs from these search results and format it as a JSON object:
        ${JSON.stringify(results, null, 2)}

        REQUIREMENTS:
        1. Federal programs must be available to all California residents
        2. State programs must be California-specific
        3. County programs must include specific utility and local government rebates
        
        MANDATORY RULES FOR ALL PROGRAMS:
        1. collapsedSummary field is REQUIRED and MUST NEVER be empty or missing:
           - MUST include at least 2-3 specific dollar amounts
           - FORBIDDEN: "varies", "free", "contact for details", empty, or missing values
           - REQUIRED format: "$X,XXX for [project], $X,XXX for [project], plus more"
           - If exact amounts unknown, use this data:
             * HVAC: "$1,500-$3,000"
             * Insulation: "$500-$1,500"
             * Windows/Doors: "$1,000-$2,500"
             * Solar: "$3,000-$6,000"
             * Batteries: "$800-$1,600"
             * Weatherization: "$500-$2,000"
             * Water Heaters: "$500-$1,000"
             * Lighting: "$200-$500"

        2. amount field is REQUIRED and MUST NEVER be vague:
           - FORBIDDEN: "varies", "free", "contact for details"
           - MUST list specific amounts for EVERY eligible project
           - MUST use ranges if exact amount unknown
           - MUST include any income-based variations
           - Format: "[Project]: $X,XXX, [Project]: $X,XXX-$Y,YYY"

        SPECIAL PROGRAM RULES:
        1. For Utility Programs (e.g. PG&E):
           ❌ WRONG: "Varies by program" or "Contact utility"
           ✓ RIGHT: "$1,500 for HVAC tune-up, $500 for smart thermostat, plus more"
           ✓ RIGHT: "HVAC: $1,500, Smart Thermostat: $500, LED Lighting: $200"

        2. For Income-Based Programs:
           ❌ WRONG: "Free improvements" or "No cost program"
           ✓ RIGHT: "$2,500 for weatherization, $1,000 for insulation, plus more"
           ✓ RIGHT: "Weatherization: $2,500, Insulation: $1,000, Windows: $1,500"

        3. For Multi-Measure Programs:
           ❌ WRONG: "Up to $X,XXX in total savings"
           ✓ RIGHT: "$2,000 for HVAC, $1,500 for insulation, plus more"
           ✓ RIGHT: "HVAC: $2,000, Insulation: $1,500, Water Heater: $500"

        Return the data in this JSON format:
        {
            "programs": [{
                "programName": "string",
                "programType": "string",
                "summary": "string (240+ chars)",
                "collapsedSummary": "string (brief one-line summary with key amounts)",
                "amount": "string",
                "eligibleProjects": ["string"],
                "eligibleRecipients": ["string"],
                "geographicScope": "string",
                "requirements": ["string"],
                "applicationProcess": "string",
                "deadline": "string",
                "websiteLink": "string",
                "contactInfo": "string",
                "processingTime": "string"
            }]
        }

        For Federal programs, use these exact formats:
        1. IRA Home Electrification collapsedSummary:
           "$8,000 for heat pumps, $840 for water heaters, stoves, and dryers (income-based)"
        
        2. HOMES Program collapsedSummary:
           "$2,000-$4,000 standard, up to $8,000 low-income based on energy savings"`;

        console.log('\nAPI → OpenAI | Sending Prompt:', {
            category,
            promptLength: prompt.length,
            timestamp: new Date().toISOString()
        });

        const completion = await openai.chat.completions.create({
            model: "gpt-4-1106-preview",
            messages: [
                {
                    role: "system",
                    content: "You are a precise data extraction assistant specializing in energy rebate programs. For County programs, always provide specific dollar amounts and avoid generic responses. Break down rebates by measure type and show combined benefits when programs can stack."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7,
            max_tokens: 4000,
            response_format: { type: "json_object" }
        });

        console.log('\nOpenAI → API | Raw Response:', {
            model: completion.model,
            usage: completion.usage,
            timestamp: new Date().toISOString()
        });

        const content = completion.choices[0].message.content;
        console.log('\nOpenAI → API | Response Content:', content);
        
        const parsedResponse = JSON.parse(content);
        if (!parsedResponse.programs || !Array.isArray(parsedResponse.programs)) {
            console.error('\nOpenAI → API | Invalid Response Format:', {
                error: 'Missing or invalid programs array',
                response: parsedResponse,
                timestamp: new Date().toISOString()
            });
            throw new Error('Invalid response format from OpenAI');
        }

        // Validate each program has required fields
        const validPrograms = parsedResponse.programs.filter(program => {
            const isValid = program.programName && 
                   program.programType && 
                   program.summary && 
                   program.collapsedSummary && 
                   program.amount && 
                   program.eligibleProjects;

            if (!isValid) {
                console.warn('\nOpenAI → API | Invalid Program:', {
                    programName: program.programName,
                    missingFields: [
                        !program.programName && 'programName',
                        !program.programType && 'programType',
                        !program.summary && 'summary',
                        !program.collapsedSummary && 'collapsedSummary',
                        !program.amount && 'amount',
                        !program.eligibleProjects && 'eligibleProjects'
                    ].filter(Boolean),
                    timestamp: new Date().toISOString()
                });
            }
            return isValid;
        });

        parsedResponse.programs = validPrograms;

        console.log('\nOpenAI → API | Final Programs:', {
            category,
            totalPrograms: validPrograms.length,
            programs: validPrograms.map(p => ({
                name: p.programName,
                type: p.programType,
                collapsedSummary: p.collapsedSummary
            })),
            timestamp: new Date().toISOString()
        });

        return parsedResponse;

    } catch (error) {
        console.error('\nOpenAI → API | Error:', {
            error: error.message,
            stack: error.stack,
            category,
            timestamp: new Date().toISOString()
        });
        throw error;
    }
}

// Add this helper function for frontend logging
function logToFrontend(logData) {
    if (global.frontendSocket) {
        global.frontendSocket.emit('log', {
            source: 'OpenAI',
            ...logData
        });
    }
}

// Test route
app.get('/api/test', (req, res) => {
    res.json({
        message: 'Server is running!',
        env: {
            hasGoogleCreds: !!process.env.GOOGLE_SHEETS_CREDENTIALS,
            hasSpreadsheetId: !!process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
            hasGoogleApiKey: !!process.env.GOOGLE_API_KEY,
            hasSearchEngineId: !!process.env.GOOGLE_SEARCH_ENGINE_ID
        }
    });
});

// Analyze route
app.post('/api/analyze', async (req, res) => {
    const { query, category } = req.body;
    
    try {
        // Log incoming request
        console.log('\nFrontend → API | Received Search Request:', {
            query,
            category,
            timestamp: new Date().toISOString()
        });

        // Check if cache is available
        if (!cache?.enabled) {
            console.error('Server → Cache | Cache not available');
            throw new Error('Cache service not available');
        }

        // Check cache first
        console.log('Server → Cache | Checking cache');
        const cacheResult = await cache.checkCache(query, category);
        
        if (cacheResult?.found) {
            console.log('\nCache → API | Cache hit:', {
                query,
                category,
                timestamp: new Date().toISOString()
            });

            // Log the cache hit
            await cache.logSearch({
                query,
                category,
                googleResults: cacheResult.googleResults,
                openaiAnalysis: cacheResult.openaiAnalysis,
                isGoogleCached: true,
                isOpenAICached: true
            });

            return res.json({
                googleResults: cacheResult.googleResults,
                analysis: cacheResult.openaiAnalysis,
                status: 'success',
                source: 'cache'
            });
        }

        console.log('Server → Cache | Cache miss, performing search');

        // Get all queries for this category
        const searchQueries = getSearchQueries(category, query);
        let allResults = [];

        // Perform Google search for each query
        for (const searchQuery of searchQueries) {
            console.log('\nAPI → Google | Searching:', {
                query: searchQuery,
                category,
                timestamp: new Date().toISOString()
            });

            try {
                const results = await performGoogleSearch(searchQuery);
                if (results.items) {
                    allResults = allResults.concat(results.items);
                }
            } catch (searchError) {
                console.error('Google Search Error:', {
                    error: searchError.message,
                    query: searchQuery,
                    category
                });
                throw searchError;
            }
        }

        // Remove duplicates based on URL
        allResults = allResults.filter((result, index, self) =>
            index === self.findIndex((r) => r.link === result.link)
        );

        // Log combined results
        console.log('\nAPI | Combined Search Results:', {
            totalResults: allResults.length,
            queries: searchQueries,
            timestamp: new Date().toISOString()
        });

        // Send combined results to OpenAI for analysis
        console.log('\nAPI → OpenAI | Sending combined results for analysis:', {
            resultCount: allResults.length,
            category,
            timestamp: new Date().toISOString()
        });

        const analysis = await analyzeWithOpenAI(allResults, category);

        // Store in cache
        const googleResults = {
            items: allResults,
            searchQueries,
            resultCount: allResults.length
        };

        console.log('Server → Cache | Storing results in cache');
        await cache.logSearch({
            query,
            category,
            googleResults,
            openaiAnalysis: analysis,
            isGoogleCached: false,
            isOpenAICached: false
        });

        // Send back both Google results and OpenAI analysis
        res.json({ 
            googleResults,
            analysis: {
                programs: analysis.programs || [],
                category: category,
                timestamp: new Date().toISOString()
            },
            status: 'success',
            source: 'fresh'
        });

    } catch (error) {
        console.error('API Error:', {
            error: error.message,
            stack: error.stack,
            category,
            query
        });
        res.status(500).json({ 
            error: error.message,
            details: error.stack,
            status: 'error'
        });
    }
});

// Helper function for Google search
async function performGoogleSearch(query) {
    const searchUrl = new URL('https://customsearch.googleapis.com/customsearch/v1');
    searchUrl.searchParams.append('key', process.env.GOOGLE_API_KEY);
    searchUrl.searchParams.append('cx', process.env.GOOGLE_SEARCH_ENGINE_ID);
    searchUrl.searchParams.append('q', query);
    searchUrl.searchParams.append('num', '10');

    try {
        const response = await fetch(searchUrl.toString());
        if (!response.ok) {
            throw new Error(`Google API error: ${response.status}`);
        }
        const data = await response.json();
        
        // Log detailed search results
        console.log('\n=== Google Search Results ===');
        console.log('Total Results:', data.searchInformation?.totalResults);
        console.log('Search Time:', data.searchInformation?.searchTime, 'seconds');
        console.log('\nResults:');
        data.items?.forEach((item, index) => {
            console.log(`\n[Result ${index + 1}]`);
            console.log('Title:', item.title);
            console.log('Link:', item.link);
            console.log('Snippet:', item.snippet);
            console.log('---');
        });
        
        return data;
    } catch (error) {
        console.error('Google Search Error:', error);
        throw error;
    }
}

// Check cache endpoint
app.post('/api/check-cache', async (req, res) => {
    const { query, category } = req.body;
    
    try {
        const cacheEntry = await cache.get(query, category);
        
        if (cacheEntry && cacheEntry.analysis && cacheEntry.analysis.programs) {
            sendLogToClient('Cache → UI | Using Cached Results', {
                message: 'Found cached results - No API calls needed',
                category,
                query,
                timestamp: new Date().toISOString()
            });

            res.json({
                found: true,
                programs: cacheEntry.analysis.programs,
                source: {
                    googleSearch: cacheEntry.source.googleSearch,
                    openaiAnalysis: cacheEntry.source.openaiAnalysis
                }
            });
        } else {
            sendLogToClient('Cache → UI | No Cache Found', {
                message: 'Will need to make Google and OpenAI API calls',
                category,
                query,
                timestamp: new Date().toISOString()
            });

            res.json({
                found: false
            });
        }
    } catch (error) {
        console.error('Cache check error:', error);
        res.status(500).json({
            error: 'Cache lookup failed',
            details: error.message
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
