// Show UI with comfortable dimensions
figma.showUI(__html__, { width: 400, height: 640, themeColors: true });

// Listen for selection changes to update the UI
figma.on("selectionchange", () => {
  sendSelectionToUI();
});

// Helper to notify UI about the current selection and page state
function sendSelectionToUI() {
  const selection = figma.currentPage.selection;
  
  if (selection.length > 0) {
    const types = selection.map(n => n.type).join(", ");
    figma.ui.postMessage({
      type: "log",
      level: "info",
      message: `Selected: ${selection.length} layer(s) [Type: ${types}]`
    });
  }

  // Scan current page for all bound keys to update UI indicators (includes both plugin metadata and matching layer names)
  const textNodes = figma.currentPage.findAll(node => node.type === "TEXT");
  const boundKeys = textNodes.map(node => {
    return node.getPluginData("copy-key") || node.name;
  }).filter(key => !!key);

  if (selection.length === 1 && selection[0].type === "TEXT") {
    const node = selection[0];
    const key = node.getPluginData("copy-key") || "";
    figma.ui.postMessage({
      type: "selection-changed",
      selected: true,
      nodeId: node.id,
      nodeName: node.name,
      currentText: node.characters,
      key: key,
      boundKeys: boundKeys
    });
  } else {
    figma.ui.postMessage({
      type: "selection-changed",
      selected: false,
      boundKeys: boundKeys
    });
  }
}

// Initial selection dispatch
sendSelectionToUI();

// Handle messages from the UI
figma.ui.onmessage = async (msg) => {
  if (msg.type === "bind-key") {
    const selection = figma.currentPage.selection;
    if (selection.length === 1 && selection[0].type === "TEXT") {
      const node = selection[0];
      node.setPluginData("copy-key", msg.key);
      
      // Lock layer name to the key so it behaves as an explicit identifier
      node.name = msg.key;
      
      figma.notify(`Bound and renamed to: ${msg.key}`);
      sendSelectionToUI();
    } else {
      figma.notify("Please select a single text layer first.");
    }
  }

  if (msg.type === "unbind-key") {
    const selection = figma.currentPage.selection;
    if (selection.length === 1 && selection[0].type === "TEXT") {
      const node = selection[0];
      const oldKey = node.getPluginData("copy-key") || node.name;
      node.setPluginData("copy-key", "");
      
      // Revert name to characters
      node.name = node.characters;
      
      figma.notify("Layer unbound.");
      sendSelectionToUI();
    } else {
      figma.notify("Please select a single text layer first.");
    }
  }

  if (msg.type === "sync-layers") {
    const { copyData, stage } = msg; // stage can be 'draft' or 'approved'
    const textNodes = figma.currentPage.findAll(node => node.type === "TEXT");
    
    let updatedCount = 0;
    let overflowCount = 0;

    for (const node of textNodes) {
      // Look up key by plugin metadata first, then layer name
      const key = node.getPluginData("copy-key") || node.name;
      if (key && copyData[key]) {
        const newText = copyData[key][stage] || copyData[key].draft || "";
        
        try {
          // Load font before editing characters
          await figma.loadFontAsync(node.fontName);
          
          node.characters = newText;
          // Explicitly assign/re-assign name to lock it in Figma
          node.name = key;
          updatedCount++;

          const limit = copyData[key].characterLimit ? parseInt(copyData[key].characterLimit, 10) : 0;
          if (limit > 0 && newText.length > limit) {
            figma.ui.postMessage({
              type: "log",
              level: "warning",
              message: `⚠️ Over limit for "${key}": ${newText.length}/${limit} chars.`
            });
            overflowCount++;
          }
        } catch (err) {
          console.error("Failed to update node", node.id, err);
        }
      }
    }

    figma.notify(`Synced ${updatedCount} layers (${overflowCount} warnings).`);
    figma.ui.postMessage({
      type: "sync-complete",
      updatedCount,
      overflowCount
    });
  }
};
