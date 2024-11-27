const OpenAI = require('openai');

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

async function analyzeResults(results, category) {
    // Build prompt for OpenAI
    const resultsText = results.map(r => `Title: ${r.title}\nDescription: ${r.snippet}`).join('\n\n');
    const prompt = `Analyze these ${category} rebate programs and extract key information in JSON format. Focus on finding specific rebate amounts, deadlines, and requirements. Return a JSON object with this exact structure:
    {
        "programs": [
            {
                "name": "Program Name",
                "amount": "Extract exact rebate amount (e.g. '$500', 'Up to $2000', '30% of cost')",
                "requirements": ["List each key requirement as a separate item"],
                "deadline": "Extract specific deadline if mentioned"
            }
        ]
    }

    Important instructions:
    1. For the amount field, always include the dollar sign ($) if it's a monetary value
    2. If multiple amounts are mentioned, list the highest or most relevant one
    3. If no specific amount is found, use "Amount varies" or "Contact for details"
    4. Keep requirements brief but specific
    5. For deadline, use "Ongoing" if no specific date is mentioned

    Here are the programs to analyze:

    ${resultsText}`;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "You are a helpful assistant that analyzes rebate programs and extracts structured information. Be precise in extracting monetary values and always include the dollar sign ($) for amounts. If an amount is a percentage, format it clearly (e.g., '30% of cost')."
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

        return {
            category: category,
            programs: parsedContent.programs || [],
            timestamp: new Date().toISOString(),
            disclaimer: "Note: Please verify all information with the official program websites. Terms and conditions may have changed."
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
