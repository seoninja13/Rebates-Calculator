import { GoogleSheetsCache } from './sheets-cache.js';
import crypto from 'crypto';

/**
 * DirectCacheRetrieval Class
 * Provides direct access to cached rebate data without performing new searches
 */
export class DirectCacheRetrieval {
    constructor() {
        this.cache = new GoogleSheetsCache();
        this.initialized = false;
    }

    /**
     * Initialize the cache connection
     */
    async initialize() {
        if (!this.initialized) {
            await this.cache.initialize();
            this.initialized = true;
        }
    }

    /**
     * Generate hash based on level and county
     * @param {string} level - Federal, State, or County
     * @param {string} county - County name (required for County level)
     * @returns {string} MD5 hash
     */
    generateHash(level, county = null) {
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
     * Retrieve data from cache based on level, county, and category
     * @param {string} level - Federal, State, or County
     * @param {string} county - County name (required for County level)
     * @param {string} category - Category to extract (Solar, HVAC, etc.)
     * @returns {Promise<Object>} Cache response
     */
    async retrieveFromCache(level, county, category) {
        try {
            // Ensure cache is initialized
            await this.initialize();

            // Generate hash
            const hash = this.generateHash(level, county);

            // Find matching row in cache
            const cacheRow = await this.cache.findByHash(hash);
            if (!cacheRow) {
                return {
                    success: true,
                    data: null,
                    error: 'No data available in cache'
                };
            }

            // Extract category-specific information
            const results = this.extractCategoryData(cacheRow.results, category);

            return {
                success: true,
                data: {
                    results,
                    timestamp: cacheRow.timestamp,
                    level,
                    query: cacheRow.query
                }
            };

        } catch (error) {
            console.error('Cache retrieval error:', error);
            return {
                success: false,
                data: null,
                error: error.message
            };
        }
    }

    /**
     * Extract category-specific program information from results
     * @param {Array} results - Full results array from cache
     * @param {string} category - Category to extract
     * @returns {Array} Filtered results for category
     */
    extractCategoryData(results, category) {
        if (!Array.isArray(results)) {
            console.warn('Invalid results format:', results);
            return [];
        }

        // Extract programs for the specified category
        return results.filter(program => {
            try {
                return program && 
                       program.category && 
                       program.category.toLowerCase() === category.toLowerCase();
            } catch (error) {
                console.warn('Error processing program:', error);
                return false;
            }
        });
    }
}
