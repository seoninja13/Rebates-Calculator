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

// Initialize environment variables with the correct path
dotenv.config({ path: path.join(dirname(fileURLToPath(import.meta.url)), '.env') });

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Request logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    console.log(`\n🔄 ${req.method} ${req.path} - Request received`);
    console.log('Headers:', req.headers);
    console.log('Query:', req.query);
    console.log('Body:', req.body);

    // Log response when it's sent
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`✨ ${req.method} ${req.path} - Response sent (${duration}ms) - Status: ${res.statusCode}`);
    });

    next();
});

// Basic middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS configuration
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: true
}));

// SSE setup
const clients = new Set();

function sendLogToClient(message, type = '', details = null) {
    const logMessage = JSON.stringify({
        message,
        type,
        details,
        timestamp: new Date().toISOString()
    });
    
    clients.forEach(client => {
        try {
            client.write(`data: ${logMessage}\n\n`);
        } catch (error) {
            console.error('Error sending log to client:', error);
            clients.delete(client);
        }
    });
}

// SSE endpoint for logging
app.get('/api/logs', (req, res) => {
    console.log('SSE connection attempt received');
    
    // Set SSE headers
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });

    // Send initial connection message
    const connectMessage = JSON.stringify({
        message: 'SSE Connected',
        details: { connectionId: Date.now() },
        timestamp: new Date().toISOString()
    });
    res.write(`data: ${connectMessage}\n\n`);
    
    // Add client to the set
    clients.add(res);
    console.log(`Client connected to SSE. Total clients: ${clients.size}`);
    
    // Handle client disconnect
    req.on('close', () => {
        clients.delete(res);
        console.log(`Client disconnected from SSE. Total clients: ${clients.size}`);
    });

    // Handle errors
    res.on('error', (error) => {
        console.error('SSE Response error:', error);
        clients.delete(res);
    });
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

// Initialize cache
const cache = new GoogleSheetsCache();
let cacheInitialized = false;

// Initialize cache immediately
(async () => {
    try {
        cacheInitialized = await cache.initialize();
        sendLogToClient('Cache initialization complete', 'system', {
            status: cacheInitialized ? 'Success' : 'Failed'
        });
    } catch (error) {
        sendLogToClient('Cache initialization failed', 'error', {
            error: error.message,
            stack: error.stack
        });
    }
})();

// Initialize OpenAI with error handling
let openai;
try {
    openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    });
    sendLogToClient('OpenAI initialized successfully', 'system');
} catch (error) {
    sendLogToClient('Failed to initialize OpenAI', 'error', { error: error.message });
}

// Google Search API configuration
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID;

// Helper function for Google search
async function localPerformGoogleSearch(query) {
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
        
        sendLogToClient('Google Search Results', 'search', {
            totalResults: data.searchInformation?.totalResults,
            searchTime: data.searchInformation?.searchTime,
            query,
            resultCount: data.items?.length || 0
        });
        
        return data;
    } catch (error) {
        sendLogToClient('Google Search Error', 'error', {
            error: error.message,
            query
        });
        throw error;
    }
}

// Helper function to get search queries
function localGetSearchQueries(category, county) {
    switch (category) {
        case 'Federal':
            return [
                'federal energy rebate programs california',
                'US government energy incentives california'
            ];
        case 'State':
            return [
                'California state energy rebate programs',
                'California energy incentives'
            ];
        case 'County':
            return [
                `${county} County local energy rebate programs`,
                `${county} County energy efficiency incentives`
            ];
        default:
            throw new Error(`Invalid category: ${category}`);
    }
}

