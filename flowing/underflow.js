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

    // Check for UNDERFLOW
    for (let i = 0; i < pageKeys.length - 1; i++) {
        const currentPageNum = pageKeys[i];
        const nextPageNum = pageKeys[i + 1];
        const currentPageElements = pages[currentPageNum] || [];
        const nextPageElements = pages[nextPageNum] || [];

        if (nextPageElements.length > 0) {
            const lastElementOnCurrentPage = currentPageElements[currentPageElements.length - 1];
            const firstElementOnNextPage = nextPageElements[0];
            
            let currentMaxBottom = lastElementOnCurrentPage ? lastElementOnCurrentPage.bottomPosition : 0;
            
            // For page 2, calculate sum of bottomPositions if it's virtual
            if (nextPageNum === 2 && nextPageElements.length > 0) {
                const totalHeight = nextPageElements.reduce((sum, el) => sum + el.height, 0);
                // Recalculate first element position in virtual page 2
                firstElementOnNextPage.height = nextPageElements[0].height;
            }
            
            const availableSpace = THRESHOLD - currentMaxBottom;

            if (firstElementOnNextPage.height <= availableSpace) {
                self.postMessage({
                    status: 'UNDERFLOW',
                    elementIndex: 0, // Always the first element
                    fromPage: nextPageNum,
                    toPage: currentPageNum
                });
                return; // Handle one move at a time
            }
        }
    }
};