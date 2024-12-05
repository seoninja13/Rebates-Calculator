import { GoogleSheetsCache } from './services/sheets-cache.mjs';

export const handler = async (event) => {
    const requestId = Math.random().toString(36).substring(7);
    console.log(`[${requestId}] 🔍 NETLIFY: Cache check request received`);

    // Handle CORS preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            }
        };
    }

    try {
        if (event.httpMethod !== 'POST') {
            throw new Error('Method not allowed');
        }

        // Parse and validate request body
        if (!event.body) {
            throw new Error('Request body is required');
        }

        const body = JSON.parse(event.body);
        const { category, county } = body;

        // Validate required fields
        if (!category || !county) {
            console.log(`[${requestId}] ❌ NETLIFY: Missing required fields`, { category, county });
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    error: 'Missing required fields',
                    required: ['category', 'county'],
                    received: { category, county }
                })
            };
        }

        console.log(`[${requestId}] 📝 NETLIFY: Check cache request:`, {
            category,
            county,
            body: JSON.stringify(body)
        });

        const cache = new GoogleSheetsCache();
        const initialized = await cache.initialize();

        if (!initialized) {
            console.log(`[${requestId}] ❌ NETLIFY: Cache not initialized`);
            console.log(`
%c
╔════════════════════════════════════════╗
║     NETLIFY CACHE NOT INITIALIZED      ║
║    Category: ${category.padEnd(20)}    ║
║    County: ${(county || 'N/A').padEnd(22)}    ║
╚════════════════════════════════════════╝
`, 'color: #FF0000; font-weight: bold; font-size: 14px;');
            return {
                statusCode: 503,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    error: 'Cache not initialized',
                    category,
                    county
                })
            };
        }

        // Generate cache key using same format as local environment
        const cacheKey = `${category}:${county}`;
        console.log(`[${requestId}] 🔑 NETLIFY: Cache Check Debug:`, {
            receivedQuery: body.query,
            receivedCategory: category,
            receivedCounty: county,
            generatedCacheKey: cacheKey,
            normalizedKey: cache.netlifyGenerateHash(cacheKey, category)
        });

        const cachedResult = await cache.netlifyGetCache(cacheKey, category);
        
        if (cachedResult) {
            // Big visual indicator for cache hit - Google Results
            console.log(`
%c
╔════════════════════════════════════════╗
║   NETLIFY: USING CACHED GOOGLE DATA    ║
║   Category: ${category.padEnd(20)}    ║
║   County: ${(county || 'N/A').padEnd(22)}    ║
╚════════════════════════════════════════╝
`, 'color: #4CAF50; font-weight: bold; font-size: 14px;');

            // Big visual indicator for cache hit - OpenAI Results
            console.log(`
%c
╔════════════════════════════════════════╗
║   NETLIFY: USING CACHED OPENAI DATA    ║
║   Category: ${category.padEnd(20)}    ║
║   Programs: ${(JSON.parse(cachedResult.openaiAnalysis).programs?.length || 0).toString().padEnd(20)}    ║
╚════════════════════════════════════════╝
`, 'color: #4CAF50; font-weight: bold; font-size: 14px;');

            // Log the cache hit
            try {
                await cache.appendRow({
                    query: cacheKey,
                    category: category,
                    googleResults: cachedResult.googleResults,
                    openaiAnalysis: cachedResult.openaiAnalysis,
                    timestamp: new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }),
                    hash: cache.netlifyGenerateHash(cacheKey),
                    googleSearchCache: 'Cache',
                    openaiSearchCache: 'Cache'
                });
                console.log(`[${requestId}] 📝 NETLIFY: Cache hit logged`);
            } catch (error) {
                console.error(`[${requestId}] ❌ NETLIFY: Failed to log cache hit:`, error);
            }

            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    found: true,
                    programs: JSON.parse(cachedResult.openaiAnalysis).programs,
                    source: {
                        googleSearch: 'Cache',
                        openaiAnalysis: 'Cache'
                    }
                })
            };
        }

        // Big visual indicator for cache miss - Will need fresh data
        console.log(`
%c
╔════════════════════════════════════════╗
║   NETLIFY: NO CACHED DATA FOUND        ║
║   Will need:                           ║
║   1. Fresh Google Search               ║
║   2. Fresh OpenAI Analysis            ║
║   Category: ${category.padEnd(20)}    ║
║   County: ${(county || 'N/A').padEnd(22)}    ║
╚════════════════════════════════════════╝
`, 'color: #FFA500; font-weight: bold; font-size: 14px;');

        console.log(`[${requestId}] ❌ NETLIFY: Cache missing`);
        console.log(`
╔════════════════════════════════════════╗
║         NETLIFY: CACHE MISSING         ║
║         Performing fresh search        ║
╚════════════════════════════════════════╝`);

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                found: false,
                category,
                county
            })
        };
    } catch (error) {
        console.error(`[${requestId}] ❌ NETLIFY: Error:`, error);
        // Big visual indicator for error
        console.log(`
%c
╔════════════════════════════════════════╗
║         NETLIFY: ERROR                 ║
║    Error: ${error.message.slice(0, 20).padEnd(22)}    ║
╚════════════════════════════════════════╝
`, 'color: #FF0000; font-weight: bold; font-size: 14px;');

        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
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