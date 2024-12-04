export default class RebatePrograms {
    constructor() {
        // Use environment-specific API URL
        const isNetlify = window.location.port === '8888';
        this.baseUrl = isNetlify ? '' : 'http://localhost:3000';
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
        // Normalize the text by removing all whitespace and converting to lowercase
        const normalizedText = `${category}:${query}`.trim().toLowerCase().replace(/\s+/g, '');
        return normalizedText;
    }

    async analyze(county) {
        console.log('Starting analyze for county:', county, {
            timestamp: new Date().toISOString(),
            county,
            categories: ['Federal', 'State', 'County'],
            note: 'Processing Federal and State categories'
        });

        this.results = {}; // Reset results at start of analyze
        
        try {
            await this.processCategory('Federal', county);
            await this.processCategory('State', county);
            // await this.processCategory('County', county);
            
            console.log('Final results:', this.results);
            
            return {
                federal: this.results.federal?.programs || [],
                state: this.results.state?.programs || [],
                county: [{
                    programName: "Temporarily Excluded",
                    summary: "County programs are temporarily excluded while we test Federal and State programs",
                    programType: "N/A",
                    amount: "N/A",
                    eligibleProjects: ["N/A"],
                    note: "This category is temporarily disabled"
                }]
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
            fullQuery = 'Federal energy rebate programs california, US government energy incentives california';
        } else if (category === 'State') {
            fullQuery = 'California state energy rebate programs, California state government energy incentives';
        } else if (category === 'County') {
            fullQuery = `${query} County energy rebate programs california`;
        }

        // Single search request log
        console.log('\nAPI To Google | Search Request:', {
            query: fullQuery,
            category,
            requestedResults: 10,
            timestamp: new Date().toISOString()
        });

        try {
            const response = await fetch(`${this.baseUrl}/api/analyze`, {
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

            // Update the UI
            const resultsContainer = document.getElementById(`${category.toLowerCase()}Results`);
            if (resultsContainer) {
                resultsContainer.innerHTML = '';
                this.results[category.toLowerCase()].programs.forEach((program) => {
                    const card = this.createProgramCard(program);
                    resultsContainer.appendChild(card);
                });
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
        console.log('Full program data:', program);
        console.log('Program collapsedSummary:', program.collapsedSummary);

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

        // Log the values being used in the HTML
        console.log('Values for HTML:', {
            programName: program.programName || 'Program Name Not Available',
            type: program.type || 'Rebate',
            collapsedSummary: program.collapsedSummary || 'Rebate Type Not Available'
        });

        // Create the HTML
        summaryContent.innerHTML = `
            <div class="program-header">
                <h3>${program.programName || 'Program Name Not Available'}</h3>
                <span class="program-type">${program.type || 'Rebate'}</span>
            </div>
            <h3 class="rebate-summary">${program.collapsedSummary || 'Rebate Type Not Available'}</h3>
        `;

        // Log the generated HTML
        console.log('Generated summary HTML:', summaryContent.innerHTML);

        summary.appendChild(summaryContent);
        summary.appendChild(toggleBtn);

        // Create the details section
        const details = document.createElement('div');
        details.className = 'program-details hidden';
        details.innerHTML = `
            <div class="details-content">
                <p class="description">${program.description || 'No description available'}</p>
                <div class="eligibility">
                    <h4>Eligibility</h4>
                    <ul>
                        ${program.eligibility?.recipients ? 
                            program.eligibility.recipients.map(recipient => `<li>${recipient}</li>`).join('') :
                            '<li>Eligibility information not available</li>'}
                    </ul>
                </div>
                <div class="requirements">
                    <h4>Requirements</h4>
                    <ul>
                        ${program.eligibility?.requirements ? 
                            program.eligibility.requirements.map(req => `<li>${req}</li>`).join('') :
                            '<li>Requirements information not available</li>'}
                    </ul>
                </div>
                <div class="application">
                    <h4>How to Apply</h4>
                    <p>${program.applicationProcess || 'Application process information not available'}</p>
                </div>
                ${program.source ? `<div class="source">
                    <h4>Source</h4>
                    <a href="${program.source}" target="_blank" rel="noopener noreferrer">Program Website</a>
                </div>` : ''}
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

        // Log the final card HTML
        console.log('Final card HTML:', card.innerHTML);

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
