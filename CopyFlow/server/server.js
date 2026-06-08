const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

// Helper to recursively follow HTTP redirects (max 5 hops)
function fetchWithRedirects(urlStr, callback, redirectCount = 0) {
  if (redirectCount > 5) {
    callback(new Error("Too many redirects"));
    return;
  }
  
  https.get(urlStr, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      let redirectUrl = res.headers.location;
      if (!redirectUrl.startsWith('http')) {
        const parsedUrl = new URL(urlStr);
        redirectUrl = `${parsedUrl.protocol}//${parsedUrl.host}${redirectUrl}`;
      }
      fetchWithRedirects(redirectUrl, callback, redirectCount + 1);
    } else {
      callback(null, res);
    }
  }).on('error', (err) => {
    callback(err);
  });
}

// Simple manual dotenv loader to load environment variables from local .env file
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, 'utf8');
  envText.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

const PORT = process.env.PORT || 3000;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || "";

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

// Parse Google Sheets API v4 ValueRange JSON array
function parseValueRange(values) {
  const result = {};
  if (!values || values.length <= 1) return result;
  
  const headers = values[0].map(h => h.toLowerCase().trim());
  const keyIdx = headers.indexOf('key');
  const draftIdx = headers.indexOf('draft');
  const approvedIdx = headers.indexOf('approved');
  const limitIdx = headers.indexOf('character limit');

  if (keyIdx === -1) {
    console.warn("Google Sheet is missing a column header named 'Key'.");
    return result;
  }

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
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
  const apiKey = parsedUrl.query.key || GOOGLE_API_KEY;

  if (pathName === '/api/sheets-proxy') {
    const targetUrl = parsedUrl.query.url;
    const token = parsedUrl.query.token;
    
    if (!targetUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: "Missing url parameter" } }));
      return;
    }
    
    const fetchUrl = token ? `${targetUrl}?token=${encodeURIComponent(token)}` : targetUrl;
    
    fetchWithRedirects(fetchUrl, (err, googleRes) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: err.message } }));
        return;
      }
      
      let data = '';
      googleRes.on('data', (chunk) => { data += chunk; });
      googleRes.on('end', () => {
        res.writeHead(googleRes.statusCode, { 'Content-Type': 'application/json' });
        res.end(data);
      });
    });
    return;
  }

  if (pathName === '/api/copy') {
    let googleUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&_t=${Date.now()}`;
    if (apiKey) {
      googleUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A:E?key=${apiKey}&_t=${Date.now()}`;
    }
    
    https.get(googleUrl, (googleRes) => {
      let data = '';
      if (googleRes.statusCode !== 200) {
        let errData = '';
        googleRes.on('data', (chunk) => { errData += chunk; });
        googleRes.on('end', () => {
          console.warn(`Failed to fetch Google Sheet. Status: ${googleRes.statusCode}. Error: ${errData}`);
          res.writeHead(googleRes.statusCode, { 'Content-Type': 'application/json' });
          res.end(errData || JSON.stringify({ error: { message: `Google Sheets API returned status ${googleRes.statusCode}` } }));
        });
        return;
      }

      googleRes.on('data', (chunk) => { data += chunk; });
      googleRes.on('end', () => {
        try {
          let parsed;
          if (apiKey) {
            const json = JSON.parse(data);
            parsed = parseValueRange(json.values);
          } else {
            parsed = parseCsv(data);
          }
          if (Object.keys(parsed).length === 0) throw new Error("Parsed empty object");
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(parsed));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: e.message } }));
        }
      });
    }).on('error', (err) => {
      console.warn("Error fetching sheet:", err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: err.message } }));
    });

  } else if (pathName === '/api/copy/approved') {
    let googleUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&_t=${Date.now()}`;
    if (apiKey) {
      googleUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A:E?key=${apiKey}&_t=${Date.now()}`;
    }

    https.get(googleUrl, (googleRes) => {
      let data = '';
      if (googleRes.statusCode !== 200) {
        let errData = '';
        googleRes.on('data', (chunk) => { errData += chunk; });
        googleRes.on('end', () => {
          console.warn(`Failed to fetch Google Sheet for approved. Status: ${googleRes.statusCode}. Error: ${errData}`);
          res.writeHead(googleRes.statusCode, { 'Content-Type': 'application/json' });
          res.end(errData || JSON.stringify({ error: { message: `Google Sheets API returned status ${googleRes.statusCode}` } }));
        });
        return;
      }

      googleRes.on('data', (chunk) => { data += chunk; });
      googleRes.on('end', () => {
        try {
          let parsed;
          if (apiKey) {
            const json = JSON.parse(data);
            parsed = parseValueRange(json.values);
          } else {
            parsed = parseCsv(data);
          }
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
