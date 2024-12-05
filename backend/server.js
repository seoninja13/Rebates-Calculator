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

function sendLogToClient(message, details = null) {
    const logMessage = JSON.stringify({
        message,
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

// Initialize cache with proper error handling
const cache = new GoogleSheetsCache();
let cacheInitialized = false;

// Initialize cache immediately
(async () => {
    try {
        cacheInitialized = await cache.initialize();
        console.log('Cache initialization status:', cacheInitialized ? 'Success' : 'Failed');
        if (!cacheInitialized) {
            console.error('Failed to initialize cache');
        }
    } catch (error) {
        console.error('Cache initialization error:', error);
        // Don't throw the error, just log it and continue
    }
})();

// Initialize OpenAI with error handling
let openai;
try {
    openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    });
    console.log('OpenAI initialized successfully');
} catch (error) {
    console.error('Failed to initialize OpenAI:', error);
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
        // Build prompt for OpenAI
        const resultsText = JSON.stringify(results, null, 2);
        console.log('Results Text for OpenAI:', resultsText);

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

        console.log('Sending to OpenAI...');
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
        console.log('OpenAI Response:', content);
        
        const parsedResponse = JSON.parse(content);
        if (!parsedResponse.programs || !Array.isArray(parsedResponse.programs)) {
            throw new Error('Invalid response format from OpenAI');
        }

        return {
            category: category,
            programs: parsedResponse.programs,
            timestamp: new Date().toISOString()
        };

    } catch (error) {
        console.error('Analysis Error:', error);
        throw error;
    }
}

// Helper function for consistent logging
function logMessage(direction, type, message, details = null) {
    const logData = {
        message,
        details,
        timestamp: new Date().toISOString(),
        type
    };
    
    console.log(`[${direction}] ${message}`, details || '');
    sendLogToClient(message, details);
}

// Helper function to perform multiple searches
async function performMultipleSearches(category, county) {
    const queries = localGetSearchQueries(category, county);
    let allResults = [];

    sendLogToClient('API → Google', 'search_batch_start', `Starting ${queries.length} Google searches for ${category}`, {
        category,
        county,
        queryCount: queries.length,
        queries
    });

    for (const query of queries) {
        try {
            sendLogToClient('API → Google', 'search_query', 'Sending search query to Google', {
                category,
                query
            });

            const results = await localPerformGoogleSearch(query);
            
            sendLogToClient('Google → API', 'search_results_received', 'Received results from Google', {
                category,
                query,
                resultCount: results.items?.length || 0
            });

            if (results) {
                allResults = allResults.concat(results.items);
            }
        } catch (error) {
            sendLogToClient('Google → API', 'search_error', 'Error from Google Search API', {
                error: error.message,
                category,
                query
            });
            // Continue with next query even if this one fails
        }
    }

    // Remove duplicates
    const uniqueResults = allResults.filter((result, index, self) =>
        index === self.findIndex((r) => r.link === result.link)
    );

    sendLogToClient('Google → API', 'search_batch_complete', `Completed all Google searches for ${category}`, {
        category,
        totalQueries: queries.length,
        totalResults: allResults.length,
        uniqueResults: uniqueResults.length,
        queries
    });

    return uniqueResults;
}

