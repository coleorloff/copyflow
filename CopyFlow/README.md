# CopyFlow: Figma-Google Sheets Copy Sync Tool (MVP State)

> [!NOTE]
> This folder structure preserves the **CopyFlow MVP (Minimum Viable Product)** state. All features are fully functional and dependency-free.

---

## 📁 Repository Structure

All MVP files have been organized into the **[CopyFlow/](file:///Users/corloff/_dev_land/cole-jetski-experiments/CopyFlow/)** directory:

*   **[CopyFlow/figma-plugin/](file:///Users/corloff/_dev_land/cole-jetski-experiments/CopyFlow/figma-plugin/)**: Figma plugin code (manifest, controller, and interactive explorer UI).
*   **[CopyFlow/server/](file:///Users/corloff/_dev_land/cole-jetski-experiments/CopyFlow/server/)**: Pure Node.js local proxy server fetching Google Sheets data.

---

## 🚀 Running the MVP

### 1. Start the Server
Run the dependency-free Node server:
```bash
cd CopyFlow/server
node server.js
```
The server will run on `http://localhost:3000`.

### 2. Load the Plugin in Figma
1. Open the Figma desktop app (or Figma web version).
2. Go to **Plugins -> Development -> Import plugin from manifest...**.
3. Select the `manifest.json` file in [CopyFlow/figma-plugin/manifest.json](file:///Users/corloff/_dev_land/cole-jetski-experiments/CopyFlow/figma-plugin/manifest.json).

### 3. Sync & Bind Keys
*   Select a Text Layer in Figma.
*   Type or search for a copy key in the plugin panel.
*   Click the key in the **Copy Key Explorer** list to instantly bind it.
*   Enter your Sheet ID (shared as *Anyone with link can view*) and click **Sync to Figma**.
