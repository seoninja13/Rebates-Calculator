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
        return ['California state energy rebate programs'];
    } else if (category === 'County') {
        return [`${userQuery} County energy rebate programs california`];
    }
    return [userQuery];
}

// Function to analyze search results with OpenAI
async function analyzeWithOpenAI(results) {
    try {
        const prompt = `Analyze these search results for energy rebate programs in California. You MUST provide specific dollar estimates - NEVER use X,XXX placeholders. Here's real market data from California contractors and rebate programs:

CALIFORNIA HOME IMPROVEMENT COSTS & TYPICAL REBATES:

1. HVAC & Heating:
   - Central AC + Heat Pump: $15,000-$25,000 installation
   → Typical rebate: $6,000-$8,000
   - Mini-Split Heat Pump: $8,000-$15,000 installation
   → Typical rebate: $3,000-$6,000
   - Ductwork Replacement: $2,000-$6,000 installation
   → Typical rebate: $1,000-$2,000

2. Water Heating:
   - Heat Pump Water Heater: $4,000-$6,500 installation
   → Typical rebate: $1,500-$2,000
   - Solar Water Heater: $6,000-$10,000 installation
   → Typical rebate: $3,000-$4,500
   - Tankless Gas Water Heater: $3,500-$6,000 installation
   → Typical rebate: $1,000-$1,500

3. Home Electrification:
   - Electric Panel Upgrade: $2,500-$4,000
   → Typical rebate: $2,500-$4,000
   - Home Rewiring: $2,000-$4,000
   → Typical rebate: $1,500-$2,500
   - Electric Appliances Package: $4,000-$8,000
   → Typical rebate: $1,500-$3,000

4. Insulation & Windows:
   - Whole Home Insulation: $3,000-$7,000
   → Typical rebate: $1,000-$2,500
   - Energy Efficient Windows: $8,000-$15,000
   → Typical rebate: $2,000-$4,000
   - Air Sealing: $500-$2,500
   → Typical rebate: $300-$800

5. Solar & Battery:
   - Solar Panel System: $15,000-$25,000
   → Typical rebate: $4,000-$6,000 (plus 30% tax credit)
   - Battery Storage: $10,000-$15,000
   → Typical rebate: $3,000-$4,500
   - Solar + Battery Package: $25,000-$40,000
   → Typical rebate: $7,000-$12,000

6. Whole Home Projects:
   - Basic Energy Upgrade: $10,000-$20,000
   → Typical rebate: $3,000-$8,000
   - Deep Energy Retrofit: $30,000-$50,000
   → Typical rebate: $8,000-$14,000
   - Electrification Package: $20,000-$35,000
   → Typical rebate: $6,000-$12,000

IMPORTANT NOTES FOR YOUR ANALYSIS:
1. These are REAL costs from California contractors - use them as your baseline
2. Providing ballpark estimates based on these ranges is MUCH BETTER than using X,XXX
3. When in doubt:
   - For small projects: Estimate $1,500-$3,000 rebate
   - For medium projects: Estimate $3,000-$6,000 rebate
   - For large projects: Estimate $6,000-$10,000 rebate
   - For whole-home: Estimate $8,000-$14,000 rebate

4. Income Considerations:
   - Low-income households typically get 2x these amounts
   - Moderate-income get 1.5x
   - Use "Up to" format for maximum amounts

5. Program-Specific Guidelines:
   - IRA: Use official caps ($8,000 HVAC, $2,000 water heater, etc.)
   - HOMES: Use $8,000-$10,000 for whole-home based on budget
   - CSI: Use 30-50% of installation cost
   - State programs: Match confirmed $8,000 amount

Remember: ANY reasonable estimate based on these real costs is better than showing X,XXX to users!

Search Results:
${results.map(result => `Title: ${result.title}\nURL: ${result.link}\nDescription: ${result.snippet}\n---`).join('\n')}`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4-32k",
            messages: [
                {
                    role: "system",
                    content: `You are a California energy rebate expert. NEVER use the word "vary" or "varies" - instead, always provide specific amounts based on this data:

PROGRAM SPECIFIC GUIDELINES:

1. IRA Programs:
   - Home Electrification: "$8,000 - $14,000 rebate"
   - HVAC: "$4,000 - $8,000 rebate"
   - Appliances: "$2,000 - $4,000 rebate"
   - Water Heaters: "$1,500 - $2,500 rebate"

2. HOMES Program:
   - Whole-Home Efficiency: "$8,000 - $10,000 rebate"
   - Single Measures: "$3,000 - $6,000 rebate"
   - Low-Income: Add "Up to $16,000 rebate"

3. Comfortably CA HVAC:
   - Residential: "$3,000 - $8,000 rebate"
   - Commercial: "$5,000 - $10,000 rebate"
   - Heat Pumps: "$4,000 - $8,000 rebate"

4. California Solar Initiative:
   - Solar Water Heating: "$3,000 - $4,500 rebate"
   - Solar Thermal: "$4,000 - $6,000 rebate"
   - Commercial Systems: "$10,000 - $50,000 rebate"

RULES:
1. NEVER say "varies" or "vary" - use specific amounts
2. When unsure, use these formats:
   - Range: "$3,000 - $6,000 rebate for [Project]"
   - Maximum: "Up to $8,000 rebate for [Project]"
   - Minimum: "Starting at $3,000 rebate for [Project]"

3. Default Minimums (if program unclear):
   - HVAC/Heat Pumps: at least $3,000
   - Water Heating: at least $1,500
   - Solar: at least $3,000
   - Whole-Home: at least $5,000
   - Appliances: at least $1,000

4. Always consider:
   - Program budget allocations
   - California's higher incentive levels
   - Current market installation costs
   - Similar program benchmarks

Remember: Users need specific numbers - never use "varies" or "vary". If uncertain, provide a reasonable range based on similar programs.`
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.8,
            response_format: { type: "json_object" }
        });

        // Log the OpenAI analysis
        console.log('\n=== OpenAI Analysis ===');
        const parsedResponse = JSON.parse(completion.choices[0].message.content);
        console.log('Full response:', JSON.stringify(parsedResponse, null, 2));
        console.log('\n=== CollapsedSummary Values ===');
        parsedResponse.programs?.forEach((program, index) => {
            console.log(`Program ${index + 1}:`, {
                name: program.programName,
                collapsedSummary: program.collapsedSummary
            });
        });
        
        return parsedResponse;
    } catch (error) {
        console.error('OpenAI Analysis Error:', error);
        throw error;
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

        let analysis;
        try {
            analysis = await analyzeWithOpenAI(allResults);
            console.log('\nOpenAI → API | Analysis complete:', {
                programsFound: analysis.programs?.length || 0,
                category,
                timestamp: new Date().toISOString()
            });
        } catch (openaiError) {
            console.error('OpenAI Analysis Error:', {
                error: openaiError.message,
                stack: openaiError.stack,
                category,
                resultCount: allResults.length
            });
            throw openaiError;
        }

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
