export default class RebatePrograms {
    constructor() {
        // Use environment-specific API URL
        const isNetlify = window.location.port === '8888';
        this.baseUrl = isNetlify ? '/.netlify/functions' : 'http://localhost:3001';
        this.analyzePath = isNetlify ? '/analyze' : '/api/analyze';
        this.cache = new Map();
        console.log('RebatePrograms initialized with:', {
            isNetlify,
            baseUrl: this.baseUrl,
            analyzePath: this.analyzePath
        });
    }

    updateIcons(category, isSearching, isCached) {
        const sectionId = `${category.toLowerCase()}Section`;
        const section = document.getElementById(sectionId);
        if (!section) return;

        const searchIcon = section.querySelector('.fa-search');
        const cacheIcon = section.querySelector('.fa-database');

        if (searchIcon) {
            searchIcon.style.display = isSearching ? 'inline-block' : 'none';
        }
        if (cacheIcon) {
            cacheIcon.style.display = isCached ? 'inline-block' : 'none';
        }
    }

    getCacheKey(category, query) {
        return `${category}-${query}`;
    }

    async analyze(county) {
        console.log('Starting analyze for county:', county);
        try {
            const categories = ['Federal', 'State', 'County'];
            const results = {};

            for (const category of categories) {
                try {
                    const query = category === 'County' 
                        ? `${county} county california energy rebate program`
                        : category === 'State'
                        ? 'california state energy rebate program'
                        : 'federal energy rebate program california';

                    console.log(`Processing ${category} with query:`, query);
                    const cacheKey = this.getCacheKey(category, query);
                    
                    // Hide both icons initially
                    this.updateIcons(category, false, false);

                    // Check cache first
                    if (this.cache.has(cacheKey)) {
                        console.log(`Found cached results for ${category}`);
                        this.updateIcons(category, false, true);
                        results[category.toLowerCase()] = this.cache.get(cacheKey);
                        continue;
                    }

                    // Show searching icon
                    this.updateIcons(category, true, false);

                    console.log(`Making API request for ${category} to:`, `${this.baseUrl}${this.analyzePath}`);
                    const response = await fetch(`${this.baseUrl}${this.analyzePath}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            query,
                            category
                        })
                    });

                    if (!response.ok) {
                        console.error(`API error for ${category}:`, response.status);
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const data = await response.json();
                    console.log(`Got data for ${category}:`, data);
                    
                    // Cache the results
                    this.cache.set(cacheKey, data);
                    results[category.toLowerCase()] = data;

                    // Hide searching icon, show cache icon
                    this.updateIcons(category, false, true);

                } catch (error) {
                    console.error(`Error loading ${category} programs:`, error);
                    this.updateIcons(category, false, false);
                    results[category.toLowerCase()] = [];
                }
            }

            console.log('Final results:', results);
            return results;
        } catch (error) {
            console.error('Error in analyze:', error);
            throw error;
        }
    }
}
