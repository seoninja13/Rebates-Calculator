function deduplicateCache(entries) {
    const seen = new Set();
    return entries.filter(entry => {
        const key = `${entry.storedCategory}:${entry.storedHash}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
} 