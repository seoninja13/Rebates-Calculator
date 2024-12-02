export default class RebatePrograms {
    constructor() {
        // Use environment-specific API URL
        const isNetlify = window.location.port === '8888';
        this.baseUrl = isNetlify ? '/.netlify/functions' : 'http://localhost:3000';
        this.analyzePath = isNetlify ? '/analyze' : '/api/analyze';
        this.cache = new Map();
        this.results = {};
        this.setupLogging();
        console.log('RebatePrograms initialized with:', {
            isNetlify,
            baseUrl: this.baseUrl,
            analyzePath: this.analyzePath
        });
    }

    setupLogging() {
        const eventSource = new EventSource('/api/logs');
        eventSource.onmessage = (event) => {
            const { message, details } = JSON.parse(event.data);
            if (details) {
                console.log('%c' + message, 'color: #2196F3; font-weight: bold', details);
            } else {
                console.log('%c' + message, 'color: #2196F3; font-weight: bold');
            }
        };
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
        console.log('Starting analyze for county:', county, {
            timestamp: new Date().toISOString(),
            county,
            categories: ['Federal', 'State', 'County']
        });

        this.results = {}; // Reset results at start of analyze
        
        try {
            await this.processCategory('Federal', county);
            await this.processCategory('State', county);
            await this.processCategory('County', county);
            
            console.log('Final results:', this.results);
            
            return {
                federal: this.results.federal?.programs || [],
                state: this.results.state?.programs || [],
                county: this.results.county?.programs || []
            };
        } catch (error) {
            console.error('Error in analyze:', {
                error: error.message,
                county,
                stack: error.stack
            });
            throw error;
        }
    }

    async processCategory(category, query) {
        let fullQuery = query;
        
        // Build search queries based on category
        if (category === 'Federal') {
            fullQuery = `Federal energy rebate programs california`;
        } else if (category === 'State') {
            fullQuery = `California state energy rebate programs`;
        } else if (category === 'County') {
            fullQuery = `${query} County energy rebate programs california`;
        }
        
        console.log('%cFrontend → API | Query', 'color: #4CAF50; font-weight: bold', {
            query: fullQuery,
            category,
            timestamp: new Date().toISOString(),
            type: 'outgoing_request'
        });
        
        try {
            const response = await fetch(`${this.baseUrl}/api/analyze`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    query: fullQuery, 
                    category,
                    maxResults: 10  // Explicitly request 10 results
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('%cAPI → Frontend | Error', 'color: #f44336; font-weight: bold', {
                    status: response.status,
                    error: errorData,
                    category,
                    timestamp: new Date().toISOString(),
                    type: 'error_response'
                });
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            // Log the full response data
            console.log('%cAPI → Frontend | Raw Response', 'color: #4CAF50; font-weight: bold', {
                category,
                data,
                timestamp: new Date().toISOString(),
                type: 'raw_response'
            });
            
            // Ensure data.programs is always an array
            if (!data.programs) {
                data.programs = [];
            }
            
            console.log('%cAPI → Frontend | Success', 'color: #4CAF50; font-weight: bold', {
                category,
                programsCount: data.programs.length,
                programs: data.programs,
                timestamp: new Date().toISOString(),
                type: 'success_response'
            });
            
            // Store the programs directly
            this.results[category.toLowerCase()] = {
                programs: data.programs,
                error: false,
                loading: false
            };

            this.updateIcons(category, false, true);
            
            // Return the programs
            return data.programs;
        } catch (error) {
            console.error('%cAPI → Frontend | Error', 'color: #f44336; font-weight: bold', {
                error: error.message,
                category,
                timestamp: new Date().toISOString(),
                type: 'error_response'
            });
            this.updateIcons(category, false, false);
            throw error;
        }
    }

    async analyzeSearchResults(results, category) {
        if (!results || results.length === 0) {
            return "No results found to analyze.";
        }

        try {
            const response = await fetch(`${this.baseUrl}${this.analyzePath}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: results.map(result => ({
                        title: result.title,
                        link: result.link,
                        snippet: result.snippet
                    })),
                    category: category
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data.analysis;
        } catch (error) {
            console.error('Error analyzing results:', error);
            return `Error analyzing results: ${error.message}`;
        }
    }
}
