export const handler = async (event, context) => {
    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            }
        };
    }

    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    // Return initial SSE headers
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        },
        body: 'data: {"message": "Logs connection established", "timestamp": "' + new Date().toISOString() + '"}\n\n'
    };
}; 