import { GoogleSheetsCache } from './sheets-cache.mjs';

async function testCacheSet() {
    const cache = new GoogleSheetsCache();
    
    const testData = {
        level: 'County',
        county: 'Alameda',
        category: 'all',
        data: {
            googleResults: [
                {
                    title: 'Alameda County Energy Rebates',
                    link: 'https://example.com/alameda-rebates'
                }
            ],
            openaiAnalysis: [
                {
                    summary: 'Energy rebate programs in Alameda County'
                }
            ]
        }
    };

    console.log('🚀 Starting Cache Set Test for Alameda County');
    
    try {
        await cache.netlifySetCache(
            testData.level, 
            testData.county, 
            testData.category, 
            testData.data
        );
        
        console.log('✅ Cache Set Test Completed Successfully');
    } catch (error) {
        console.error('❌ Cache Set Test Failed:', error);
    }
}

testCacheSet();
