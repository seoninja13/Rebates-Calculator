import OpenAI from 'openai';
import fetch from 'node-fetch';
import { GoogleSheetsCache } from './sheets-cache.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

console.log('Starting analyze.js...');
console.log('Current environment:', process.env.NODE_ENV);
console.log('Current directory:', process.cwd());

// Initialize environment variables
const cache = new GoogleSheetsCache();
let cacheInitialized = false;

// Load environment variables for local development
if (process.env.NODE_ENV !== 'production') {
    try {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        const envPath = path.join(__dirname, '../../backend/.env');
        console.log('Attempting to load .env from:', envPath);
        dotenv.config({ path: envPath });
    } catch (error) {
        console.error('Error loading .env file:', error);
    }
}

// Initialize OpenAI
let openai;
try {
    console.log('Initializing OpenAI with API key:', process.env.OPENAI_API_KEY ? 'Present' : 'Missing');
    openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    });
} catch (error) {
    console.error('Error initializing OpenAI:', error);
}

// Google Search API configuration
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID;

console.log('Google API configuration:', {
    GOOGLE_API_KEY: GOOGLE_API_KEY ? 'Present' : 'Missing',
    GOOGLE_SEARCH_ENGINE_ID: GOOGLE_SEARCH_ENGINE_ID ? 'Present' : 'Missing'
});

// Minimal logging for environment variables
console.log('Environment variables status:', {
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    GOOGLE_API_KEY: !!process.env.GOOGLE_API_KEY,
    GOOGLE_SEARCH_ENGINE_ID: !!process.env.GOOGLE_SEARCH_ENGINE_ID,
    GOOGLE_SHEETS_SPREADSHEET_ID: !!process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
    GOOGLE_SHEETS_CREDENTIALS: !!process.env.GOOGLE_SHEETS_CREDENTIALS
});

// Initialize cache at startup
try {
    await cache.initialize();
    cacheInitialized = true;
    console.log('✅ Cache initialized successfully');
} catch (error) {
    console.error('❌ Failed to initialize cache:', error);
    cacheInitialized = false;
}

