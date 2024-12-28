import { GoogleSheetsCache } from '../../backend/services/sheets-cache.js';
import dotenv from 'dotenv';
import { projectFlowRouter } from './services/project-flow-router.mjs';
import { sendLogToClient, logError } from './services/logging-utils.mjs';

// Load environment variables
dotenv.config();

// Cache instance (shared between requests)
const cache = new GoogleSheetsCache();
let initialized = false;

/**
 * Direct cache retrieval handler
 * Only checks cache and returns results if found, no fallback to analysis
 */
export async function handler(event, context) {
    try {
        // Parse request parameters
        const { level, category, county } = JSON.parse(event.body);

        // Validate required parameters
        if (!level || !['Federal', 'State', 'County'].includes(level)) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: "Missing or invalid level (Federal/State/County)" })
            };
        }

        // Build the query based on level - matching exactly what's in the cache
        let query;
        if (level === 'Federal') {
            query = "Federal energy rebate programs california, US government energy incentives california";
        } else if (level === 'State') {
            query = "California state energy rebate programs, California state government energy incentives";
        } else {
            if (!county) {
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: "County name required for County level" })
                };
            }
            query = `${county} County energy rebate programs california, ${county} County utility incentives california`;
            
            const debugData = {
                county,
                constructedQuery: query,
                queryLength: query.length,
                charCodes: Array.from(query).map(c => c.charCodeAt(0))
            };
            
            console.log('\n[QUERY-DEBUG] ==================');
            console.log('County:', county);
            console.log('Constructed Query:', query);
            console.log('Query Length:', query.length);
            console.log('Character Codes:', Array.from(query).map(c => c.charCodeAt(0)));
            console.log('============================\n');
            
            sendLogToClient('Query Debug', debugData);
        }

        // Log the search request
        console.log("[LOG] Direct Cache → Search", { level, county, query });

        // Initialize cache (only once)
        if (!initialized) {
            if (!await cache.initialize()) {
                throw new Error('Cache initialization failed');
            }
            initialized = true;
        }

        // Check cache with the query and level
        const cacheResult = await cache.checkCache(query, level);
        if (!cacheResult) {
            console.log("[LOG] Direct Cache → No Result Found", { level, county });
            return {
                statusCode: 200,
                body: JSON.stringify({
                    level,
                    county,
                    found: false,
                    hash: null,
                    timestamp: null,
                    programCount: 0
                })
            };
        }

        // Log cache result
        console.log("[LOG] Direct Cache → Result", {
            level,
            county,
            found: cacheResult.found,
            hash: cacheResult.hash,
            timestamp: cacheResult.timestamp || 'N/A',
            programCount: cacheResult.data?.programs?.length || 0,
            dataKeys: Object.keys(cacheResult.data || {}),
            openaiKeys: Object.keys(cacheResult.data?.openaiAnalysis || {}),
            firstProgram: cacheResult.data?.programs?.[0]
        });

        // Return the result
        const responseData = {
            success: true,
            level,
            county,
            found: cacheResult.found,
            hash: cacheResult.hash,
            timestamp: cacheResult.timestamp || null,
            data: {
                googleResults: cacheResult.data?.googleResults || [],
                openaiAnalysis: cacheResult.data?.openaiAnalysis || {},
                programs: cacheResult.data?.programs || []
            }
        };

        console.log("[LOG] Direct Cache → Response Data", {
            success: responseData.success,
            found: responseData.found,
            programCount: responseData.data.programs.length,
            firstProgram: responseData.data.programs[0]
        });

        return {
            statusCode: 200,
            body: JSON.stringify(responseData)
        };

    } catch (error) {
        // Log detailed error info
        logError('Direct Cache Error', {
            error: error.message,
            stack: error.stack,
            name: error.name
        });

        return {
            statusCode: 500,
            body: JSON.stringify({
                success: false,
                error: error.message,
                details: error.stack
            })
        };
    }
}
