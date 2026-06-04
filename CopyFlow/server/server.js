const http = require('http');
const url = require('url');

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

// Simple CSV parser
function parseCsv(csvText) {
  const lines = csvText.split('\n');
  const result = {};
  
  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Split by comma, handling potential quotes (simple CSV parser)
    const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
    if (!matches || matches.length < 3) continue;
    
    const key = cleanValue(matches[0]);
    const draft = cleanValue(matches[1]);
    const approved = cleanValue(matches[2]);
    const characterLimit = matches[3] ? cleanValue(matches[3]) : "";
    
    if (key) {
      result[key] = {
        draft,
        approved,
        characterLimit
      };
    }
  }
  return result;
}

function cleanValue(val) {
  if (!val) return "";
  let s = val.trim();
  if (s.startsWith('"') && s.endsWith('"')) {
    s = s.substring(1, s.length - 1);
  }
  return s.replace(/""/g, '"'); // Unescape quotes
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
  const path = parsedUrl.pathname;
  const sheetId = parsedUrl.query.sheetId || "18T7m-9xT_d2hKkU5Fk6q5p_rYQp77_O5zS5a417u7B0";

  if (path === '/api/copy') {
    const googleUrl = `http://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
    
    http.get(googleUrl, (googleRes) => {
      let data = '';
      if (googleRes.statusCode !== 200) {
        console.warn(`Failed to fetch Google Sheet. Status: ${googleRes.statusCode}. Serving mock data.`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(localMockDatabase));
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
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(localMockDatabase));
        }
      });
    }).on('error', (err) => {
      console.warn("Error fetching sheet:", err.message);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(localMockDatabase));
    });

  } else if (path === '/api/copy/approved') {
    const googleUrl = `http://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;

    http.get(googleUrl, (googleRes) => {
      let data = '';
      if (googleRes.statusCode !== 200) {
        const approvedOnly = {};
        for (const [key, val] of Object.entries(localMockDatabase)) {
          approvedOnly[key] = val.approved;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(approvedOnly));
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
          const approvedOnly = {};
          for (const [key, val] of Object.entries(localMockDatabase)) {
            approvedOnly[key] = val.approved;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(approvedOnly));
        }
      });
    }).on('error', () => {
      const approvedOnly = {};
      for (const [key, val] of Object.entries(localMockDatabase)) {
        approvedOnly[key] = val.approved;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(approvedOnly));
    });

  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`CopyFlow Sync Server running on http://localhost:${PORT}`);
});
