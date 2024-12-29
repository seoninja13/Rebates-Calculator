export class RebatePrograms {
    constructor() {
        this.activeCategories = new Set();
        this.loadingSpinner = document.getElementById('loadingSpinner');
        this.searchButton = document.getElementById('searchButton');
        this.resultsContainer = document.getElementById('resultsContainer');
        this.hasSearched = false;  // Track if search has been performed
        this.setupCategoryListeners();
    }

    setupCategoryListeners() {
        const categoryIcons = document.querySelectorAll('.category-icon');
        categoryIcons.forEach(icon => {
            icon.addEventListener('click', () => {
                const category = icon.getAttribute('data-category');
                this.toggleCategory(category, icon);
            });
        });
    }

    toggleCategory(category, icon) {
        if (this.activeCategories.has(category)) {
            this.activeCategories.delete(category);
            icon.classList.remove('active');
        } else {
            this.activeCategories.add(category);
            icon.classList.add('active');
        }
        // No filtering here - wait for search
    }

    getCategoryFromProgram(program) {
        const title = (program.title || program.programName || '').toLowerCase();
        const description = (program.description || program.summary || program.collapsedSummary || '').toLowerCase();
        const content = title + ' ' + description;

        console.log(`\nAnalyzing program: "${title}"\nDescription: "${description}"`);

        // Solar category
        if (content.includes('solar') || 
            content.includes('photovoltaic') || 
            content.includes('itc') ||
            (content.includes('tax credit') && content.includes('energy')) ||
            content.includes('renewable energy')) {
            console.log('Categorized as: solar (matched solar keywords)');
            return 'solar';
        } 
        // Heat pumps category
        else if (content.includes('heat pump') || 
                 content.includes('heehra') ||
                 content.includes('electrification') ||
                 (content.includes('heating') && content.includes('electr')) ||
                 (content.includes('heating') && content.includes('upgrade') && !content.includes('hvac'))) {
            console.log('Categorized as: heat-pumps (matched heat pump keywords)');
            return 'heat-pumps';
        }
        // HVAC category
        else if (content.includes('hvac') || 
                 content.includes('air condition') ||
                 (content.includes('heating') && content.includes('cooling')) ||
                 (content.includes('heating') && !content.includes('heat pump'))) {
            console.log('Categorized as: hvac (matched HVAC keywords)');
            return 'hvac';
        }
        // EV Chargers category
        else if (content.includes('ev ') || 
                 content.includes('electric vehicle') || 
                 content.includes('charger') ||
                 content.includes('charging')) {
            console.log('Categorized as: ev-charger (matched EV keywords)');
            return 'ev-charger';
        }
        // Default to other
        console.log('Categorized as: other (no specific category matches)');
        return 'other';
    }

    formatCategory(category) {
        const formatMap = {
            'solar': 'Solar',
            'heat-pumps': 'Heat Pumps',
            'ev-charger': 'EV Chargers',
            'hvac': 'HVAC',
            'other': 'Other Programs'
        };
        return formatMap[category] || category;
    }

    createProgramCard(program) {
        const card = document.createElement('div');
        card.className = 'program-card';

        const title = document.createElement('h3');
        title.className = 'program-title';
        title.textContent = program.title;

        const description = document.createElement('p');
        description.className = 'program-description';
        description.textContent = program.summary || program.collapsedSummary || 'No description available';

        const amount = document.createElement('div');
        amount.className = 'program-amount';
        amount.textContent = program.amount || 'Amount varies';

        card.appendChild(title);
        card.appendChild(description);
        card.appendChild(amount);

        return card;
    }

    showLoadingSpinner() {
        if (this.loadingSpinner) {
            this.loadingSpinner.style.display = 'block';
        }
        if (this.resultsContainer) {
            this.resultsContainer.style.display = 'none';
        }
    }

    hideLoadingSpinner() {
        if (this.loadingSpinner) {
            this.loadingSpinner.style.display = 'none';
        }
    }

    displayResults(results) {
        if (!this.resultsContainer) return;

        // Clear any existing content
        this.resultsContainer.innerHTML = '';

        // If no categories selected, don't display anything
        if (this.activeCategories.size === 0) {
            return;
        }

        // Group programs by category
        const programsByCategory = {};
        ['federal', 'state', 'county'].forEach(level => {
            const levelPrograms = results[level]?.analysis?.programs || [];
            levelPrograms.forEach(program => {
                const category = this.getCategoryFromProgram(program);
                if (!programsByCategory[category]) {
                    programsByCategory[category] = { federal: [], state: [], county: [] };
                }
                program.level = level;
                programsByCategory[category][level].push(program);
            });
        });

        // Create sections for selected categories with programs
        Object.entries(programsByCategory).forEach(([category, levelPrograms]) => {
            if (!this.activeCategories.has(category)) return;

            const hasPrograms = Object.values(levelPrograms).some(programs => programs.length > 0);
            if (!hasPrograms) return;

            const section = document.createElement('div');
            section.className = 'program-section';
            section.setAttribute('data-category', category);

            const title = document.createElement('h2');
            title.className = 'category-header';
            title.textContent = this.formatCategory(category);
            section.appendChild(title);

            const content = document.createElement('div');
            content.className = 'program-content';

            ['federal', 'state', 'county'].forEach(level => {
                const programs = levelPrograms[level];
                if (programs.length === 0) return;

                const levelHeader = document.createElement('div');
                levelHeader.className = 'level-indicator';
                levelHeader.textContent = this.formatLevel(level);
                content.appendChild(levelHeader);

                programs.forEach(program => {
                    const card = this.createProgramCard(program);
                    content.appendChild(card);
                });
            });

            section.appendChild(content);
            this.resultsContainer.appendChild(section);
        });

        // Show results container if we have content
        if (this.resultsContainer.children.length > 0) {
            this.resultsContainer.style.display = 'block';
        }
    }

    formatLevel(level) {
        const levelMap = {
            'federal': 'Federal Programs',
            'state': 'State Programs',
            'county': 'County Programs'
        };
        return levelMap[level] || level;
    }
}
