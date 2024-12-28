import { GoogleSheetsCache } from '../../backend/services/sheets-cache.js';
import { sendLogToClient, logError } from './services/logging-utils.mjs';

// Helper function to normalize program type
function normalizeRebateType(type) {
    if (!type) return 'Not Available';
    
    const typeMap = {
        'rebate': 'Rebate',
        'grant': 'Grant',
        'tax credit': 'Tax Credit',
        'tax-credit': 'Tax Credit',
        'low-interest loan': 'Low-Interest Loan',
        'loan': 'Low-Interest Loan'
    };

    return typeMap[type.toLowerCase()] || type;
}

// Helper function to transform program data
function transformProgram(program) {
    if (!program) return null;

    return {
        title: program.programName || 'Not Available',
        type: normalizeRebateType(program.programType),
        summary: program.summary || 'No summary available',
        amount: program.amount || 'Not specified',
        eligibleProjects: Array.isArray(program.eligibleProjects) 
            ? program.eligibleProjects.map(project => typeof project === 'object' ? project.name : project)
            : [],
        eligibleRecipients: program.eligibleRecipients || 'Not specified',
        geographicScope: program.geographicScope || 'Not specified',
        requirements: Array.isArray(program.requirements) ? program.requirements : [],
        applicationProcess: program.applicationProcess || 'Not specified',
        deadline: program.deadline || 'Not specified',
        websiteLink: program.websiteLink || '#',
        contactInfo: program.contactInfo || 'Not specified',
        processingTime: program.processingTime || 'Not specified',
        collapsedSummary: program.collapsedSummary || `${program.programName} - ${(program.summary || '').slice(0, 100)}...`
    };
}

export const handler = async (event) => {
    const requestId = Math.random().toString(36).substring(7);
    sendLogToClient('Cache check request received', 'request', { requestId });

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

        if (!event.body) {
            throw new Error('Request body is required');
        }

        const body = JSON.parse(event.body);
        const { category, county } = body;

        // Validate required fields
        if (!category || !county) {
            sendLogToClient('Missing required fields', 'error', { category, county });
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

        sendLogToClient('Processing cache check', 'info', {
            category,
            county,
            requestId
        });

        const cache = new GoogleSheetsCache();
        const initialized = await cache.initialize();

        if (!initialized) {
            sendLogToClient('Cache not initialized', 'error', { category, county });
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

        const normalizedQuery = `${category}:${county}`;
        const cachedResult = await cache.checkCache(normalizedQuery, category);
        
        if (cachedResult?.found) {
            sendLogToClient('Cache hit', 'cache', {
                category,
                county,
                timestamp: cachedResult.timestamp
            });

            try {
                const cachedPrograms = JSON.parse(cachedResult.openaiAnalysis).programs;
                const transformedPrograms = cachedPrograms.map(transformProgram).filter(Boolean);

                // Log cache hit
                await cache.logSearch({
                    query: normalizedQuery,
                    level: category,
                    googleResults: cachedResult.googleResults,
                    openaiAnalysis: cachedResult.openaiAnalysis,
                    isGoogleCached: true,
                    isOpenAICached: true
                });

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
            } catch (parseError) {
                logError('Failed to parse cached data', parseError);
                throw parseError;
            }
        }

        sendLogToClient('Cache miss', 'cache', {
            category,
            county,
            normalizedQuery
        });

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
        logError('Cache check failed', error);
        
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
