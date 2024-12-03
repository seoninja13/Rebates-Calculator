// Previous imports and setup remain the same...

app.post('/api/analyze', async (req, res) => {
    const { query, category, maxResults = 10 } = req.body;
    
    try {
        console.log('Frontend → API | Received | Query:', {
            query,
            category,
            maxResults,
            timestamp: new Date().toISOString(),
            type: 'incoming_request'
        });

        // Get all search queries for this category
        const searchQueries = getSearchQueries(category, query);
        let allSearchResults = [];
        let cacheHits = 0;

        // Process each search query
        for (const searchQuery of searchQueries) {
            // Try to get from cache first
            const cachedResult = await sheetsCache.get(searchQuery, category);
            
            if (cachedResult) {
                console.log('Cache → API | Hit | Using cached results for query:', searchQuery);
                if (cachedResult.results) {
                    allSearchResults = allSearchResults.concat(cachedResult.results);
                }
                cacheHits++;
                continue;  // Skip to next query if we have cached results
            }

            // API to Google
            sendLogToClient(`API → Google | Searching | Query: "${searchQuery}"`, {
                query: searchQuery,
                searchUrl: `https://www.googleapis.com/customsearch/v1?cx=${process.env.GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(searchQuery)}`,
                timestamp: new Date().toISOString(),
                type: 'google_request'
            });
            
            const googleData = await searchGoogle(searchQuery, maxResults);
            if (googleData.items) {
                allSearchResults = allSearchResults.concat(googleData.items);
            }
            
            // Google to API
            sendLogToClient(`Google → API | Results: ${googleData.items?.length || 0} | Total: ${googleData.searchInformation.totalResults}`, {
                totalResults: parseInt(googleData.searchInformation.totalResults),
                returnedResults: googleData.items?.length || 0,
                searchTime: googleData.searchInformation.searchTime,
                items: googleData.items?.map(item => ({
                    title: item.title,
                    link: item.link,
                    snippet: item.snippet
                })),
                timestamp: new Date().toISOString(),
                type: 'google_response'
            });
        }

        // Remove duplicates based on URL
        allSearchResults = allSearchResults.filter((result, index, self) =>
            index === self.findIndex((r) => r.link === result.link)
        );

        // API to OpenAI for combined results
        sendLogToClient(`API → OpenAI | Analyzing | Results: ${allSearchResults.length} | Category: ${category}`, {
            resultsCount: allSearchResults.length,
            category,
            model: "gpt-4-turbo-preview",
            timestamp: new Date().toISOString(),
            type: 'openai_request'
        });
        
        // Get OpenAI analysis
        const analysis = await analyzeSearchResults(allSearchResults, category);
        
        // Log OpenAI analysis results
        sendLogToClient(`OpenAI → API | Analysis Complete | Programs Found: ${analysis.programs?.length || 0}`, {
            category,
            programsCount: analysis.programs?.length || 0,
            programs: analysis.programs,
            timestamp: new Date().toISOString(),
            type: 'openai_response'
        });

        // Only cache if we have valid OpenAI analysis
        if (analysis && analysis.programs && analysis.programs.length > 0) {
            // Cache results for each search query
            for (const searchQuery of searchQueries) {
                await sheetsCache.set(searchQuery, category, {
                    results: allSearchResults,
                    analysis: analysis,
                    source: {
                        googleSearch: true,
                        openaiAnalysis: true
                    }
                });
            }
        }

        res.json(analysis);
    } catch (error) {
        console.error('Error in /api/analyze:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Rest of the server.js code remains the same...
