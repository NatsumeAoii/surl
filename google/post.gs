/**
 * Google Apps Script — WRITE (Create Short URL)
 *
 * Deployment: Deploy as Web App (Execute as: Me, Access: Anyone)
 *
 * Query parameters:
 *   ?name=<alias>&url=<longUrl>
 *
 * Returns JSON:
 *   { "ok": true,  "shortUrl": "https://.../<alias>" }   — success
 *   { "ok": false, "error": "..." }                       — failure
 *
 * Sheet layout (sheet name: "database"):
 *   Column A: timestamp (ISO 8601)
 *   Column B: short alias
 *   Column C: long URL
 *   Column D: (optional) requester fingerprint for audit
 *
 * Security layers:
 *   1. Rate limiting (per-minute cap using CacheService)
 *   2. Allowed-origin check
 *   3. URL validation (protocol, length, blocked schemes & domains)
 *   4. Alias sanitization (charset, length, reserved-word block)
 *   5. Collision-resistant alias generation (6-char, 729M+ pool)
 *   6. Duplicate URL detection (optional — prevents flooding with same URL)
 *   7. Structured JSON error responses
 */

// ─── Configuration ───
var CONFIG = {
  BASE_URL: 'https://natsumeaoii.github.io/surl/',

  // Paste your Google Spreadsheet ID here (from the URL)
  // https://docs.google.com/spreadsheets/d/YOUR_SPREADSHEET_ID/edit
  SPREADSHEET_ID: '[FILL IN: Google Spreadsheet ID]',

  SHEET_NAME: 'database',

  // Alias rules
  ALIAS_MIN_LENGTH: 2,
  ALIAS_MAX_LENGTH: 32,
  ALIAS_GEN_LENGTH: 6,
  ALIAS_CHARS: 'abcdefghjkmnpqrstuvwxyz23456789',

  // URL rules
  MAX_URL_LENGTH: 2048,
  SAFE_SCHEMES: /^https?:\/\//i,

  // Blocked URL patterns (prevent abuse vectors)
  BLOCKED_URL_PATTERNS: [
    /^javascript:/i,
    /^data:/i,
    /^vbscript:/i,
    /^file:/i,
    /^ftp:/i,
  ],

  // Blocked domains (add known phishing / malware domains)
  BLOCKED_DOMAINS: [
    // 'example-malware-site.com',
  ],

  // Reserved aliases that cannot be created
  RESERVED_ALIASES: [
    'admin', 'api', 'login', 'signup', 'register', 'dashboard',
    'settings', 'help', 'about', 'contact', 'terms', 'privacy',
    'favicon', 'robots', 'sitemap', 'index', 'null', 'undefined',
    '404', 'error', 'health', 'status', 'assets', 'static',
  ],

  // Rate limiting
  RATE_LIMIT_WINDOW_SECONDS: 60,
  RATE_LIMIT_MAX_REQUESTS: 10,

  // Collision handling
  MAX_COLLISION_RETRIES: 10,

  // Set to ['*'] to allow all origins
  ALLOWED_ORIGINS: [
    'https://natsumeaoii.github.io',
  ],
};


// ─── Entry Point ───

function doGet(e) {
  var origin = getOrigin_(e);

  // 1. Origin check
  if (!isOriginAllowed_(origin)) {
    return errorResponse_('Forbidden: origin not allowed');
  }

  // 2. Rate limiting
  var rateLimitResult = checkRateLimit_();
  if (!rateLimitResult.allowed) {
    return errorResponse_(
      'Rate limit exceeded. Try again in ' + rateLimitResult.retryAfter + 's.'
    );
  }

  var rawAlias = (e.parameter.name || '').trim();
  var targetUrl = (e.parameter.url || '').trim();

  // 3. Validate the target URL
  var urlError = validateUrl_(targetUrl);
  if (urlError) {
    return errorResponse_(urlError);
  }

  // 4. Create the short URL
  var result = createShortUrl_(rawAlias, targetUrl);
  return jsonResponse_(result);
}


// ─── Core Logic ───

