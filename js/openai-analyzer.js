class RebatePrograms {
    constructor() {
        this.cache = new Map();
        // Always use local server during development
        this.apiEndpoint = 'http://localhost:3000/api/analyze';
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
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
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
                const errorText = await response.text();
                console.error('Server response:', errorText);
                throw new Error(`Request failed: ${response.status} - ${errorText}`);
            }

            const analysis = await response.json();
            console.log('Received analysis:', analysis);
            this.cache.set(cacheKey, analysis);
            return analysis;

        } catch (error) {
            console.error('Error fetching analysis:', error);
            throw new Error('Failed to fetch analysis: ' + error.message);
        }
    }

    displayPrograms(analysis, container) {
        // Create programs section
        const section = document.createElement('section');
        section.className = 'programs-section';

        // Add header
        const header = document.createElement('div');
        header.className = 'programs-header';
        header.innerHTML = `
            <i class="fas fa-award"></i>
            <h2 class="programs-title">${analysis.category}</h2>
            <span class="programs-date">Updated ${new Date(analysis.timestamp).toLocaleDateString()}</span>
        `;
        section.appendChild(header);

        // Parse the content into program cards
        const programs = this._parsePrograms(analysis.content);
        const grid = document.createElement('div');
        grid.className = 'programs-grid';

        programs.forEach(program => {
            const card = this._createProgramCard(program);
            grid.appendChild(card);
        });

        section.appendChild(grid);

        // Add disclaimer
        const note = document.createElement('div');
        note.className = 'programs-note';
        note.innerHTML = `<i class="fas fa-info-circle"></i> ${analysis.disclaimer}`;
        section.appendChild(note);

        container.appendChild(section);
    }

    _parsePrograms(content) {
        const programs = [];
        const lines = content.split('\n');
        let currentProgram = null;

        lines.forEach(line => {
            line = line.trim();
            
            // Skip empty lines and category headers
            if (!line || line.startsWith('Category:')) return;

            // New program starts with a number
            if (/^\d+\./.test(line)) {
                if (currentProgram) {
                    programs.push(currentProgram);
                }
                currentProgram = {
                    name: line.replace(/^\d+\.\s*/, '').trim(),
                    price: '',
                    requirements: [],
                    deadline: ''
                };
            } else if (currentProgram) {
                // Parse program details
                if (line.startsWith('Price:')) {
                    currentProgram.price = line.replace('Price:', '').trim();
                } else if (line.startsWith('Key Requirements:')) {
                    // Skip the header, requirements will be added below
                } else if (line.startsWith('-')) {
                    currentProgram.requirements.push(line.replace('-', '').trim());
                } else if (line.startsWith('Deadline:')) {
                    currentProgram.deadline = line.replace('Deadline:', '').trim();
                }
            }
        });

        // Add the last program
        if (currentProgram) {
            programs.push(currentProgram);
        }

        return programs;
    }

    _createProgramCard(program) {
        const card = document.createElement('div');
        card.className = 'program-card';
        
        card.innerHTML = `
            <div class="program-header">
                ${program.name}
            </div>
            <div class="program-amount">
                <i class="fas fa-dollar-sign"></i>
                ${program.price}
            </div>
            <div class="program-requirements">
                <div class="requirements-title">Requirements:</div>
                ${program.requirements.map(req => `
                    <div class="requirement-item">
                        <i class="fas fa-check"></i>
                        <span>${req}</span>
                    </div>
                `).join('')}
            </div>
            ${program.deadline ? `
                <div class="program-deadline">
                    <i class="fas fa-clock"></i>
                    Deadline: ${program.deadline}
                </div>
            ` : ''}
        `;
        
        return card;
    }
}

// Export the program handler
window.RebatePrograms = RebatePrograms;
