export default class RebatePrograms {
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

        // Event listener for search button
        document.getElementById('searchButton').addEventListener('click', async (event) => {
            event.preventDefault();
            console.log('Button clicked');
            
            const county = document.getElementById('countySelect').value;
            if (!county) {
                alert('Please select a county');
                return;
            }
            console.log('Selected county:', county);
            
            const loadingSpinner = document.getElementById('rebatesLoadingSpinner');
            if (loadingSpinner) {
                loadingSpinner.style.display = 'block';
            }

            try {
                await this.searchRebates(county);
            } catch (error) {
                console.error('Error:', error);
                this.displayError(error.message);
            } finally {
                if (loadingSpinner) {
                    loadingSpinner.style.display = 'none';
                }
            }
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

    getCategoryFromProgram(program) {
        const title = program.title.toLowerCase();
        const summary = program.summary.toLowerCase();
        const projects = program.eligibleProjects.map(p => p.toLowerCase());

        if (projects.some(p => p.includes('heat pump')) || title.includes('heat pump') || summary.includes('heat pump')) {
            return 'heat-pumps';
        }
        if (projects.some(p => p.includes('solar')) || title.includes('solar') || summary.includes('solar')) {
            return 'solar';
        }
        if (projects.some(p => p.includes('ev') || p.includes('electric vehicle')) || 
            title.includes('ev charger') || summary.includes('ev charger')) {
            return 'ev-charger';
        }
        if (projects.some(p => p.includes('hvac')) || title.includes('hvac') || summary.includes('hvac')) {
            return 'hvac';
        }
        return 'other';
    }

    createProgramCard(program) {
        const template = document.getElementById('programCardTemplate');
        const card = template.content.cloneNode(true);
        
        // Get the category for this program
        const category = this.getCategoryFromProgram(program);
        card.querySelector('.program-card').dataset.category = category;

        // Fill in the card details
        card.querySelector('.program-title').textContent = program.title;
        card.querySelector('.program-category').textContent = this.formatCategory(category);
        card.querySelector('.program-amount').textContent = this.formatAmount(program.amount);
        card.querySelector('.program-description').textContent = program.summary;
        
        if (program.eligibleProjects && program.eligibleProjects.length > 0) {
            const projectsList = document.createElement('ul');
            program.eligibleProjects.forEach(project => {
                const li = document.createElement('li');
                li.textContent = project;
                projectsList.appendChild(li);
            });
            card.querySelector('.eligible-projects').appendChild(projectsList);
        }

        card.querySelector('.geographic-scope').textContent = program.geographicScope;
        
        return card;
    }

    formatCategory(category) {
        const categoryMap = {
            'heat-pumps': 'Heat Pumps',
            'solar': 'Solar',
            'ev-charger': 'EV Charger',
            'hvac': 'HVAC',
            'other': 'Other'
        };
        return categoryMap[category] || category;
    }

    formatAmount(amount) {
        if (!amount) return 'Amount not specified';
        if (typeof amount === 'string') {
            // If amount is already formatted, return as is
            if (amount.includes('$')) return amount;
            // Try to extract numbers and format
            const numbers = amount.match(/\d+/g);
            if (numbers) {
                return `$${numbers.join(',')}`; 
            }
        }
        return `$${amount}`;
    }

    filterPrograms() {
        const selectedFilterTypes = this.getSelectedFilterTypes();
        const programCards = document.querySelectorAll('.program-card');

        programCards.forEach(card => {
            const category = card.querySelector('.program-category').textContent.toLowerCase();
            const shouldShow = selectedFilterTypes.some(cat => category.includes(cat));
            card.style.display = shouldShow ? 'block' : 'none';
        });
    }

    getSelectedFilterTypes() {
        return Array.from(document.querySelectorAll('.filter-item.active'))
            .map(item => item.dataset.category);
    }

    updateDisplayedPrograms() {
        const programGrid = document.getElementById('programGrid');
        const cards = programGrid.querySelectorAll('.program-card');
        
        cards.forEach(card => {
            const category = card.dataset.category;
            if (this.activeFilters.has(category)) {
                card.style.display = '';
            } else {
                card.style.display = 'none';
            }
        });
    }

    async analyze(county) {
        console.log('Starting analyze for county:', county, {
            timestamp: new Date().toISOString(),
            county,
            levels: ['Federal', 'State', 'County'],
            note: 'Processing Federal, State, and County levels'
        });

        this.results = {}; // Reset results at start of analyze
        
        try {
            // Process all levels but don't update UI yet
            console.log('\n===> PROCESSING FEDERAL LEVEL');
            const federalResults = await this.processLevel('Federal', county, false);
            this.results.federal = federalResults.analysis;

            console.log('\n===> PROCESSING STATE LEVEL');
            const stateResults = await this.processLevel('State', county, false);
            this.results.state = stateResults.analysis;

            console.log('\n===> PROCESSING COUNTY LEVEL');
            const countyResults = await this.processLevel('County', county, false);
            this.results.county = countyResults.analysis;
            
            console.log('\n===> FINAL RESULTS:', {
                federal: {
                    programCount: this.results.federal?.programs?.length || 0,
                    source: federalResults.source
                },
                state: {
                    programCount: this.results.state?.programs?.length || 0,
                    source: stateResults.source
                },
                county: {
                    programCount: this.results.county?.programs?.length || 0,
                    source: countyResults.source
                }
            });

            // Get selected project types (categories)
            const selectedCategories = this.getSelectedFilterTypes();
            
            // Now update UI for all levels at once
            ['federal', 'state', 'county'].forEach(level => {
                const resultsContainer = document.getElementById(`${level}Results`);
                if (resultsContainer) {
                    resultsContainer.innerHTML = '';
                    const programs = this.results[level]?.programs || [];
                    console.log(`\n===> UPDATING UI FOR ${level.toUpperCase()}:`, {
                        programCount: programs.length
                    });
                    
                    // Filter programs by selected project types
                    const filteredPrograms = selectedCategories.length > 0 
                        ? programs.filter(program => {
                            const programCategory = this.getCategoryFromProgram(program);
                            return selectedCategories.includes(programCategory);
                        })
                        : programs;
                        
                    filteredPrograms.forEach((program) => {
                        const card = this.createProgramCard(program);
                        resultsContainer.appendChild(card);
                    });
                }
            });
            
            return {
                federal: this.results.federal?.programs || [],
                state: this.results.state?.programs || [],
                county: this.results.county?.programs || []
            };
        } catch (error) {
            console.error('\n===> ERROR IN ANALYZE:', {
                error: error.message,
                county,
                stack: error.stack
            });
            throw error;
        }
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
        // Prevent duplicate requests
        if (this.isRequestPending?.[level]) {
            console.log(`[LOG] Skipping duplicate request for ${level}`);
            return null;
        }

        try {
            this.isRequestPending = this.isRequestPending || {};
            this.isRequestPending[level] = true;

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
            
            // If found in cache, filter by category before returning
            if (data.success && data.found && data.data) {
                const categories = Array.from(this.activeFilters);
                const category = categories[0];

                if (category) {
                    // Filter the programs by category
                    const filteredData = {
                        ...data.data,
                        programs: data.data.programs?.filter(program => 
                            program.category?.toLowerCase() === category.toLowerCase()
                        ) || []
                    };
                    return {
                        analysis: filteredData,
                        source: 'cache'
                    };
                }
            }

            return {
                analysis: data.data || { programs: [] },
                source: data.found ? 'cache' : 'search'
            };
        } catch (error) {
            console.error(`Error in processNetlifyRequest for ${level}:`, error);
            throw error;
        } finally {
            this.isRequestPending[level] = false;
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

    displayResults(programs, level, source = {}) {
        const sectionId = `${level.toLowerCase()}Results`;
        const container = document.getElementById(sectionId);
        if (!container) {
            console.error(`Container not found: ${sectionId}`);
            return;
        }

        // Clear previous results
        container.innerHTML = '';
        
        if (source.cached) {
            const cacheIndicator = document.createElement('div');
            cacheIndicator.className = 'cache-indicator';
            cacheIndicator.innerHTML = '<i class="fas fa-bolt"></i> Showing cached results';
            container.appendChild(cacheIndicator);
        }

        programs.forEach(program => this.createProgramCard(program, source));
        
        // Show the section
        container.closest('.results-section').style.display = 'block';
    }

    async searchPrograms(level, county = null) {
        console.log('Searching programs for:', { level, county });
        
        try {
            // First try to get data from cache
            const cachedData = await this.getCachedData(level, county);
            if (cachedData?.success && cachedData.displayData?.results?.length > 0) {
                console.log('Using cached data:', cachedData);
                this.displayResults(cachedData.displayData.results, level, { cached: true });
                return;
            }

            // If no cache, proceed with normal search
            const response = await fetch(`${this.baseUrl}/analyze`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    category: level,       // Required: Federal/State/County
                    county: county,        // Required for County category
                    query: '',             // Optional: search query
                    shouldSearch: true     // Optional: force new search
                })
            });

            if (!response.ok) {
                throw new Error(`Network response was not ok`);
            }

            const data = await response.json();
            this.displayResults(data.displayData.results, level);
        } catch (error) {
            console.error('Error searching programs:', error);
            this.handleError(error);
        }
    }

    async getCachedData(level, county = null) {
        try {
            const response = await fetch(`${this.baseUrl}/get-cached-data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ level, county })
            });

            if (!response.ok) {
                throw new Error('Failed to fetch cached data');
            }

            return await response.json();
        } catch (error) {
            console.warn('Cache retrieval failed:', error);
            return null;
        }
    }

    displayError(message) {
        const errorContainer = document.getElementById('errorContainer');
        if (errorContainer) {
            errorContainer.textContent = message;
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
