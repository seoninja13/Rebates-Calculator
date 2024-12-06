import cache from './sheets-cache.mjs';

// Helper function to get search queries
function getSearchQueries(category, county) {
    switch (category) {
        case 'Federal':
            return [
                'federal energy rebate programs california',
                'US government energy incentives california'
            ];
        case 'State':
            return [
                'California state energy rebate programs',
                'California energy incentives'
            ];
        case 'County':
            return [
                `${county} County local energy rebate programs`,
                `${county} County energy efficiency incentives`
            ];
        default:
            throw new Error(`Invalid category: ${category}`);
    }
}

export const handler = async (event, context) => {
    const requestId = Math.random().toString(36).substring(7);
    console.log(`[${requestId}] 📝 CACHE CHECK REQUEST RECEIVED`);

    try {
        if (event.httpMethod !== 'POST') {
            return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
        }

        const { query, category, county } = JSON.parse(event.body);
        
        // Get all possible queries for this category
        const queries = getSearchQueries(category, county);
        const combinedCacheKey = queries.join(' | ');
        
        // Check cache first before any operations
        if (cache.enabled) {
            try {
                console.log(`[${requestId}] 🔍 Checking cache for ${category}`);
                const cachedResults = await cache.getCacheEntry(combinedCacheKey, category);
                
                if (cachedResults && cachedResults.results && cachedResults.analysis) {
                    console.log(`[${requestId}] ✅ Cache hit for ${category}`);
                    
                    // Log cache hit
                    await cache.logSearchOperation(combinedCacheKey, category, {
                        results: cachedResults.results,
                        analysis: cachedResults.analysis,
                        source: {
                            googleSearch: 'Cache',
                            openaiAnalysis: 'Cache'
                        }
                    });

                    // Return cached results immediately
                    return {
                        statusCode: 200,
                        headers: {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        },
                        body: JSON.stringify({
                            found: true,
                            programs: cachedResults.analysis.programs || [],
                            source: {
                                googleSearch: 'Cache',
                                openaiAnalysis: 'Cache'
                            }
                        })
                    };
                }
                console.log(`[${requestId}] ❌ Cache missing for ${category}`);
                return {
                    statusCode: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    body: JSON.stringify({ found: false })
                };
            } catch (cacheError) {
                console.error(`[${requestId}] ❌ Cache error:`, cacheError);
                return {
                    statusCode: 500,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    body: JSON.stringify({ error: 'Cache lookup failed' })
                };
            }
        }

        return {
            statusCode: 503,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ error: 'Cache not initialized' })
        };
    } catch (error) {
        console.error(`[${requestId}] ❌ Error:`, error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Cache check failed',
                message: error.message,
                timestamp: new Date().toISOString(),
                details: error.stack
            })
        };
    }
}; 