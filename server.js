// ES Module imports
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import fetch from 'node-fetch';
import { OpenAI } from 'openai';
import { writeFileSync, appendFileSync, readFileSync } from 'fs';
import { GoogleSheetsCache } from './backend/services/sheets-cache.js';

// Add at the top with other imports
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const LOG_FILE = './debug.log';

// Clear log file on startup
writeFileSync(LOG_FILE, '=== Debug Log Started ===\n');

function debugLog(message, data = null) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n${data ? JSON.stringify(data, null, 2) + '\n' : ''}`;
    appendFileSync(LOG_FILE, logMessage);
    console.log(logMessage);
}

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configure environment variables
const envPath = join(__dirname, 'backend', '.env');
console.log('Loading .env from:', envPath);
const result = dotenv.config({ path: envPath });

if (result.error) {
    console.error('❌ Error loading .env file:', result.error);
    process.exit(1);
}

// Log environment variable status (without exposing values)
console.log('📋 Environment Variables Status:', {
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY ? `${process.env.GOOGLE_API_KEY.substring(0, 6)}...${process.env.GOOGLE_API_KEY.slice(-4)}` : 'missing',
    GOOGLE_API_KEY_LENGTH: process.env.GOOGLE_API_KEY?.length || 0,
    GOOGLE_SEARCH_ENGINE_ID: process.env.GOOGLE_SEARCH_ENGINE_ID || 'missing',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? '✓ present' : 'missing'
});

// Set up logging
const logsDir = join(__dirname, 'logs');
if (!existsSync(logsDir)) {
    mkdirSync(logsDir);
}
const logFile = join(logsDir, 'server.log');

const log = (message) => {
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp}: ${message}\n`;
    try {
        appendFileSync(logFile, logMessage);
    } catch (error) {
        console.error('Error writing to log file:', error);
    }
    if (typeof message === 'object') {
        console.log(timestamp + ':', JSON.stringify(message, null, 2));
    } else {
        console.log(timestamp + ':', message);
    }
};

// Clear previous log file
try {
    writeFileSync(logFile, '');
    log('✅ Log file initialized');
} catch (error) {
    console.error('Error creating log file:', error);
}

// Verify environment variables are loaded
const envStatus = {
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY ? '✅ Present' : '❌ Missing',
    GOOGLE_SEARCH_ENGINE_ID: process.env.GOOGLE_SEARCH_ENGINE_ID ? '✅ Present' : '❌ Missing',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? '✅ Present' : '❌ Missing',
    GOOGLE_SHEETS_CREDENTIALS: process.env.GOOGLE_SHEETS_CREDENTIALS ? '✅ Present' : '❌ Missing',
    GOOGLE_SHEETS_SPREADSHEET_ID: process.env.GOOGLE_SHEETS_SPREADSHEET_ID ? '✅ Present' : '❌ Missing'
};
log('📋 Environment variables loaded: ' + JSON.stringify(envStatus, null, 2));

// Log actual values for debugging (except sensitive data)
log('🔐 Environment variable details:', {
    GOOGLE_SHEETS_SPREADSHEET_ID: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
    GOOGLE_SHEETS_CREDENTIALS_LENGTH: process.env.GOOGLE_SHEETS_CREDENTIALS ? process.env.GOOGLE_SHEETS_CREDENTIALS.length : 0
});

// Validate environment variables at startup
function validateGoogleConfig() {
    const config = {
        GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
        GOOGLE_SEARCH_ENGINE_ID: process.env.GOOGLE_SEARCH_ENGINE_ID
    };

    const missing = Object.entries(config)
        .filter(([_, value]) => !value)
        .map(([key]) => key);

    if (missing.length > 0) {
        console.error('❌ Missing required Google Search configuration:', missing.join(', '));
        return false;
    }

    // Basic format validation
    if (!/^AIza[0-9A-Za-z\-_]{35}$/.test(config.GOOGLE_API_KEY)) {
        console.error('❌ Invalid Google API key format. Should start with "AIza" and be 39 characters long');
        return false;
    }

    return true;
}

// Initialize Express app and OpenAI client
const app = express();
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Initialize Google Sheets Cache
let sheetsCache;
try {
    sheetsCache = new GoogleSheetsCache();
    log('✅ Google Sheets Cache initialized successfully');
} catch (error) {
    log('❌ Failed to initialize Google Sheets Cache:', error);
    process.exit(1);
}

