import { logError } from './logging-utils.mjs';

/**
 * Validate search parameters
 * @param {Object} params - Search parameters
 * @returns {Object} - Validation result { isValid, error }
 */
export function validateSearchParams(params) {
    try {
        const { level, county } = params;

        // Check level
        if (!level || !['Federal', 'State', 'County'].includes(level)) {
            return {
                isValid: false,
                error: 'Missing or invalid level (Federal/State/County)'
            };
        }

        // Check county for County-level searches
        if (level === 'County' && !county) {
            return {
                isValid: false,
                error: 'County is required for County-level searches'
            };
        }

        return { isValid: true };
    } catch (error) {
        logError('Parameter Validation', error);
        return {
            isValid: false,
            error: 'Parameter validation failed'
        };
    }
}

/**
 * Validate search results
 * @param {Array} results - Search results
 * @returns {boolean} - Whether results are valid
 */
export function validateSearchResults(results) {
    return Array.isArray(results) && results.length > 0;
}

/**
 * Validate OpenAI response format
 * @param {Object} response - OpenAI response
 * @returns {boolean} - Whether response is valid
 */
export function validateOpenAIResponse(response) {
    if (!response?.choices?.[0]?.message?.content) {
        return false;
    }

    try {
        const content = JSON.parse(response.choices[0].message.content);
        return Array.isArray(content.programs);
    } catch (error) {
        logError('OpenAI Response Validation', error);
        return false;
    }
}

/**
 * Validate cache entry
 * @param {Object} entry - Cache entry
 * @returns {boolean} - Whether entry is valid
 */
export function validateCacheEntry(entry) {
    const requiredFields = [
        'Query',
        'Level',
        'Google Results',
        'openAI Analysis',
        'Timestamp',
        'Hash',
        'Google Search-Cache',
        'OpenAI Search-Cache'
    ];

    return requiredFields.every(field => field in entry);
}

/**
 * Validate environment variables
 * @returns {Object} - Validation result { isValid, missing }
 */
export function validateEnvironment() {
    const required = [
        'GOOGLE_API_KEY',
        'GOOGLE_SEARCH_ENGINE_ID',
        'OPENAI_API_KEY'
    ];

    const missing = required.filter(key => !process.env[key]);

    return {
        isValid: missing.length === 0,
        missing
    };
}
