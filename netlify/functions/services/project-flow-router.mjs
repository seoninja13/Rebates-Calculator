/**
 * Project Flow Router
 * Manages and routes between different project flows:
 * 1. Direct Cache Retrieval Flow - Fast cache-first approach
 * 2. Full Analysis Flow - Complete search and analysis
 */

class ProjectFlowRouter {
    constructor() {
        // Default to direct cache retrieval flow
        this.activeFlow = 'direct-cache';
    }

    /**
     * Set the active flow
     * @param {'direct-cache' | 'full-analysis'} flow - Flow to set as active
     */
    setActiveFlow(flow) {
        if (!['direct-cache', 'full-analysis'].includes(flow)) {
            throw new Error('Invalid flow. Must be either "direct-cache" or "full-analysis"');
        }
        console.log('🔀 Router → Setting Active Flow:', { flow });
        this.activeFlow = flow;
    }

    /**
     * Get the current active flow
     * @returns {'direct-cache' | 'full-analysis'} Current active flow
     */
    getActiveFlow() {
        return this.activeFlow;
    }

    /**
     * Route the request to the appropriate handler based on active flow
     * @param {Object} params - Request parameters
     * @param {string} params.category - Federal/State/County
     * @param {string} params.county - County name (if applicable)
     * @param {string} params.query - Search query (if applicable)
     * @returns {Object} Routing information
     */
    routeRequest(params) {
        console.log('🔀 Router → Routing Request:', {
            flow: this.activeFlow,
            params
        });

        switch (this.activeFlow) {
            case 'direct-cache':
                return {
                    handler: '/.netlify/functions/direct-retrieval',
                    params: {
                        category: params.category,
                        county: params.county
                    }
                };

            case 'full-analysis':
                return {
                    handler: '/.netlify/functions/analyze',
                    params: {
                        category: params.category,
                        county: params.county,
                        query: params.query,
                        shouldSearch: true
                    }
                };

            default:
                throw new Error(`Unknown flow: ${this.activeFlow}`);
        }
    }

    /**
     * Check if the request should fall back to full analysis
     * @param {Object} cacheResponse - Response from direct cache retrieval
     * @returns {boolean} True if should fall back to full analysis
     */
    shouldFallbackToFullAnalysis(cacheResponse) {
        // Fall back if cache miss or error
        return !cacheResponse?.success || !cacheResponse?.data;
    }
}

// Export singleton instance
export const projectFlowRouter = new ProjectFlowRouter();
