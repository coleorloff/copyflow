// Show UI with comfortable dimensions
figma.showUI(__html__, { width: 400, height: 680, themeColors: true });

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

  // Scan current page for all text node names (used for matching key visualization)
  const textNodes = figma.currentPage.findAll(node => node.type === "TEXT");
  const boundKeys = textNodes.map(node => node.name).filter(name => !!name);

  const lastSyncedSha = figma.root.getPluginData("last-synced-sha") || "";

  if (selection.length === 1 && selection[0].type === "TEXT") {
    const node = selection[0];
    figma.ui.postMessage({
      type: "selection-changed",
      selected: true,
      nodeId: node.id,
      nodeName: node.name,
      currentText: node.characters,
      key: node.name,
      boundKeys: boundKeys,
      lastSyncedSha: lastSyncedSha
    });
  } else {
    figma.ui.postMessage({
      type: "selection-changed",
      selected: false,
      boundKeys: boundKeys,
      lastSyncedSha: lastSyncedSha
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
      
      // Rename the layer to the copy key (locks the name from auto-renaming)
      node.name = msg.key;
      
      figma.notify(`Renamed layer to match key: ${msg.key}`);
      sendSelectionToUI();
    } else {
      figma.notify("Please select a single text layer first.");
    }
  }

  if (msg.type === "unbind-key") {
    const selection = figma.currentPage.selection;
    if (selection.length === 1 && selection[0].type === "TEXT") {
      const node = selection[0];
      
      // Reset node name back to its raw characters
      node.name = node.characters;
      
      figma.notify("Layer name reverted.");
      sendSelectionToUI();
    } else {
      figma.notify("Please select a single text layer first.");
    }
  }

  if (msg.type === "sync-layers") {
    const { copyData, stage, sha } = msg; // stage can be 'draft' or 'approved'
    const textNodes = figma.currentPage.findAll(node => node.type === "TEXT");
    
    let updatedCount = 0;
    let overflowCount = 0;

    for (const node of textNodes) {
      // Look up key strictly by layer name
      const key = node.name;
      if (key && copyData[key]) {
        const newText = copyData[key][stage] || copyData[key].draft || "";
        
        try {
          // Load font before editing characters
          await figma.loadFontAsync(node.fontName);
          
          node.characters = newText;
          // Explicitly assign/re-assign name to keep it locked
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

    if (sha) {
      figma.root.setPluginData("last-synced-sha", sha);
    }

    figma.notify(`Synced ${updatedCount} layers (${overflowCount} warnings).`);
    figma.ui.postMessage({
      type: "sync-complete",
      updatedCount,
      overflowCount
    });
    
    // Refresh selection states to broadcast updated SHA
    sendSelectionToUI();
  }
};
