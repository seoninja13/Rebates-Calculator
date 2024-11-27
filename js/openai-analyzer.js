class RebatePrograms {
    constructor() {
        this.cache = new Map();
        const hostname = window.location.hostname;
        this.apiEndpoint = `${window.location.protocol}//${hostname}/.netlify/functions/analyze`;
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            this.apiEndpoint = 'http://localhost:3001/api/analyze';
        }
        console.log('Using API endpoint:', this.apiEndpoint);
    }

    async fetchPrograms(results, category) {
        const cacheKey = `${category}-${JSON.stringify(results)}`;
        
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
                body: JSON.stringify({ results, category })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            this.cache.set(cacheKey, data);
            return data;
        } catch (error) {
            console.error('Error:', error);
            throw error;
        }
    }

    createProgramCard(program) {
        const card = document.createElement('div');
        card.className = 'program-card';
        
        // Title
        const title = document.createElement('h3');
        title.className = 'program-title';
        title.textContent = program.name;
        card.appendChild(title);
        
        // Amount (always show)
        const amount = document.createElement('div');
        amount.className = 'program-amount';
        amount.textContent = `Rebate amount: ${program.amount !== 'Not specified' ? program.amount : 'Amount varies'}`;
        card.appendChild(amount);
        
        // Requirements
        if (program.requirements && program.requirements.length > 0) {
            const requirementsTitle = document.createElement('div');
            requirementsTitle.className = 'requirements-title';
            requirementsTitle.textContent = 'Requirements:';
            card.appendChild(requirementsTitle);
            
            program.requirements.forEach(req => {
                if (req && !req.toLowerCase().includes('not specified')) {
                    const requirement = document.createElement('div');
                    requirement.className = 'requirement-item';
                    requirement.textContent = req;
                    card.appendChild(requirement);
                }
            });
        }
        
        // Deadline
        if (program.deadline && program.deadline !== 'Not specified') {
            const deadline = document.createElement('div');
            deadline.className = 'program-deadline';
            deadline.textContent = `Deadline: ${program.deadline}`;
            card.appendChild(deadline);
        }
        
        return card;
    }

    displayPrograms(data, container, category) {
        if (!container || !category) {
            console.error('Missing container or category for displaying programs');
            return;
        }

        // Get or create category section
        let categorySection = document.getElementById(`${category.toLowerCase()}Results`);
        if (!categorySection) {
            categorySection = document.createElement('div');
            categorySection.id = `${category.toLowerCase()}Results`;
            categorySection.className = 'category-section';
            
            const header = document.createElement('h2');
            header.className = 'category-header';
            header.textContent = `${category} Programs`;
            categorySection.appendChild(header);
            
            container.appendChild(categorySection);
        } else {
            // Clear existing content in the category section
            categorySection.innerHTML = '';
            const header = document.createElement('h2');
            header.className = 'category-header';
            header.textContent = `${category} Programs`;
            categorySection.appendChild(header);
        }

        if (!data || !data.programs || !Array.isArray(data.programs)) {
            categorySection.innerHTML += '<div class="error-message">No valid program data available</div>';
            return;
        }

        // Create and append program cards
        data.programs.forEach(program => {
            if (!program.name.toLowerCase().includes('category:')) {
                const card = this.createProgramCard(program);
                categorySection.appendChild(card);
            }
        });
    }
}

export default RebatePrograms;