// Helper function to perform Google search
async function performGoogleSearch(query) {
    const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&num=10`;
    console.log('🔍 Performing Google search with URL:', url);
    
    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Google Search failed:', response.status, errorText);
            throw new Error(`Google Search failed: ${response.status} - ${errorText}`);
        }
        const data = await response.json();
        
        if (!data.items || data.items.length === 0) {
            console.warn('⚠️ No items found in Google Search response');
            return [];
        }
        
        return data.items;
    } catch (error) {
        console.error('❌ Google Search Error:', error);
        throw error;
    }
}

// Helper function to check analysis cache
async function checkAnalysisCache(query, category) {
    return await cache.get(query, category);
}

// Helper function to store analysis in cache
async function storeAnalysisCache(query, category, result) {
    return await cache.set(query, category, result);
}

async function analyzeResults(results, category) {
    try {
        // Log raw search results
        console.log('Raw Search Results:', JSON.stringify(results, null, 2));

        // Validate input
        if (!results || !Array.isArray(results) || results.length === 0) {
            console.error('❌ Invalid or empty search results');
            return {
                category: category,
                programs: [],
                error: 'Invalid or empty search results',
                timestamp: new Date().toISOString()
            };
        }

        // Build prompt for OpenAI
        const resultsText = results.map(result => `Title: ${result.title}\nLink: ${result.link}\nSnippet: ${result.snippet}`).join('\n\n');
        console.log('Results Text for OpenAI:', resultsText);

        const prompt = `Analyze these search results about ${category} energy rebate programs in California and extract program information in JSON format.
        
        REQUIRED OUTPUT FORMAT:
        {
            "programs": [
                {
                    "programName": "Program name",
                    "summary": "Brief description (240-520 chars)",
                    "programType": "One of: Rebate/Grant/Tax Credit/Low-Interest Loan",
                    "amount": "Exact amount with $ and commas (e.g. $8,000 or Up to $10,000)",
                    "eligibleProjects": ["List of eligible project types"],
                    "eligibleRecipients": ["List of who can apply"],
                    "geographicScope": "One of: Nationwide/State-specific/County-specific/Utility service area",
                    "requirements": ["List of requirements"],
                    "applicationProcess": "1-2 line description",
                    "deadline": "Specific date or Ongoing",
                    "websiteLink": "Full URL",
                    "contactInfo": {
                        "phone": "Phone number if available",
                        "email": "Email if available",
                        "office": "Office location if available"
                    },
                    "processingTime": "Expected processing time"
                }
            ]
        }

        VALIDATION RULES:
        1. For Federal programs: Must be available to all California residents
        2. For State programs: Must be California-specific programs
        3. For County programs: Must be specific to the county or utility service area
        4. Exclude any programs about electric vehicles
        5. Each program MUST have amount and eligibleProjects fields
        6. If exact information isn't available, use "Contact program administrator for details"
        
        Here are the search results to analyze:
        ${resultsText}`;

        console.log('Making OpenAI API call with prompt:', prompt);
        
        const completion = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                {
                    role: "system",
                    content: "You are a specialized assistant that extracts energy rebate program information from search results. You MUST return a valid JSON object containing program information in the exact format specified. Each program MUST include amount and eligibleProjects fields."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.1,
            max_tokens: 2500,
            response_format: { type: "json_object" }
        });

        // Parse and validate OpenAI response
        console.log('Raw OpenAI Response:', completion.choices[0].message.content);
        
        try {
            const parsedResponse = JSON.parse(completion.choices[0].message.content);
            
            // Validate the response structure
            if (!parsedResponse || !Array.isArray(parsedResponse.programs)) {
                console.error('Invalid response structure from OpenAI');
                throw new Error('Invalid response structure');
            }

            // Validate each program has required fields
            parsedResponse.programs = parsedResponse.programs.filter(program => {
                return program.amount && program.eligibleProjects && 
                       program.programName && program.programType;
            });

            if (parsedResponse.programs.length === 0) {
                console.error('No valid programs found in OpenAI response');
                throw new Error('No valid programs found');
            }

            return {
                category: category,
                programs: parsedResponse.programs,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error parsing OpenAI response:', error);
            return {
                category: category,
                programs: [],
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    } catch (error) {
        console.error('Error in analyzeResults:', error);
        return {
            category: category,
            programs: [],
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

// Export the handler function
export const handler = async (event, context) => {
    const requestId = Math.random().toString(36).substring(7);
    try {
        // Log incoming request details
        console.log(`[${requestId}] 📝 REQUEST RECEIVED:`, {
            timestamp: new Date().toISOString(),
            method: event.httpMethod,
            path: event.path,
            headers: event.headers,
            queryParams: event.queryStringParameters,
            body: event.body ? JSON.parse(event.body) : null
        });

        // Check environment variables
        const requiredEnvVars = ['OPENAI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_SEARCH_ENGINE_ID', 'GOOGLE_SHEETS_SPREADSHEET_ID', 'GOOGLE_SHEETS_CREDENTIALS'];
        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

        if (missingVars.length > 0) {
            const error = `Missing required environment variables: ${missingVars.join(', ')}`;
            console.error(`[${requestId}] ❌ CONFIG ERROR:`, error);
            return {
                statusCode: 500,
                body: JSON.stringify({ 
                    error,
                    environment: process.env.NODE_ENV
                })
            };
        }

        // Handle OPTIONS request for CORS
        if (event.httpMethod === 'OPTIONS') {
            console.log(`[${requestId}] ✨ CORS preflight request handled`);
            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS'
                },
                body: ''
            };
        }

        // Only allow POST requests
        if (event.httpMethod !== 'POST') {
            const error = 'Method not allowed';
            console.error(`[${requestId}] ❌ METHOD ERROR: ${error}`);
            return {
                statusCode: 405,
                body: JSON.stringify({ error })
            };
        }

        try {
            // Parse and validate request body
            console.log(`[${requestId}] 📦 Raw request body:`, event.body);
            const body = JSON.parse(event.body);
            console.log(`[${requestId}] ✅ Parsed request body:`, body);

            const { query } = body;
            if (!query) {
                const error = 'Missing required parameter: query';
                console.error(`[${requestId}] ❌ VALIDATION ERROR:`, { error });
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error })
                };
            }

            // Process all program types
            const programTypes = ['Federal', 'State', 'County'];
            const allResults = {};
            let isCached = true;  // Track if all results are from cache
            
            for (const category of programTypes) {
                console.log(`[${requestId}] 🔍 Processing ${category} programs...`);
                
                let searchResults, analysisResults;
                let usedGoogleCache = false;
                let usedOpenAICache = false;
                let searchStartTime = new Date();

                // Check cache if initialized
                if (cacheInitialized) {
                    console.log(`[${requestId}] 📦 Checking cache for ${category}...`);
                    const cachedEntry = await cache.getCacheEntry(query, category);
                    if (cachedEntry) {
                        console.log(`[${requestId}] ✅ Cache hit for ${category}`);
                        console.log(`[${requestId}] 📊 Found ${cachedEntry.searchResults.length} Google results and ${cachedEntry.analysis.programs?.length || 0} programs in cache`);
                        searchResults = cachedEntry.searchResults;
                        analysisResults = cachedEntry.analysis;
                        usedGoogleCache = true;
                        // Only mark OpenAI as cached if we have valid analysis results
                        usedOpenAICache = cachedEntry.analysis && cachedEntry.analysis.programs;
                    } else {
                        console.log(`[${requestId}] ❌ Cache miss for ${category}`);
                    }
                } else {
                    console.log(`[${requestId}] ⚠️ Cache not initialized, performing fresh search`);
                }

                // If no cache hit, do fresh search and analysis
                if (!searchResults || !analysisResults) {
                    console.log(`[${requestId}] 🔍 Performing new search for ${category}`);
                    isCached = false;  // At least one result is not from cache
                    
                    // Perform fresh search
                    console.log(`[${requestId}] 🌐 Making Google Search API call...`);
                    searchResults = await performGoogleSearch(query + ' ' + category + ' rebates');
                    console.log(`[${requestId}] ✅ Received ${searchResults.length} results from Google`);
                    
                    // Always perform OpenAI analysis for fresh search results
                    console.log(`[${requestId}] 🤖 Sending results to OpenAI for analysis...`);
                    analysisResults = await analyzeResults(searchResults, category);
                    console.log(`[${requestId}] ✅ OpenAI analysis complete. Found ${analysisResults.programs?.length || 0} programs`);
                }

                // Calculate and log timing
                const searchEndTime = new Date();
                const searchDuration = searchEndTime - searchStartTime;
                console.log(`[${requestId}] ⏱️ ${category} search completed in ${searchDuration}ms`);
                console.log(`[${requestId}] 📊 Final results for ${category}:`, {
                    googleResults: searchResults.length,
                    programs: analysisResults.programs?.length || 0,
                    source: usedGoogleCache ? 'Cache' : 'Fresh Search'
                });

                // Log search operation only if we have valid results
                if (searchResults && analysisResults) {
                    try {
                        await cache.logSearchOperation(query, category, searchResults, analysisResults, {
                            googleCache: usedGoogleCache,
                            openaiCache: usedOpenAICache && analysisResults && analysisResults.programs && analysisResults.programs.length > 0
                        });
                        console.log(`[${requestId}] 📝 Search operation logged to Google Sheets`);
                    } catch (error) {
                        console.error(`[${requestId}] ❌ Error logging search operation:`, error);
                    }
                } else {
                    console.warn(`[${requestId}] ⚠️ Missing results, skipping log operation`);
                }
                
                allResults[category.toLowerCase()] = {
                    programs: analysisResults?.programs || [],
                    timestamp: new Date().toISOString()
                };
            }

            const response = {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS'
                },
                body: JSON.stringify({
                    federal: allResults.federal,
                    state: allResults.state,
                    county: allResults.county,
                    timestamp: new Date().toISOString()
                })
            };

            console.log(`[${requestId}] ✅ RESPONSE SENT:`, {
                statusCode: response.statusCode,
                timestamp: new Date().toISOString(),
                programCounts: {
                    federal: allResults.federal.programs.length,
                    state: allResults.state.programs.length,
                    county: allResults.county.programs.length
                }
            });

            return response;
        } catch (error) {
            console.error('Error details:', {
                message: error.message,
                stack: error.stack,
                name: error.name,
                type: error.constructor.name
            });

            return {
                statusCode: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS'
                },
                body: JSON.stringify({
                    error: 'Internal server error',
                    details: error.message,
                    type: error.name,
                    errorType: error.constructor.name
                })
            };
        }
    } catch (error) {
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name,
            type: error.constructor.name
        });

        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: JSON.stringify({
                error: 'Internal server error',
                details: error.message,
                type: error.name,
                errorType: error.constructor.name
            })
        };
    }
}
