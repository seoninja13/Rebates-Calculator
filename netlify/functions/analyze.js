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
    // Basic required parameters only
    const baseUrl = 'https://www.googleapis.com/customsearch/v1';
    const searchParams = {
        key: GOOGLE_API_KEY,
        cx: GOOGLE_SEARCH_ENGINE_ID,
        q: query,
        num: '10'
    };

    const url = `${baseUrl}?${new URLSearchParams(searchParams)}`;
    
    // Log the actual request (with API key redacted)
    const redactedParams = { ...searchParams };
    redactedParams.key = 'REDACTED';
    redactedParams.cx = 'REDACTED';
    console.log('\n===> Google Search Request');
    console.log(JSON.stringify(redactedParams, null, 2));
    console.log('<=== End Request\n');

    try {
        const response = await fetch(url);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Google Search Error:', {
                status: response.status,
                error: errorText
            });
            throw new Error(`Google Search failed: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        
        // Log complete raw response
        console.log('\n===> Google Search Response');
        console.log('Status:', response.status);
        console.log('Response Data:', JSON.stringify(data, null, 2));
        console.log('<=== End Response\n');

        // Return the results in the response to frontend
        return {
            status: response.status,
            data: data,
            items: data.items || [],
            searchInfo: data.searchInformation
        };
    } catch (error) {
        console.error('Google Search Error:', error);
        throw error;
    }
}

// Helper function to check analysis cache
async function checkAnalysisCache(query, category) {
    return await cache.getCacheEntry(query, category);
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

        const prompt = `Analyze these search results about ${category} energy rebate programs in California, focusing on Federal programs. Convert all program budgets into specific per-household rebate amounts.

        FEDERAL PROGRAMS EXACT AMOUNTS:

        1. IRA Home Electrification:
        collapsedSummary MUST be:
        "$8,000 for heat pumps, $840 for water heaters, stoves, and dryers (income-based)"
        amount MUST be:
        "Heat Pumps: $8,000, Water Heaters: $840, Electric Stoves: $840, Dryers: $840, Max: $14,000"

        2. HOMES Program:
        collapsedSummary MUST be:
        "$2,000-$4,000 standard, up to $8,000 low-income based on energy savings"
        amount MUST be:
        "Base: $2,000-$4,000 for 20-35% savings, $4,000-$8,000 for 35%+ savings (income-based)"

        MANDATORY CONVERSION RULES:
        1. For IRA Programs:
           ❌ WRONG: "Varies" or "$X,XXX rebate"
           ✓ RIGHT: List specific amounts ($8,000, $840)
           ✓ RIGHT: Show income-based variations

        2. For HOMES Program:
           ❌ WRONG: "$291 million in funding"
           ❌ WRONG: "Up to $8,000"
           ✓ RIGHT: "$2,000-$4,000 standard, up to $8,000 low-income"
           ✓ RIGHT: Show both savings tiers and income levels

        EXACT FORMAT REQUIRED:
        {
            "programs": [
                {
                    "programName": "Inflation Reduction Act Residential Energy Rebate Programs",
                    "type": "Rebate",
                    "amount": "COPY EXACT AMOUNT FORMAT ABOVE",
                    "collapsedSummary": "COPY EXACT SUMMARY FORMAT ABOVE",
                    "description": "Brief description",
                    "eligibility": {
                        "recipients": ["Income-qualified homeowners"],
                        "requirements": ["Must be primary residence"],
                        "restrictions": ["Income limits apply"]
                    },
                    "eligibleProjects": ["Heat pumps", "Water heaters", "Electric appliances"],
                    "source": "Program URL"
                }
            ]
        }

        FINAL VALIDATION:
        Before returning results, verify each Federal program has:
        1. Specific dollar amounts (no X,XXX)
        2. Income-based variations
        3. Per-measure breakdowns
        4. Maximum benefit caps
        5. Energy savings tiers (for HOMES)
        
        Here are the search results to analyze:
        ${resultsText}`;

        console.log('Making OpenAI API call with prompt:', prompt);
        
        const completion = await openai.chat.completions.create({
            model: "gpt-4-32k",
            messages: [
                {
                    role: "system",
                    content: "You are a Federal energy rebate specialist. You MUST use the exact amount formats provided. When you see total program budgets or 'varies', you MUST convert them to specific per-household amounts. For IRA, use exact equipment amounts. For HOMES, show savings tiers and income-based amounts."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.3,
            max_tokens: 4000,
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
    console.log('\x1b[35m%s\x1b[0m', `[${requestId}] 📝 REQUEST RECEIVED`);

    try {
        if (event.httpMethod !== 'POST') {
            return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
        }

        const body = JSON.parse(event.body);
        
        // Extract only the fields we need
        const searchRequest = {
            query: String(body.query || '').trim(),
            category: String(body.category || '').trim(),
            timestamp: new Date().toISOString()
        };

        // Log with explicit formatting
        console.log('\x1b[32m%s\x1b[0m', 'API → Google | Search Request:', 
            JSON.stringify({
                query: searchRequest.query,
                category: searchRequest.category,
                timestamp: searchRequest.timestamp
            }, null, 2)
        );
        
        // Only handle Federal category for now
        if (searchRequest.category !== 'Federal') {
            return {
                statusCode: 200,
                body: JSON.stringify({
                    programs: [],
                    message: 'Only Federal category is supported for now'
                })
            };
        }
        
        // Perform search with clean query
        const googleResults = await performGoogleSearch(searchRequest.query);

        // Log what we're sending back
        console.log('\x1b[32m%s\x1b[0m', 'Google → API | Results received:');
        console.log('\n===> Google Search Response');
        console.log(JSON.stringify(googleResults.data, null, 2));
        console.log('<=== End Google Search Response\n');

        // Return Google results directly
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                googleResults: googleResults.data,
                resultCount: googleResults.items.length,
                searchRequest: {
                    query: searchRequest.query,
                    category: searchRequest.category,
                    timestamp: searchRequest.timestamp
                }
            })
        };

        /* COMMENTED OUT: All OpenAI Analysis Code
        const analysis = await analyzeResults(results, category);
        
        // Store in cache
        if (cacheInitialized) {
            console.log('Attempting to store Federal results in cache:', {
                query: searchRequest.query,
                category,
                hasResults: results.length > 0,
                hasAnalysis: !!analysis,
            });
            
            try {
                await cache.appendRow({
                    query: searchRequest.query,
                    category,
                    googleResults: JSON.stringify(results),
                    openaiAnalysis: JSON.stringify(analysis),
                    timestamp: new Date().toISOString(),
                    hash: cache._generateHash(searchRequest.query + category),
                    googleSearchCache: 'Search',
                    openaiSearchCache: 'Search'
                });
                console.log('✅ Successfully stored results in cache');
            } catch (error) {
                console.error('❌ Failed to store in cache:', error);
            }
        }

        return {
            statusCode: 200,
            body: JSON.stringify(analysis)
        };
        */
    } catch (error) {
        console.error('\x1b[31m%s\x1b[0m', `[${requestId}] ❌ Error:`, error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Search failed',
                message: error.message,
                timestamp: new Date().toISOString()
            })
        };
    }
};
