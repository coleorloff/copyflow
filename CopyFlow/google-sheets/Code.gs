const SECRET_TOKEN = "CopyFlowSecret2026"; // Default secret token, change as needed

function doGet(e) {
  const token = e.parameter.token;
  if (token !== SECRET_TOKEN) {
    return ContentService.createTextOutput(JSON.stringify({ error: "Unauthorized: Invalid or missing token" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      return ContentService.createTextOutput(JSON.stringify({ error: "No active spreadsheet found. Make sure this script is container-bound to a Google Sheet." }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    const sheet = ss.getActiveSheet();
    const data = sheet.getDataRange().getValues();
    
    if (data.length <= 1) {
      return ContentService.createTextOutput(JSON.stringify({}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const headers = data[0].map(h => String(h).toLowerCase().trim());
    const keyIdx = headers.indexOf('key');
    const limitIdx = headers.indexOf('character limit');

    if (keyIdx === -1) {
      return ContentService.createTextOutput(JSON.stringify({ error: "Sheet is missing a 'Key' column header." }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Identify dynamic version headers (columns starting with "copy v" like "Copy V1", "Copy V2")
    const versionHeaders = [];
    headers.forEach((h, idx) => {
      if (/^copy\s+v/i.test(h)) {
        versionHeaders.push({ name: data[0][idx], index: idx });
      }
    });

    const result = {};

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const key = String(row[keyIdx]).trim();
      if (!key) continue;

      const limit = limitIdx !== -1 && row[limitIdx] !== undefined ? String(row[limitIdx]).trim() : "";
      
      const versions = {};
      versionHeaders.forEach(vh => {
        versions[vh.name] = row[vh.index] !== undefined ? String(row[vh.index]).trim() : "";
      });

      result[key] = {
        characterLimit: limit,
        versions: versions
      };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
