export default class RebatePrograms {
    constructor() {
        // Use environment-specific API URL
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        this.baseUrl = isLocal ? 'http://localhost:3001' : '/.netlify/functions';
        this.analyzePath = isLocal ? '/api/analyze' : '/analyze';
    }

    async analyze(county) {
        try {
            const categories = ['Federal', 'State', 'County'];
            const results = {};

            for (const category of categories) {
                try {
                    const response = await fetch(`${this.baseUrl}${this.analyzePath}`, {
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

                    console.log(`🌐 ${category} API Response Status:`, response.status);
                    
                    if (!response.ok) {
                        console.error(`❌ ${category} API Error:`, response.status, response.statusText);
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const data = await response.json();
                    console.log(`📦 ${category} Raw API Response:`, JSON.stringify(data, null, 2));
                    
                    // Normalize the programs data structure
                    let normalizedPrograms = [];
                    if (data && data.programs) {
                        // Handle both array and object structures
                        if (Array.isArray(data.programs)) {
                            normalizedPrograms = data.programs;
                        } else if (typeof data.programs === 'object') {
                            // If programs is an object, convert its values to an array
                            normalizedPrograms = Object.values(data.programs);
                        }
                    }
                    
                    console.log(`✅ ${category} Normalized Programs:`, normalizedPrograms);
                    
                    // Update source indicator icons for the specific section if they exist
                    const sectionId = `${category.toLowerCase()}Results`;
                    const cachedIcon = document.querySelector(`#${sectionId} .source-indicator-container .cached`);
                    const searchIcon = document.querySelector(`#${sectionId} .source-indicator-container .search`);
                    
                    // Only update icons if they exist
                    if (cachedIcon && searchIcon) {
                        if (normalizedPrograms.length > 0 && normalizedPrograms[0].source === 'cache') {
                            cachedIcon.style.display = 'inline-block';
                            searchIcon.style.display = 'none';
                        } else {
                            searchIcon.style.display = 'inline-block';
                            cachedIcon.style.display = 'none';
                        }
                    }
                    
                    // Process the normalized programs
                    if (normalizedPrograms.length > 0) {
                        results[category.toLowerCase()] = normalizedPrograms.map(program => {
                            console.log(`📝 Processing Program:`, program);
                            // Map backend field names to frontend field names
                            return {
                                programName: program.name || program.programName,
                                summary: program.summary,
                                programType: program.programType,
                                amount: program.amount,
                                eligibleProjects: program.eligibleProjects,
                                eligibleRecipients: program.eligibleRecipients,
                                geographicScope: program.geographicScope,
                                requirements: program.requirements,
                                applicationProcess: program.applicationProcess,
                                deadline: program.deadline,
                                websiteLink: program.link || program.websiteLink,
                                contactInformation: program.contactInformation,
                                processingTime: program.processingTime,
                                source: program.source
                            };
                        });
                        console.log(`✨ ${category} Processing Complete:`, results[category.toLowerCase()]);
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
