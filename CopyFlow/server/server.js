const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// Local fallback mock database
let localMockDatabase = {
  "landing.hero.title": {
    draft: "Build beautiful user experiences",
    approved: "Collaborative copy design, simplified.",
    characterLimit: "40"
  },
  "landing.hero.subtitle": {
    draft: "This is a draft subtitle to verify it fits in your layout.",
    approved: "Figma CopyFlow connects copywriters directly with design layers.",
    characterLimit: "100"
  },
  "landing.hero.cta": {
    draft: "Try it",
    approved: "Get started for free",
    characterLimit: "25"
  }
};

// Robust RFC 4180 CSV parser supporting empty cells, quoted commas, and dynamic headers
function parseCsv(csvText) {
  const result = {};
  const rows = [];
  let currentField = '';
  let inQuotes = false;
  let currentRow = [];

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"';
          i++; // skip next quote
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\r' || char === '\n') {
        currentRow.push(currentField.trim());
        currentField = '';
        if (currentRow.length > 0 && currentRow.some(f => f !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
      } else {
        currentField += char;
      }
    }
  }
  
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    rows.push(currentRow);
  }

  if (rows.length <= 1) return result;
  
  // Dynamically map columns based on header titles
  const headers = rows[0].map(h => h.toLowerCase().trim());
  const keyIdx = headers.indexOf('key');
  const draftIdx = headers.indexOf('draft');
  const approvedIdx = headers.indexOf('approved');
  const limitIdx = headers.indexOf('character limit');

  if (keyIdx === -1) {
    console.warn("CSV is missing a 'Key' column header.");
    return result;
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const key = row[keyIdx];
    if (!key) continue;

    const draft = draftIdx !== -1 && row[draftIdx] ? row[draftIdx] : "";
    const approved = approvedIdx !== -1 && row[approvedIdx] ? row[approvedIdx] : "";
    const limit = limitIdx !== -1 && row[limitIdx] ? row[limitIdx] : "";

    result[key] = {
      draft,
      approved,
      characterLimit: limit
    };
  }

  return result;
}

function serveLocalFallback(res, fallbackDb) {
  const localCsvPath = path.join(__dirname, 'copy.csv');
  if (fs.existsSync(localCsvPath)) {
    try {
      const csvData = fs.readFileSync(localCsvPath, 'utf8');
      const parsed = parseCsv(csvData);
      console.log(`Serving copy from local fallback file: ${localCsvPath}`);
      res.writeHead(200, { 'Content-Type': 'application/json', 'X-CopyFlow-Source': 'local-csv' });
      res.end(JSON.stringify(parsed));
      return;
    } catch (err) {
      console.error("Failed to read local copy.csv:", err.message);
    }
  }
  
  console.log("Serving hardcoded fallback mock database.");
  res.writeHead(200, { 'Content-Type': 'application/json', 'X-CopyFlow-Source': 'mock' });
  res.end(JSON.stringify(fallbackDb));
}

function serveLocalApprovedFallback(res, fallbackDb) {
  const localCsvPath = path.join(__dirname, 'copy.csv');
  if (fs.existsSync(localCsvPath)) {
    try {
      const csvData = fs.readFileSync(localCsvPath, 'utf8');
      const parsed = parseCsv(csvData);
      const approvedOnly = {};
      for (const [key, val] of Object.entries(parsed)) {
        approvedOnly[key] = val.approved || val.draft;
      }
      console.log(`Serving approved copy from local fallback file: ${localCsvPath}`);
      res.writeHead(200, { 'Content-Type': 'application/json', 'X-CopyFlow-Source': 'local-csv' });
      res.end(JSON.stringify(approvedOnly));
      return;
    } catch (err) {
      console.error("Failed to read local copy.csv for approved endpoint:", err.message);
    }
  }
  
  const approvedOnly = {};
  for (const [key, val] of Object.entries(fallbackDb)) {
    approvedOnly[key] = val.approved;
  }
  console.log("Serving hardcoded fallback approved mock database.");
  res.writeHead(200, { 'Content-Type': 'application/json', 'X-CopyFlow-Source': 'mock' });
  res.end(JSON.stringify(approvedOnly));
}

const server = http.createServer((req, res) => {
  // Set CORS headers manually
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight options request
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathName = parsedUrl.pathname;
  const sheetId = parsedUrl.query.sheetId || "18T7m-9xT_d2hKkU5Fk6q5p_rYQp77_O5zS5a417u7B0";

  if (pathName === '/api/copy') {
    const googleUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&_t=${Date.now()}`;
    
    https.get(googleUrl, (googleRes) => {
      let data = '';
      if (googleRes.statusCode !== 200) {
        console.warn(`Failed to fetch Google Sheet. Status: ${googleRes.statusCode}. Falling back...`);
        serveLocalFallback(res, localMockDatabase);
        return;
      }

      googleRes.on('data', (chunk) => { data += chunk; });
      googleRes.on('end', () => {
        try {
          const parsed = parseCsv(data);
          if (Object.keys(parsed).length === 0) throw new Error("Parsed empty object");
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(parsed));
        } catch (e) {
          serveLocalFallback(res, localMockDatabase);
        }
      });
    }).on('error', (err) => {
      console.warn("Error fetching sheet:", err.message);
      serveLocalFallback(res, localMockDatabase);
    });

  } else if (pathName === '/api/copy/approved') {
    const googleUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&_t=${Date.now()}`;

    https.get(googleUrl, (googleRes) => {
      let data = '';
      if (googleRes.statusCode !== 200) {
        console.warn(`Failed to fetch Google Sheet for approved. Status: ${googleRes.statusCode}. Falling back...`);
        serveLocalApprovedFallback(res, localMockDatabase);
        return;
      }

      googleRes.on('data', (chunk) => { data += chunk; });
      googleRes.on('end', () => {
        try {
          const parsed = parseCsv(data);
          const approvedOnly = {};
          for (const [key, val] of Object.entries(parsed)) {
            approvedOnly[key] = val.approved || val.draft;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(approvedOnly));
        } catch (e) {
          serveLocalApprovedFallback(res, localMockDatabase);
        }
      });
    }).on('error', (err) => {
      console.warn("Error fetching sheet for approved:", err.message);
      serveLocalApprovedFallback(res, localMockDatabase);
    });

  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`CopyFlow Sync Server running on http://localhost:${PORT}`);
});
