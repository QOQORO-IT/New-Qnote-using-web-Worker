const THRESHOLD = 1550;

self.onmessage = (event) => {
    const contentData = event.data;
    if (!contentData || contentData.length === 0) return;

    // Group elements by page number
    const pages = contentData.reduce((acc, el) => {
        const pageNum = parseInt(el.pagenum, 10);
        if (!acc[pageNum]) { acc[pageNum] = []; }
        acc[pageNum].push(el);
        return acc;
    }, {});

    const pageKeys = Object.keys(pages).map(Number).sort((a, b) => a - b);

    // Check for OVERFLOW
    for (const pageNum of pageKeys) {
        const pageElements = pages[pageNum];
        if (pageElements && pageElements.length > 0) {
            const lastElement = pageElements[pageElements.length - 1];
            
            // For page 2, calculate sum of all bottomPositions if it's virtual
            let effectiveBottom = lastElement.bottomPosition;
            if (pageNum === 2 && pageElements.length > 0) {
                // Sum all bottomPositions for page 2 elements
                const totalHeight = pageElements.reduce((sum, el) => sum + el.height, 0);
                effectiveBottom = 24 + totalHeight; // 24px padding + total height
            }
            
            // Add 2-pixel tolerance for overflow
            if (effectiveBottom > THRESHOLD + 2) {
                self.postMessage({
                    status: 'OVERFLOW',
                    elementIndex: pageElements.length - 1, // Use index instead of ID
                    fromPage: pageNum
                });
                return; // Handle one move at a time
            }
        }
    }
};
