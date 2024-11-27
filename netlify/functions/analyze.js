const OpenAI = require('openai');

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

async function analyzeResults(results, category) {
    // Build prompt for OpenAI
    const resultsText = results.map(r => `Title: ${r.title}\nDescription: ${r.snippet}`).join('\n\n');
    const prompt = `CRITICAL TASK: Analyze these ${category} rebate programs and extract comprehensive information.

    MANDATORY REQUIREMENTS:
    1. Generate a precise, informative summary for EACH program
    2. Summary MUST be exactly 320 characters long
    3. Capture the core purpose, key benefits, and primary eligibility criteria
    4. Write in clear, concise language
    5. Avoid technical jargon
    6. Focus on what makes each program unique and valuable

    Return a JSON object with this EXACT structure:
    {
        "programs": [
            {
                "name": "Program Name",
                "summary": "REQUIRED: Exactly 320-character summary capturing program's essence. Must include core purpose, key benefits, and primary eligibility.",
                "amount": "Exact rebate amount",
                "requirements": ["Key requirements"],
                "deadline": "Program deadline"
            }
        ]
    }

    Programs to analyze:
    ${resultsText}

    IMPORTANT: If you CANNOT generate a 320-character summary, provide the most comprehensive summary possible, but NEVER return an empty summary.`;

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

        // Parse the response content as JSON
        const parsedContent = JSON.parse(completion.choices[0].message.content);

        // Validate that each program has a summary
        const validatedPrograms = (parsedContent.programs || []).map(program => ({
            name: program.name || 'Program Name Not Available',
            summary: (program.summary || 'No summary available').slice(0, 320),
            amount: program.amount || 'Contact for details',
            requirements: Array.isArray(program.requirements) ? program.requirements : [],
            deadline: program.deadline || 'Ongoing'
        }));

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

exports.handler = async function(event, context) {
    // Set CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204,
            headers,
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const { results, category } = JSON.parse(event.body);
        
        if (!results || !category) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Missing required parameters' })
            };
        }

        const analysis = await analyzeResults(results, category);
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(analysis)
        };
    } catch (error) {
        console.error('Analysis Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal server error' })
        };
    }
};
