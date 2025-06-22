const initializePageFlow = () => {
    const THRESHOLD = 1550;
    const pagebooks = document.querySelectorAll('.pagebook');
    const jsonOutput = document.getElementById('json-output');
    const restoreBtn = document.getElementById('restore-btn');
    const togglePage2Btn = document.getElementById('toggle-page2-btn');
    const localStorageKey = 'pagebookContentBackup';
    let page2Hidden = false;
    let virtualPage2Elements = []; // Store page 2 elements when hidden

    // Queue system to prevent overlapping operations
    let operationQueue = [];
    let isProcessingQueue = false;

    // Web Worker Initialization
    const overflowWorker = new Worker('flowing/overflow.js');
    const underflowWorker = new Worker('flowing/underflow.js');

    // Process queue sequentially
    const processQueue = async () => {
        if (isProcessingQueue || operationQueue.length === 0) return;
        
        isProcessingQueue = true;
        
        while (operationQueue.length > 0) {
            const operation = operationQueue.shift();
            await executeOperation(operation);
            // Small delay to ensure DOM updates are complete
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        
        isProcessingQueue = false;
        // Update content and positions after all operations in the batch are processed
        updateContentAndPositions();
    };

    // Execute individual operation
    const executeOperation = async (operation) => {
        const { type, elementIndex, fromPage, toPage } = operation;
        
        if (type === 'OVERFLOW') {
            const nextPageNum = parseInt(fromPage) + 1;
            const currentPage = document.getElementById(`pagenumber${fromPage}`);
            const nextPage = document.getElementById(`pagenumber${nextPageNum}`);
            
            if (currentPage && currentPage.children.length > elementIndex) {
                const elementToMove = currentPage.children[elementIndex];
                
                if (page2Hidden && nextPageNum === 2) {
                    // Store in virtual page 2 elements at the beginning
                    const elementData = createElementData(elementToMove, nextPageNum);
                    virtualPage2Elements.unshift(elementData); // Insert at beginning
                    elementToMove.remove();
                } else if (nextPage) {
                    // Insert as first child for word processor experience
                    nextPage.insertBefore(elementToMove, nextPage.firstChild);
                }
            }
        } else if (type === 'UNDERFLOW') {
            const targetPage = document.getElementById(`pagenumber${toPage}`);
            
            if (page2Hidden && fromPage === 2 && virtualPage2Elements.length > elementIndex) {
                // Move from virtual page 2 elements
                const elementData = virtualPage2Elements.splice(elementIndex, 1)[0];
                if (targetPage && elementData) {
                    const newElement = createElementFromData(elementData);
                    targetPage.appendChild(newElement);
                }
            } else {
                const fromPageElement = document.getElementById(`pagenumber${fromPage}`);
                if (fromPageElement && fromPageElement.children.length > elementIndex && targetPage) {
                    const elementToMove = fromPageElement.children[elementIndex];
                    targetPage.appendChild(elementToMove);
                }
            }
        }
        
    };

    // Listen for messages from the Web Workers
    overflowWorker.onmessage = (event) => {
        const { status, elementIndex, fromPage } = event.data;
        
        if (status === 'OVERFLOW') {
            operationQueue.push({
                type: 'OVERFLOW',
                elementIndex,
                fromPage
            });
            processQueue();
        }
    };

    underflowWorker.onmessage = (event) => {
        const { status, elementIndex, fromPage, toPage } = event.data;
        
        if (status === 'UNDERFLOW') {
            operationQueue.push({
                type: 'UNDERFLOW',
                elementIndex,
                fromPage,
                toPage
            });
            processQueue();
        }
    };

    // Helper function to create element data
    const createElementData = (element, pageNum) => {
        const attributes = {};
        for (const attr of element.attributes) {
            attributes[attr.name] = attr.value;
        }
        return {
            tagName: element.tagName.toLowerCase(),
            attr_and_vals: attributes,
            innerHTML: element.innerHTML,
            bottomPosition: 0, // Will be calculated virtually
            height: element.offsetHeight || 35, // Default height for BR elements
            pagenum: pageNum.toString()
        };
    };

    // Helper function to create element from data
    const createElementFromData = (elementData) => {
        const newElement = document.createElement(elementData.tagName);
        for (const attrName in elementData.attr_and_vals) {
            newElement.setAttribute(attrName, elementData.attr_and_vals[attrName]);
        }
        newElement.innerHTML = elementData.innerHTML;
        return newElement;
    };

    // Calculate virtual bottomPosition sum for page 2 elements using page 2 measurements
    const calculateVirtualPage2Sum = () => {
        if (virtualPage2Elements.length === 0) return [];
        
        // Get measurements from both page 1 and the empty page 2 container
        const page1 = document.getElementById('pagenumber1');
        const page2 = document.getElementById('pagenumber2');
        const page1Children = Array.from(page1.children);
        
        // Calculate average spacing between elements from page 1
        let averageSpacing = 0;
        
        if (page1Children.length > 1) {
            for (let i = 1; i < page1Children.length; i++) {
                const prevRect = page1Children[i-1].getBoundingClientRect();
                const currRect = page1Children[i].getBoundingClientRect();
                const spacing = currRect.top - prevRect.bottom;
                averageSpacing += spacing;
            }
            averageSpacing = averageSpacing / (page1Children.length - 1);
        } else {
            averageSpacing = 4; // 4px default spacing
        }
        
        // Use page 2's actual padding measurements
        const page2Rect = page2.getBoundingClientRect();
        const page2Styles = window.getComputedStyle(page2);
        const page2PaddingTop = parseFloat(page2Styles.paddingTop) || 24;
        
        // Calculate positions for virtual elements using real page 2 measurements
        const results = [];
        let currentPosition = page2PaddingTop; // Use actual page 2 padding
        
        virtualPage2Elements.forEach((elementData, index) => {
            // Use stored height or calculate based on content type
            let estimatedHeight = elementData.height;
            
            // If height is not available, estimate based on content
            if (!estimatedHeight || estimatedHeight === 0) {
                if (elementData.innerHTML === '<br>' || elementData.innerHTML.trim() === '') {
                    estimatedHeight = 35; // Default height for BR elements
                } else if (elementData.tagName === 'H2') {
                    estimatedHeight = 40; // Estimated height for headings
                } else {
                    // Estimate based on content length
                    const contentLength = elementData.innerHTML.length;
                    estimatedHeight = Math.max(20, Math.min(60, 20 + (contentLength / 50) * 10));
                }
            }
            
            // Add spacing before element (except for first element)
            if (index > 0) {
                currentPosition += averageSpacing;
            }
            
            // Calculate bottom position
            const bottomPosition = currentPosition + estimatedHeight;
            
            results.push({
                ...elementData,
                bottomPosition: bottomPosition,
                height: estimatedHeight,
                elementIndex: index
            });
            
            // Update current position for next element
            currentPosition = bottomPosition;
        });
        
        return results;
    };

    const updateContentAndPositions = () => {
        const contentBackup = [];
        
        pagebooks.forEach(pagebook => {
            if (page2Hidden && pagebook.id === 'pagenumber2') {
                return; // Skip hidden page 2
            }
            
            const containerRect = pagebook.getBoundingClientRect();
            const pageNum = pagebook.id.replace('pagenumber', '');

            Array.from(pagebook.children).forEach((child, index) => {
                const rect = child.getBoundingClientRect();
                const attributes = {};
                for (const attr of child.attributes) {
                    attributes[attr.name] = attr.value;
                }

                const elementData = {
                    tagName: child.tagName.toLowerCase(),
                    attr_and_vals: attributes,
                    innerHTML: child.innerHTML,
                    bottomPosition: rect.bottom - containerRect.top,
                    height: rect.height,
                    pagenum: pageNum,
                    elementIndex: index
                };
                contentBackup.push(elementData);
            });
        });

        // Add virtual page 2 elements if page 2 is hidden
        if (page2Hidden && virtualPage2Elements.length > 0) {
            const virtualElements = calculateVirtualPage2Sum();
            contentBackup.push(...virtualElements);
        }

        // Post the data to both workers
        overflowWorker.postMessage(contentBackup);
        underflowWorker.postMessage(contentBackup);

        const jsonString = JSON.stringify(contentBackup, null, 2);
        jsonOutput.textContent = jsonString;

        try {
            localStorage.setItem(localStorageKey, jsonString);
        } catch (e) { console.error("Failed to save to localStorage.", e); }
    };

    const restoreContent = () => {
        try {
            const savedJson = localStorage.getItem(localStorageKey);
            if (!savedJson) { console.warn("No backup found."); return; }
            const contentData = JSON.parse(savedJson);

            pagebooks.forEach(pb => pb.innerHTML = '');
            virtualPage2Elements = [];

            contentData.forEach(elementData => {
                const targetPageNum = parseInt(elementData.pagenum);
                const targetPage = document.getElementById(`pagenumber${targetPageNum}`);
                
                if (page2Hidden && targetPageNum === 2) {
                    // Store in virtual elements
                    virtualPage2Elements.push(elementData);
                } else if (targetPage) {
                    const newElement = createElementFromData(elementData);
                    targetPage.appendChild(newElement);
                }
            });
            console.log("Content restored successfully.");
        } catch (e) { console.error("Failed to restore content.", e); }
    };

    // Toggle Page 2 visibility
    const togglePage2 = () => {
        const page2 = document.getElementById('pagenumber2');
        
        if (page2Hidden) {
            // Show page 2 children
            page2Hidden = false;
            togglePage2Btn.textContent = 'Hide Page 2';
            
            // Restore virtual elements to actual page 2
            virtualPage2Elements.forEach(elementData => {
                const newElement = createElementFromData(elementData);
                page2.appendChild(newElement);
            });
            virtualPage2Elements = [];
        } else {
            // Hide page 2 children (but keep the container visible)
            page2Hidden = true;
            togglePage2Btn.textContent = 'Show Page 2';
            
            // Store page 2 elements virtually
            Array.from(page2.children).forEach(child => {
                const elementData = createElementData(child, 2);
                virtualPage2Elements.push(elementData);
            });
            page2.innerHTML = ''; // Clear children but keep container
        }
        
        updateContentAndPositions();
    };

    // Debounce function
    const debounce = (func, delay) => {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), delay);
        };
    };

    const debouncedUpdateContentAndPositions = debounce(updateContentAndPositions, 100); // Debounce by 100ms

    // Event Listeners Setup
    pagebooks.forEach(pagebook => {
        new MutationObserver(debouncedUpdateContentAndPositions).observe(pagebook, {
            childList: true, subtree: true, characterData: true, attributes: true
        });
    });
    
    restoreBtn.addEventListener('click', restoreContent);
    togglePage2Btn.addEventListener('click', togglePage2);
    
    // Initial call on page load
    updateContentAndPositions();
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initializePageFlow);