function createShortUrl_(rawAlias, targetUrl) {
  var sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) return { ok: false, error: 'Database unavailable' };

  // Batch read existing data into a lookup map
  var data = sheet.getLastRow() > 0 ? sheet.getDataRange().getValues() : [];
  var existingAliases = {};
  var existingUrls = {};

  for (var i = 0; i < data.length; i++) {
    var storedAlias = String(data[i][1]).trim();
    var storedUrl = String(data[i][2]).trim();
    existingAliases[storedAlias] = true;
    existingUrls[storedUrl] = storedAlias;
  }

  // Duplicate URL check — return existing alias instead of creating a new one
  if (existingUrls[targetUrl]) {
    return {
      ok: true,
      shortUrl: CONFIG.BASE_URL + existingUrls[targetUrl],
      reused: true,
    };
  }

  // Determine alias
  var alias;
  if (rawAlias) {
    // User-provided alias: sanitize and validate
    alias = sanitizeAlias_(rawAlias);
    if (!alias) {
      return { ok: false, error: 'Invalid alias. Use 2-32 alphanumeric characters, hyphens, or underscores.' };
    }
    if (isReserved_(alias)) {
      return { ok: false, error: 'Alias "' + alias + '" is reserved.' };
    }
    if (existingAliases[alias]) {
      return { ok: false, error: 'Alias "' + alias + '" is already taken.' };
    }
  } else {
    // Auto-generate a unique alias
    alias = generateUniqueAlias_(existingAliases);
    if (!alias) {
      return { ok: false, error: 'Could not generate a unique alias. Try again.' };
    }
  }

  // Write the entry
  sheet.appendRow([
    new Date().toISOString(),
    alias,
    targetUrl,
  ]);

  return { ok: true, shortUrl: CONFIG.BASE_URL + alias };
}


// ─── Validation ───

/**
 * Validate a target URL. Returns an error string, or null if valid.
 */
function validateUrl_(url) {
  if (!url) return 'URL is required.';
  if (url.length > CONFIG.MAX_URL_LENGTH) return 'URL exceeds maximum length (' + CONFIG.MAX_URL_LENGTH + ' chars).';
  if (!CONFIG.SAFE_SCHEMES.test(url)) return 'URL must start with http:// or https://';

  // Block dangerous schemes that might bypass the protocol check via encoding
  for (var i = 0; i < CONFIG.BLOCKED_URL_PATTERNS.length; i++) {
    if (CONFIG.BLOCKED_URL_PATTERNS[i].test(url)) {
      return 'URL contains a blocked scheme.';
    }
  }

  // Block known malicious domains
  var domain = extractDomain_(url);
  if (domain && CONFIG.BLOCKED_DOMAINS.indexOf(domain) !== -1) {
    return 'This domain is blocked.';
  }

  // Reject URLs with control characters or null bytes
  if (/[\x00-\x1f\x7f]/.test(url)) {
    return 'URL contains invalid characters.';
  }

  var authority = extractAuthority_(url);
  if (!authority) return 'Enter a complete URL with a valid host.';

  // Reject URLs that contain credential stuffing (user:pass@host).
  if (authority.indexOf('@') !== -1) {
    return 'URL must not contain embedded credentials.';
  }

  var parsedAuthority = parseAuthority_(authority);
  if (!parsedAuthority.host) return 'Enter a complete URL with a valid host.';
  if (parsedAuthority.invalidPort) return 'Enter a complete URL with a valid port.';

  return null;
}

/**
 * Sanitize alias: whitelist [a-zA-Z0-9_-], enforce length bounds.
 */
function sanitizeAlias_(raw) {
  var cleaned = String(raw).trim().replace(/[^a-zA-Z0-9_-]/g, '');
  if (cleaned.length < CONFIG.ALIAS_MIN_LENGTH || cleaned.length > CONFIG.ALIAS_MAX_LENGTH) {
    return '';
  }
  return cleaned.toLowerCase();
}

/**
 * Check if alias is in the reserved list.
 */
function isReserved_(alias) {
  return CONFIG.RESERVED_ALIASES.indexOf(alias.toLowerCase()) !== -1;
}