// Configure middleware
app.use(cors({
    origin: '*', // Allow all origins in development
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add OPTIONS handling for preflight requests
app.options('*', cors());

// Add error handling for CORS
app.use((err, req, res, next) => {
    if (err.name === 'CORSError') {
        res.status(403).json({
            error: true,
            message: 'CORS error: ' + err.message
        });
    } else {
        next(err);
    }
});

// Serve static files
app.use(express.static(__dirname));

// Log all incoming requests
app.use((req, res, next) => {
    log(`${req.method} ${req.url}`);
    next();
});

// In-memory cache for OpenAI results
const openAICache = new Map();
const CACHE_TTL = 3600 * 1000; // 1 hour in milliseconds

function getCacheKey(query, category) {
    return `${category}:${query}`;
}

async function getFromCache(query, category) {
    const key = getCacheKey(query, category);
    const cached = openAICache.get(key);
    
    if (cached) {
        const isExpired = Date.now() - cached.timestamp > CACHE_TTL;
        if (!isExpired) {
            console.log('✅ Cache hit for:', { category, query });
            return cached.data;
        } else {
            console.log('🔄 Cache expired for:', { category, query });
            openAICache.delete(key);
        }
    }
    return null;
}

function saveToCache(query, category, data) {
    const key = getCacheKey(query, category);
    openAICache.set(key, {
        data,
        timestamp: Date.now()
    });
    console.log('💾 Saved to cache:', { category, query });
}

// Add SSE endpoint for logging
let clients = [];

app.get('/api/logs', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    clients.push(res);

    req.on('close', () => {
        clients = clients.filter(client => client !== res);
    });
});

function sendLogToClient(message, details = null) {
    clients.forEach(client => {
        client.write(`data: ${JSON.stringify({ message, details })}\n\n`);
    });
}

app.post('/api/analyze', async (req, res) => {
    const { query, category } = req.body;
    
    try {
        // Frontend to API
        sendLogToClient(`Frontend → API | Received | Query: "${query}" | Category: ${category}`, {
            query,
            category,
            timestamp: new Date().toISOString(),
            type: 'incoming_request'
        });

        // Check cache first
        const cachedResult = await sheetsCache.get(query, category);
        let searchResults, analysis;
        
        if (cachedResult) {
            sendLogToClient(`API → Frontend | Cache Hit | Category: ${category}`, {
                category,
                programsCount: cachedResult.results.length,
                timestamp: new Date().toISOString(),
                type: 'cache_hit'
            });

            searchResults = cachedResult.results;
            analysis = cachedResult.analysis;

            // Log the cache hit to sheets
            await sheetsCache.set(query, category, {
                results: searchResults,
                analysis: analysis,
                source: {
                    googleSearch: false,  // Mark as cached
                    openaiAnalysis: false  // Mark as cached
                }
            });

        } else {
            // API to Google
            sendLogToClient(`API → Google | Searching | Query: "${query}"`, {
                query,
                searchUrl: `https://www.googleapis.com/customsearch/v1?cx=${process.env.GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}`,
                timestamp: new Date().toISOString(),
                type: 'google_request'
            });
            
            searchResults = await searchGoogle(query);
            
            // Google to API
            sendLogToClient(`Google → API | Results: ${searchResults.items.length} | Total: ${searchResults.searchInformation.totalResults}`, {
                totalResults: parseInt(searchResults.searchInformation.totalResults),
                returnedResults: searchResults.items.length,
                searchTime: searchResults.searchInformation.searchTime,
                items: searchResults.items.map(item => ({
                    title: item.title,
                    link: item.link,
                    snippet: item.snippet
                })),
                timestamp: new Date().toISOString(),
                type: 'google_response'
            });

            // API to OpenAI
            sendLogToClient(`API → OpenAI | Analyzing | Results: ${searchResults.items.length} | Category: ${category}`, {
                resultsCount: searchResults.items.length,
                category,
                model: "gpt-4-turbo-preview",
                timestamp: new Date().toISOString(),
                type: 'openai_request'
            });
            
            analysis = await analyzeSearchResults(searchResults.items, category);
            
            // Cache the results
            const cacheResult = await sheetsCache.set(query, category, {
                results: searchResults.items,
                analysis: analysis,
                source: {
                    googleSearch: true,  // Mark as new search
                    openaiAnalysis: true  // Mark as new analysis
                }
            }, query);

            if (!cacheResult) {
                console.error('Failed to cache results');
            }
        }

        // OpenAI to API
        sendLogToClient(`OpenAI → API | Programs Found: ${analysis?.programs?.length || 0} | Category: ${category}`, {
            programsFound: analysis?.programs?.length || 0,
            programs: analysis?.programs || [],
            category,
            timestamp: new Date().toISOString(),
            type: 'openai_response'
        });

        // API to Frontend
        const response = {
            programs: analysis?.programs || [],
            timestamp: new Date().toISOString()
        };

        sendLogToClient(`API → Frontend | Sending | Programs: ${response.programs.length} | Category: ${category}`, {
            programsCount: response.programs.length,
            category,
            programs: response.programs,
            timestamp: response.timestamp,
            type: 'outgoing_response'
        });

        res.json(response);
        
    } catch (error) {
        sendLogToClient(`API → Frontend | Error | ${error.message} | Category: ${category}`, {
            error: error.message,
            category,
            stack: error.stack,
            timestamp: new Date().toISOString(),
            type: 'error_response'
        });
        res.status(500).json({
            error: true,
            message: error.message
        });
    }
});

// Test endpoint for Google Search
app.get('/api/test-search', async (req, res) => {
    try {
        console.log('\n=== Testing Google Search API ===');
        
        // Log environment variables
        console.log('Environment variables:', {
            GOOGLE_API_KEY: process.env.GOOGLE_API_KEY ? '✓ present' : '❌ missing',
            GOOGLE_SEARCH_ENGINE_ID: process.env.GOOGLE_SEARCH_ENGINE_ID ? '✓ present' : '❌ missing',
            KEY_LENGTH: process.env.GOOGLE_API_KEY?.length,
            CX_LENGTH: process.env.GOOGLE_SEARCH_ENGINE_ID?.length
        });

        // Construct a simple test query
        const searchUrl = new URL('https://customsearch.googleapis.com/customsearch/v1');
        const params = {
            key: process.env.GOOGLE_API_KEY,
            cx: process.env.GOOGLE_SEARCH_ENGINE_ID,
            q: 'test search',
            num: 1
        };

        // Add parameters to URL
        Object.entries(params).forEach(([key, value]) => {
            searchUrl.searchParams.append(key, value);
        });

        console.log('Making test request to Google API...');
        console.log('URL:', searchUrl.toString().replace(process.env.GOOGLE_API_KEY, 'HIDDEN_KEY'));

        const response = await fetch(searchUrl.toString());
        const data = await response.text();

        console.log('Response status:', response.status);
        console.log('Response headers:', Object.fromEntries(response.headers));
        
        try {
            const jsonData = JSON.parse(data);
            console.log('Response data:', {
                kind: jsonData.kind,
                totalResults: jsonData.searchInformation?.totalResults,
                hasItems: !!jsonData.items,
                itemCount: jsonData.items?.length
            });
            
            res.json({
                success: true,
                status: response.status,
                data: jsonData
            });
        } catch (parseError) {
            console.error('Failed to parse response:', data.substring(0, 500));
            res.status(500).json({
                success: false,
                error: 'Failed to parse response',
                responseText: data.substring(0, 500)
            });
        }
    } catch (error) {
        console.error('Test search error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
});

// Simple test endpoint
app.get('/api/test-google', async (req, res) => {
    try {
        console.log('\n=== Testing Google Search API ===');
        
        // Log API configuration
        console.log('API Configuration:', {
            hasKey: !!process.env.GOOGLE_API_KEY,
            keyLength: process.env.GOOGLE_API_KEY?.length,
            hasCX: !!process.env.GOOGLE_SEARCH_ENGINE_ID,
            cxLength: process.env.GOOGLE_SEARCH_ENGINE_ID?.length
        });

        // Construct a simple test URL
        const searchUrl = new URL('https://customsearch.googleapis.com/customsearch/v1');
        searchUrl.searchParams.append('key', process.env.GOOGLE_API_KEY);
        searchUrl.searchParams.append('cx', process.env.GOOGLE_SEARCH_ENGINE_ID);
        searchUrl.searchParams.append('q', 'test');

        console.log('Making request to:', searchUrl.toString().replace(process.env.GOOGLE_API_KEY, 'HIDDEN_KEY'));

        const response = await fetch(searchUrl.toString());
        console.log('Response status:', response.status);

        const data = await response.text();
        console.log('Raw response:', data.substring(0, 500));

        res.json({
            status: 'success',
            responseStatus: response.status,
            data: JSON.parse(data)
        });
    } catch (error) {
        console.error('Test endpoint error:', error);
        res.status(500).json({
            status: 'error',
            message: error.message,
            stack: error.stack
        });
    }
});

// Reset cache sheet endpoint
app.post('/api/reset-cache', async (req, res) => {
    try {
        const result = await sheetsCache.clearAndResetSheet();
        if (result) {
            res.json({ success: true, message: 'Cache sheet cleared and reset successfully' });
        } else {
            res.status(500).json({ success: false, message: 'Failed to reset cache sheet' });
        }
    } catch (error) {
        console.error('Error resetting cache sheet:', error);
        res.status(500).json({ success: false, message: 'Error resetting cache sheet', error: error.message });
    }
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
    res.sendFile(join(__dirname, 'index.html'));
});

// Add a basic health check endpoint
app.get('/health', (req, res) => {
    console.log('Health check request received');
    res.json({ 
        status: 'ok',
        timestamp: new Date().toISOString(),
        env: {
            GOOGLE_API_KEY: !!process.env.GOOGLE_API_KEY,
            GOOGLE_SEARCH_ENGINE_ID: !!process.env.GOOGLE_SEARCH_ENGINE_ID,
            NODE_ENV: process.env.NODE_ENV || 'development'
        }
    });
});

// Start server
const PORT = 3000;

app.listen(PORT, () => {
    console.clear(); // Clear the console for better visibility
    console.log('\n=== Server Started ===');
    console.log(`Server running on port ${PORT}`);
    console.log('\n🔍 Available endpoints:');
    console.log(`- Health check:   http://localhost:${PORT}/health`);
    console.log(`- Test search:    http://localhost:${PORT}/api/test-search`);
    console.log(`- Main endpoint:  http://localhost:${PORT}/api/analyze\n`);
});

// Handle server errors
app.on('error', (error) => {
    console.error('\n❌ Server error:', {
        code: error.code,
        message: error.message,
        stack: error.stack
    });
    
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Please try a different port or stop the other process.`);
        process.exit(1);
    }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('\n❌ Uncaught exception:', {
        message: error.message,
        stack: error.stack
    });
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('\n❌ Unhandled rejection:', {
        reason: reason,
        promise: promise
    });
});

// Helper functions
async function searchGoogle(query) {
    try {
        console.log(`API → Google | Searching | Query: "${query}"`);
        const url = `https://www.googleapis.com/customsearch/v1?key=${process.env.GOOGLE_API_KEY}&cx=${process.env.GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            const error = await response.text();
            console.error(`Google → API | Error | ${response.status}: ${error}`);
            throw new Error(`Google Search failed: ${response.status}`);
        }

        const data = await response.json();
        console.log(`Google → API | Results: ${data.items.length} | Total: ${data.searchInformation.totalResults}`);
        return data;
    } catch (error) {
        console.error(`Google → API | Error | ${error.message}`);
        throw error;
    }
}

async function analyzeSearchResults(searchResults, category) {
    try {
        console.log('Starting analysis for category:', category);
        console.log('Search results:', JSON.stringify(searchResults, null, 2));

        const prompt = `Analyze these search results about ${category} energy rebate programs and extract specific programs available. For each program, provide:
        1. Program Name
        2. Description (brief)
        3. Eligibility (if mentioned)
        4. Incentive Amount (if mentioned)
        5. How to Apply (if mentioned)
        6. Source URL

        Search Results:
        ${searchResults.map(result => `Title: ${result.title}\nURL: ${result.link}\nDescription: ${result.snippet}\n---`).join('\n')}`;

        console.log('Generated prompt:', prompt);

        const retryAttempts = 3;
        const retryDelay = 5000; // 5 seconds

        for (let attempt = 1; attempt <= retryAttempts; attempt++) {
            try {
                console.log(`Attempt ${attempt}/${retryAttempts} to get OpenAI completion`);
                const completion = await openai.chat.completions.create({
                    model: "gpt-4-turbo-preview",
                    messages: [{
                        role: "system",
                        content: "You are a helpful assistant that analyzes search results about energy rebate programs and extracts specific program information in a structured format."
                    }, {
                        role: "user",
                        content: prompt
                    }],
                    temperature: 0.2
                });

                console.log('OpenAI response:', completion.choices[0].message.content);
                const analysis = completion.choices[0].message.content;
                const programs = extractPrograms(analysis) || [];
                console.log('Extracted programs:', JSON.stringify(programs, null, 2));
                return { programs };  

            } catch (error) {
                console.error(`Attempt ${attempt} failed:`, error);
                if (error.status === 429) { // Rate limit error
                    log(`⚠️ OpenAI Rate limit hit (attempt ${attempt}/${retryAttempts}). Waiting ${retryDelay/1000} seconds...`);
                    if (attempt < retryAttempts) {
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                        continue;
                    }
                    // If all retries failed, use test data
                    log('⚠️ Using test data due to OpenAI rate limit');
                    const testDataPath = join(__dirname, 'backend', 'test-data.json');
                    const testData = JSON.parse(readFileSync(testDataPath, 'utf8'));
                    return testData;
                }
                throw error;
            }
        }
        throw new Error('Failed after all retry attempts');
    } catch (error) {
        console.error('Error in analyzeSearchResults:', error);
        // Return empty array instead of undefined
        return { programs: [] };
    }
}

// Get search queries based on category
function getSearchQueries(category, baseQuery) {
    switch (category) {
        case 'Federal':
            return [
                'federal energy rebate programs california',
                'US government energy incentives california',
                'federal renewable energy tax credits california',
                'federal energy efficiency incentives california'
            ];
        case 'State':
            return [
                'California state energy rebate programs',
                'California energy incentives',
                'California solar rebates',
                'California renewable energy grants'
            ];
        case 'County':
            const county = baseQuery;
            return [
                `${county} County local energy rebate programs`,
                `${county} County energy efficiency incentives`,
                `${county} County solar rebates`,
                `${county} County renewable energy programs`
            ];
        default:
            return [];
    }
}

function extractPrograms(analysis) {
    console.log('Extracting programs from analysis:', analysis);
    try {
        // Try parsing as JSON first
        try {
            console.log('Attempting to parse as JSON...');
            const parsedAnalysis = JSON.parse(analysis);
            console.log('Successfully parsed as JSON:', parsedAnalysis);
            return parsedAnalysis.programs || [];
        } catch (jsonError) {
            console.log('Not JSON, processing as markdown text...');
            // If not JSON, process as markdown text
            const programs = [];
            const lines = analysis.split('\n');
            let currentProgram = null;

            for (let line of lines) {
                line = line.trim();
                
                // New program starts with a number or program name
                if (line.match(/^(\d+\.|\*|\-)\s+(.+)$/)) {
                    console.log('Found new program:', line);
                    if (currentProgram) {
                        programs.push(currentProgram);
                    }
                    currentProgram = {
                        name: line.replace(/^(\d+\.|\*|\-)\s+/, ''),
                        description: '',
                        eligibility: '',
                        incentiveAmount: '',
                        howToApply: '',
                        sourceUrl: ''
                    };
                } else if (currentProgram && line) {
                    // Add details to current program
                    if (line.toLowerCase().includes('description:')) {
                        currentProgram.description = line.split(':')[1]?.trim() || '';
                        console.log('Added description:', currentProgram.description);
                    } else if (line.toLowerCase().includes('eligibility:')) {
                        currentProgram.eligibility = line.split(':')[1]?.trim() || '';
                        console.log('Added eligibility:', currentProgram.eligibility);
                    } else if (line.toLowerCase().includes('incentive amount:') || line.toLowerCase().includes('amount:')) {
                        currentProgram.incentiveAmount = line.split(':')[1]?.trim() || '';
                        console.log('Added amount:', currentProgram.incentiveAmount);
                    } else if (line.toLowerCase().includes('how to apply:') || line.toLowerCase().includes('application:')) {
                        currentProgram.howToApply = line.split(':')[1]?.trim() || '';
                        console.log('Added how to apply:', currentProgram.howToApply);
                    } else if (line.toLowerCase().includes('source:') || line.toLowerCase().includes('url:')) {
                        currentProgram.sourceUrl = line.split(':')[1]?.trim() || '';
                        console.log('Added source URL:', currentProgram.sourceUrl);
                    }
                }
            }

            // Add the last program
            if (currentProgram) {
                programs.push(currentProgram);
            }

            console.log('Extracted programs from markdown:', programs);
            return programs;
        }
    } catch (error) {
        console.error('Error extracting programs:', error);
        return [];
    }
}

// Update Google Sheets with query and results
async function updateGoogleSheets(query, category, results, analysis, source) {
    const timestamp = new Date().toLocaleString();
    const values = [
        [
            query,
            category,
            JSON.stringify(results),
            analysis,
            timestamp,
            source.cacheStatus // Single combined cache status column
        ]
    ];
    await sheetsCache.update(values);
}
