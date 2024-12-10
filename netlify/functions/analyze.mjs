import { GoogleSheetsCache } from './services/sheets-cache.mjs';
import OpenAI from 'openai';
import fetch from 'node-fetch';

// Helper function to get search queries
function netlifyGetSearchQueries(category, county) {
    switch (category) {
        case 'Federal':
            return [
                'federal energy rebate programs california',
                'US government energy incentives california'
            ];
        case 'State':
            return [
                'California state energy rebate programs',
                'California energy incentives'
            ];
        case 'County':
            return [
                `${county} County local energy rebate programs`,
                `${county} County energy efficiency incentives`
            ];
        default:
            throw new Error(`Invalid category: ${category}`);
    }
}

// Helper function to perform Google search
async function netlifyPerformGoogleSearch(query) {
    if (!process.env.GOOGLE_API_KEY || !process.env.GOOGLE_SEARCH_ENGINE_ID) {
        throw new Error('Google Search API configuration is missing');
    }

    console.log('🔍 GOOGLE SEARCH REQUEST:', {
        query: query,
        timestamp: new Date().toISOString()
    });

    // Limit to 7 results
    const url = `https://www.googleapis.com/customsearch/v1?key=${process.env.GOOGLE_API_KEY}&cx=${process.env.GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&num=7`;
    
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Google Search API error: ${response.status}`);
    }
    const searchResults = await response.json();
    
    console.log('📥 GOOGLE SEARCH RESULTS:', {
        query: query,
        totalResults: searchResults.searchInformation?.totalResults,
        itemsCount: searchResults.items?.length,
        firstResult: searchResults.items?.[0]?.title,
        timestamp: new Date().toISOString()
    });

    return searchResults;
}

// Helper function to create collapsed summary
function createCollapsedSummary(program) {
    if (!program) return 'No program details available';
    
    // Format: Each project gets its own amount description
    const type = program.programType || 'Not Available';
    const projects = Array.isArray(program.eligibleProjects) ? program.eligibleProjects : [];
    
    // Build summary with each project having its own amount
    if (projects.length > 0) {
        // For each project, create its own description
        return projects.map(project => {
            // Each project should have its own amount description
            let projectAmount = program.amount || 'Not specified';
            if (typeof project === 'object' && project.amount) {
                projectAmount = project.amount;
            }
            return `${projectAmount} ${type.toLowerCase()} for ${typeof project === 'object' ? project.name : project}`;
        }).join(', ');
    }
    
    // Fallback if no specific projects
    return `${program.amount || 'Not specified'} ${type.toLowerCase()} available`;
}

// Helper function to normalize program type
function normalizeRebateType(type) {
    if (!type) return 'Not Available';
    
    // Standardize the type to match UI expectations
    const typeMap = {
        'rebate': 'Rebate',
        'grant': 'Grant',
        'tax credit': 'Tax Credit',
        'tax-credit': 'Tax Credit',
        'low-interest loan': 'Low-Interest Loan',
        'loan': 'Low-Interest Loan'
    };

    const normalizedType = typeMap[type.toLowerCase()] || type;
    return normalizedType;
}

// Helper function to create program entries for each eligible project
function createProgramEntries(program) {
    if (!program) return [];
    
    const type = normalizeRebateType(program.programType);
    const projects = Array.isArray(program.eligibleProjects) ? program.eligibleProjects : [];
    
    if (projects.length === 0) {
        // If no specific projects, return single program
        return [{
            title: program.programName || 'Not Available',
            programType: type,
            summary: program.summary || 'No summary available',
            amount: program.amount || 'Not specified',
            eligibleProjects: [],
            eligibleRecipients: program.eligibleRecipients || 'Not specified',
            geographicScope: program.geographicScope || 'Not specified',
            requirements: Array.isArray(program.requirements) ? program.requirements : [],
            applicationProcess: program.applicationProcess || 'Not specified',
            deadline: program.deadline || 'Not specified',
            websiteLink: program.websiteLink || '#',
            contactInfo: program.contactInfo || 'Not specified',
            processingTime: program.processingTime || 'Not specified'
        }];
    }
    
    // Create separate entry for each project
    return projects.map(project => {
        const projectName = typeof project === 'object' ? project.name : project;
        const projectAmount = (typeof project === 'object' && project.amount) ? project.amount : program.amount;
        
        return {
            title: program.programName || 'Not Available',
            programType: type,
            summary: program.summary || 'No summary available',
            amount: projectAmount || 'Not specified',
            eligibleProjects: [projectName],
            eligibleRecipients: program.eligibleRecipients || 'Not specified',
            geographicScope: program.geographicScope || 'Not specified',
            requirements: Array.isArray(program.requirements) ? program.requirements : [],
            applicationProcess: program.applicationProcess || 'Not specified',
            deadline: program.deadline || 'Not specified',
            websiteLink: program.websiteLink || '#',
            contactInfo: program.contactInfo || 'Not specified',
            processingTime: program.processingTime || 'Not specified'
        };
    });
}

// Format collapsed summary to be concise
function formatCollapsedSummary(program) {
    const amount = program.amount || '';
    const projectType = program.eligibleProjects?.[0]?.name?.toLowerCase() || 'home improvements';
    
    // Create concise summary in the format: "[Amount] for [project type]"
    let summary = `${amount} for ${projectType}`;
    
    // Ensure it's not too long
    if (summary.length > 60) {
        // Truncate project type if needed
        const maxProjectTypeLength = 60 - (amount.length + 5); // 5 for " for "
        summary = `${amount} for ${projectType.substring(0, maxProjectTypeLength)}`;
    }
    
    return summary;
}

// Typical ranges for California state programs with comprehensive project types
const STATE_REBATE_RANGES = {
    'heat_pumps': {
        keywords: ['heat pump', 'heating', 'cooling', 'hvac heat pump'],
        min: 3000,
        max: 6500,
        description: 'Est. $3,000-$6,500 for heat pump installation'
    },
    'hvac': {
        keywords: ['hvac', 'heating system', 'cooling system', 'furnace', 'air conditioning'],
        min: 1000,
        max: 5000,
        description: 'Est. $1,000-$5,000 for HVAC systems'
    },
    'solar': {
        keywords: ['solar', 'photovoltaic', 'pv', 'solar panels', 'solar system'],
        min: 3000,
        max: 6000,
        description: 'Est. $3,000-$6,000 for solar installation'
    },
    'insulation': {
        keywords: ['insulation', 'weatherization', 'air sealing', 'weatherize'],
        min: 500,
        max: 2000,
        description: 'Est. $500-$2,000 for insulation'
    },
    'windows': {
        keywords: ['window', 'windows', 'energy efficient windows', 'window replacement'],
        min: 200,
        max: 1500,
        description: 'Est. $200-$1,500 per window'
    },
    'water_heaters': {
        keywords: ['water heater', 'hot water', 'tankless', 'water heating'],
        min: 1000,
        max: 3500,
        description: 'Est. $1,000-$3,500 for water heaters'
    },
    'appliances': {
        keywords: ['appliance', 'refrigerator', 'washer', 'dryer', 'dishwasher'],
        min: 300,
        max: 1200,
        description: 'Est. $300-$1,200 for appliances'
    },
    'lighting': {
        keywords: ['light', 'lighting', 'led', 'fixtures'],
        min: 50,
        max: 500,
        description: 'Est. $50-$500 for lighting'
    },
    'energy_audits': {
        keywords: ['audit', 'assessment', 'energy assessment', 'home energy audit'],
        min: 200,
        max: 600,
        description: 'Est. $200-$600 for energy audits'
    },
    'smart_thermostats': {
        keywords: ['thermostat', 'smart thermostat', 'programmable thermostat'],
        min: 100,
        max: 300,
        description: 'Est. $100-$300 for smart thermostats'
    },
    'energy_storage': {
        keywords: ['battery', 'storage', 'energy storage', 'battery system'],
        min: 2000,
        max: 5000,
        description: 'Est. $2,000-$5,000 for energy storage'
    },
    'generators': {
        keywords: ['generator', 'backup power', 'emergency power'],
        min: 200,
        max: 600,
        description: 'Est. $200-$600 for generators'
    },
    'general_efficiency': {
        keywords: ['efficiency', 'energy efficiency', 'energy saving'],
        min: 500,
        max: 8000,
        description: 'Est. $500-$8,000 for energy efficiency upgrades'
    },
    'roofing': {
        keywords: ['roof', 'roofing', 'cool roof', 'roof replacement', 'roof repair'],
        min: 2000,
        max: 6000,
        description: 'Est. $2,000-$6,000 for energy efficient roofing'
    },
    'other_improvements': {
        keywords: ['improvements', 'upgrades', 'renovation', 'home improvements'],
        min: 1000,
        max: 5000,
        description: 'Est. $1,000-$5,000 for home improvements'
    }
};

// Update the matching logic in ensureStateAmount
function findMatchingRange(projectType) {
    if (!projectType) return STATE_REBATE_RANGES.other_improvements;
    
    projectType = projectType.toLowerCase();
    
    // Find the best matching range based on keywords
    for (const [key, value] of Object.entries(STATE_REBATE_RANGES)) {
        if (value.keywords && value.keywords.some(keyword => projectType.includes(keyword))) {
            return value;
        }
    }
    
    return STATE_REBATE_RANGES.other_improvements;
}

// Update ensureStateAmount to use the new matching logic
function ensureStateAmount(program) {
    // If we already have a valid amount with dollar signs and numbers, return it
    if (program.amount && /\$\d/.test(program.amount)) {
        return program;
    }

    // Extract project type from either eligibleProjects or collapsedSummary
    let projectType = '';
    if (program.eligibleProjects && program.eligibleProjects.length > 0) {
        projectType = program.eligibleProjects[0].name;
    } else if (program.collapsedSummary) {
        // Try to extract project type from collapsedSummary
        const match = program.collapsedSummary.match(/for\s+(.+)$/i);
        if (match) {
            projectType = match[1];
        }
    }

    // Find matching range based on project type
    const range = findMatchingRange(projectType);
    
    // Update the amount
    program.amount = `$${range.min.toLocaleString()}-$${range.max.toLocaleString()}`;
    
    // Update collapsedSummary if it's missing or doesn't match our format
    if (!program.collapsedSummary || !program.collapsedSummary.match(/^\$[\d,]+([-–]\$[\d,]+)? for .+$/)) {
        program.collapsedSummary = `${program.amount} for ${projectType || 'home improvements'}`;
    }

    // Update eligible projects amounts if they're missing
    if (program.eligibleProjects) {
        program.eligibleProjects = program.eligibleProjects.map(project => {
            if (!project.amount || !project.amount.includes('$')) {
                const projectRange = findMatchingRange(project.name);
                project.amount = `$${projectRange.min.toLocaleString()}-$${projectRange.max.toLocaleString()}`;
            }
            return project;
        });
    }

    return program;
}

// Calculate range from eligible projects
function calculateProjectRanges(eligibleProjects) {
    if (!eligibleProjects?.length) return null;

    let minAmount = Number.MAX_VALUE;
    let maxAmount = 0;
    let validRanges = 0;
    let highestProject = null;
    let highestAmount = 0;

    eligibleProjects.forEach(project => {
        if (project.amount) {
            // Parse amounts like "$1,000-$5,000" or "Up to $5,000"
            const amounts = project.amount.match(/\$([0-9,]+)(?:[-–]\$([0-9,]+))?/);
            if (amounts) {
                const min = parseInt(amounts[1].replace(/,/g, ''));
                const max = amounts[2] ? parseInt(amounts[2].replace(/,/g, '')) : min;
                minAmount = Math.min(minAmount, min);
                maxAmount = Math.max(maxAmount, max);
                
                // Track the project with highest amount
                if (max > highestAmount) {
                    highestAmount = max;
                    highestProject = {
                        name: project.name,
                        amount: project.amount
                    };
                }
                
                validRanges++;
            }
        }
    });

    if (validRanges === 0) return null;

    return {
        min: minAmount,
        max: maxAmount,
        highestProject
    };
}

// Validate and fix program data
function validateAndFixProgram(program) {
    // Helper to check if amount is valid
    const isValidAmount = (amount) => {
        if (!amount) return false;
        if (typeof amount !== 'string') return false;
        
        const invalidTerms = [
            'varies', 
            'specific amounts', 
            'unknown', 
            'not specified',
            'contact for details',
            'tbd',
            'to be determined',
            'by project type'
        ];
        
        const amountLower = amount.toLowerCase();
        
        // Allow percentage-based amounts for tax credits
        if (program.programType === 'Tax Credit' && 
            (amountLower.includes('%') || amountLower.includes('percent'))) {
            return true;
        }
        
        // Check for invalid terms
        if (invalidTerms.some(term => amountLower.includes(term))) {
            return false;
        }
        
        // Must include $ unless it's a tax credit
        if (!amountLower.includes('$') && program.programType !== 'Tax Credit') {
            return false;
        }
        
        return true;
    };

    // Get the specific project type
    const getProjectType = (program) => {
        if (!program) return 'energy efficiency';
        
        // First try to get from eligibleProjects
        if (program.eligibleProjects?.[0]?.name) {
            return program.eligibleProjects[0].name;
        }

        // Then try to extract from program name
        if (program.programName) {
            const programName = program.programName.toLowerCase();
            const types = [
                'heat pump', 'hvac', 'solar', 'insulation', 'windows',
                'water heater', 'appliance', 'lighting', 'energy audit',
                'thermostat', 'battery', 'generator', 'roofing'
            ];
            const found = types.find(type => programName.includes(type));
            if (found) return found;
        }

        // Default fallback
        return 'energy efficiency';
    };

    // Handle tax credits separately
    if (program.programType === 'Tax Credit') {
        if (!isValidAmount(program.amount)) {
            program.amount = 'Up to 30%';
            program.collapsedSummary = 'Up to 30% tax credit for home improvements';
        }
        return program;
    }

    const projectType = getProjectType(program);
    const range = findMatchingRange(projectType);
    
    // Always set a specific amount based on the project type
    if (!isValidAmount(program.amount)) {
        program.amount = `$${range.min.toLocaleString()}-$${range.max.toLocaleString()}`;
    }

    // Ensure collapsedSummary matches the amount and project type
    program.collapsedSummary = `${program.amount} for ${projectType}`;

    // Fix eligible projects
    if (program.eligibleProjects) {
        program.eligibleProjects = program.eligibleProjects.map(project => {
            if (!isValidAmount(project.amount)) {
                const projectRange = findMatchingRange(project.name);
                project.amount = `$${projectRange.min.toLocaleString()}-$${projectRange.max.toLocaleString()}`;
            }
            return project;
        });
    }

    return program;
}

// Function to create standard county programs
function createCountyPrograms(countyName) {
    return [
        {
            programName: `${countyName} Solar Rebate Program`,
            programType: "Rebate",
            summary: `${countyName} offers rebates for solar panel installation to help residents reduce energy costs and environmental impact.`,
            collapsedSummary: "Up to $6,000 for solar installation",
            amount: "Up to $6,000",
            eligibleProjects: [{ name: "Solar", amount: "Up to $6,000" }],
            eligibleRecipients: `${countyName} residents`,
            geographicScope: countyName,
            requirements: ["Must be a resident", "Property must be eligible for solar installation"],
            applicationProcess: "Apply through the county website",
            deadline: "Ongoing",
            websiteLink: "",
            contactInfo: "Contact county sustainability office",
            processingTime: "4-6 weeks"
        },
        {
            programName: `${countyName} HVAC Rebate Program`,
            programType: "Rebate",
            summary: `${countyName} provides rebates for energy-efficient HVAC system upgrades.`,
            collapsedSummary: "$1,000-$5,000 for HVAC upgrades",
            amount: "$1,000-$5,000",
            eligibleProjects: [{ name: "HVAC", amount: "$1,000-$5,000" }],
            eligibleRecipients: `${countyName} residents`,
            geographicScope: countyName,
            requirements: ["Must be a resident", "Must use qualified contractor"],
            applicationProcess: "Apply through the county website",
            deadline: "Ongoing",
            websiteLink: "",
            contactInfo: "Contact county sustainability office",
            processingTime: "4-6 weeks"
        },
        {
            programName: `${countyName} Home Insulation Rebate Program`,
            programType: "Rebate",
            summary: `${countyName} offers rebates for home insulation improvements to increase energy efficiency.`,
            collapsedSummary: "$500-$2,000 for insulation",
            amount: "$500-$2,000",
            eligibleProjects: [{ name: "Insulation", amount: "$500-$2,000" }],
            eligibleRecipients: `${countyName} residents`,
            geographicScope: countyName,
            requirements: ["Must be a resident", "Must meet R-value requirements"],
            applicationProcess: "Apply through the county website",
            deadline: "Ongoing",
            websiteLink: "",
            contactInfo: "Contact county sustainability office",
            processingTime: "4-6 weeks"
        }
    ];
}

// Ensure county has multiple programs
function ensureMultipleCountyPrograms(programs) {
    if (!programs || !Array.isArray(programs)) return programs;

    // Check if this is a county program
    const isCountyProgram = programs.some(p => 
        p.programName?.toLowerCase().includes('county') || 
        p.geographicScope?.toLowerCase().includes('county')
    );

    if (isCountyProgram && programs.length < 3) {
        // Extract county name from the first program
        const countyMatch = programs[0].geographicScope.match(/(\w+)\s+County/i);
        if (countyMatch) {
            const countyName = countyMatch[1] + ' County';
            // Create standard county programs
            const standardPrograms = createCountyPrograms(countyName);
            
            // Keep any existing valid programs
            const existingPrograms = programs.filter(p => 
                p.amount && !p.amount.toLowerCase().includes('unknown')
            );

            // Combine existing and standard programs, avoiding duplicates
            const combinedPrograms = [...existingPrograms];
            standardPrograms.forEach(stdProg => {
                if (!existingPrograms.some(ep => 
                    ep.eligibleProjects?.[0]?.name === stdProg.eligibleProjects[0].name
                )) {
                    combinedPrograms.push(stdProg);
                }
            });

            return { programs: combinedPrograms };
        }
    }

    return { programs };
}

// Helper function to normalize program fields
function normalizeProgram(program) {
    // Convert title to programName if needed
    if (program.title && !program.programName) {
        program.programName = program.title;
        delete program.title;
    }

    // Normalize eligibleProjects to array of objects
    if (Array.isArray(program.eligibleProjects)) {
        program.eligibleProjects = program.eligibleProjects.map(project => {
            if (typeof project === 'string') {
                return {
                    name: project,
                    amount: program.amount // Use program amount as default
                };
            }
            return project;
        });
    }

    // Ensure federal scope for federal programs
    if (program.programName?.includes('Federal') || 
        program.programType === 'Tax Credit' || 
        program.programName?.includes('HEEHRA')) {
        program.geographicScope = 'Federal';
    }

    return program;
}

// Function to merge similar programs
function mergeSimilarPrograms(programs) {
    const mergedPrograms = new Map();

    programs.forEach(program => {
        const normalizedProgram = normalizeProgram(program);
        
        // Create key for similar program detection
        const key = normalizedProgram.programName.toLowerCase()
            .replace(/\(.*?\)/g, '') // Remove parentheses content
            .trim();

        if (mergedPrograms.has(key)) {
            const existing = mergedPrograms.get(key);
            
            // Merge eligible projects
            const existingProjects = new Map(
                existing.eligibleProjects.map(p => [p.name.toLowerCase(), p])
            );
            
            normalizedProgram.eligibleProjects.forEach(project => {
                const projectKey = project.name.toLowerCase();
                if (!existingProjects.has(projectKey)) {
                    existing.eligibleProjects.push(project);
                }
            });
        } else {
            mergedPrograms.set(key, normalizedProgram);
        }
    });

    return Array.from(mergedPrograms.values());
}

// Function to validate and ensure required federal programs
function ensureFederalPrograms(programs) {
    if (!programs || !Array.isArray(programs)) {
        programs = [];
    }

    // First, normalize and merge similar programs
    const normalizedPrograms = mergeSimilarPrograms(programs);
    
    const validatedPrograms = [...normalizedPrograms];
    const seenPrograms = new Map(
        normalizedPrograms.map(p => [p.programName.toLowerCase(), p])
    );

    // Process each required federal program
    Object.values(FEDERAL_PROGRAM_TEMPLATES).forEach(template => {
        const templateKey = template.programName.toLowerCase();
        
        if (seenPrograms.has(templateKey)) {
            // Program exists - validate and update critical fields
            const existingProgram = seenPrograms.get(templateKey);
            
            // Update critical fields
            existingProgram.programType = template.programType;
            existingProgram.collapsedSummary = template.collapsedSummary;
            existingProgram.geographicScope = 'Federal';
            
            // Merge eligibleProjects from template
            const existingProjects = new Map(
                existingProgram.eligibleProjects.map(p => [p.name.toLowerCase(), p])
            );
            
            template.eligibleProjects.forEach(project => {
                const projectKey = project.name.toLowerCase();
                if (!existingProjects.has(projectKey)) {
                    existingProgram.eligibleProjects.push(project);
                }
            });
            
            // Fill in missing fields from template
            Object.keys(template).forEach(field => {
                if (!existingProgram[field]) {
                    existingProgram[field] = template[field];
                }
            });
        } else {
            // Program missing - add template version
            validatedPrograms.push({...template});
        }
    });

    // Sort programs by name for consistency
    validatedPrograms.sort((a, b) => a.programName.localeCompare(b.programName));

    return { programs: validatedPrograms };
}

// Federal program templates - our source of truth
const FEDERAL_PROGRAM_TEMPLATES = {
    "Federal Solar Tax Credit (ITC)": {
        programName: "Federal Solar Tax Credit (ITC)",
        programType: "Tax Credit",
        summary: "The Federal Solar Tax Credit (ITC) allows homeowners to claim up to 30% of their solar installation costs on federal taxes through 2034.",
        collapsedSummary: "Up to 30% for solar installation",
        amount: "Up to 30%",
        eligibleProjects: [{ 
            name: "Solar Installation", 
            amount: "Up to 30%" 
        }],
        eligibleRecipients: "Homeowners",
        geographicScope: "Federal",
        requirements: [
            "Must own the home",
            "Solar system must be new or being used for the first time",
            "Must be installed by December 31, 2034"
        ],
        applicationProcess: "Claim credit on federal tax return",
        deadline: "Must be claimed in the tax year of installation",
        websiteLink: "https://www.energy.gov/eere/solar/homeowners-guide-federal-tax-credit-solar-photovoltaics",
        contactInfo: "Consult with a tax professional",
        processingTime: "Processed with tax return"
    },
    "High-Efficiency Electric Home Rebate (HEEHRA)": {
        programName: "High-Efficiency Electric Home Rebate (HEEHRA)",
        programType: "Rebate",
        summary: "The HEEHRA program provides point-of-sale rebates for energy-efficient home improvements including heat pumps, insulation, and electric appliances.",
        collapsedSummary: "$1,000-$5,000 for HVAC, $300-$1,200 for Appliances",
        amount: "$1,000-$5,000",
        eligibleProjects: [
            { 
                name: "HVAC", 
                amount: "$1,000-$5,000" 
            },
            {
                name: "Appliances",
                amount: "$300-$1,200"
            }
        ],
        eligibleRecipients: "Low and moderate-income households",
        geographicScope: "Federal",
        requirements: [
            "Income requirements apply",
            "Must be for primary residence",
            "Equipment must meet efficiency standards"
        ],
        applicationProcess: "Apply through state program administrator",
        deadline: "Ongoing until funds depleted",
        websiteLink: "https://www.energy.gov/scep/home-energy-rebates",
        contactInfo: "Contact state energy office",
        processingTime: "4-8 weeks"
    },
    "Home Energy Rebate Program": {
        programName: "Home Energy Rebate Program",
        programType: "Rebate",
        summary: "Federal rebate program offering incentives for home energy efficiency improvements including insulation and air sealing.",
        collapsedSummary: "$500-$2,000 for insulation",
        amount: "$500-$2,000",
        eligibleProjects: [{ 
            name: "Insulation", 
            amount: "$500-$2,000" 
        }],
        eligibleRecipients: "All homeowners",
        geographicScope: "Federal",
        requirements: [
            "Must be for primary residence",
            "Work must be performed by qualified contractor",
            "Pre and post installation verification may be required"
        ],
        applicationProcess: "Apply through state program administrator",
        deadline: "Ongoing until funds depleted",
        websiteLink: "https://www.energy.gov/scep/home-energy-rebates",
        contactInfo: "Contact state energy office",
        processingTime: "4-8 weeks"
    }
};

// Helper function to analyze results with OpenAI
async function netlifyAnalyzeResults(results, category, county) {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error('OpenAI API key is missing');
    }

    // Prepare a more concise version of results
    const processedResults = results.map(r => ({
        title: r.title,
        snippet: r.snippet,
        link: r.link
    }));

    console.log('📊 ANALYSIS INPUT:', {
        category: category,
        resultsCount: processedResults.length,
        timestamp: new Date().toISOString()
    });

    const systemInstruction = `You are a helpful assistant that analyzes rebate program data. Your task is to extract and structure information about rebate programs from the given text.

IMPORTANT RULES:
1. Solar programs are REQUIRED. ALWAYS include at least one solar program with these specific ranges:
   - Solar Installation: $4,000-$6,000
   - Federal Solar Tax Credit: Up to 30% (ALWAYS include for federal category)
   - Solar Battery Storage: $2,000-$5,000

2. For federal programs, ALWAYS include these confirmed programs if the category is 'Federal':
   - Federal Solar Tax Credit (ITC): Up to 30% of total system cost
   - High-Efficiency Electric Home Rebate (HEEHRA): $1,000-$5,000 for HVAC
   - Home Energy Rebate Program: $500-$2,000 for insulation

3. For all other programs, use these specific ranges when available:
   - HVAC: $1,000-$5,000
   - Insulation: $500-$2,000
   - Appliances: $300-$1,200
   - Battery/Storage: $2,000-$5,000

4. Amount formatting MUST be:
   - For ranges: "$X-$Y" (e.g., "$300-$1,200")
   - For tax credits: "Up to X%" (e.g., "Up to 30%")
   - NEVER use "Varies" or vague terms

5. For non-solar programs, only include those explicitly mentioned in the search results or source data.

Format the response as a JSON object with this structure:
{
    "programs": [
        {
            "programName": "string",
            "programType": "Rebate|Grant|Loan|Tax Credit",
            "summary": "string",
            "collapsedSummary": "string (must be in format '$X-$Y for [project]' or 'Up to X% for [project]')",
            "amount": "string (must be in format '$X-$Y' or 'Up to X%')",
            "eligibleProjects": [
                {
                    "name": "string",
                    "amount": "string (must match amount format)"
                }
            ],
            "eligibleRecipients": "string",
            "geographicScope": "string",
            "requirements": ["string"],
            "applicationProcess": "string",
            "deadline": "string",
            "websiteLink": "string",
            "contactInfo": "string",
            "processingTime": "string"
        }
    ]
}`;

    const userPrompt = `Extract detailed home improvement and energy efficiency rebate programs from these results. Be specific about program names, types, amounts, and eligible projects. Each program MUST have a specific name and type must be exactly one of: 'Rebate', 'Grant', 'Tax Credit', or 'Low-Interest Loan'. If a program has multiple project types or amounts, list them separately. Return ONLY the JSON object:

${JSON.stringify(processedResults, null, 2)}`;

    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: 25000
    });

    let completion;
    try {
        console.log('🤖 OPENAI REQUEST:', {
            category: category,
            timestamp: new Date().toISOString()
        });

        completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo-1106",
            messages: [
                { role: "system", content: systemInstruction },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.3,
            max_tokens: 2000,
            response_format: { type: "json_object" }
        });

        const content = completion.choices[0].message.content;
        console.log('🤖 OPENAI RESPONSE:', {
            rawResponse: content,
            timestamp: new Date().toISOString()
        });

        let parsedResponse;
        try {
            parsedResponse = JSON.parse(content);
        } catch (parseError) {
            console.error('❌ JSON PARSE ERROR:', {
                error: parseError.message,
                content: content,
                timestamp: new Date().toISOString()
            });
            throw new Error('Failed to parse OpenAI response as JSON');
        }

        // Validate and transform response
        if (!parsedResponse || typeof parsedResponse !== 'object') {
            throw new Error('OpenAI response is not a valid JSON object');
        }

        if (!parsedResponse.programs) {
            console.warn('⚠️ NO PROGRAMS FOUND:', {
                category: category,
                response: parsedResponse,
                timestamp: new Date().toISOString()
            });
        }

        if (!Array.isArray(parsedResponse.programs)) {
            throw new Error('OpenAI response "programs" field is not an array');
        }

        // Transform programs
        const transformedPrograms = parsedResponse.programs.flatMap(program => {
            if (!program || typeof program !== 'object') {
                console.warn('⚠️ INVALID PROGRAM:', {
                    program: program,
                    timestamp: new Date().toISOString()
                });
                return [];
            }
            
            console.log('Program before transformation:', {
                name: program.programName,
                type: program.programType,
                rawProgram: program
            });
            
            const entries = createProgramEntries({
                ...program,
                category: category.toLowerCase()
            });

            console.log('Program after transformation:', {
                entries: entries.map(e => ({
                    title: e.title,
                    programType: e.programType
                }))
            });
            
            return entries;
        });

        if (category === 'State') {
            transformedPrograms.forEach(program => ensureStateAmount(program));
        }

        // Validate and fix each program
        transformedPrograms.forEach(program => validateAndFixProgram(program));

        // Add required programs based on category
        if (category === 'Federal') {
            parsedResponse = ensureFederalPrograms(transformedPrograms);
        } else if (category === 'County') {
            parsedResponse = ensureMultipleCountyPrograms({ programs: transformedPrograms });
        }

        console.log('✅ ANALYSIS COMPLETE:', {
            category,
            programsFound: parsedResponse.programs.length,
            programs: parsedResponse.programs.map(p => ({
                title: p.programName,
                programType: p.programType,
                amount: p.amount
            })),
            timestamp: new Date().toISOString()
        });

        // Cache the results
        try {
            const cache = new GoogleSheetsCache();
            await cache.initialize();
            
            // Generate cache key using same format as check-cache
            const cacheKey = `${category}:${county}`;
            
            await cache.appendRow({
                query: cacheKey,
                category: category,
                googleResults: JSON.stringify(results),
                openaiAnalysis: JSON.stringify(parsedResponse),
                timestamp: new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }),
                hash: cache.netlifyGenerateHash(cacheKey, category),
                googleSearchCache: 'Search',
                openaiSearchCache: 'Search'
            });
            
            console.log('📝 NETLIFY: Results cached successfully:', {
                category,
                county,
                programsCount: parsedResponse.programs.length,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('❌ NETLIFY: Failed to cache results:', {
                error: error.message,
                stack: error.stack,
                category,
                county,
                timestamp: new Date().toISOString()
            });
            // Don't throw - we still want to return results even if caching fails
        }

        // Add prominent program type logging with color
        let color;
        switch (category.toLowerCase()) {
            case 'federal':
                color = '\x1b[36m'; // Cyan
                break;
            case 'state':
                color = '\x1b[32m'; // Green
                break;
            case 'county':
                color = '\x1b[35m'; // Magenta
                break;
            default:
                color = '\x1b[37m'; // White
        }
        const resetColor = '\x1b[0m';

        console.log(`${color}
╔═══════════════════════════════════════════════════╗
║             DISPLAYING ${category.toUpperCase()} PROGRAMS             ║
║   Total Programs Found: ${parsedResponse.programs.length.toString().padEnd(10)}              ║
╚═══════════════════════════════════════════════════╝${resetColor}`);

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                programs: parsedResponse.programs,
                source: {
                    googleSearch: 'Search',
                    openaiAnalysis: 'Search'
                }
            })
        };

    } catch (error) {
        console.error('❌ ANALYSIS ERROR:', {
            error: error.message,
            type: error.constructor.name,
            stack: error.stack,
            openaiResponse: completion?.choices?.[0]?.message?.content,
            timestamp: new Date().toISOString()
        });
        throw new Error(`Analysis failed: ${error.message}`);
    }
}

export const handler = async (event, context) => {
    const requestId = Math.random().toString(36).substring(7);
    console.log(`[${requestId}] 🔄 NETLIFY: Analyze request received`);

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            }
        };
    }

    try {
        if (event.httpMethod !== 'POST') {
            throw new Error('Method not allowed');
        }

        // Parse request body
        let body;
        try {
            body = JSON.parse(event.body);
        } catch (e) {
            console.error('Failed to parse request body:', e);
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    status: 400,
                    error: 'Bad Request',
                    message: 'Invalid JSON in request body'
                })
            };
        }

        const { category, county } = body;
        
        if (!category) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    status: 400,
                    error: 'Bad Request',
                    message: 'Category is required'
                })
            };
        }

        // Initialize cache
        const cache = new GoogleSheetsCache();
        await cache.initialize();

        // Get search queries
        const queries = netlifyGetSearchQueries(category, county);
        let allResults = [];

        // Perform searches
        for (const query of queries) {
            try {
                const results = await netlifyPerformGoogleSearch(query);
                if (results.items) {
                    allResults = allResults.concat(results.items);
                }
            } catch (searchError) {
                console.error('Search Error:', searchError);
                // Continue with other queries if one fails
            }
        }

        if (allResults.length === 0) {
            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    status: 200,
                    category: category,
                    programs: [],
                    message: 'No search results found'
                })
            };
        }

        // Analyze results
        const analysis = await netlifyAnalyzeResults(allResults, category, county);

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                status: 200,
                ...analysis
            })
        };

    } catch (error) {
        console.error('Handler Error:', {
            error: error.message,
            stack: error.stack,
            type: error.constructor.name
        });

        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                status: 500,
                error: 'Internal Server Error',
                message: error.message,
                category: event.body ? JSON.parse(event.body).category : undefined,
                timestamp: new Date().toISOString()
            })
        };
    }
};