/**
 * Extract the domain from a URL for blocklist checking.
 */
function extractDomain_(url) {
  return parseAuthority_(extractAuthority_(url)).host.toLowerCase();
}

function extractAuthority_(url) {
  var rest = String(url || '').replace(/^https?:\/\//i, '');
  return rest.split(/[/?#]/)[0];
}

function parseAuthority_(authority) {
  authority = String(authority || '').trim();
  if (!authority) return { host: '', invalidPort: false };

  if (authority.charAt(0) === '[') {
    var end = authority.indexOf(']');
    if (end === -1) return { host: '', invalidPort: false };

    var ipv6Host = authority.slice(1, end);
    var ipv6Rest = authority.slice(end + 1);
    if (!ipv6Host || (ipv6Rest && ipv6Rest.charAt(0) !== ':')) {
      return { host: '', invalidPort: false };
    }

    var ipv6Port = ipv6Rest ? ipv6Rest.slice(1) : '';
    return {
      host: ipv6Host,
      invalidPort: !!ipv6Port && !isValidPort_(ipv6Port),
    };
  }

  if (authority.indexOf('[') !== -1 || authority.indexOf(']') !== -1) {
    return { host: '', invalidPort: false };
  }

  var colonIndex = authority.lastIndexOf(':');
  if (colonIndex !== -1 && authority.indexOf(':') !== colonIndex) {
    return { host: '', invalidPort: false };
  }

  var host = colonIndex === -1 ? authority : authority.slice(0, colonIndex);
  var port = colonIndex === -1 ? '' : authority.slice(colonIndex + 1);
  if (!host || /\s/.test(host)) return { host: '', invalidPort: false };

  return {
    host: host,
    invalidPort: !!port && !isValidPort_(port),
  };
}

function isValidPort_(port) {
  if (!/^\d+$/.test(port)) return false;
  var value = Number(port);
  return value >= 0 && value <= 65535;
}


// ─── Alias Generation ───

function generateUniqueAlias_(existingAliases) {
  for (var attempt = 0; attempt < CONFIG.MAX_COLLISION_RETRIES; attempt++) {
    var alias = generateAlias_();
    if (!existingAliases[alias] && !isReserved_(alias)) {
      return alias;
    }
  }
  return null;
}

function generateAlias_() {
  var result = '';
  for (var i = 0; i < CONFIG.ALIAS_GEN_LENGTH; i++) {
    result += CONFIG.ALIAS_CHARS.charAt(Math.floor(Math.random() * CONFIG.ALIAS_CHARS.length));
  }
  return result;
}


// ─── Rate Limiting ───

/**
 * Simple per-minute rate limiter using CacheService.
 * Key format: "rl_global" — global across all users.
 * For per-user limiting, you'd use a user identifier (not available in anonymous mode).
 */
function checkRateLimit_() {
  var cache = CacheService.getScriptCache();
  var key = 'rl_write_global';
  var raw = cache.get(key);
  var count = raw ? parseInt(raw, 10) : 0;

  if (count >= CONFIG.RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, retryAfter: CONFIG.RATE_LIMIT_WINDOW_SECONDS };
  }

  cache.put(key, String(count + 1), CONFIG.RATE_LIMIT_WINDOW_SECONDS);
  return { allowed: true };
}


// ─── Origin Check ───

function getOrigin_(e) {
  if (e && e.parameter && e.parameter.origin) {
    return String(e.parameter.origin).trim();
  }
  return '*';
}

function isOriginAllowed_(origin) {
  if (CONFIG.ALLOWED_ORIGINS.indexOf('*') !== -1) return true;
  if (origin === '*') return true;

  for (var i = 0; i < CONFIG.ALLOWED_ORIGINS.length; i++) {
    if (origin === CONFIG.ALLOWED_ORIGINS[i]) return true;
    if (origin.indexOf(CONFIG.ALLOWED_ORIGINS[i]) === 0) return true;
  }
  return false;
}


// ─── Response Helpers ───

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function errorResponse_(message) {
  return jsonResponse_({ ok: false, error: message });
}
