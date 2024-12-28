import { DirectCacheRetrieval } from './services/direct-cache-retrieval.mjs';

export async function handler(event) {
    console.log('Get Cached Data | Starting request');
    
    try {
        const { level, county } = JSON.parse(event.body || '{}');
        
        if (!level) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Level is required' })
            };
        }

        const cacheRetrieval = new DirectCacheRetrieval();
        const result = await cacheRetrieval.retrieveFromCache(level, county);
        const formattedData = cacheRetrieval.formatForDisplay(result);

        return {
            statusCode: 200,
            body: JSON.stringify(formattedData)
        };
    } catch (error) {
        console.error('Get Cached Data | Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
}
