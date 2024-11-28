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
            const response = await fetch(this.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ results, category })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Server response (${response.status}):`, errorText);
                
                if (response.status === 502) {
                    throw new Error('The request took too long to process. Please try again with a more specific search term.');
                }
                
                throw new Error(`Server error (${response.status}): ${errorText || 'No error details available'}`);
            }

            const data = await response.json();
            this.cache.set(cacheKey, data);
            return data;
        } catch (error) {
            console.error('Error in fetchPrograms:', error);
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
        
        // Summary
        if (program.summary) {
            const summary = document.createElement('div');
            summary.className = 'program-summary';
            summary.textContent = program.summary;
            card.appendChild(summary);
        }
        
        // Program Type and Amount
        const typeAmount = document.createElement('div');
        typeAmount.className = 'program-header';
        typeAmount.innerHTML = `
            <div class="program-info">
                <div class="program-type"><i class="fas fa-tag"></i>Program Type: ${program.programType}</div>
                <div class="program-amount"><i class="fas fa-dollar-sign"></i>Amount: ${program.amount}</div>
            </div>
        `;
        card.appendChild(typeAmount);

        // Eligibility Information
        const eligibility = document.createElement('div');
        eligibility.className = 'program-eligibility';
        eligibility.innerHTML = `
            <div class="eligibility-item"><i class="fas fa-check"></i>Eligible Projects: ${program.eligibleProjects || 'Contact for details'}</div>
            <div class="eligibility-item"><i class="fas fa-users"></i>Eligible Recipients: ${program.eligibleRecipients || 'Contact for details'}</div>
            <div class="eligibility-item"><i class="fas fa-map-marker-alt"></i>Geographic Scope: ${program.geographicScope || 'Contact for details'}</div>
        `;
        card.appendChild(eligibility);
        
        // Requirements
        if (program.requirements && program.requirements.length > 0) {
            const requirementsTitle = document.createElement('div');
            requirementsTitle.className = 'requirements-title';
            requirementsTitle.innerHTML = '<i class="fas fa-list"></i>Requirements';
            card.appendChild(requirementsTitle);
            
            const requirementsList = document.createElement('div');
            requirementsList.className = 'requirements-list';
            program.requirements.forEach(req => {
                if (req && !req.toLowerCase().includes('not specified')) {
                    const requirement = document.createElement('div');
                    requirement.className = 'requirement-item';
                    requirement.textContent = req;  
                    requirementsList.appendChild(requirement);
                }
            });
            card.appendChild(requirementsList);
        }

        // Application Process
        if (program.applicationProcess) {
            const process = document.createElement('div');
            process.className = 'application-process';
            process.innerHTML = `<i class="fas fa-file-alt"></i>Application Process: ${program.applicationProcess}`;
            card.appendChild(process);
        }
        
        // Deadline and Processing Time
        const timing = document.createElement('div');
        timing.className = 'program-timing';
        timing.innerHTML = `
            <div class="deadline"><i class="fas fa-clock"></i>Deadline: ${program.deadline || 'Contact for details'}</div>
            <div class="processing-time"><i class="fas fa-hourglass-half"></i>Processing Time: ${program.processingTime || 'Contact for details'}</div>
        `;
        card.appendChild(timing);

        // Contact Information
        if (program.websiteLink || program.contactInfo) {
            const contact = document.createElement('div');
            contact.className = 'program-contact';
            if (program.websiteLink) {
                contact.innerHTML += `<div class="website"><i class="fas fa-globe"></i>Website: <a href="${program.websiteLink}" target="_blank">Visit Website</a></div>`;
            }
            if (program.contactInfo) {
                contact.innerHTML += `<div class="contact-info"><i class="fas fa-phone"></i>Contact: ${program.contactInfo}</div>`;
            }
            card.appendChild(contact);
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
