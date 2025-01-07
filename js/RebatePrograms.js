export class RebatePrograms {
    constructor() {
        this.activeCategories = new Set();
        this.loadingSpinner = document.getElementById('loadingSpinner');
        this.searchButton = document.getElementById('searchButton');
        this.resultsContainer = document.getElementById('resultsContainer');
        this.hasSearched = false;
        this.setupCategoryListeners();
        this.setupSelectAllListener();
    }

    setupSelectAllListener() {
        const selectAllButton = document.querySelector('.select-all-button');
        if (selectAllButton) {
            selectAllButton.addEventListener('click', () => {
                this.selectAllCategories();
            });
        }
    }

    selectAllCategories() {
        const allSelected = this.activeCategories.size === 12;
        const categoryIcons = document.querySelectorAll('.category-icon');
        
        categoryIcons.forEach(icon => {
            const category = icon.getAttribute('data-category');
            if (allSelected) {
                this.activeCategories.delete(category);
                icon.classList.remove('active');
            } else {
                this.activeCategories.add(category);
                icon.classList.add('active');
            }
        });

        this.updateSelectAllButtonState();
    }

    updateSelectAllButtonState() {
        const selectAllButton = document.querySelector('.select-all-button');
        if (selectAllButton) {
            if (this.activeCategories.size === 12) {
                selectAllButton.classList.add('active');
            } else {
                selectAllButton.classList.remove('active');
            }
        }
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
    }

    createProgramCard(program) {
        const container = document.createElement('div');
        container.className = 'program-row-container';

        const row = document.createElement('div');
        row.className = 'program-row';
        row.addEventListener('click', () => this.toggleProgramDetails(container));

        // Program Info
        const info = document.createElement('div');
        info.className = 'program-info';

        const title = document.createElement('div');
        title.className = 'program-title';
        title.textContent = program.title || program.programName;
        
        // Chevron Icon
        const chevron = document.createElement('i');
        chevron.className = 'fas fa-chevron-down program-chevron';
        title.appendChild(chevron);
        
        info.appendChild(title);

        // Program Amount
        const amount = document.createElement('div');
        amount.className = 'program-amount';
        
        let amountText = program.amount || 'Amount varies';
        if (typeof amountText === 'string') {
            if (amountText.includes('%')) {
                amountText = amountText.replace('Up to ', '') + ' of cost';
            }
            else if (amountText.toLowerCase().includes('up to')) {
                amountText = 'Up to' + amountText.toLowerCase().split('up to')[1];
            }
            if (/^\d/.test(amountText) && !amountText.includes('$')) {
                amountText = '$' + amountText;
            }
        }
        amount.textContent = amountText;

        // Program Summary
        const summary = document.createElement('div');
        summary.className = 'program-summary';
        summary.textContent = program.summary || program.description || 'No summary available';
        summary.style.display = 'none';

        row.appendChild(info);
        row.appendChild(amount);
        container.appendChild(row);
        container.appendChild(summary);

        return container;
    }

    toggleProgramDetails(container) {
        const summary = container.querySelector('.program-summary');
        if (summary) {
            summary.style.display = summary.style.display === 'none' ? 'block' : 'none';
            container.classList.toggle('expanded');
        }
    }

    displayResults(results) {
        if (!this.resultsContainer) return;

        this.resultsContainer.innerHTML = '';

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

        this.activeCategories.forEach(category => {
            const levelPrograms = programsByCategory[category] || { federal: [], state: [], county: [] };
            const hasPrograms = Object.values(levelPrograms).some(programs => programs.length > 0);
            
            const section = document.createElement('div');
            section.className = 'program-section';
            section.setAttribute('data-category', category);

            const title = document.createElement('h2');
            title.className = 'category-header';
            title.textContent = this.formatCategory(category);
            section.appendChild(title);

            const content = document.createElement('div');
            content.className = 'program-content';

            if (hasPrograms) {
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
            } else {
                const noResults = document.createElement('div');
                noResults.className = 'no-results';
                noResults.textContent = 'No rebate programs found in your area for this category';
                content.appendChild(noResults);
            }

            section.appendChild(content);
            this.resultsContainer.appendChild(section);
        });

        this.resultsContainer.style.display = 'block';
    }

    formatCategory(category) {
        const formatMap = {
            'solar': 'Solar',
            'heat-pumps': 'Heat Pumps',
            'hvac': 'HVAC',
            'windows': 'Windows',
            'ev-charger': 'EV Charger',
            'insulation': 'Insulation',
            'appliances': 'Appliances',
            'water-heater': 'Water Heater',
            'lighting': 'Lighting',
            'weatherization': 'Weatherization',
            'roofing': 'Roofing',
            'battery': 'Battery Storage'
        };
        return formatMap[category] || category;
    }

    formatLevel(level) {
        const levelMap = {
            'federal': 'Federal Programs',
            'state': 'State Programs',
            'county': 'County Programs'
        };
        return levelMap[level] || level;
    }

    getCategoryFromProgram(program) {
        const title = (program.title || program.programName || '').toLowerCase();
        const description = (program.description || program.summary || program.collapsedSummary || '').toLowerCase();
        const content = title + ' ' + description;

        // Solar category
        if (content.includes('solar') || 
            content.includes('photovoltaic') || 
            content.includes('solar tax credit') ||
            content.includes('itc') && content.includes('solar')) {
            return 'solar';
        }
        // Heat Pumps
        if (content.includes('heat pump') || content.includes('heatpump')) {
            return 'heat-pumps';
        }
        // EV Charger
        if (content.includes('ev charger') || content.includes('electric vehicle charger')) {
            return 'ev-charger';
        }
        // HVAC
        if (content.includes('hvac') || content.includes('heating') || content.includes('ventilation') || content.includes('air conditioning')) {
            return 'hvac';
        }
        // Insulation
        if (content.includes('insulation') || content.includes('insulate')) {
            return 'insulation';
        }
        // Windows
        if (content.includes('window') || content.includes('door')) {
            return 'windows';
        }
        // Appliances
        if (content.includes('appliance') || content.includes('washer') || content.includes('dryer') || content.includes('refrigerator')) {
            return 'appliances';
        }
        // Water Heater
        if (content.includes('water heater') || content.includes('waterheater')) {
            return 'water-heater';
        }
        // Lighting
        if (content.includes('lighting') || content.includes('light') || content.includes('bulb')) {
            return 'lighting';
        }
        // Weatherization
        if (content.includes('weatherization') || content.includes('weatherize')) {
            return 'weatherization';
        }
        // Roofing
        if (content.includes('roof') || content.includes('roofing')) {
            return 'roofing';
        }
        // Battery Storage
        if (content.includes('battery') || content.includes('storage')) {
            return 'battery';
        }
        return 'other';
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
}
