// CommonJS syntax for better compatibility
const express = require('express');
const path = require('path');
const cors = require('cors');
const fetch = require('node-fetch');
const dotenv = require('dotenv');
const { OpenAI } = require('openai');
const fs = require('fs');

// Set up logging
const logFile = path.join(__dirname, 'server.log');
const log = (message) => {
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp}: ${message}\n`;
    fs.appendFileSync(logFile, logMessage);
    console.log(message);
};

// Clear previous log file
fs.writeFileSync(logFile, '');

// Load environment variables
dotenv.config({ path: path.join(__dirname, 'backend', '.env') });

// Verify environment variables are loaded
const envStatus = {
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY ? '✅ Present' : '❌ Missing',
    GOOGLE_SEARCH_ENGINE_ID: process.env.GOOGLE_SEARCH_ENGINE_ID ? '✅ Present' : '❌ Missing',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? '✅ Present' : '❌ Missing'
};
log('Environment variables loaded: ' + JSON.stringify(envStatus, null, 2));

const app = express();
const port = 3000;

// Enable CORS for all routes
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Serve static files from the root directory
app.use(express.static(__dirname));

// Log all incoming requests
app.use((req, res, next) => {
    log(`${req.method} ${req.url}`);
    next();
});

// API endpoint for analyze
app.post('/api/analyze', async (req, res) => {
    log('Received analyze request');
    try {
        const { query, category } = req.body;
        
        log('📝 Analyze request: ' + JSON.stringify({ query, category }));

        if (!process.env.GOOGLE_API_KEY || !process.env.GOOGLE_SEARCH_ENGINE_ID) {
            throw new Error('Missing required Google API configuration');
        }

        if (!process.env.OPENAI_API_KEY) {
            throw new Error('Missing required OpenAI API configuration');
        }

        // Perform Google search
        const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${process.env.GOOGLE_API_KEY}&cx=${process.env.GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&num=10`;
        log('🔍 Performing Google search...');
        log('Search URL: ' + searchUrl.replace(process.env.GOOGLE_API_KEY, 'HIDDEN_KEY'));
        
        const searchResponse = await fetch(searchUrl);
        if (!searchResponse.ok) {
            const errorText = await searchResponse.text();
            log('Google Search API Error: ' + JSON.stringify({
                status: searchResponse.status,
                statusText: searchResponse.statusText,
                error: errorText
            }));
            throw new Error(`Google search failed: ${searchResponse.status} - ${errorText}`);
        }
        
        const searchData = await searchResponse.json();
        log('✅ Google search completed');

        // Process with OpenAI
        log('🤖 Processing with OpenAI...');
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });

        const prompt = `Extract information about ${category} energy rebate programs from the search results. Important requirements:

        1. For Federal programs: Only include programs available to ALL California residents
        2. For State programs: Only include programs available to ALL California residents
        3. For County programs: Only include programs specifically available to residents of the specified county
        4. Ensure there is NO overlap between Federal, State, and County programs
        5. Skip any program that doesn't explicitly state its eligibility requirements

        For each program, provide:
        - programName: Full program name
        - summary: CRITICAL - Must be between 240 and 520 characters. Provide a detailed, informative description focusing on:
          * Core purpose and key benefits of the program
          * Primary and secondary eligibility criteria
          * Financial incentives and support provided
          * Unique program features and advantages
          * Write in active voice and avoid technical jargon
          * Include specific details about the application process
        - programType: Type of program (Federal, State, or County)
        - amount: Specific rebate amount or range
        - eligibleProjects: List of projects that qualify
        - eligibleRecipients: Who can apply
        - geographicScope: Geographic area covered
        - requirements: List of specific eligibility requirements
        - applicationProcess: How to apply
        - deadline: Application deadline or status
        - websiteLink: Program's URL
        - contactInfo: Contact information
        - processingTime: Expected processing time
        - source: Source website

        Return the data in this exact JSON format:
        {
          "programs": [
            {
              "programName": "string",
              "summary": "string (240-520 characters)",
              "programType": "string",
              "amount": "string",
              "eligibleProjects": ["string"],
              "eligibleRecipients": ["string"],
              "geographicScope": "string",
              "requirements": ["string"],
              "applicationProcess": "string",
              "deadline": "string",
              "websiteLink": "string",
              "contactInfo": "string",
              "processingTime": "string",
              "source": "string"
            }
          ]
        }

        Search results to analyze: ${JSON.stringify(searchData.items, null, 2)}`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4-1106-preview",
            messages: [
                {
                    role: "system",
                    content: "You are a precise data extraction assistant that always returns valid JSON. Your task is to extract detailed information about energy rebate programs from search results, ensuring strict adherence to eligibility requirements and format guidelines. Summaries MUST be between 240 and 520 characters, providing comprehensive details about program benefits, eligibility, and process. For Federal and State programs, they must be available to all California residents. For County programs, they must be specifically available to the target county's residents. Avoid any duplicate programs across categories."
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

        if (!completion.choices || !completion.choices[0] || !completion.choices[0].message || !completion.choices[0].message.content) {
            throw new Error('Invalid OpenAI response structure');
        }

        const analyzedData = JSON.parse(completion.choices[0].message.content);
        
        // Validate and normalize the response
        const normalizedPrograms = (analyzedData.programs || []).map(program => {
            const summary = program.summary || "Summary Not Available";
            // Enforce summary length requirements
            if (summary.length < 240) {
                log(`Summary too short (${summary.length} chars) for program: ${program.programName}`);
            }
            log(`Program Summary (${summary.length} chars): ${summary}`);
            
            return {
                programName: program.programName || "Program Name Not Available",
                summary: summary.slice(0, 520), // Keep maximum 520 chars
                programType: program.programType || "Program Type Not Available",
                amount: program.amount || "Amount Not Available",
                eligibleProjects: program.eligibleProjects || ["Not Specified"],
                eligibleRecipients: program.eligibleRecipients || ["Not Specified"],
                geographicScope: program.geographicScope || "Geographic Scope Not Available",
                requirements: program.requirements || ["Requirements Not Available"],
                applicationProcess: program.applicationProcess || "Application Process Not Available",
                deadline: program.deadline || "Deadline Not Available",
                websiteLink: program.websiteLink || "Website Link Not Available",
                contactInfo: program.contactInfo || "Contact Information Not Available",
                processingTime: program.processingTime || "Processing Time Not Available",
                source: program.source || "Source Not Available"
            };
        });

        log('✅ OpenAI processing completed with ${normalizedPrograms.length} programs extracted');

        res.json({
            category: category,
            programs: normalizedPrograms,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        log('❌ API Error: ' + error.message);
        log('Full error stack: ' + error.stack);
        if (error.response) {
            log('Error response: ' + await error.response.text());
        }
        res.status(500).json({ 
            error: error.message,
            stack: error.stack,
            category: req.body.category,
            programs: [],
            timestamp: new Date().toISOString()
        });
    }
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(port, () => {
    log(`Server running at http://localhost:${port}`);
    log(`API endpoint available at http://localhost:${port}/api/analyze`);
});
