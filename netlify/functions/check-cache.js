import { GoogleSheetsCache } from './services/sheets-cache.mjs';

// Helper function to normalize program type
function normalizeRebateType(type) {
    if (!type) return 'Not Available';
    
    // Standardize the type to match UI expectations
    const typeMap = {
        'rebate': 'Rebate',
        'grant': 'Grant',
        'tax credit': 'Tax Credit',
        'tax-credit': 'Tax Credit',
        'low-interest loan': 'Low-Interest Loan',
        'loan': 'Low-Interest Loan'
    };

    // Convert to lowercase for consistent matching
    const normalizedType = typeMap[type.toLowerCase()] || type;
    return normalizedType;
}

// Helper function to create program entries for each eligible project
function createProgramEntries(program) {
    if (!program) return [];
    
    const type = normalizeRebateType(program.programType);
    const projects = Array.isArray(program.eligibleProjects) ? program.eligibleProjects : [];
    
    if (projects.length === 0) {
        // If no specific projects, return single program
        return [{
            title: program.programName || 'Not Available',
            type: type,
            summary: program.summary || 'No summary available',
            amount: program.amount || 'Not specified',
            eligibleProjects: [],
            eligibleRecipients: program.eligibleRecipients || 'Not specified',
            geographicScope: program.geographicScope || 'Not specified',
            requirements: Array.isArray(program.requirements) ? program.requirements : [],
            applicationProcess: program.applicationProcess || 'Not specified',
            deadline: program.deadline || 'Not specified',
            websiteLink: program.websiteLink || '#',
            contactInfo: program.contactInfo || 'Not specified',
            processingTime: program.processingTime || 'Not specified'
        }];
    }
    
    // Create separate entry for each project
    return projects.map(project => {
        const projectName = typeof project === 'object' ? project.name : project;
        const projectAmount = (typeof project === 'object' && project.amount) ? project.amount : program.amount;
        
        return {
            title: program.programName || 'Not Available',
            type: type,
            summary: program.summary || 'No summary available',
            amount: projectAmount || 'Not specified',
            eligibleProjects: [projectName],
            eligibleRecipients: program.eligibleRecipients || 'Not specified',
            geographicScope: program.geographicScope || 'Not specified',
            requirements: Array.isArray(program.requirements) ? program.requirements : [],
            applicationProcess: program.applicationProcess || 'Not specified',
            deadline: program.deadline || 'Not specified',
            websiteLink: program.websiteLink || '#',
            contactInfo: program.contactInfo || 'Not specified',
            processingTime: program.processingTime || 'Not specified'
        };
    });
}

// Helper function to create collapsed summary
function createCollapsedSummary(program) {
    if (!program) return 'No program details available';
    
    const type = program.programType || 'Not Available';
    const projects = Array.isArray(program.eligibleProjects) ? program.eligibleProjects : [];
    
    // Build summary with each project having its own amount
    if (projects.length > 0) {
        return projects.map(project => {
            let projectAmount = program.amount || 'Not specified';
            if (typeof project === 'object' && project.amount) {
                projectAmount = project.amount;
            }
            const projectName = typeof project === 'object' ? project.name : project;
            return `${projectAmount} ${type.toLowerCase()} for ${projectName}`;
        }).join(', ');
    }
    
    // Fallback if no specific projects
    return `${program.amount || 'Not specified'} ${type.toLowerCase()} available`;
}

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
            // Transform the cached programs using simple direct mapping
            const cachedPrograms = JSON.parse(cachedResult.openaiAnalysis).programs;
            console.log('Raw cached programs:', cachedPrograms);

            const transformedPrograms = cachedPrograms.map(program => ({
                title: program.programName,
                type: program.programType,
                summary: program.summary,
                collapsedSummary: program.collapsedSummary,
                amount: program.amount,
                eligibleProjects: program.eligibleProjects.map(project => 
                    typeof project === 'object' ? project.name : project
                ),
                eligibleRecipients: program.eligibleRecipients,
                geographicScope: program.geographicScope,
                requirements: program.requirements,
                applicationProcess: program.applicationProcess,
                deadline: program.deadline,
                websiteLink: program.websiteLink,
                contactInfo: program.contactInfo,
                processingTime: program.processingTime,
                category: category.toLowerCase()
            }));

            console.log('Transformed programs:', transformedPrograms);

            // Log the cache hit
            try {
                await cache.appendRow({
                    query: cacheKey,
                    category: category,
                    googleResults: cachedResult.googleResults,
                    openaiAnalysis: cachedResult.openaiAnalysis,
                    timestamp: new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }),
                    hash: cache.netlifyGenerateHash(cacheKey, category),
                    googleSearchCache: 'Cache',
                    openaiSearchCache: 'Cache'
                });
                console.log('📝 NETLIFY: Cache hit logged successfully');
            } catch (error) {
                console.error('❌ NETLIFY: Failed to log cache hit:', error);
            }

            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    found: true,
                    programs: transformedPrograms,
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
╔═══════════════════════════════════════╗
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