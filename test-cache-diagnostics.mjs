import { GoogleSheetsCache } from './netlify/functions/services/sheets-cache.mjs';

async function runTest() {
    console.log('Starting Cache Diagnostics Test');
    const cache = new GoogleSheetsCache();
    await cache.runDiagnostics();
}

runTest().catch(error => {
    console.error('Diagnostic Test Failed:', error);
    process.exit(1);
});
