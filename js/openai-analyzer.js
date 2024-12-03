export default class RebatePrograms {
    constructor() {
        // Use environment-specific API URL
        const isNetlify = window.location.port === '8888';
        this.baseUrl = isNetlify ? '' : 'http://localhost:3000';
        this.cache = new Map();
        this.results = {};
        this.setupLogging();
        console.log('RebatePrograms initialized with:', {
            isNetlify,
            baseUrl: this.baseUrl
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

    createProgramCard(program, category) {
        const card = document.createElement('div');
        card.className = 'program-card';
        card.setAttribute('data-category', category.toLowerCase());

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
            <h3>${program.eligibleProjects}</h3>
            <p class="amount-summary">${program.amount}</p>
            <p class="program-brief">${program.summary}</p>
        `;

        summary.appendChild(summaryContent);
        summary.appendChild(toggleBtn);

        // Create the details section (hidden by default)
        const details = document.createElement('div');
        details.className = 'program-details';
        details.style.display = 'none';
        details.innerHTML = `
            <div class="details-grid">
                <div class="detail-item">
                    <h4>Program Name</h4>
                    <p>${program.programName || 'N/A'}</p>
                </div>
                <div class="detail-item">
                    <h4>Summary</h4>
                    <p>${program.summary || 'N/A'}</p>
                </div>
                <div class="detail-item">
                    <h4>Amount</h4>
                    <p>${program.amount || 'N/A'}</p>
                </div>
                <div class="detail-item">
                    <h4>Eligible Projects</h4>
                    <p>${program.eligibleProjects || 'N/A'}</p>
                </div>
                <div class="detail-item">
                    <h4>Eligible Recipients</h4>
                    <p>${program.eligibleRecipients || 'N/A'}</p>
                </div>
                <div class="detail-item">
                    <h4>Geographic Scope</h4>
                    <p>${program.geographicScope || 'N/A'}</p>
                </div>
                <div class="detail-item">
                    <h4>Requirements</h4>
                    <p>${program.requirements || 'N/A'}</p>
                </div>
                <div class="detail-item">
                    <h4>Application Process</h4>
                    <p>${program.applicationProcess || 'N/A'}</p>
                </div>
                <div class="detail-item">
                    <h4>Deadline</h4>
                    <p>${program.deadline || 'N/A'}</p>
                </div>
                <div class="detail-item">
                    <h4>Website</h4>
                    <p>${program.website ? `<a href="${program.website}" target="_blank">${program.website}</a>` : 'N/A'}</p>
                </div>
            </div>
        `;

        // Add click handler for toggle
        toggleBtn.addEventListener('click', () => {
            const isExpanded = details.style.display !== 'none';
            details.style.display = isExpanded ? 'none' : 'block';
            toggleBtn.querySelector('i').className = isExpanded ? 'fas fa-chevron-down' : 'fas fa-chevron-up';
        });

        card.appendChild(summary);
        card.appendChild(details);
        return card;
    }
}
