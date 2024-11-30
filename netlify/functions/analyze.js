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
cache.initialize().catch(console.error);

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
            // Add fallback search terms for federal rebates
            const fallbackQueries = [
                'federal energy efficiency tax credits',
                'federal renewable energy rebates',
                'US government energy incentives',
                'federal solar tax credits'
            ];
            
            for (const fallbackQuery of fallbackQueries) {
                const fallbackUrl = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(fallbackQuery)}&num=10`;
                console.log(`🔄 Trying fallback search: ${fallbackQuery}`);
                
                const fallbackResponse = await fetch(fallbackUrl);
                const fallbackData = await fallbackResponse.json();
                
                if (fallbackData.items && fallbackData.items.length > 0) {
                    console.log(`✅ Found results with fallback query: ${fallbackQuery}`);
                    return fallbackData.items;
                }
            }
            
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
    // Log raw search results
    console.log('Raw Search Results:', JSON.stringify(results, null, 2));

    // Build prompt for OpenAI
    const resultsText = JSON.stringify(results, null, 2);
    console.log('Results Text for OpenAI:', resultsText);

    if (!resultsText) {
        console.error('❌ NO SEARCH RESULTS FOUND');
        return {
            category: category,
            programs: [],
            error: 'No search results found',
            timestamp: new Date().toISOString()
        };
    }

    const prompt = `Extract information about ${category} energy rebate programs from the search results. 

        CRITICAL REQUIREMENT - SUMMARY LENGTH:
        The summary field should ideally be between 240 and 520 characters, but longer summaries are acceptable.
        - Target range: 240-520 characters (about 3-7 sentences)
        - Minimum: 240 characters (required)
        - Current summaries are too short and need to be expanded
        - Include more details about benefits, eligibility, and process
        - Use complete sentences and active voice

        REQUIREMENTS FOR PROGRAMS:
        - Federal programs must be available to all California residents
        - State programs must be California-specific
        - County programs should include both county-specific and relevant utility programs
        
        For each program, you MUST provide ALL of the following fields:
        1. programName: Full official program name
        2. programType: Must be one of [Rebate/Grant/Tax Credit/Low-Interest Loan]
        3. summary: CRITICAL - Write a detailed summary (aim for 240-520 characters) that includes:
           * Comprehensive program description
           * Key benefits and financial incentives
           * Primary and secondary eligibility criteria
           * Application process overview
        4. amount: Specific rebate amount or range (use $ and commas)
        5. eligibleProjects: MUST include applicable items:
           * Solar panels
           * HVAC systems
           * Insulation
           * Electric vehicles
           * Energy-efficient appliances
           * Home improvements
        6. eligibleRecipients: MUST specify ALL that apply:
           * Homeowners
           * Businesses
           * Municipalities
           * Income requirements
           * Other qualifying criteria
        7. geographicScope: MUST be one of:
           * Nationwide
           * State-specific
           * County/city-specific
           * Utility service area
        8. requirements: MUST include ALL applicable items:
           * Application forms
           * Proof of purchase/installation
           * Contractor requirements
           * Energy audits
           * Income verification
           * Property documentation
        9. applicationProcess: 1-2 line description of how to apply
        10. deadline: Specific date or "Ongoing"
        11. websiteLink: Official program URL
        12. contactInfo: MUST include when available:
            * Phone numbers
            * Email addresses
            * Office locations
        13. processingTime: Expected processing time (e.g., "6-8 weeks" or "30 days after approval")
        
        Return the data as a JSON object with this structure:
        {
          "programs": [
            {
              "programName": "string",
              "programType": "string",
              "summary": "string (aim for 240-520 chars)",
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
            }
          ]
        }`;

    try {
        console.log('🤖 Sending to OpenAI with prompt length:', prompt.length);
        const completion = await openai.chat.completions.create({
            model: "gpt-4-1106-preview",
            messages: [
                {
                    role: "system",
                    content: "You are a precise data extraction assistant that always returns valid JSON. Your primary focus is creating detailed program summaries between 240-520 characters, but longer summaries are acceptable. Current summaries are too short and need more detail. Include comprehensive information about benefits, eligibility, process, and requirements. Never return summaries shorter than 240 characters. For Federal and State programs, they must be available to all California residents. For County programs, include both county-specific programs and relevant utility/local government incentives available to county residents."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7,
            max_tokens: 2000,
            response_format: { type: "json_object" }
        });

        console.log('✅ OpenAI Response received');
        
        let programs = [];
        try {
            const content = completion.choices[0].message.content;
            console.log('Raw OpenAI response:', content);
            const parsedResponse = JSON.parse(content);
            console.log('📊 Parsed OpenAI response');
            
            // Validate summaries before accepting the response
            if (parsedResponse.programs && Array.isArray(parsedResponse.programs)) {
                let allSummariesValid = true;
                parsedResponse.programs.forEach((program, index) => {
                    if (!program.summary || program.summary.length < 240) {
                        console.error(`Invalid summary length for program ${index + 1}:`, {
                            programName: program.programName,
                            summaryLength: program.summary ? program.summary.length : 0,
                            required: '240+'
                        });
                        allSummariesValid = false;
                    }
                });
                
                if (!allSummariesValid) {
                    // If any summaries are invalid, try one more time with stronger emphasis
                    console.log('🔄 Retrying due to invalid summary lengths...');
                    const retryCompletion = await openai.chat.completions.create({
                        model: "gpt-4-1106-preview",
                        messages: [
                            {
                                role: "system",
                                content: "CRITICAL: Previous summaries were too short. You MUST write detailed summaries that are at least 240 characters (aim for 240-520, but longer is acceptable). Include comprehensive details about benefits, eligibility, process, and requirements. This is your final attempt to provide adequate length summaries."
                            },
                            {
                                role: "user",
                                content: prompt
                            }
                        ],
                        temperature: 0.7,
                        max_tokens: 2000,
                        response_format: { type: "json_object" }
                    });
                    const retryContent = retryCompletion.choices[0].message.content;
                    console.log('Raw retry response:', retryContent);
                    programs = JSON.parse(retryContent);
                } else {
                    programs = parsedResponse;
                }
            }
        } catch (parseError) {
            console.error('❌ Error parsing OpenAI response:', parseError);
            console.log('Raw OpenAI response:', completion.choices[0].message.content);
            throw new Error('Failed to parse OpenAI response: ' + parseError.message);
        }

        // Final validation of programs
        const validatedPrograms = (programs.programs || []).map(program => {
            const summary = program.summary || "Summary Not Available";
            console.log('\n=== Summary Length Analysis ===');
            console.log(`Program: ${program.programName}`);
            console.log(`Original Length: ${summary.length} characters`);
            console.log(`Required Minimum: 240 characters`);
            
            let finalSummary = summary;
            
            if (summary.length < 240) {
                console.error('❌ ERROR: Summary is too short!', {
                    programName: program.programName,
                    length: summary.length,
                    required: '240+',
                    summary: summary.slice(0, 50) + '...'
                });
                
                finalSummary = `[Error: Summary length (${summary.length} chars) is below minimum requirement of 240 characters. This program needs manual review.]`;
            } else {
                console.log('✅ Summary length meets minimum requirement');
            }
            
            console.log(`Final Length: ${finalSummary.length} characters`);
            console.log('=== End Summary Analysis ===\n');
            
            return {
                programName: program.programName || "Program Name Not Available",
                programType: program.programType || "Program Type Not Available",
                summary: finalSummary,
                amount: program.amount || "Amount Not Available",
                eligibleProjects: Array.isArray(program.eligibleProjects) ? program.eligibleProjects : ["Not Specified"],
                eligibleRecipients: Array.isArray(program.eligibleRecipients) ? program.eligibleRecipients : ["Not Specified"],
                geographicScope: program.geographicScope || "Geographic Scope Not Available",
                requirements: Array.isArray(program.requirements) ? program.requirements : ["Requirements Not Available"],
                applicationProcess: program.applicationProcess || "Application Process Not Available",
                deadline: program.deadline || "Deadline Not Available",
                websiteLink: program.websiteLink || "Website Link Not Available",
                contactInfo: program.contactInfo || "Contact Information Not Available",
                processingTime: program.processingTime || "Processing Time Not Available"
            };
        });

        console.log(`✅ Successfully processed ${validatedPrograms.length} programs for category: ${category}`);
        
        return {
            category: category,
            programs: validatedPrograms,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error('OpenAI API Error:', error);
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

            // Extract and validate query and category
            const { query, category } = body;
            console.log(`[${requestId}] 🔍 Extracted parameters:`, { query, category });

            if (!query || !category) {
                const error = 'Missing required parameters';
                console.error(`[${requestId}] ❌ VALIDATION ERROR:`, {
                    error,
                    received: { query, category }
                });
                return {
                    statusCode: 400,
                    body: JSON.stringify({ 
                        error,
                        received: { query, category }
                    })
                };
            }

            // Check cache for Google search results
            let searchResults;
            const cachedSearchResults = await cache.get(query, category);
            if (cachedSearchResults) {
                console.log(`[${requestId}] 📦 Using cached search results`);
                searchResults = cachedSearchResults;
            } else {
                console.log(`[${requestId}] 🔍 Cache miss - performing new Google search`);
                searchResults = await performGoogleSearch(query);
                if (searchResults && searchResults.length > 0) {
                    console.log(`[${requestId}] 💾 Caching Google search results`);
                    await cache.set(query, category, searchResults, 'google');
                }
            }

            // Check cache for analysis results
            const cachedAnalysis = await cache.get(query + '_analysis', category);
            if (cachedAnalysis) {
                console.log(`[${requestId}] 📦 Using cached analysis results`);
                const response = {
                    statusCode: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Content-Type',
                        'Access-Control-Allow-Methods': 'POST, OPTIONS'
                    },
                    body: JSON.stringify({
                        category,
                        programs: cachedAnalysis.programs.map(program => ({
                            programName: program.programName || "Program Name Not Available",
                            programType: program.programType || "Program Type Not Available",
                            summary: program.summary || "Summary Not Available",
                            amount: program.amount || "Amount Not Available",
                            eligibleProjects: Array.isArray(program.eligibleProjects) ? program.eligibleProjects : ["Not Specified"],
                            eligibleRecipients: Array.isArray(program.eligibleRecipients) ? program.eligibleRecipients : ["Not Specified"],
                            geographicScope: program.geographicScope || "Geographic Scope Not Available",
                            requirements: Array.isArray(program.requirements) ? program.requirements : ["Requirements Not Available"],
                            applicationProcess: program.applicationProcess || "Application Process Not Available",
                            deadline: program.deadline || "Deadline Not Available",
                            websiteLink: program.websiteLink || "Website Link Not Available",
                            contactInfo: program.contactInfo || "Contact Information Not Available",
                            processingTime: program.processingTime || "Processing Time Not Available"
                        })),
                        source: cachedAnalysis.source,
                        timestamp: new Date().toISOString()
                    })
                };
                console.log(`[${requestId}] ✅ RESPONSE SENT (from cache):`, {
                    statusCode: response.statusCode,
                    timestamp: new Date().toISOString(),
                    programCount: cachedAnalysis.programs.length,
                    source: cachedAnalysis.source
                });
                return response;
            }

            // Analyze results if not in cache
            console.log(`[${requestId}] 🧠 Cache miss - performing new OpenAI analysis`);
            const analysisResults = await analyzeResults(searchResults, category);
            
            // Cache analysis results
            if (analysisResults) {
                console.log(`[${requestId}] 💾 Caching OpenAI analysis results`);
                await cache.set(query + '_analysis', category, analysisResults, 'openai');
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
                    ...analysisResults,
                    query,
                    category
                })
            };

            console.log(`[${requestId}] ✅ RESPONSE SENT (fresh analysis):`, {
                statusCode: response.statusCode,
                timestamp: new Date().toISOString(),
                programCount: analysisResults.programs.length
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
