export default class RebatePrograms {
    constructor() {
        // Use environment-specific API URL
        this.baseUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? 'http://localhost:3001'
            : '/.netlify/functions';  // This will point to Netlify Functions when deployed
    }

    async analyze(county) {
        try {
            const categories = ['Federal', 'State', 'County'];
            const results = {};

            for (const category of categories) {
                try {
                    const response = await fetch(`${this.baseUrl}/api/analyze`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            query: category === 'County' 
                                ? `${county} county california energy rebate program`
                                : category === 'State'
                                ? 'california state energy rebate program'
                                : 'federal energy rebate program california',
                            category
                        })
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const data = await response.json();
                    console.log(`${category} programs data:`, data);
                    
                    // Update source indicator icons for the specific section
                    const sectionId = `${category.toLowerCase()}Results`;
                    const cachedIcon = document.querySelector(`#${sectionId} .source-indicator-container .cached`);
                    const searchIcon = document.querySelector(`#${sectionId} .source-indicator-container .search`);
                    
                    // Check source from the first program's source field
                    if (data.programs && data.programs.length > 0 && data.programs[0].source === 'cache') {
                        cachedIcon.style.display = 'inline-block';
                        searchIcon.style.display = 'none';
                    } else {
                        searchIcon.style.display = 'inline-block';
                        cachedIcon.style.display = 'none';
                    }
                    
                    console.log('First program raw data:', data.programs[0]); // Debug log
                    
                    // Check if we have valid program data
                    if (data && data.programs && Array.isArray(data.programs)) {
                        results[category.toLowerCase()] = data.programs.map(program => {
                            const mappedProgram = {
                                name: program.name || 'Program Name Not Available',
                                amount: program.amount || 'Amount varies',
                                requirements: [
                                    program.eligibleProjects,
                                    program.eligibleRecipients,
                                    program.requirements
                                ].filter(Boolean),
                                deadline: program.deadline || 'Contact for deadline',
                                summary: program.summary || 'No summary available',
                                source: program.source // Preserve the source field
                            };
                            console.log('Mapped program with source:', mappedProgram); // Debug log
                            return mappedProgram;
                        });
                    } else {
                        console.error(`No valid programs found for ${category}`);
                        results[category.toLowerCase()] = [];
                    }
                } catch (error) {
                    console.error(`Error loading ${category} programs:`, error);
                    results[category.toLowerCase()] = [];
                }
            }

            return results;
        } catch (error) {
            console.error('Error in analyze:', error);
            throw error;
        }
    }
}