// Helper function to analyze with OpenAI
async function localAnalyzeWithOpenAI(results, category) {
    try {
        const resultsText = JSON.stringify(results, null, 2);
        sendLogToClient('Preparing OpenAI Analysis', 'analysis', {
            category,
            resultCount: results.length
        });

        const prompt = `Extract information about ${category} energy rebate programs from these search results:
        ${resultsText}

        REQUIREMENTS:
        1. Federal programs must be available to all California residents
        2. State programs must be California-specific
        3. County programs should include both county-specific and utility programs
        
        For each program, extract:
        1. programName: Full official name
        2. programType: One of [Rebate/Grant/Tax Credit/Low-Interest Loan]
        3. summary: Detailed description (240+ characters)
        4. amount: Specific amount with $ and commas
        5. eligibleProjects: List of what's covered
        6. eligibleRecipients: Who can apply
        7. geographicScope: Coverage area
        8. requirements: List of requirements
        9. applicationProcess: How to apply
        10. deadline: When to apply
        11. websiteLink: Official URL
        12. contactInfo: Contact details
        13. processingTime: Expected processing time

        Return as JSON:
        {
            "programs": [{
                "programName": "string",
                "programType": "string",
                "summary": "string (240+ chars)",
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
        }`;

        sendLogToClient('Sending to OpenAI', 'analysis');
        const completion = await openai.chat.completions.create({
            model: "gpt-4-1106-preview",
            messages: [
                {
                    role: "system",
                    content: "You are a precise data extraction assistant. Extract detailed program information from search results. Ensure summaries are at least 240 characters. For Federal and State programs, verify California eligibility."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0,
            max_tokens: 2000,
            response_format: { type: "json_object" }
        });

        const content = completion.choices[0].message.content;
        const parsedResponse = JSON.parse(content);
        
        if (!parsedResponse.programs || !Array.isArray(parsedResponse.programs)) {
            throw new Error('Invalid response format from OpenAI');
        }

        sendLogToClient('OpenAI Analysis Complete', 'analysis', {
            category,
            programCount: parsedResponse.programs.length
        });

        return {
            category: category,
            programs: parsedResponse.programs,
            timestamp: new Date().toISOString()
        };

    } catch (error) {
        sendLogToClient('OpenAI Analysis Error', 'error', {
            error: error.message,
            category
        });
        throw error;
    }
}

// Helper function to perform multiple searches
async function performMultipleSearches(category, county) {
    const queries = localGetSearchQueries(category, county);
    let allResults = [];

    sendLogToClient('Starting Multiple Searches', 'search', {
        category,
        county,
        queryCount: queries.length,
        queries
    });

    for (const query of queries) {
        try {
            const results = await localPerformGoogleSearch(query);
            if (results?.items) {
                allResults = allResults.concat(results.items);
            }
        } catch (error) {
            sendLogToClient('Search Error', 'error', {
                error: error.message,
                query
            });
        }
    }

    // Remove duplicates
    const uniqueResults = allResults.filter((result, index, self) =>
        index === self.findIndex((r) => r.link === result.link)
    );

    sendLogToClient('Search Complete', 'search', {
        category,
        totalResults: allResults.length,
        uniqueResults: uniqueResults.length
    });

    return uniqueResults;
}

// API endpoint for analysis
app.post('/api/analyze', async (req, res) => {
    const { query, category, county } = req.body;
    const shouldSearch = req.body.shouldSearch === true;
    const startTime = Date.now();

    try {
        sendLogToClient('Analyze Request', 'request', {
            category,
            county,
            query,
            shouldSearch
        });

        if (!shouldSearch) {
            return res.status(400).json({ 
                error: 'Search not requested. Check cache first.',
                shouldSearch
            });
        }

        // Check cache first
        if (cacheInitialized) {
            try {
                const normalizedQuery = `${category}:${county}`;
                const cachedResults = await cache.checkCache(normalizedQuery, category);
                
                if (cachedResults?.found && cachedResults.openaiAnalysis) {
                    sendLogToClient('Cache Hit', 'cache', {
                        category,
                        county,
                        timestamp: cachedResults.timestamp
                    });

                    // Log cache hit
                    await cache.logSearch({
                        query: normalizedQuery,
                        level: category,
                        googleResults: cachedResults.googleResults,
                        openaiAnalysis: cachedResults.openaiAnalysis,
                        isGoogleCached: true,
                        isOpenAICached: true
                    });

                    const analysis = JSON.parse(cachedResults.openaiAnalysis);
                    return res.json({
                        programs: analysis.programs || [],
                        source: {
                            googleSearch: 'Cache',
                            openaiAnalysis: 'Cache'
                        }
                    });
                }
            } catch (cacheError) {
                sendLogToClient('Cache Check Failed', 'error', {
                    error: cacheError.message
                });
            }
        }

        // Perform search and analysis
        const searchResults = await performMultipleSearches(category, county);
        
        if (!searchResults || searchResults.length === 0) {
            return res.status(404).json({ error: 'No search results found' });
        }

        const formattedResults = searchResults.map(result => ({
            title: result.title,
            link: result.link,
            snippet: result.snippet
        }));

        const analysis = await localAnalyzeWithOpenAI(formattedResults, category);

        // Store in cache if initialized
        if (cacheInitialized) {
            try {
                const normalizedQuery = `${category}:${county}`;
                await cache.logSearch({
                    query: normalizedQuery,
                    level: category,
                    googleResults: searchResults,
                    openaiAnalysis: analysis,
                    isGoogleCached: false,
                    isOpenAICached: false
                });
            } catch (cacheError) {
                sendLogToClient('Cache Store Failed', 'error', {
                    error: cacheError.message
                });
            }
        }

        res.json({
            programs: analysis.programs || [],
            source: {
                googleSearch: 'Search',
                openaiAnalysis: 'Search'
            }
        });
    } catch (error) {
        sendLogToClient('Analysis Failed', 'error', {
            error: error.message,
            stack: error.stack,
            duration: Date.now() - startTime
        });
        
        res.status(500).json({ 
            error: 'Analysis failed',
            message: error.message,
            timestamp: new Date().toISOString(),
            details: error.stack
        });
    }
});

// Check cache endpoint
app.post('/api/check-cache', async (req, res) => {
    const { query, category, county } = req.body;
    const startTime = Date.now();

    try {
        sendLogToClient('Cache Check Request', 'cache', {
            category,
            county,
            query
        });

        if (!cacheInitialized) {
            return res.status(503).json({ error: 'Cache not initialized' });
        }

        const normalizedQuery = `${category}:${county}`;
        const cachedResults = await cache.checkCache(normalizedQuery, category);
        
        if (cachedResults?.found) {
            sendLogToClient('Cache Hit', 'cache', {
                category,
                county,
                timestamp: cachedResults.timestamp
            });

            // Log cache hit
            await cache.logSearch({
                query: normalizedQuery,
                level: category,
                googleResults: cachedResults.googleResults,
                openaiAnalysis: cachedResults.openaiAnalysis,
                isGoogleCached: true,
                isOpenAICached: true
            });

            const analysis = JSON.parse(cachedResults.openaiAnalysis);
            return res.json({
                found: true,
                programs: analysis.programs || [],
                source: {
                    googleSearch: 'Cache',
                    openaiAnalysis: 'Cache'
                }
            });
        }

        return res.json({ found: false });
    } catch (error) {
        sendLogToClient('Cache Check Failed', 'error', {
            error: error.message,
            stack: error.stack,
            duration: Date.now() - startTime
        });
        
        res.status(500).json({ 
            error: 'Cache check failed',
            message: error.message,
            timestamp: new Date().toISOString(),
            details: error.stack
        });
    }
});

// Serve static files
app.use(express.static(path.join(__dirname, '..')));

// Root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    sendLogToClient('Unhandled Error', 'error', {
        error: err.message,
        stack: err.stack
    });
    
    res.status(500).json({
        error: 'Internal server error',
        message: err.message,
        timestamp: new Date().toISOString()
    });
});

// Start server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    sendLogToClient('Server Started', 'system', {
        port: PORT,
        sseEndpoint: `http://localhost:${PORT}/api/logs`
    });
}).on('error', (error) => {
    sendLogToClient('Server Start Failed', 'error', {
        error: error.message
    });
});

// Handle shutdown
process.on('SIGTERM', () => {
    sendLogToClient('Server Shutdown', 'system');
    server.close(() => {
        process.exit(0);
    });
});
