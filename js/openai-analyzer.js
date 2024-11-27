class RebatePrograms {
    constructor() {
        this.cache = new Map();
        // Use production endpoint or fallback to local during development
        this.apiEndpoint = 'https://rebates-calculator.netlify.app/.netlify/functions/analyze';
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
               Array.isArray(analysis.programs);
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

        const date = document.createElement('div');
        date.className = 'programs-date';
        date.textContent = new Date().toLocaleDateString();
        header.appendChild(date);

        section.appendChild(header);

        // Create programs grid
        const programsGrid = document.createElement('div');
        programsGrid.className = 'programs-grid';

        // Add programs
        analysis.programs.forEach(program => {
            const programCard = document.createElement('div');
            programCard.className = 'program-card';

            // Program header
            const programHeader = document.createElement('div');
            programHeader.className = 'program-header';
            programHeader.textContent = program.name || 'Program Name Not Available';
            programCard.appendChild(programHeader);

            // Program amount
            if (program.price) {
                const amount = document.createElement('div');
                amount.className = 'program-amount';
                amount.innerHTML = `<i class="fas fa-money-bill-wave"></i>${program.price}`;
                programCard.appendChild(amount);
            }

            // Requirements section
            if (program.requirements && program.requirements.length > 0) {
                const reqSection = document.createElement('div');
                reqSection.className = 'program-requirements';
                
                const reqTitle = document.createElement('div');
                reqTitle.className = 'requirements-title';
                reqTitle.textContent = 'Key Requirements';
                reqSection.appendChild(reqTitle);

                program.requirements.forEach(req => {
                    const reqItem = document.createElement('div');
                    reqItem.className = 'requirement-item';
                    
                    const reqIcon = document.createElement('i');
                    reqIcon.className = 'fas fa-check';
                    reqItem.appendChild(reqIcon);

                    const reqText = document.createElement('div');
                    reqText.textContent = req;
                    reqItem.appendChild(reqText);

                    reqSection.appendChild(reqItem);
                });
                
                programCard.appendChild(reqSection);
            }

            // Deadline
            if (program.deadline) {
                const deadline = document.createElement('div');
                deadline.className = 'program-deadline';
                deadline.innerHTML = `<i class="far fa-clock"></i>${program.deadline}`;
                programCard.appendChild(deadline);
            }

            programsGrid.appendChild(programCard);
        });

        section.appendChild(programsGrid);

        // Add disclaimer note
        if (analysis.disclaimer) {
            const note = document.createElement('div');
            note.className = 'programs-note';
            note.textContent = analysis.disclaimer;
            section.appendChild(note);
        }

        container.appendChild(section);
    }
}

// Export the class
export default RebatePrograms;
