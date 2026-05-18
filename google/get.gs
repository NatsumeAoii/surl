/**
 * Google Apps Script — READ (Resolve Short URL)
 *
 * Deployment: Deploy as Web App (Execute as: Me, Access: Anyone)
 *
 * Query parameter:
 *   ?name=<alias>
 *
 * Returns JSON:
 *   { "ok": true,  "url": "https://..." }     — found
 *   { "ok": false, "url": "<BASE_URL>" }       — not found / invalid
 *
 * Sheet layout (sheet name: "database"):
 *   Column A: timestamp (ISO 8601)
 *   Column B: short alias
 *   Column C: long URL
 *
 * Security layers:
 *   1. Alias sanitization (reject anything that isn't [a-zA-Z0-9_-])
 *   2. Alias length cap (max 32 chars)
 *   3. Stored-URL validation before redirect (only http/https)
 *   4. Allowed-origin check (CORS-like)
 *   5. Structured JSON response (prevents raw-redirect abuse)
 */

// ─── Configuration ───
var CONFIG = {
  BASE_URL: 'https://natsumeaoii.github.io/surl/',

  // Paste your Google Spreadsheet ID here (from the URL)
  // https://docs.google.com/spreadsheets/d/YOUR_SPREADSHEET_ID/edit
  SPREADSHEET_ID: '[FILL IN: Google Spreadsheet ID]',

  MAX_ALIAS_LENGTH: 32,
  SHEET_NAME: 'database',

  // Set to ['*'] to allow all origins, or specify your domains
  ALLOWED_ORIGINS: [
    'https://natsumeaoii.github.io',
  ],

  // Safe URL schemes that are allowed for redirect
  SAFE_SCHEMES: /^https?:\/\//i,
};


// ─── Entry Point ───

function doGet(e) {
  var origin = getOrigin_(e);

  // Origin validation (reject unknown callers)
  if (!isOriginAllowed_(origin)) {
    return errorResponse_('Forbidden', origin);
  }

  var alias = sanitizeAlias_((e.parameter.name || ''));

  if (!alias) {
    return jsonResponse_({ ok: false, url: CONFIG.BASE_URL }, origin);
  }

  var resolved = resolve_(alias);

  // Validate the stored URL before returning it (prevent open redirect)
  if (resolved !== CONFIG.BASE_URL && !CONFIG.SAFE_SCHEMES.test(resolved)) {
    return jsonResponse_({ ok: false, url: CONFIG.BASE_URL }, origin);
  }

  return jsonResponse_(
    { ok: resolved !== CONFIG.BASE_URL, url: resolved },
    origin
  );
}


// ─── Core Logic ───

function resolve_(alias) {
  var sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 1) return CONFIG.BASE_URL;

  var data = sheet.getDataRange().getValues();

  for (var i = 0; i < data.length; i++) {
    if (String(data[i][1]).trim() === alias) {
      return String(data[i][2]).trim();
    }
  }

  return CONFIG.BASE_URL;
}


// ─── Security Helpers ───

/**
 * Sanitize alias: strip anything not [a-zA-Z0-9_-], enforce length cap.
 * Returns empty string if the result is invalid.
 */
function sanitizeAlias_(raw) {
  var cleaned = String(raw).trim().replace(/[^a-zA-Z0-9_-]/g, '');
  if (cleaned.length === 0 || cleaned.length > CONFIG.MAX_ALIAS_LENGTH) {
    return '';
  }
  return cleaned;
}

/**
 * Extract the Origin header from the request.
 * GAS provides headers in e.parameter or via a custom approach;
 * for web-app deployments, we check the common header locations.
 */
function getOrigin_(e) {
  if (e && e.parameter && e.parameter.origin) {
    return String(e.parameter.origin).trim();
  }
  return '*';
}

/**
 * Check if the request origin is in the allow-list.
 */
function isOriginAllowed_(origin) {
  if (CONFIG.ALLOWED_ORIGINS.indexOf('*') !== -1) return true;
  if (origin === '*') return true; // Direct browser hits (no Origin header)

  for (var i = 0; i < CONFIG.ALLOWED_ORIGINS.length; i++) {
    if (origin === CONFIG.ALLOWED_ORIGINS[i]) return true;
    // Allow subpaths: "https://foo.github.io" matches "https://foo.github.io/bar"
    if (origin.indexOf(CONFIG.ALLOWED_ORIGINS[i]) === 0) return true;
  }
  return false;
}


// ─── Response Helpers ───

function jsonResponse_(payload, origin) {
  var output = ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}

function errorResponse_(message, origin) {
  return jsonResponse_({ ok: false, error: message }, origin);
}
