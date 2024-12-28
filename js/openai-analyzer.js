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
        if (!program || typeof program !== 'object') {
            console.error('Invalid program data:', program);
            return null;
        }

        const card = document.createElement('div');
        card.className = 'program-card';
        
        // Create the card content
        card.innerHTML = `
            <div class="program-summary">
                <div class="summary-content">
                    <h3>${program.title || program.programName || 'Untitled Program'}</h3>
                    <p class="program-type">${program.programType || 'Unknown Type'}</p>
                    <p class="rebate-summary">${program.collapsedSummary || program.amount || 'Amount not specified'}</p>
                    <p class="program-desc">${program.summary || 'No description available'}</p>
                </div>
                <button class="toggle-details" aria-label="Toggle Details">
                    <i class="fas fa-chevron-down"></i>
                </button>
            </div>
            <div class="program-details" style="display: none;">
                <div class="details-grid">
                    ${program.eligibleProjects ? `
                    <div class="detail-item">
                        <h4>Eligible Projects</h4>
                        <ul>
                            ${Array.isArray(program.eligibleProjects) ? 
                                program.eligibleProjects.map(project => 
                                    `<li>${typeof project === 'object' ? project.name : project}</li>`
                                ).join('') : 
                                `<li>${program.eligibleProjects}</li>`
                            }
                        </ul>
                    </div>
                    ` : ''}
                    ${program.requirements ? `
                    <div class="detail-item">
                        <h4>Requirements</h4>
                        <ul>
                            ${Array.isArray(program.requirements) ? 
                                program.requirements.map(req => `<li>${req}</li>`).join('') : 
                                `<li>${program.requirements}</li>`
                            }
                        </ul>
                    </div>
                    ` : ''}
                    ${program.applicationProcess ? `
                    <div class="detail-item">
                        <h4>Application Process</h4>
                        <p>${program.applicationProcess}</p>
                    </div>
                    ` : ''}
                    ${program.contactInfo ? `
                    <div class="detail-item">
                        <h4>Contact Information</h4>
                        <p>${program.contactInfo}</p>
                        ${program.websiteLink ? `<p><a href="${program.websiteLink}" target="_blank">Program Website</a></p>` : ''}
                    </div>
                    ` : ''}
                </div>
            </div>
        `;

        // Add event listener for toggle button
        const toggleButton = card.querySelector('.toggle-details');
        const detailsSection = card.querySelector('.program-details');
        if (toggleButton && detailsSection) {
            toggleButton.addEventListener('click', () => {
                const isExpanded = detailsSection.style.display !== 'none';
                detailsSection.style.display = isExpanded ? 'none' : 'block';
                toggleButton.querySelector('i').className = isExpanded ? 'fas fa-chevron-down' : 'fas fa-chevron-up';
            });
        }

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
        try {
            const results = {
                federal: [],
                state: [],
                county: []
            };

            // Show loading state
            document.getElementById('resultsContainer').style.display = 'none';

            // Search all levels
            await Promise.all([
                this.searchPrograms('federal', county).then(data => {
                    if (data?.displayData?.results) {
                        results.federal = data.displayData.results;
                    }
                }),
                this.searchPrograms('state', county).then(data => {
                    if (data?.displayData?.results) {
                        results.state = data.displayData.results;
                    }
                }),
                this.searchPrograms('county', county).then(data => {
                    if (data?.displayData?.results) {
                        results.county = data.displayData.results;
                    }
                })
            ]);

            // Display combined results
            this.displayResults(results);

            // Show results container
            document.getElementById('resultsContainer').style.display = 'block';

            return results;
        } catch (error) {
            console.error('Error in analyze:', error);
            throw error;
        }
    }

    async searchPrograms(level, county = null) {
        try {
            // Try to get cached data first
            const cachedData = await this.getCachedData(level, county);
            if (cachedData?.success && cachedData.displayData?.results?.length > 0) {
                console.log('Using cached data:', cachedData);
                return cachedData;
            }

            // If no cached data, make API call
            const url = '/.netlify/functions/direct-retrieval';
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
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error searching programs:', error);
            this.handleError(error);
            return null;
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
                throw new Error('Failed to fetch cached data');
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

    processLevel(level, query, updateUI = true) {
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

    displayResults(results) {
        console.log('Displaying results:', results);
        
        // Create a map to store programs by category
        const programsByCategory = {
            solar: [],
            hvac: [],
            insulation: [],
            windows: [],
            appliances: [],
            'water-heater': [],
            lighting: [],
            weatherization: [],
            roofing: [],
            battery: [],
            'heat-pumps': [],
            'ev-charger': []
        };

        // Helper function to categorize a program
        const categorizeProgram = (program) => {
            const title = program.title.toLowerCase();
            if (title.includes('solar')) return 'solar';
            if (title.includes('hvac') || title.includes('cooling')) return 'hvac';
            if (title.includes('heat pump')) return 'heat-pumps';
            if (title.includes('insulation')) return 'insulation';
            if (title.includes('window')) return 'windows';
            if (title.includes('appliance')) return 'appliances';
            if (title.includes('water heat')) return 'water-heater';
            if (title.includes('light')) return 'lighting';
            if (title.includes('weather')) return 'weatherization';
            if (title.includes('roof')) return 'roofing';
            if (title.includes('battery') || title.includes('storage')) return 'battery';
            if (title.includes('ev') || title.includes('charger')) return 'ev-charger';
            return null; // uncategorized
        };

        // Categorize all programs
        ['federal', 'state', 'county'].forEach(level => {
            if (results[level]) {
                results[level].forEach(program => {
                    const category = categorizeProgram(program);
                    if (category && programsByCategory[category]) {
                        programsByCategory[category].push({
                            ...program,
                            level: level
                        });
                    }
                });
            }
        });

        // Update the UI for each category
        Object.entries(programsByCategory).forEach(([category, programs]) => {
            const sectionContainer = document.querySelector(`.program-section[data-category="${category}"]`);
            if (!sectionContainer) {
                console.log(`Creating container for ${category} programs`);
                // Create new section if it doesn't exist
                const newSection = this.createProgramSection(category, programs);
                document.getElementById('resultsContainer').appendChild(newSection);
            } else {
                console.log(`Updating container for ${category} programs`);
                // Update existing section
                const contentContainer = sectionContainer.querySelector('.program-content');
                contentContainer.innerHTML = ''; // Clear existing content
                
                if (programs.length === 0) {
                    contentContainer.innerHTML = `<div class="program-row">No ${category.replace('-', ' ')} programs found.</div>`;
                } else {
                    programs.forEach(program => {
                        const row = document.createElement('div');
                        row.className = 'program-row';
                        
                        const title = document.createElement('div');
                        title.className = 'program-title';
                        title.textContent = program.title;
                        
                        const amount = document.createElement('div');
                        amount.className = 'program-amount';
                        amount.textContent = program.amount || program.summary;
                        
                        row.appendChild(title);
                        row.appendChild(amount);
                        contentContainer.appendChild(row);
                    });
                }
            }
        });
    }

    createProgramSection(category, programs) {
        const section = document.createElement('div');
        section.className = 'program-section';
        section.setAttribute('data-category', category);

        const header = document.createElement('h2');
        header.textContent = category.split('-').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');

        const content = document.createElement('div');
        content.className = 'program-content';

        if (programs.length === 0) {
            content.innerHTML = `<div class="program-row">No ${category.replace('-', ' ')} programs found.</div>`;
        } else {
            programs.forEach(program => {
                const row = document.createElement('div');
                row.className = 'program-row';
                
                const title = document.createElement('div');
                title.className = 'program-title';
                title.textContent = program.title;
                
                const amount = document.createElement('div');
                amount.className = 'program-amount';
                amount.textContent = program.amount || program.summary;
                
                row.appendChild(title);
                row.appendChild(amount);
                content.appendChild(row);
            });
        }

        section.appendChild(header);
        section.appendChild(content);
        return section;
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
