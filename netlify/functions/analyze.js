const OpenAI = require('openai');
const fetch = require('node-fetch');

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Google Search API configuration
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID;

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

async function analyzeResults(results, category) {
    // Build prompt for OpenAI
    const resultsText = results.map(r => `Title: ${r.title}\nDescription: ${r.snippet}`).join('\n\n');
    const prompt = `CRITICAL TASK: Analyze these ${category} rebate programs and extract comprehensive information.

    MANDATORY REQUIREMENTS FOR EACH PROGRAM:
    Generate a PRECISE 320-character summary
    MUST include:
       - Core purpose of the program
       - Key financial benefits
       - Primary eligibility criteria
    Write in ACTIVE, CLEAR language
    AVOID technical jargon
    HIGHLIGHT unique program features

    CRITICAL: If you CANNOT create a 320-character summary, 
    you MUST provide the MOST COMPREHENSIVE summary possible.
    NEVER return an empty or generic summary.

    REQUIRED JSON FORMAT:
    {
        "programs": [
            {
                "name": "Exact Program Name",
                "summary": "REQUIRED: Exactly 320 characters explaining program's core value, benefits, and who qualifies.",
                "amount": "Precise rebate amount",
                "requirements": ["Key eligibility points"],
                "deadline": "Specific program end date"
            }
        ]
    }

    Programs to analyze:
    ${resultsText}

    FINAL INSTRUCTION: Ensure EVERY program has a MEANINGFUL, INFORMATIVE summary.`;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "You are a precise, detail-oriented assistant specializing in extracting and summarizing rebate program information. Your summaries must be informative, concise, and exactly 320 characters. Focus on clarity, key benefits, and unique program features."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0,
            max_tokens: 1000,
            response_format: { type: "json_object" }
        });

        // Log the raw response for debugging
        console.log('Raw OpenAI Response:', JSON.stringify(completion, null, 2));

        // Defensive parsing with more error handling
        let parsedContent;
        try {
            parsedContent = JSON.parse(completion.choices[0].message.content);
        } catch (parseError) {
            console.error('JSON Parsing Error:', parseError);
            console.error('Raw content:', completion.choices[0].message.content);
            throw new Error('Failed to parse OpenAI response');
        }

        // Validate that each program has a summary
        const validatedPrograms = (parsedContent.programs || []).map(program => {
            const summary = program.summary || 'No summary available';
            console.log(`Program Summary: ${summary}`);
            return {
                name: program.name || 'Program Name Not Available',
                summary: summary.slice(0, 320),
                amount: program.amount || 'Contact for details',
                requirements: Array.isArray(program.requirements) ? program.requirements : [],
                deadline: program.deadline || 'Ongoing'
            };
        });

        return {
            category: category,
            programs: validatedPrograms,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error('OpenAI API Error:', error);
        throw new Error('Failed to analyze results');
    }
}

// Export the handler function
exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const body = JSON.parse(event.body);
        const { query, category } = body;

        if (!query || !category) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing required parameters: query and category' })
            };
        }

        // Perform Google search
        console.log('Performing search for:', query);
        const searchResults = await performGoogleSearch(query);
        
        // Analyze the results
        const analysis = await analyzeResults(searchResults, category);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: JSON.stringify(analysis)
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal server error' })
        };
    }
};
