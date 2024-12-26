export default class RebatePrograms {
    constructor() {
        // Environment detection
        const isNetlifyProd = window.location.hostname.includes('netlify.app');
        const isNetlifyDev = window.location.port === '8888';
        this.isNetlify = isNetlifyProd || isNetlifyDev;
        this.baseUrl = this.isNetlify ? '/.netlify/functions' : 'http://localhost:3000/api';
        this.results = {};
        this.searchHistory = new Map();
        this.activeFilters = new Set(['heat-pumps', 'solar', 'ev-charger', 'hvac']);
        
        // Log environment details
        console.log('\n===> ENVIRONMENT DETECTION:', {
            hostname: window.location.hostname,
            port: window.location.port,
            isNetlifyProd,
            isNetlifyDev,
            isNetlify: this.isNetlify,
            baseUrl: this.baseUrl
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

    async analyze(location) {
        try {
            const response = await fetch(`${this.baseUrl}/analyze`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ location })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            this.results = data;

            // Clear existing programs
            const programGrid = document.getElementById('programGrid');
            programGrid.innerHTML = '';

            // Create and append program cards
            const allPrograms = [
                ...(data.federal?.programs || []),
                ...(data.state?.programs || []),
                ...(data.county?.programs || [])
            ];

            allPrograms.forEach(program => {
                const card = this.createProgramCard(program);
                programGrid.appendChild(card);
            });

            this.updateDisplayedPrograms();
            return data;

        } catch (error) {
            console.error('Error analyzing rebates:', error);
            throw error;
        }
    }

    async processCategory(category, query, updateUI = true) {
        let fullQuery = query;
        
        // Build search queries based on category
        if (category === 'Federal') {
            fullQuery = 'Federal energy rebate programs california, US government energy incentives california';
        } else if (category === 'State') {
            fullQuery = 'California state energy rebate programs, California state government energy incentives';
        } else if (category === 'County') {
            fullQuery = `${query} County energy rebate programs california, ${query} County utility incentives california`;
        }

        console.log('\n===> REQUESTING DATA:', {
            category,
            query: fullQuery,
            environment: this.isNetlify ? 'Netlify' : 'Local'
        });

        try {
            // Use different logic based on environment
            const data = this.isNetlify 
                ? await this.processNetlifyRequest(category, fullQuery, query)
                : await this.processLocalRequest(category, fullQuery);

            // Update UI if needed
            if (updateUI) {
                this.updateUIWithResults(category, data);
            }

            return data;
        } catch (error) {
            console.error('\n===> ERROR:', {
                category,
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    async processLocalRequest(category, query) {
        console.log('\n===> LOCAL REQUEST:', { category, query });
        
        // First check cache
        const cacheResponse = await fetch(`${this.baseUrl}/check-cache`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                query, 
                category,
                shouldSearch: false
            }),
        });

        if (!cacheResponse.ok) {
            throw new Error(`Cache check failed: ${cacheResponse.status}`);
        }

        const cacheResult = await cacheResponse.json();
        
        if (cacheResult.found) {
            console.log('\n===> LOCAL CACHE HIT:', {
                category,
                source: 'cache',
                programCount: cacheResult.programs?.length || 0
            });
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
                query, 
                category,
                shouldSearch: true
            }),
        });

        if (!response.ok) {
            throw new Error(`Search failed: ${response.status}`);
        }

        const data = await response.json();
        console.log('\n===> LOCAL SEARCH COMPLETE:', {
            category,
            source: 'search',
            programCount: data.programs?.length || 0
        });

        return {
            analysis: { programs: data.programs },
            source: 'search'
        };
    }

    async processNetlifyRequest(category, fullQuery, county) {
        console.log('\n===> NETLIFY REQUEST:', { 
            category, 
            fullQuery,
            county 
        });

        // First check cache
        try {
            const cacheResponse = await fetch(`${this.baseUrl}/check-cache`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    query: fullQuery,
                    category,
                    county,
                    shouldSearch: false // Always check cache first
                }),
            });

            if (!cacheResponse.ok) {
                const errorData = await cacheResponse.json();
                console.group('🚨 NETLIFY CACHE ERROR');
                console.error('Cache check failed:', {
                    status: cacheResponse.status,
                    error: errorData.error,
                    message: errorData.message,
                    details: errorData.details
                });
                console.groupEnd();
                throw new Error(`Cache check failed: ${errorData.message}`);
            }

            const cacheResult = await cacheResponse.json();

            if (cacheResult.found) {
                console.group('📦 NETLIFY CACHE STATUS');
                console.log('%c=== USING CACHED RESULTS ===', 'color: #4CAF50; font-weight: bold; font-size: 14px');
                console.log('✓ Using Cached Google Search Results');
                console.log('✓ Using Cached OpenAI Analysis');
                console.log('Category:', category);
                console.log('Programs Found:', cacheResult.programs?.length || 0);
                console.groupEnd();

                return {
                    analysis: { programs: cacheResult.programs },
                    source: 'cache'
                };
            }

            console.group('🔍 NETLIFY CACHE STATUS');
            console.log('%c=== CACHE MISSING - STARTING FRESH SEARCH ===', 'color: #2196F3; font-weight: bold; font-size: 14px');
            console.log('➤ Will perform new Google Search');
            console.log('➤ Will perform new OpenAI Analysis');
            console.log('Category:', category);
            console.groupEnd();
        } catch (error) {
            console.group('🚨 NETLIFY CACHE ERROR');
            console.error('Cache check failed:', error);
            console.groupEnd();
        }

        // If not in cache or cache check failed, do fresh analysis
        console.group('🔄 NETLIFY FRESH SEARCH');
        console.log('%c=== PERFORMING FRESH SEARCH AND ANALYSIS ===', 'color: #FF9800; font-weight: bold; font-size: 14px');
        console.log('➤ Sending Google Search Request');
        console.log('Category:', category);
        console.log('Query:', fullQuery);
        console.groupEnd();

        const analyzeResponse = await fetch(`${this.baseUrl}/analyze`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                query: fullQuery,
                category,
                county,
                shouldSearch: true
            }),
        });

        if (!analyzeResponse.ok) {
            const errorData = await analyzeResponse.json();
            console.group('🚨 NETLIFY ANALYZE ERROR');
            console.error('Analysis failed:', {
                status: analyzeResponse.status,
                error: errorData.error,
                message: errorData.message,
                details: errorData.details
            });
            console.groupEnd();
            throw new Error(`Analysis failed: ${errorData.message}`);
        }

        const data = await analyzeResponse.json();
        console.group('✨ NETLIFY SEARCH COMPLETE');
        console.log('%c=== FRESH SEARCH COMPLETED ===', 'color: #4CAF50; font-weight: bold; font-size: 14px');
        console.log('✓ Google Search Complete');
        console.log('✓ OpenAI Analysis Complete');
        console.log('Category:', category);
        console.log('Programs Found:', data.programs?.length || 0);
        console.groupEnd();

        return {
            analysis: { programs: data.programs },
            source: 'search'
        };
    }

    updateUIWithResults(category, data) {
        const resultsContainer = document.getElementById(`${category.toLowerCase()}Results`);
        if (resultsContainer) {
            resultsContainer.innerHTML = '';
            const programs = data.analysis?.programs || [];
            programs.forEach((program) => {
                const card = this.createProgramCard(program);
                resultsContainer.appendChild(card);
            });
        }
        this.updateIcons(category, false, data.source === 'cache');
    }

    async analyzeSearchResults(results, category) {
        if (!results || results.length === 0) {
            return "No results found to analyze.";
        }

        try {
            const response = await fetch(`${this.baseUrl}/api/analyze-search-results`, {
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

    async analyze(county) {
        console.log('Starting analyze for county:', county, {
            timestamp: new Date().toISOString(),
            county,
            categories: ['Federal', 'State', 'County'],
            note: 'Processing Federal, State, and County categories'
        });

        this.results = {}; // Reset results at start of analyze
        
        try {
            // Process all categories but don't update UI yet
            console.log('\n===> PROCESSING FEDERAL CATEGORY');
            const federalResults = await this.processCategory('Federal', county, false);
            this.results.federal = federalResults.analysis;

            console.log('\n===> PROCESSING STATE CATEGORY');
            const stateResults = await this.processCategory('State', county, false);
            this.results.state = stateResults.analysis;

            console.log('\n===> PROCESSING COUNTY CATEGORY');
            const countyResults = await this.processCategory('County', county, false);
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
            
            // Now update UI for all categories at once
            ['federal', 'state', 'county'].forEach(category => {
                const resultsContainer = document.getElementById(`${category}Results`);
                if (resultsContainer) {
                    resultsContainer.innerHTML = '';
                    const programs = this.results[category]?.programs || [];
                    console.log(`\n===> UPDATING UI FOR ${category.toUpperCase()}:`, {
                        programCount: programs.length
                    });
                    programs.forEach((program) => {
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
        // Normalize the text by removing all whitespace and converting to lowercase
        const normalizedText = `${category}:${query}`.trim().toLowerCase().replace(/\s+/g, '');
        return normalizedText;
    }

    isRepeatSearch(category, county) {
        const searchKey = `${category}:${county || 'ALL'}`;
        const lastSearch = this.searchHistory.get(searchKey);
        
        if (lastSearch) {
            console.log('\n===> REPEAT SEARCH DETECTED:', {
                category,
                county,
                lastSearchTime: lastSearch.timestamp
            });
            return true;
        }
        
        // Track this search
        this.searchHistory.set(searchKey, {
            timestamp: new Date().toISOString(),
            category,
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

    displayResults(data) {
        const resultsContainer = document.getElementById('resultsContainer');
        if (resultsContainer) {
            resultsContainer.innerHTML = '';
            const programs = data.programs || [];
            programs.forEach((program) => {
                const card = this.createProgramCard(program);
                resultsContainer.appendChild(card);
            });
        }
    }

    displayError(message) {
        const errorContainer = document.getElementById('errorContainer');
        if (errorContainer) {
            errorContainer.textContent = message;
        }
    }

    async searchRebates(county) {
        // Get the first selected filter type as our project type
        const selectedFilters = this.getSelectedFilterTypes();
        if (selectedFilters.length === 0) {
            throw new Error('Please select at least one category (Solar, HVAC, etc.)');
        }
        
        // Use the first selected filter as our project type
        const projectType = selectedFilters[0];  // e.g. 'solar', 'hvac', etc.
        
        const response = await fetch(`${this.baseUrl}/analyze`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                level: 'County',       // The level we're searching at (Federal/State/County)
                county: county,        // The selected county name
                projectType: projectType // The type of project (solar, hvac, etc.)
            })
        });

        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        const data = await response.json();
        this.displayResults(data);
    }
}
