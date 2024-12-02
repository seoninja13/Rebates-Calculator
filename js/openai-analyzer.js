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
        
        if (category === 'Federal') {
            fullQuery = `Federal energy rebate programs california`;
        } else if (category === 'State') {
            fullQuery = `${query} State energy rebate programs`;
        } else if (category === 'County') {
            fullQuery = `${query} County local energy rebate programs`;
        }
        
        console.log('%cFrontend → API | Query', 'color: #4CAF50; font-weight: bold', {
            query: fullQuery,
            category,
            timestamp: new Date().toISOString(),
            type: 'outgoing_request'
        });
        
        try {
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query: fullQuery, category }),
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
}
