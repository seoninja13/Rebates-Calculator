const OpenAI = require('openai');

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

async function analyzeResults(results, category) {
    // Build prompt for OpenAI
    const resultsText = results.map(r => `Title: ${r.title}\nDescription: ${r.snippet}`).join('\n\n');
    const prompt = `Analyze these ${category} rebate programs and extract key information in JSON format. You MUST find and extract a rebate amount for each program, even if it requires inference. Return a JSON object with this exact structure:
    {
        "programs": [
            {
                "name": "Program Name",
                "amount": "REQUIRED - Use one of these formats:
                          - Exact amount: '$500', '$1,000', etc.
                          - Range: 'Up to $2,000', '$500-$1,500'
                          - Percentage: '30% of cost', 'Up to 80%'
                          - Variable: '$X per square foot', '$X per kW'
                          - If amount unclear: 'Contact for details'",
                "requirements": ["List each key requirement as a separate item"],
                "deadline": "Extract specific deadline if mentioned"
            }
        ]
    }

    Important instructions for amount field:
    1. The amount field is REQUIRED for each program
    2. Always include the dollar sign ($) for monetary values
    3. If multiple amounts are mentioned, list the highest or most comprehensive one
    4. Look for keywords like 'rebate', 'incentive', 'savings', 'credit', 'reimbursement'
    5. If amount is mentioned as a range, include both ends (e.g., '$500-$2,500')
    6. For percentage-based rebates, clearly state the percentage
    7. For variable amounts, explain the calculation basis
    8. Only use 'Contact for details' if no amount information can be inferred

    Here are the programs to analyze:

    ${resultsText}`;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "You are a helpful assistant that analyzes rebate programs and extracts structured information. You must ALWAYS find and include a rebate amount for each program. Be thorough in searching for amount information and format it consistently. If the exact amount isn't stated, provide the best approximation based on available information."
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

        // Validate that each program has an amount
        const validatedPrograms = parsedContent.programs.map(program => ({
            ...program,
            amount: program.amount || 'Contact for details'
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
