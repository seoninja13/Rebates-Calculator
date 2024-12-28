import { GoogleSheetsCache } from '../../backend/services/sheets-cache.js';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { projectFlowRouter } from './services/project-flow-router.mjs';

// Load environment variables
dotenv.config();

/**
 * Generate hash based on level and county
 * @param {string} level - Federal, State, or County
 * @param {string} county - County name (required for County level)
 * @returns {string} MD5 hash
 */
function generateHash(level, county = null) {
    level = level.toUpperCase();
    
    let hashInput;
    switch (level) {
        case 'FEDERAL':
            hashInput = 'FEDERAL::ALL';
            break;
        case 'STATE':
            hashInput = 'STATE::CALIFORNIA::ALL';
            break;
        case 'COUNTY':
            if (!county) throw new Error('County name required for County level');
            county = county.toUpperCase().trim().replace(' COUNTY', '');
            hashInput = `COUNTY::${county}::ALL`;
            break;
        default:
            throw new Error(`Invalid level: ${level}`);
    }

    return crypto.createHash('md5').update(hashInput).digest('hex');
}

/**
 * Direct cache retrieval handler
 * Only checks cache and returns results if found, no fallback to analysis
 */
export async function handler(event, context) {
    try {
        // Parse request parameters
        const { level, query } = JSON.parse(event.body || '{}');

        // Validate input parameters
        if (!level || !['Federal', 'State', 'County'].includes(level)) {
            throw new Error('Missing or invalid level (Federal/State/County)');
        }

        // Initialize cache
        const cache = new GoogleSheetsCache();
        const cacheInitialized = await cache.initialize();
        if (!cacheInitialized) {
            throw new Error('Cache initialization failed');
        }

        // Check cache for results using the full query
        const cacheResult = await cache.checkCache(query, level);
        
        if (!cacheResult || !cacheResult.found) {
            return {
                statusCode: 200,
                body: JSON.stringify({
                    success: true,
                    found: false,
                    message: `No cached data found for ${level} query: ${query}`
                })
            };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                found: true,
                data: cacheResult
            })
        };

    } catch (error) {
        console.error('Cache Error:', error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({
                success: false,
                error: error.message
            })
        };
    }
}
