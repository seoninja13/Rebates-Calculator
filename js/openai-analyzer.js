class RebatePrograms {
    constructor() {
        this.cache = new Map();
        // Get the current hostname
        const hostname = window.location.hostname;
        // Use production endpoint or fallback to local during development
        this.apiEndpoint = `${window.location.protocol}//${hostname}/.netlify/functions/analyze`;
        // Fallback to local if in development
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            this.apiEndpoint = 'http://localhost:3001/api/analyze';
        }
        console.log('Using API endpoint:', this.apiEndpoint);
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
            name.className = 'program-name';
            name.textContent = program.name || 'Program Name Not Available';
            card.appendChild(name);

            // Program summary
            const summary = document.createElement('p');
            summary.className = 'program-summary';
            summary.textContent = program.summary || 'No summary available';
            card.appendChild(summary);

            // Amount - now always displayed since it's required
            const amount = document.createElement('div');
            amount.className = 'program-amount';
            // Default to dollar sign if amount is missing or doesn't specify percentage
            const amountText = program.amount || 'Contact for details';
            const icon = (amountText && amountText.includes('%')) ? 'fa-percent' : 'fa-dollar-sign';
            amount.innerHTML = `<i class="fas ${icon}"></i> ${amountText}`;
            card.appendChild(amount);

            // Requirements if available
            if (program.requirements && program.requirements.length > 0) {
                const requirements = document.createElement('ul');
                requirements.className = 'program-requirements';
                program.requirements.forEach(req => {
                    const li = document.createElement('li');
                    li.innerHTML = `<i class="fas fa-check"></i> ${req}`;
                    requirements.appendChild(li);
                });
                card.appendChild(requirements);
            }

            // Deadline if available
            if (program.deadline && program.deadline !== "Ongoing") {
                const deadline = document.createElement('div');
                deadline.className = 'program-deadline';
                deadline.innerHTML = `<i class="fas fa-clock"></i> Deadline: ${program.deadline}`;
                card.appendChild(deadline);
            }

            section.appendChild(card);
        });

        container.appendChild(section);
    }
}

// Export the class
export default RebatePrograms;
