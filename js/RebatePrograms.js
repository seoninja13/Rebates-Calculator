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

        // Solar category - must explicitly mention solar or photovoltaic
        if (content.includes('solar') || 
            content.includes('photovoltaic') || 
            content.includes('solar tax credit') ||
            content.includes('itc') && content.includes('solar')) {
            console.log('Categorized as: solar (matched solar keywords)');
            return 'solar';
        } 
        // Windows and Doors category
        else if (content.includes('window') || 
                 content.includes('door') ||
                 content.includes('home improvement') && (content.includes('window') || content.includes('door'))) {
            console.log('Categorized as: windows-doors (matched windows/doors keywords)');
            return 'windows-doors';
        }
        // Heat pumps category
        else if (content.includes('heat pump') || 
                 content.includes('heehra') ||
                 content.includes('electrification') ||
                 (content.includes('heating') && content.includes('electr'))) {
            console.log('Categorized as: heat-pumps (matched heat pump keywords)');
            return 'heat-pumps';
        }
        // HVAC category
        else if (content.includes('hvac') || 
                 content.includes('air condition') ||
                 (content.includes('heating') && content.includes('cooling'))) {
            console.log('Categorized as: hvac (matched HVAC keywords)');
            return 'hvac';
        }
        // Default to other
        console.log('Categorized as: other (no specific category matches)');
        return 'other';
    }

    formatCategory(category) {
        const formatMap = {
            'solar': 'Solar',
            'heat-pumps': 'Heat Pumps',
            'hvac': 'HVAC',
            'windows-doors': 'Windows and Doors',
            'other': 'Other Programs'
        };
        return formatMap[category] || category;
    }

    createProgramCard(program) {
        const card = document.createElement('div');
        card.className = 'program-row';

        // Create left side with title
        const leftSide = document.createElement('div');
        leftSide.className = 'program-info';

        // Title
        const title = document.createElement('div');
        title.className = 'program-title';
        
        // Get the base title from either title or programName
        const baseTitle = program.title || program.programName;
        
        // Format the title based on level
        let formattedTitle = '';
        if (program.level === 'federal') {
            formattedTitle = 'Federal ' + baseTitle;
        } else if (program.level === 'state') {
            formattedTitle = 'California ' + baseTitle;
        } else if (program.level === 'county' && program.county) {
            // Only add county name if it's not already in the title
            if (!baseTitle.includes(program.county)) {
                formattedTitle = program.county + ' County ' + baseTitle;
            } else {
                formattedTitle = baseTitle;
            }
        } else {
            formattedTitle = baseTitle;
        }

        // Clean up common formatting issues
        formattedTitle = formattedTitle
            .replace(/\s+/g, ' ')  // Remove extra spaces
            .replace(/\b(ITC)\b/g, 'Tax Credit')  // Replace ITC with Tax Credit
            .trim();

        title.textContent = formattedTitle;
        leftSide.appendChild(title);

        // Format the amount and basis
        const amount = document.createElement('div');
        amount.className = 'program-amount';
        
        let amountText = program.amount || 'Amount varies';
        if (typeof amountText === 'string') {
            // Handle percentage amounts
            if (amountText.includes('%')) {
                amountText = amountText.replace('Up to ', '') + ' of cost';
            }
            // Handle dollar amounts
            else if (amountText.toLowerCase().includes('up to')) {
                // Keep it as is, but ensure proper capitalization
                amountText = 'Up to' + amountText.toLowerCase().split('up to')[1];
            }
            // Add dollar sign if missing
            if (/^\d/.test(amountText) && !amountText.includes('$')) {
                amountText = '$' + amountText;
            }
        }

        // Add brief requirements if critical
        if (program.costBasis) {
            amountText += ` (${program.costBasis})`;
        }

        amount.textContent = amountText;

        card.appendChild(leftSide);
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
