import { GoogleSheetsCache } from './cache/index.mjs';

/**
 * DirectCacheRetrieval
 * Handles direct retrieval of cached rebate data without performing new searches
 */
class DirectCacheRetrieval {
    constructor() {
        console.log('DirectCacheRetrieval → Constructor | Initializing service');
        this.cache = new GoogleSheetsCache();
    }

    /**
     * Initialize the cache connection
     */
    async initialize() {
        console.log('DirectCacheRetrieval → Initialize | Starting initialization');
        if (!this.cache.initialized) {
            try {
                await this.cache.initialize();
                console.log('DirectCacheRetrieval → Initialize | Cache initialized successfully');
            } catch (error) {
                console.error('DirectCacheRetrieval → Initialize | Failed to initialize cache:', error);
                throw new Error('Failed to initialize cache service');
            }
        }
    }

    /**
     * Retrieve cached data for a specific location
     * @param {string} level - 'Federal', 'State', or 'County'
     * @param {string} county - County name (if applicable)
     * @param {string} category - Category of data to retrieve (default: 'all')
     * @returns {Promise<Object>} Cached data or null if not found
     */
    async retrieveFromCache(level, county = null, category = 'all') {
        console.log('DirectCacheRetrieval → Retrieve | Starting retrieval:', { level, county, category });
        try {
            await this.initialize();
            
            // Input validation
            if (!level) {
                throw new Error('Level is required');
            }
            
            // Normalize inputs using cache utility functions
            const normalizedLevel = this.cache.normalizeLevel(level);
            const normalizedCounty = county ? this.cache.normalizeCounty(county) : null;
            
            // Validate county requirement for county-level searches
            if (normalizedLevel.toUpperCase() === 'COUNTY' && !normalizedCounty) {
                throw new Error('County name is required for county-level searches');
            }
            
            console.log('DirectCacheRetrieval → Retrieve | Normalized inputs:', {
                level: normalizedLevel,
                county: normalizedCounty,
                category
            });
            
            // Get cached data
            const cachedData = await this.cache.netlifyGetCache(
                normalizedLevel, 
                normalizedCounty, 
                category
            );

            console.log('DirectCacheRetrieval → Retrieve | Cache retrieval successful');
            return {
                success: true,
                data: cachedData,
                timestamp: cachedData?.timestamp || null
            };
        } catch (error) {
            console.error('DirectCacheRetrieval → Retrieve | Error:', error);
            return {
                success: false,
                error: error.message,
                data: null
            };
        }
    }

    /**
     * Format the cached data for display
     * @param {Object} cacheResponse - Response from retrieveFromCache
     * @returns {Object} Formatted data ready for display
     */
    formatForDisplay(cacheResponse) {
        console.log('DirectCacheRetrieval → Format | Starting format');
        if (!cacheResponse.success) {
            console.warn('DirectCacheRetrieval → Format | Unsuccessful cache response');
            return {
                success: false,
                displayData: null,
                error: cacheResponse.error || 'Failed to retrieve cache data'
            };
        }

        const { data } = cacheResponse;
        if (!data || !data.results) {
            console.warn('DirectCacheRetrieval → Format | No data or results found');
            return {
                success: false,
                displayData: null,
                error: 'No cached data found'
            };
        }

        console.log('DirectCacheRetrieval → Format | Formatting successful');
        return {
            success: true,
            displayData: {
                results: data.results,
                metadata: {
                    timestamp: data.timestamp,
                    level: data.level,
                    query: data.query
                }
            }
        };
    }

    /**
     * Validate if cache data is still fresh
     * @param {string} timestamp - Cache timestamp
     * @returns {boolean} True if cache is fresh
     */
    isCacheFresh(timestamp) {
        if (!timestamp) return false;
        
        const cacheTime = new Date(timestamp);
        const now = new Date();
        const cacheDurationHours = 24; // Cache is considered fresh for 24 hours
        
        return (now - cacheTime) / (1000 * 60 * 60) < cacheDurationHours;
    }
}

export { DirectCacheRetrieval };
