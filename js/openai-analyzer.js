class RebatePrograms {
    constructor() {
        this.cache = new Map();
        // Use production endpoint or fallback to local during development
        this.apiEndpoint = 'https://rebates-calculator.netlify.app/.netlify/functions/analyze';
        // Fallback to local if in development
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            this.apiEndpoint = 'http://localhost:3000/api/analyze';
        }
    }

    async fetchPrograms(results, category) {
        const cacheKey = `${category}-${JSON.stringify(results)}`;
        
        // Check cache
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            console.log('Sending request to:', this.apiEndpoint);
            console.log('Request data:', { results, category });

            const response = await fetch(this.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                mode: 'cors',
                body: JSON.stringify({ 
                    results: results.map(r => ({
                        title: r.title,
                        snippet: r.snippet,
                        link: r.link
                    })), 
                    category 
                })
            });

            if (!response.ok) {
                throw new Error('Failed to fetch analysis');
            }

            const analysis = await response.json();
            
            // Validate the response format
            if (!this._isValidAnalysis(analysis)) {
                throw new Error('Invalid analysis format');
            }

            console.log('Received analysis:', analysis);
            
            // Cache the result
            this.cache.set(cacheKey, analysis);
            
            return analysis;
        } catch (error) {
            console.error('Error fetching analysis:', error);
            throw error;
        }
    }

    _isValidAnalysis(analysis) {
        return analysis && 
               typeof analysis === 'object' && 
               'category' in analysis && 
               'programs' in analysis &&
               Array.isArray(analysis.programs);
    }

    displayPrograms(analysis, container) {
        const section = document.createElement('div');
        section.className = 'rebate-section';
        
        // Add category header
        const header = document.createElement('h2');
        header.className = 'category-header';
        header.textContent = analysis.category;
        section.appendChild(header);

        // Add programs
        analysis.programs.forEach(program => {
            const programDiv = document.createElement('div');
            programDiv.className = 'rebate-program';

            // Program header with title and amount
            const programHeader = document.createElement('div');
            programHeader.className = 'program-header';

            const title = document.createElement('h3');
            title.className = 'rebate-title';
            title.textContent = program.name || 'Program Name Not Available';
            programHeader.appendChild(title);

            if (program.amount) {
                const amount = document.createElement('div');
                amount.className = 'program-amount';
                amount.textContent = program.amount;
                programHeader.appendChild(amount);
            }

            programDiv.appendChild(programHeader);

            // Requirements section
            if (program.requirements && program.requirements.length > 0) {
                const reqSection = document.createElement('div');
                reqSection.className = 'requirements-section';
                
                const reqTitle = document.createElement('h4');
                reqTitle.textContent = 'Key Requirements:';
                reqSection.appendChild(reqTitle);

                const reqList = document.createElement('ul');
                program.requirements.forEach(req => {
                    const li = document.createElement('li');
                    li.textContent = req;
                    reqList.appendChild(li);
                });
                reqSection.appendChild(reqList);
                
                programDiv.appendChild(reqSection);
            }

            // Deadline section
            if (program.deadline) {
                const deadline = document.createElement('div');
                deadline.className = 'deadline-section';
                deadline.innerHTML = `<strong>Deadline:</strong> ${program.deadline}`;
                programDiv.appendChild(deadline);
            }

            section.appendChild(programDiv);
        });

        container.appendChild(section);
    }
}

// Export the class
export default RebatePrograms;
