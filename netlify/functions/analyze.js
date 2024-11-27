const OpenAI = require('openai');

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

async function analyzeResults(results, category) {
    // Build prompt for OpenAI
    const resultsText = results.map(r => `Title: ${r.title}\nDescription: ${r.snippet}`).join('\n\n');
    const prompt = `Analyze these ${category} rebate programs and provide a summary with the following format:

    Category: [Main category of rebates]
    Top 3 Programs:
    1. [Program Name]
       - Rebate Amount: [Amount if available]
       - Key Requirements: [Brief list]
       - Deadline: [If mentioned]
       
    2. [Program Name]
       ...
    
    3. [Program Name]
       ...

    Here are the programs to analyze:

    ${resultsText}`;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "You are a helpful assistant that analyzes rebate programs and summarizes key information."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7,
            max_tokens: 500
        });

        return {
            timestamp: new Date().toISOString(),
            content: completion.choices[0].message.content,
            disclaimer: "Note: Please verify all information with the official program websites. Terms and conditions may have changed."
        };
    } catch (error) {
        console.error('OpenAI API Error:', error);
        throw new Error('Failed to analyze results');
    }
}

exports.handler = async (event, context) => {
    // Add CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',  // More permissive for testing
        'Access-Control-Allow-Headers': 'Content-Type, Accept, Origin',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Max-Age': '86400'  // 24 hours cache for preflight
    };

    // Handle preflight request
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204,  // No content needed for preflight
            headers,
            body: ''  // Empty body for OPTIONS request
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
