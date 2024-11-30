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

// CORS configuration
app.use(cors());  // Allow all origins for local development

// Initialize cache
const cache = new GoogleSheetsCache();
cache.initialize().catch(console.error);

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Middleware
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
            console.log('✅ CACHE HIT: Results retrieved from cache');
            console.log('📦 Cache details:', { query, category });
            // Add source indicator to each program
            cachedResults.programs = cachedResults.programs.map(program => ({
                ...program,
                source: 'cache'
            }));
            console.log('Program with source:', cachedResults.programs[0]); // Debug log
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
        console.log('\n========== NEW ANALYSIS REQUEST ==========');
        const { query, category, county } = req.body;
        console.log('📝 Analyze request:', { query, category, county });
        
        if (!query || !category) {
            console.error('❌ Missing parameters:', { query, category });
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        // First check cache
        console.log('\n🔍 Checking cache...');
        const cachedResults = await cache.get(query, category);
        if (cachedResults) {
            console.log('✅ CACHE HIT: Results retrieved from cache');
            console.log('📦 Cache details:', { query, category });
            // Add source indicator to each program
            cachedResults.programs = cachedResults.programs.map(program => ({
                ...program,
                source: 'cache'
            }));
            console.log('Program with source:', cachedResults.programs[0]); // Debug log
            return res.json(cachedResults);
        }

        // Perform Google search
        console.log('\n🔎 CACHE MISS: Performing fresh Google search');
        const searchQuery = `${query} ${category === 'Federal' ? 'federal government' : category} energy rebate program incentive`;
        console.log('🔍 Search query:', searchQuery);
        
        const searchResults = await performGoogleSearch(searchQuery);
        console.log(`📊 Found ${searchResults.length} results from Google Search`);
        
        if (!searchResults || searchResults.length === 0) {
            console.warn('⚠️ No search results found');
            return res.status(404).json({ error: 'No search results found' });
        }

        // Map search results to our format
        const formattedResults = searchResults.map(item => ({
            title: item.title,
            link: item.link,
            snippet: item.snippet
        }));

        console.log('\n🤖 Analyzing results with OpenAI...');
        const analysis = await analyzeResults(formattedResults, category);
        console.log('✨ Analysis results:', JSON.stringify(analysis, null, 2));
        
        if (!analysis || !analysis.programs || analysis.programs.length === 0) {
            console.warn('⚠️ No programs found in analysis');
            return res.status(404).json({ error: 'No programs found in analysis' });
        }
        
        // Add source indicator to each program
        analysis.programs = analysis.programs.map(program => ({
            ...program,
            source: 'search'
        }));
        console.log('Program with source:', analysis.programs[0]); // Debug log

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
            temperature: 0,
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
                        temperature: 0,
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
        console.error('❌ OpenAI API Error:', error);
        throw error;
    }
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
