// Centralized logging utilities

/**
 * Send log message to client
 * @param {string} message - Log message
 * @param {Object} details - Additional details
 */
export function sendLogToClient(message, details = null) {
    const logMessage = JSON.stringify({
        message,
        details,
        timestamp: new Date().toISOString()
    });
    
    console.log(`[LOG] ${message}`, details || '');
}

/**
 * Log search parameters
 * @param {Object} params - Search parameters
 */
export function logSearchParameters(params) {
    const { query, level, county, shouldSearch } = params;
    console.log('🔍 Search Parameters', {
        query,
        level,
        county,
        shouldSearch
    });
}

/**
 * Log search results
 * @param {Array} results - Search results
 * @param {string} query - Search query
 */
export function logSearchResults(results, query) {
    console.log('📊 Search Results', {
        query,
        resultsCount: results?.length || 0,
        firstResultTitle: results?.[0]?.title || 'N/A'
    });
}

/**
 * Log error with context
 * @param {string} context - Error context
 * @param {Error} error - Error object
 */
export function logError(context, error) {
    console.error(`❌ ${context} Error:`, {
        message: error.message,
        stack: error.stack
    });
}

/**
 * Log API response
 * @param {string} api - API name
 * @param {Object} response - API response
 */
export function logAPIResponse(api, response) {
    console.log(`✅ ${api} Response:`, {
        status: response?.status,
        dataSize: JSON.stringify(response?.data || {}).length
    });
}
