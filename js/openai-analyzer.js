export default class RebatePrograms {
    constructor() {
        // Environment detection
        const isNetlifyProd = window.location.hostname.includes('netlify.app');
        const isNetlifyDev = window.location.port === '8888';
        this.isNetlify = isNetlifyProd || isNetlifyDev;
        this.baseUrl = this.isNetlify ? '/.netlify/functions' : 'http://localhost:3000/api';
        this.results = {};
        this.searchHistory = new Map();
        
        // Log environment details
        console.log('\n===> ENVIRONMENT DETECTION:', {
            hostname: window.location.hostname,
            port: window.location.port,
            isNetlifyProd,
            isNetlifyDev,
            isNetlify: this.isNetlify,
            baseUrl: this.baseUrl
        });

        this.setupLogging();
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
            this.updateIcons(category, true, false);
            
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

    // Preserve original local environment logic exactly
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

    // Netlify-specific logic
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

    createProgramCard(program) {
        console.log('\n%c=== Creating Program Card ===', 'color: #FF9800; font-size: 14px; font-weight: bold');
        
        const card = document.createElement('div');
        card.className = 'program-card';
        
        // Create the summary section (always visible)
        const summary = document.createElement('div');
        summary.className = 'program-summary';

        // Create the toggle button
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'toggle-details';
        toggleBtn.innerHTML = '<i class="fas fa-chevron-down"></i>';

        // Create the summary content
        const summaryContent = document.createElement('div');
        summaryContent.className = 'summary-content';

        summaryContent.innerHTML = `
            <div class="program-header">
                <h3>${program.programName || 'Program Name Not Available'}</h3>
                <span class="program-type">${program.type || 'Rebate'}</span>
            </div>
            <h3 class="rebate-summary">${program.collapsedSummary || 'Rebate Type Not Available'}</h3>
        `;

        summary.appendChild(summaryContent);
        summary.appendChild(toggleBtn);

        // Create the details section
        const details = document.createElement('div');
        details.className = 'program-details hidden';
        
        details.innerHTML = `
            <div class="details-content">
                ${program.collapsedSummary ? `<p class="expanded-summary">${program.collapsedSummary}</p>` : ''}

                <div class="program-section">
                    <h4>Program Name</h4>
                    <p>${program.programName || 'Not Available'}</p>
                </div>

                <div class="program-section">
                    <h4>Program Type</h4>
                    <p>${program.type || 'Not Available'}</p>
                </div>

                <div class="program-section">
                    <h4>Amount</h4>
                    <p>${program.amount || 'Not Available'}</p>
                </div>

                <div class="program-section">
                    <h4>Eligible Projects</h4>
                    <p>${program.eligibleProjects ? program.eligibleProjects.join(', ') : 'Not Available'}</p>
                </div>

                <div class="program-section">
                    <h4>Eligible Recipients</h4>
                    <p>${program.eligibility?.recipients ? program.eligibility.recipients.join(', ') : 'Not Available'}</p>
                </div>

                <div class="program-section">
                    <h4>Geographic Scope</h4>
                    <p>${program.geographicScope || 'Not Available'}</p>
                </div>

                <div class="program-section">
                    <h4>Requirements</h4>
                    <p>${program.requirements ? program.requirements.join(', ') : 'Not Available'}</p>
                </div>

                <div class="program-section">
                    <h4>Application Process</h4>
                    <p>${program.applicationProcess || 'Not Available'}</p>
                </div>

                <div class="program-section">
                    <h4>Deadline</h4>
                    <p>${program.deadline || 'Not Available'}</p>
                </div>

                <div class="program-section">
                    <h4>Website</h4>
                    <p>${program.websiteLink || 'Not Available'}</p>
                </div>

                <div class="program-section">
                    <h4>Contact Information</h4>
                    <p>${program.contactInfo || 'Not Available'}</p>
                </div>

                <div class="program-section">
                    <h4>Processing Time</h4>
                    <p>${program.processingTime || 'Not Available'}</p>
                </div>
            </div>
        `;

        // Add click handler for toggle button
        toggleBtn.addEventListener('click', () => {
            details.classList.toggle('hidden');
            toggleBtn.querySelector('i').classList.toggle('fa-chevron-up');
            toggleBtn.querySelector('i').classList.toggle('fa-chevron-down');
        });

        card.appendChild(summary);
        card.appendChild(details);

        return card;
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
}