// API endpoint for analysis with better error handling
app.post('/api/analyze', async (req, res) => {
    const { query, category, county } = req.body;
    const shouldSearch = req.body.shouldSearch === true;  // Explicitly check for true

    try {
        sendLogToClient('UI → API', 'analyze_request', 'Received analyze request', {
            category,
            county,
            query,
            shouldSearch
        });

        // Only proceed with search if explicitly requested
        if (!shouldSearch) {
            sendLogToClient('API → UI', 'search_skipped', 'Search not requested', { 
                category, 
                county,
                shouldSearch
            });
            return res.status(400).json({ 
                error: 'Search not requested. Check cache first.',
                shouldSearch
            });
        }

        // Check cache first
        if (cacheInitialized) {
            try {
                const cacheKey = `${category}:${county}`;
                const cachedResults = await cache.localGetCache(cacheKey, category);
                
                if (cachedResults) {
                    sendLogToClient('Cache → API', 'cache_hit', 'Found cached results', {
                        category,
                        county,
                        timestamp: new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })
                    });

                    // Log the cache hit
                    try {
                        await cache.appendRow({
                            query: cacheKey,
                            category: category,
                            googleResults: JSON.stringify(cachedResults.results || []),
                            openaiAnalysis: JSON.stringify(cachedResults.analysis || {}),
                            timestamp: new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }),
                            hash: cache.localGenerateHash(cacheKey),
                            googleSearchCache: 'Cache',
                            openaiSearchCache: 'Cache'
                        });

                        return res.json({
                            programs: cachedResults.analysis.programs || [],
                            source: {
                                googleSearch: 'Cache',
                                openaiAnalysis: 'Cache'
                            }
                        });
                    } catch (logError) {
                        console.error('Failed to log cache hit:', logError);
                    }
                }
            } catch (cacheError) {
                console.error('Cache check failed:', cacheError);
                // Continue with search if cache check fails
            }
        }

        // If we reach here, either cache wasn't initialized, check failed, or no cache hit
        // Proceed with search
        console.log('Proceeding with search, shouldSearch is true');
        sendLogToClient('API → Internal', 'search_start', 'Starting new search', {
            category,
            county,
            query,
            shouldSearch
        });

        // Perform multiple Google searches
        sendLogToClient('API → Google', 'search_start', `Starting ${localGetSearchQueries(category, county).length} Google searches for ${category}`, {
            category,
            county,
            queryCount: localGetSearchQueries(category, county).length,
            queries: localGetSearchQueries(category, county)
        });

        const searchResults = await localPerformGoogleSearch(query);
        
        if (!searchResults || searchResults.length === 0) {
            sendLogToClient('Google → API', 'search_error', 'No search results found', { category, county });
            return res.status(404).json({ error: 'No search results found' });
        }

        // Format ALL results for OpenAI analysis
        const formattedResults = searchResults.map(item => ({
            title: item.title,
            link: item.link,
            snippet: item.snippet
        }));

        // Send ALL results to OpenAI for analysis
        sendLogToClient('API → OpenAI', 'analysis_request', 'Sending combined Google results to OpenAI for analysis', {
            category,
            resultCount: formattedResults.length,
            searchQueries: localGetSearchQueries(category, county)
        });
        
        const analysis = await localAnalyzeWithOpenAI(formattedResults, category);
        
        sendLogToClient('OpenAI → API', 'analysis_complete', 'Received program analysis from OpenAI', {
            category,
            programCount: analysis.programs?.length,
            totalSearchResults: formattedResults.length
        });

        // Store new search results
        if (cacheInitialized) {
            try {
                sendLogToClient('API → Cache', 'cache_store', 'Storing Google and OpenAI results in Google Sheets', {
                    category,
                    county,
                    queries: localGetSearchQueries(category, county),
                    googleResultsCount: searchResults.length,
                    openaiProgramsCount: analysis.programs?.length
                });

                await cache.appendRow({
                    query: localGetSearchQueries(category, county).join(' | '),
                    category: category,
                    googleResults: JSON.stringify(searchResults),
                    openaiAnalysis: JSON.stringify(analysis),
                    timestamp: new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }),
                    hash: cache.localGenerateHash(`${category}:${county}`),
                    googleSearchCache: 'Search',  // New search
                    openaiSearchCache: 'Search'   // New analysis
                });

                sendLogToClient('Cache → API', 'cache_store_success', 'New Google and OpenAI results stored in Google Sheets', {
                    category,
                    county,
                    timestamp: new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })
                });
            } catch (cacheError) {
                sendLogToClient('Cache → API', 'cache_store_error', 'Failed to store Google and OpenAI results in Google Sheets', {
                    error: cacheError.message,
                    category,
                    county
                });
            }
        }

        // Add metadata about the search process to the response
        analysis.searchMetadata = {
            totalQueries: localGetSearchQueries(category, county).length,
            totalResults: searchResults.length,
            queries: localGetSearchQueries(category, county),
            timestamp: new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }),
            source: 'search'
        };

        sendLogToClient('API → UI', 'response_sent', 'Sending final results', {
            category,
            programCount: analysis.programs?.length,
            searchMetadata: analysis.searchMetadata
        });

        res.json({
            programs: analysis.programs || [],
            source: {
                googleSearch: 'Search',
                openaiAnalysis: 'Search'
            }
        });
    } catch (error) {
        sendLogToClient('API → UI', 'error', 'Analysis failed', {
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

// Add check-cache endpoint
app.post('/api/check-cache', async (req, res) => {
    const { query, category, county } = req.body;
    const startTime = Date.now();

    try {
        sendLogToClient('UI → API', 'cache_check', 'Checking cache', {
            category,
            county,
            query
        });

        if (!cacheInitialized) {
            sendLogToClient('API → UI', 'cache_error', 'Cache not initialized', {
                category,
                county
            });
            return res.status(503).json({ error: 'Cache not initialized' });
        }

        // Get all possible queries for this category
        const queries = localGetSearchQueries(category, county);
        const combinedCacheKey = queries.join(' | ');

        try {
            sendLogToClient('API → Cache', 'cache_lookup', 'Looking up cache entry', {
                category,
                county,
                queries
            });

            const cachedResults = await cache.localGetCache(combinedCacheKey, category);
            
            if (cachedResults && cachedResults.results && cachedResults.analysis) {
                sendLogToClient('Cache → API', 'cache_hit', 'Found cached results', {
                    category,
                    county,
                    timestamp: new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })
                });

                // Log the cache hit
                try {
                    await cache.appendRow({
                        query: combinedCacheKey,
                        category: category,
                        googleResults: JSON.stringify(cachedResults.results || []),
                        openaiAnalysis: JSON.stringify(cachedResults.analysis || {}),
                        timestamp: new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }),
                        hash: cache.localGenerateHash(`${category}:${county}`),
                        googleSearchCache: 'Cache',
                        openaiSearchCache: 'Cache'
                    });

                    sendLogToClient('Cache → API', 'cache_log', 'Logged cache hit', {
                        category,
                        county,
                        timestamp: new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })
                    });
                } catch (logError) {
                    sendLogToClient('Cache → API', 'cache_log_error', 'Failed to log cache hit', {
                        error: logError.message,
                        category,
                        county
                    });
                }

                return res.json({
                    found: true,
                    programs: cachedResults.analysis.programs || [],
                    source: {
                        googleSearch: 'Cache',
                        openaiAnalysis: 'Cache'
                    }
                });
            }

            sendLogToClient('Cache → API', 'cache_doesnt_exist', 'No previous cache entry exists', {
                category,
                county
            });
            return res.json({ found: false });

        } catch (cacheError) {
            sendLogToClient('Cache → API', 'cache_error', 'Cache lookup failed', {
                error: cacheError.message,
                category,
                county
            });
            return res.status(500).json({ error: 'Cache lookup failed' });
        }
    } catch (error) {
        sendLogToClient('API → UI', 'error', 'Cache check failed', {
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

// Serve static files from the root directory
app.use(express.static(path.join(__dirname, '..'))); // Go up one level from /backend

// Root route - serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message,
        timestamp: new Date().toISOString()
    });
});

// Start server with proper error handling
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`SSE endpoint available at http://localhost:${PORT}/api/logs`);
}).on('error', (error) => {
    console.error('Failed to start server:', error);
});

// Handle server shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
