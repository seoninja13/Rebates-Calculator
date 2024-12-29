export class RebateAnalyzer {
    constructor() {
        // Environment detection
        const isNetlifyProd = window.location.hostname.includes('netlify.app');
        const isNetlifyDev = window.location.port === '8888';
        this.isNetlify = isNetlifyProd || isNetlifyDev;
        this.baseUrl = this.isNetlify ? '/.netlify/functions' : 'http://localhost:3000/api';
        this.results = {};
        this.searchHistory = new Map();
        // These are project types (categories), not levels
        this.activeFilters = new Set(['heat-pumps', 'solar', 'ev-charger', 'hvac']);
        this.activeFlow = 'direct-cache'; // Default to direct cache mode
        
        // Log environment details
        console.log('\n===> ENVIRONMENT DETECTION:', {
            hostname: window.location.hostname,
            port: window.location.port,
            isNetlifyProd,
            isNetlifyDev,
            isNetlify: this.isNetlify,
            baseUrl: this.baseUrl,
            activeFlow: this.activeFlow
        });

        this.setupEventListeners();
        this.setupLogging();
    }

    setupEventListeners() {
        // Setup category filter listeners
        document.querySelectorAll('.filter-item').forEach(filter => {
            filter.addEventListener('click', () => {
                filter.classList.toggle('active');
                this.filterPrograms();
            });
        });
    }

    setupLogging() {
        // Environment detection for logging
        const isNetlifyProd = window.location.hostname.includes('netlify.app');
        const isNetlifyDev = window.location.port === '8888';
        const isNetlify = isNetlifyProd || isNetlifyDev;
        
        console.log('\n===> LOGGING SETUP:', {
            environment: isNetlifyProd ? 'Netlify Production' : 
                        isNetlifyDev ? 'Netlify Development' : 
                        'Local Development',
            logsEndpoint: isNetlify ? '/.netlify/functions/logs' : '/api/logs'
        });

        const logsUrl = isNetlify ? '/.netlify/functions/logs' : '/api/logs';
        const eventSource = new EventSource(logsUrl);
        eventSource.onmessage = (event) => {
            const { message, details } = JSON.parse(event.data);
            if (details) {
                console.log('%c' + message, 'color: #2196F3; font-weight: bold', details);
            } else {
                console.log('%c' + message, 'color: #2196F3; font-weight: bold');
            }
        };
    }

    filterPrograms() {
        const selectedCategories = Array.from(document.querySelectorAll('.category-icon.active'))
            .map(el => el.dataset.category);
        
        console.log('Filtering programs for categories:', selectedCategories);
        
        // Get all programs from the current results
        const allPrograms = [
            ...(this.results.federal?.analysis?.programs || []),
            ...(this.results.state?.analysis?.programs || []),
            ...(this.results.county?.analysis?.programs || [])
        ];

        // Filter programs based on selected categories
        const filteredPrograms = selectedCategories.length === 0 
            ? allPrograms 
            : allPrograms.filter(program => {
                const category = this.getCategoryFromProgram(program);
                return selectedCategories.includes(category);
            });

        console.log('Filtered programs:', filteredPrograms);
        this.displayResults({ programs: filteredPrograms });
    }

    getCategoryFromProgram(program) {
        const title = (program.title || '').toLowerCase();
        const description = (program.description || '').toLowerCase();
        const content = title + ' ' + description;

        if (content.includes('solar') || content.includes('photovoltaic') || content.includes('pv system')) {
            return 'solar';
        }
        if (content.includes('heat pump') || content.includes('hvac') || content.includes('heating') || content.includes('cooling')) {
            return 'heat-pumps';
        }
        if (content.includes('ev') || content.includes('electric vehicle') || content.includes('charger')) {
            return 'ev-charger';
        }
        if (content.includes('hvac') || content.includes('air condition') || content.includes('furnace')) {
            return 'hvac';
        }
        return 'other';
    }

    displayResults(results) {
        console.log('Displaying results:', results);
        
        const container = document.getElementById('resultsContainer');
        if (!container) return;

        // Clear existing content
        container.innerHTML = '';

        // Group programs by category
        const programsByCategory = {
            'solar': [],
            'heat-pumps': [],
            'ev-charger': [],
            'hvac': [],
            'other': []
        };

        // Get all programs from all levels
        const allPrograms = [
            ...(results.federal?.analysis?.programs || []),
            ...(results.state?.analysis?.programs || []),
            ...(results.county?.analysis?.programs || [])
        ];

        // Sort programs into categories
        allPrograms.forEach(program => {
            const category = this.getCategoryFromProgram(program);
            if (programsByCategory[category]) {
                programsByCategory[category].push(program);
            }
        });

        // Create sections for each category
        Object.entries(programsByCategory).forEach(([category, programs]) => {
            if (programs.length === 0) return; // Skip empty categories

            const section = document.createElement('div');
            section.className = 'program-section';
            section.setAttribute('data-category', category);

            const title = document.createElement('h2');
            title.textContent = this.formatCategory(category);
            section.appendChild(title);

            const content = document.createElement('div');
            content.className = 'program-content';

            programs.forEach(program => {
                const card = this.createProgramCard(program);
                content.appendChild(card);
            });

            section.appendChild(content);
            container.appendChild(section);
        });

        container.style.display = 'block';
    }

    createProgramCard(program) {
        const card = document.createElement('div');
        card.className = 'program-card';

        const title = document.createElement('h3');
        title.className = 'program-title';
        title.textContent = program.title;

        const description = document.createElement('p');
        description.className = 'program-description';
        description.textContent = program.description || program.summary || 'No description available';

        const amount = document.createElement('div');
        amount.className = 'program-amount';
        amount.textContent = this.formatAmount(program.amount);

        card.appendChild(title);
        card.appendChild(description);
        card.appendChild(amount);

        return card;
    }

    formatCategory(category) {
        const names = {
            'solar': 'Solar Installation',
            'heat-pumps': 'Heat Pumps',
            'ev-charger': 'EV Chargers',
            'hvac': 'HVAC Systems',
            'other': 'Other Programs'
        };
        return names[category] || category;
    }

    formatAmount(amount) {
        if (!amount) return 'Amount varies';
        return amount;
    }

    async searchPrograms(level) {
        try {
            // Make API call
            const url = '/.netlify/functions/direct-retrieval';
            const requestBody = {
                level,
                category: Array.from(this.activeFilters)
            };

            // Add county if level is County
            if (level === 'County') {
                const county = document.getElementById('countySelect')?.value;
                if (!county) {
                    throw new Error('Please select a county for county-level search');
                }
                requestBody.county = county;
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('API Error:', errorData);
                throw new Error(errorData.error || 'Network error');
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error searching programs:', error);
            throw error;
        }
    }

    async analyze() {
        try {
            const results = {};
            
            // Search all levels
            await Promise.all([
                this.searchPrograms('Federal').then(data => {
                    if (data.success && data.data?.programs) {
                        results.federal = { analysis: { programs: data.data.programs } };
                    }
                }),
                this.searchPrograms('State').then(data => {
                    if (data.success && data.data?.programs) {
                        results.state = { analysis: { programs: data.data.programs } };
                    }
                }),
                this.searchPrograms('County').then(data => {
                    if (data.success && data.data?.programs) {
                        results.county = { analysis: { programs: data.data.programs } };
                    }
                })
            ]);

            console.log('===> SEARCHING REBATES:', results);
            return results;
        } catch (error) {
            console.error('Error in analyze:', error);
            throw error;
        }
    }

    async getCachedData(level, county = null) {
        try {
            const url = '/.netlify/functions/get-cached-data';
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    level,
                    county,
                }),
            });

            if (!response.ok) {
                console.error('Failed to fetch cached data');
                return null;
            }

            return await response.json();
        } catch (error) {
            console.warn('Cache retrieval failed:', error);
            return null;
        }
    }

    handleError(error) {
        console.error('Error:', error);
        const errorMessage = error.message || 'An error occurred while searching for rebate programs.';
        // You can add UI error handling here if needed
    }

    async processLevel(level, query, updateUI = true) {
        let fullQuery = query;
        
        // Build search queries based on level
        if (level === 'Federal') {
            fullQuery = 'Federal energy rebate programs california, US government energy incentives california';
        } else if (level === 'State') {
            fullQuery = 'California state energy rebate programs, California state government energy incentives';
        } else if (level === 'County') {
            fullQuery = `${query} County energy rebate programs california, ${query} County utility incentives california`;
        }

        console.log('\n===> REQUESTING DATA:', {
            level,
            query: fullQuery,
            environment: this.isNetlify ? 'Netlify' : 'Local'
        });

        try {
            // Use different logic based on environment
            const data = this.isNetlify 
                ? await this.processNetlifyRequest(level, fullQuery, query)
                : await this.processLocalRequest(level, fullQuery);

            // Handle case where processNetlifyRequest returns null (duplicate request)
            if (!data) {
                console.log(`[LOG] Skipping UI update for ${level} - duplicate request`);
                return {
                    analysis: { programs: [] },
                    source: 'skipped'
                };
            }

            // Update UI if needed
            if (updateUI) {
                this.updateUIWithResults(level, data);
            }

            return data;
        } catch (error) {
            console.error('\n===> ERROR IN PROCESS LEVEL:', {
                level,
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    async processNetlifyRequest(level, fullQuery, county) {
        try {
            console.log('\n===> SENDING REQUEST:', {
                level,
                query: fullQuery,
                county
            });

            const response = await fetch(`${this.baseUrl}/direct-retrieval`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    level,
                    query: fullQuery,
                    county
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('\n===> RECEIVED RESPONSE:', {
                success: data.success,
                found: data.found,
                level: data.level,
                dataKeys: Object.keys(data.data || {}),
                openaiKeys: Object.keys(data.data?.openaiAnalysis || {}),
                programCount: data.data?.programs?.length || 0
            });

            // Extract programs from the response
            const programs = data.data?.programs || [];
            console.log('\n===> EXTRACTED PROGRAMS:', {
                count: programs.length,
                firstProgram: programs[0]
            });
            
            return {
                analysis: {
                    programs: programs,
                    googleResults: data.data?.googleResults || [],
                    openaiAnalysis: data.data?.openaiAnalysis || {}
                },
                source: data.found ? 'cache' : 'search'
            };
        } catch (error) {
            console.error(`Error in processNetlifyRequest for ${level}:`, error);
            throw error;
        }
    }

    async processLocalRequest(level, query) {
        console.log('\n===> LOCAL REQUEST:', { level, query });
        
        // First check cache
        const cacheResponse = await fetch(`${this.baseUrl}/check-cache`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                category: level,       // Required: Federal/State/County
                query: query,          // Optional: search query
                shouldSearch: false    // Don't force search on cache check
            }),
        });

        if (!cacheResponse.ok) {
            throw new Error(`Cache check failed: ${cacheResponse.status}`);
        }

        const cacheResult = await cacheResponse.json();
        
        if (cacheResult.found) {
            console.log('Using cached data:', cacheResult);
            this.displayResults(cacheResult.displayData.results, level, { cached: true });
            return {
                analysis: { programs: cacheResult.programs },
                source: 'cache'
            };
        }

        // If not in cache, do a fresh search
        console.log('\n===> LOCAL CACHE MISS - Proceeding with search');
        const response = await fetch(`${this.baseUrl}/analyze`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                category: level,       // Required: Federal/State/County
                query: query,          // Optional: search query
                shouldSearch: true     // Force new search
            }),
        });

        if (!response.ok) {
            throw new Error(`Search failed: ${response.status}`);
        }

        const data = await response.json();
        console.log('\n===> LOCAL SEARCH COMPLETE:', {
            level,
            source: 'search',
            programCount: data.programs?.length || 0
        });

        return {
            analysis: { programs: data.programs },
            source: 'search'
        };
    }

    updateUIWithResults(level, data) {
        const resultsContainer = document.getElementById(`${level.toLowerCase()}Results`);
        if (!resultsContainer) return;

        resultsContainer.innerHTML = '';

        // Handle no results case
        if (!data.analysis?.programs || data.analysis.programs.length === 0) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'no-results-message';
            messageDiv.innerHTML = `
                <div class="alert alert-info">
                    <i class="fas fa-info-circle"></i>
                    <span>${data.message || 'No programs found'}</span>
                </div>
            `;
            resultsContainer.appendChild(messageDiv);
            this.updateIcons(level, false, data.source === 'cache');
            return;
        }

        // Display programs
        data.analysis.programs.forEach((program) => {
            const card = this.createProgramCard(program);
            resultsContainer.appendChild(card);
        });

        // Update status icons
        this.updateIcons(level, false, data.source === 'cache');
    }

    async analyzeSearchResults(results, level) {
        if (!results || results.length === 0) {
            return "No results found to analyze.";
        }

        try {
            const response = await fetch(`${this.baseUrl}/api/analyze-search-results`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query: results.map(result => ({
                        title: result.title,
                        link: result.link,
                        snippet: result.snippet
                    })),
                    category: level  // Changed from level to category for consistency
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

    updateIcons(level, isSearching, isCached) {
        const sectionId = `${level.toLowerCase()}Section`;
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

    getCacheKey(level, query) {
        // Normalize the text by removing all whitespace and converting to lowercase
        const normalizedText = `${level}:${query}`.trim().toLowerCase().replace(/\s+/g, '');
        return normalizedText;
    }

    isRepeatSearch(level, county) {
        const searchKey = `${level}:${county || 'ALL'}`;
        const lastSearch = this.searchHistory.get(searchKey);
        
        if (lastSearch) {
            console.log('\n===> REPEAT SEARCH DETECTED:', {
                level,
                county,
                lastSearchTime: lastSearch.timestamp
            });
            return true;
        }
        
        // Track this search
        this.searchHistory.set(searchKey, {
            timestamp: new Date().toISOString(),
            level,
            county
        });
        
        return false;
    }

    // Helper method to get the final results
    getFinalResults() {
        return {
            federal: this.results.federal?.programs || [],
            state: this.results.state?.programs || [],
            county: this.results.county?.programs || []
        };
    }

    // Make sure cache persists between page reloads
    saveCache() {
        const cacheData = Array.from(this.cache.entries()).map(([key, value]) => ({
            key,
            value
        }));
        localStorage.setItem('rebateCache', JSON.stringify(cacheData));
        console.log('\n===> CACHE SAVED TO LOCAL STORAGE:', {
            entries: cacheData.length
        });
    }

    loadCache() {
        const savedCache = localStorage.getItem('rebateCache');
        if (savedCache) {
            const cacheData = JSON.parse(savedCache);
            cacheData.forEach(({key, value}) => {
                this.cache.set(key, value);
            });
            console.log('\n===> CACHE LOADED FROM LOCAL STORAGE:', {
                entries: cacheData.length
            });
        }
    }

    async searchRebates(county) {
        console.log('\n===> SEARCHING REBATES:', {
            county,
            activeFlow: this.activeFlow
        });

        try {
            if (this.activeFlow === 'direct-cache') {
                // Process all levels
                await this.analyze(county);
            } else {
                await this.analyze(county);
            }
        } catch (error) {
            console.error('\n===> ERROR IN SEARCH REBATES:', error);
            throw error;
        }
    }
}

// Create and export a singleton instance
const analyzer = new RebateAnalyzer();

export function analyze(level) {
    return analyzer.analyze(null, ['Federal', 'State', 'County']);
}
