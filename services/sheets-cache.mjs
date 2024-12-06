function deduplicateCache(entries) {
    const seen = new Set();
    return entries.filter(entry => {
        const key = `${entry.storedCategory}:${entry.storedHash}`;
        return !seen.has(key) && seen.add(key);
    });
} 