export default class RebatePrograms {
    constructor() {
        this.baseUrl = 'http://localhost:3001';
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
                    
                    // Check if we have valid program data
                    if (data && data.programs && Array.isArray(data.programs)) {
                        results[category.toLowerCase()] = data.programs.map(program => ({
                            name: program.name || 'Program Name Not Available',
                            amount: program.amount || 'Amount varies',
                            requirements: [
                                program.eligibleProjects,
                                program.eligibleRecipients,
                                program.requirements
                            ].filter(Boolean),
                            deadline: program.deadline || 'Contact for deadline',
                            summary: program.summary || 'No summary available'
                        }));
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
