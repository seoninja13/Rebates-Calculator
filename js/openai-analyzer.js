class RebatePrograms {
    constructor() {
        this.cache = new Map();
        // Use production endpoint or fallback to local during development
        this.apiEndpoint = 'https://green-rebates-calculator.netlify.app/.netlify/functions/analyze';
        // Fallback to local if in development
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            this.apiEndpoint = 'http://localhost:3001/api/analyze';
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
               Array.isArray(analysis.programs) &&
               analysis.programs.every(program => 
                   typeof program === 'object' &&
                   'name' in program
               );
    }

    displayPrograms(analysis, container) {
        // Create programs section
        const section = document.createElement('div');
        section.className = 'programs-section';

        // Add header
        const header = document.createElement('div');
        header.className = 'programs-header';
        
        const icon = document.createElement('i');
        icon.className = 'fas fa-leaf';
        header.appendChild(icon);

        const title = document.createElement('div');
        title.className = 'programs-title';
        title.textContent = analysis.category;
        header.appendChild(title);

        section.appendChild(header);

        // Add programs
        analysis.programs.forEach(program => {
            const card = document.createElement('div');
            card.className = 'program-card';

            // Program name
            const name = document.createElement('h3');
            name.textContent = program.name;
            card.appendChild(name);

            // Amount if available
            if (program.amount) {
                const amount = document.createElement('div');
                amount.className = 'program-amount';
                amount.innerHTML = `<i class="fas fa-dollar-sign"></i> ${program.amount}`;
                card.appendChild(amount);
            }

            // Requirements if available
            if (program.requirements && program.requirements.length > 0) {
                const requirements = document.createElement('ul');
                requirements.className = 'program-requirements';
                program.requirements.forEach(req => {
                    const li = document.createElement('li');
                    li.textContent = req;
                    requirements.appendChild(li);
                });
                card.appendChild(requirements);
            }

            // Deadline if available
            if (program.deadline) {
                const deadline = document.createElement('div');
                deadline.className = 'program-deadline';
                deadline.innerHTML = `<i class="fas fa-clock"></i> Deadline: ${program.deadline}`;
                card.appendChild(deadline);
            }

            section.appendChild(card);
        });

        // Add disclaimer if available
        if (analysis.disclaimer) {
            const disclaimer = document.createElement('div');
            disclaimer.className = 'program-disclaimer';
            disclaimer.textContent = analysis.disclaimer;
            section.appendChild(disclaimer);
        }

        container.appendChild(section);
    }
}

// Export the class
export default RebatePrograms;
