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
            trans_title: program.programName || 'Not Available',
            trans_type: type,
            trans_summary: program.summary || 'No summary available',
            trans_collapsedSummary: program.collapsedSummary || 'No collapsed summary available',
            trans_amount: program.amount || 'Not specified',
            trans_eligibleProjects: [],
            trans_eligibleRecipients: program.eligibleRecipients || 'Not specified',
            trans_geographicScope: program.geographicScope || 'Not specified',
            trans_requirements: Array.isArray(program.requirements) ? program.requirements : [],
            trans_applicationProcess: program.applicationProcess || 'Not specified',
            trans_deadline: program.deadline || 'Not specified',
            trans_websiteLink: program.websiteLink || '#',
            trans_contactInfo: program.contactInfo || 'Not specified',
            trans_processingTime: program.processingTime || 'Not specified',
            category: program.category
        }];
    }
    
    // Create separate entry for each project
    return projects.map(project => {
        const projectName = typeof project === 'object' ? project.name : project;
        const projectAmount = (typeof project === 'object' && project.amount) ? project.amount : program.amount;
        
        return {
            trans_title: program.programName || 'Not Available',
            trans_type: type,
            trans_summary: program.summary || 'No summary available',
            trans_collapsedSummary: program.collapsedSummary || 'No collapsed summary available',
            trans_amount: projectAmount || 'Not specified',
            trans_eligibleProjects: [projectName],
            trans_eligibleRecipients: program.eligibleRecipients || 'Not specified',
            trans_geographicScope: program.geographicScope || 'Not specified',
            trans_requirements: Array.isArray(program.requirements) ? program.requirements : [],
            trans_applicationProcess: program.applicationProcess || 'Not specified',
            trans_deadline: program.deadline || 'Not specified',
            trans_websiteLink: program.websiteLink || '#',
            trans_contactInfo: program.contactInfo || 'Not specified',
            trans_processingTime: program.processingTime || 'Not specified',
            category: program.category
        };
    });
}

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

    const systemInstruction = `Extract detailed home improvement rebate programs from search results. Be specific and avoid using "Varies" or "Not Available". Return in JSON format:
{
  "programs": [
    {
      "programName": "Full official program name (e.g., 'Energy Upgrade California Home Upgrade Program')",
      "programType": "MUST be exactly one of these values (case-sensitive): 'Rebate', 'Grant', 'Tax Credit', 'Low-Interest Loan'",
      "summary": "240-520 char description",
      "collapsedSummary": "MUST include specific estimated amounts for each project type (e.g., 'Up to $2,000 rebate for HVAC, Up to $1,500 for insulation, Up to $500 for lighting'). Even if exact amounts aren't available, provide typical/estimated ranges based on similar programs.",
      "amount": "Specific dollar amount or range. If varies, list example amounts",
      "eligibleProjects": [
        {
          "name": "Specific project type (e.g., HVAC, Windows, Solar)",
          "amount": "MUST provide specific amount or range (e.g., 'Up to $2,000', '$1,000-$3,000'). Do not use 'Varies'"
        }
      ],
      "eligibleRecipients": "string",
      "geographicScope": "string",
      "requirements": ["string"],
      "applicationProcess": "Specific steps to apply",
      "deadline": "string",
      "websiteLink": "string",
      "contactInfo": "string",
      "processingTime": "Typical processing timeframe"
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
            temperature: 0.7,
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
                    trans_title: e.trans_title,
                    trans_type: e.trans_type
                }))
            });
            
            return entries.map(entry => ({
                trans_title: entry.trans_title,
                trans_type: entry.trans_type,
                trans_summary: entry.trans_summary,
                trans_collapsedSummary: entry.trans_collapsedSummary,
                trans_amount: entry.trans_amount,
                trans_eligibleProjects: entry.trans_eligibleProjects,
                trans_eligibleRecipients: entry.trans_eligibleRecipients,
                trans_geographicScope: entry.trans_geographicScope,
                trans_requirements: entry.trans_requirements,
                trans_applicationProcess: entry.trans_applicationProcess,
                trans_deadline: entry.trans_deadline,
                trans_websiteLink: entry.trans_websiteLink,
                trans_contactInfo: entry.trans_contactInfo,
                trans_processingTime: entry.trans_processingTime,
                category: entry.category
            }));
        });

        console.log('✅ ANALYSIS COMPLETE:', {
            category,
            programsFound: transformedPrograms.length,
            programs: transformedPrograms.map(p => ({
                trans_title: p.trans_title,
                trans_type: p.trans_type,
                trans_amount: p.trans_amount
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
                programsCount: transformedPrograms.length,
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
╔══════════════════════════════════════════════════════╗
║             DISPLAYING ${category.toUpperCase()} PROGRAMS             ║
║   Total Programs Found: ${transformedPrograms.length.toString().padEnd(10)}              ║
╚══════════════════════════════════════════════════════╝${resetColor}`);

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                programs: transformedPrograms,
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
