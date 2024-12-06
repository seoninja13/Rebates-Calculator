export default class RebatePrograms {
    constructor() {
        // Use environment-specific API URL
        const isNetlify = window.location.port === '8888';
        this.baseUrl = isNetlify ? '/.netlify/functions' : 'http://localhost:3000/api';
        this.cache = new Map();
        this.results = {};
        this.setupLogging();
        console.log('%cUI | Initialization', 'color: #2196F3; font-weight: bold', {
            isNetlify,
            baseUrl: this.baseUrl,
            timestamp: new Date().toISOString()
        });
    }

    setupLogging() {
        const isNetlify = window.location.port === '8888';
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
            await this.processCategory('Federal', county, false);
            await this.processCategory('State', county, false);
            await this.processCategory('County', county, false);
            
            console.log('Final results:', this.results);
            
            // Now update UI for all categories at once
            ['federal', 'state', 'county'].forEach(category => {
                const resultsContainer = document.getElementById(`${category}Results`);
                if (resultsContainer) {
                    resultsContainer.innerHTML = '';
                    if (this.results[category] && this.results[category].programs) {
                        this.results[category].programs.forEach((program) => {
                            const card = this.createProgramCard(program);
                            resultsContainer.appendChild(card);
                        });
                    }
                }
            });
            
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

        // Single search request log
        console.log('\nAPI To Google | Search Request:', {
            query: fullQuery,
            category,
            requestedResults: 10,
            timestamp: new Date().toISOString()
        });

        try {
            const response = await fetch(`${this.baseUrl}/analyze`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    query: fullQuery, 
                    category
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            // Log Google search results with proper format
            console.log('\nGoogle TO API | Search Results:', {
                resultCount: data.googleResults?.items?.length || 0,
                results: data.googleResults?.items?.map(item => ({
                    title: item.title,
                    link: item.link
                })) || [],
                category,
                timestamp: new Date().toISOString()
            });

            console.log('\nAPI → OpenAI | Sending Request:', {
                category,
                searchResults: data.googleResults?.items?.length || 0,
                timestamp: new Date().toISOString()
            });

            console.log('\nOpenAI → API | Analysis Results:', {
                category,
                programCount: data.analysis?.programs?.length || 0,
                timestamp: new Date().toISOString()
            });

            // Store results
            this.results[category.toLowerCase()] = {
                results: data.googleResults,
                programs: (data.analysis && data.analysis.programs) ? data.analysis.programs.map(program => {
                    const mappedProgram = {
                        ...program,
                        category: category.toLowerCase()
                    };
                    return mappedProgram;
                }) : [],
                error: false,
                loading: false,
                source: data.source || 'fresh'
            };

            console.log('\nAPI → UI | Final Programs:', {
                category,
                totalPrograms: this.results[category.toLowerCase()].programs.length,
                programs: this.results[category.toLowerCase()].programs.map(p => ({
                    name: p.programName,
                    type: p.programType,
                    collapsedSummary: p.collapsedSummary
                })),
                timestamp: new Date().toISOString()
            });

            // Only update UI if flag is true
            if (updateUI) {
                const resultsContainer = document.getElementById(`${category.toLowerCase()}Results`);
                if (resultsContainer) {
                    resultsContainer.innerHTML = '';
                    this.results[category.toLowerCase()].programs.forEach((program) => {
                        const card = this.createProgramCard(program);
                        resultsContainer.appendChild(card);
                    });
                }
            }

            return this.results[category.toLowerCase()].programs;
        } catch (error) {
            console.error('\nAPI → UI | Error:', {
                error: error.message,
                category,
                stack: error.stack,
                timestamp: new Date().toISOString()
            });
            throw error;
        }
    }

    async analyzeSearchResults(results, category) {
        if (!results || results.length === 0) {
            return "No results found to analyze.";
        }

        try {
            const response = await fetch(`${this.baseUrl}/analyze-search-results`, {
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
}
