/**
 * Google Apps Script - S.url combined API.
 *
 * Deployment:
 * 1. Create or open the backing Google Sheet.
 * 2. Rename the tab to "database".
 * 3. Open Extensions > Apps Script.
 * 4. Paste this file and deploy as a Web App.
 * 5. Execute as: Me. Access: Anyone.
 *
 * Methods:
 * - GET is preferred for browser calls from GitHub Pages because Apps Script
 *   returns CORS-compatible JSON for this request path:
 *   ?action=write&name=abc&url=https%3A%2F%2Fexample.com
 * - POST remains supported for compatible non-browser callers.
 */

var BASE_URL = 'https://natsumeaoii.github.io/surl/';
var SPREADSHEET_ID = '';
var SHEET_NAME = 'database';
var REPORTS_SHEET = 'reports';

var MAX_URL_LENGTH = 2048;
var ALIAS_MIN_LENGTH = 2;
var ALIAS_MAX_LENGTH = 64;
var ALIAS_GEN_LENGTH = 6;
var ALIAS_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
var MAX_BULK_URLS = 10;
var MAX_FIELD_LENGTH = 64;
var MAX_PASSWORD_LENGTH = 128;
var MAX_REPORT_REASON = 500;
var MAX_REQUEST_BODY_LENGTH = 32 * 1024;
var MAX_BULK_JSON_LENGTH = MAX_BULK_URLS * (MAX_URL_LENGTH + 16);
var ACCESS_COUNT_COLUMN = 13;
var LAST_ACCESSED_COLUMN = 14;
var DATABASE_HEADERS = [
  'Timestamp', 'Alias', 'Long link', 'uid', 'device', 'browser', 'OS', 'lang', 'referer', 'screen',
  'exp', 'password hash', 'access count', 'last accessed', 'creator IP', 'creator IP hash',
  'country', 'region', 'city', 'timezone',
];
var REPORT_HEADERS = [
  'Timestamp', 'Alias', 'Reason', 'Description', 'Destination',
  'ReporterIp', 'ReporterIpHash', 'Country', 'Region', 'City', 'Timezone', 'Reporter',
];

var RATE_LIMIT_MAX = 10;
var RATE_LIMIT_GLOBAL_MAX = 120;
var PASSWORD_RATE_LIMIT_MAX = 5;
var PASSWORD_RATE_LIMIT_GLOBAL_MAX = 60;
var RATE_LIMIT_WINDOW = 60;
var LOCK_WAIT_MS = 5000;

var RESERVED_ALIASES = [
  'admin', 'api', 'login', 'signup', 'register', 'dashboard',
  'settings', 'help', 'about', 'contact', 'terms', 'privacy',
  'favicon', 'robots', 'sitemap', 'index', 'null', 'undefined',
  '404', 'error', 'health', 'status', 'assets', 'static',
  'preview', 'report', 'bulk',
];

var BLOCKED_URL_PATTERNS = [
  /^javascript:/i,
  /^data:/i,
  /^vbscript:/i,
  /^file:/i,
  /^ftp:/i,
];

var BLOCKED_DOMAINS = [
  // 'example-malware-site.com',
];

function doGet(e) {
  var event = normalizeEvent_(e);
  if (event.error) return respond_(event.error);
  var action = getParam_(event, 'action') || 'read';

  try {
    switch (String(action).toLowerCase()) {
      case 'write': return handleWrite_(event);
      case 'bulk': return handleBulk_(event);
      case 'report': return handleReport_(event);
      case 'preview': return handlePreview_(event);
      case 'history': return handleHistory_(event);
      case 'read':
      default: return handleRead_(event);
    }
  } catch (err) {
    return respond_(failure_('INTERNAL_ERROR', 'The shortener service failed. Try again shortly.'));
  }
}

function doPost(e) {
  return doGet(e);
}

function handleRead_(e) {
  var alias = sanitizeAlias_(getParam_(e, 'name'));
  var password = getParam_(e, 'password');

  if (!alias) return respond_(failure_('INVALID_ALIAS', 'Invalid alias.', { url: BASE_URL }));

  var sheet = getSheet_(SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 1) {
    return respond_(failure_('NOT_FOUND', 'Link not found.', { url: BASE_URL }));
  }

  var data = sheet.getDataRange().getValues();
  for (var i = 0; i < data.length; i++) {
    if (normalizeStoredAlias_(data[i][1]) !== alias) continue;

    var storedUrl = String(data[i][2] || '').trim();
    if (validateUrl_(storedUrl)) continue;

    var expiry = String(data[i][10] || '').trim();
    if (isExpired_(expiry)) {
      return respond_(failure_('LINK_EXPIRED', 'This link has expired.', { url: BASE_URL }));
    }

    var storedHash = String(data[i][11] || '').trim();
    if (storedHash) {
      if (!password) {
        return respond_(failure_('PASSWORD_REQUIRED', 'Password required.', { needsPassword: true }));
      }
      var passwordLimit = checkPasswordAttemptRateLimit_(alias, getRequesterKey_(e));
      if (!passwordLimit.allowed) {
        return respond_(failure_('RATE_LIMITED', 'Too many password attempts. Try again in ' + passwordLimit.retryAfter + 's.', { needsPassword: true }));
      }
      if (!verifyPassword_(password, storedHash)) {
        return respond_(failure_('WRONG_PASSWORD', 'Incorrect password.', { needsPassword: true }));
      }
    }

    incrementAccessCounter_(sheet, i + 1, data[i]);
    return respond_({ ok: true, url: storedUrl });
  }

  return respond_(failure_('NOT_FOUND', 'Link not found.', { url: BASE_URL }));
}

function handlePreview_(e) {
  var alias = sanitizeAlias_(getParam_(e, 'name'));
  if (!alias) return respond_(failure_('INVALID_ALIAS', 'Invalid alias.'));

  var sheet = getSheet_(SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 1) {
    return respond_(failure_('NOT_FOUND', 'Link not found.'));
  }

  var data = sheet.getDataRange().getValues();
  for (var i = 0; i < data.length; i++) {
    if (normalizeStoredAlias_(data[i][1]) !== alias) continue;

    var storedUrl = String(data[i][2] || '').trim();
    if (validateUrl_(storedUrl)) continue;

    var expiry = String(data[i][10] || '').trim();
    var hasPassword = !!String(data[i][11] || '').trim();
    var isExpired = isExpired_(expiry);

    return respond_({
      ok: true,
      domain: extractDomain_(storedUrl) || alias,
      hasPassword: hasPassword,
      expiry: expiry || null,
      isExpired: isExpired,
      previewUrl: hasPassword || isExpired ? null : storedUrl,
    });
  }

  return respond_(failure_('NOT_FOUND', 'Link not found.'));
}

function handleWrite_(e) {
  var rl = checkActionRateLimit_('write', getRequesterKey_(e));
  if (!rl.allowed) {
    return respond_(failure_('RATE_LIMITED', 'Rate limit exceeded. Try again in ' + rl.retryAfter + 's.'));
  }

  var rawAlias = getParam_(e, 'name').trim();
  var targetUrl = getParam_(e, 'url').trim();
  var expiryParam = getParam_(e, 'expiry').trim();
  var passwordParam = getParam_(e, 'password');

  var urlErr = validateUrl_(targetUrl);
  if (urlErr) return respond_(failure_(urlErr.code, urlErr.message));

  if (passwordParam.length > MAX_PASSWORD_LENGTH) {
    return respond_(failure_('PASSWORD_TOO_LONG', 'Password exceeds the maximum length.'));
  }

  if (expiryParam) {
    var expiryDate = new Date(expiryParam);
    if (isNaN(expiryDate.getTime())) {
      return respond_(failure_('INVALID_EXPIRY', 'Invalid expiry date format. Use ISO 8601.'));
    }
    if (expiryDate <= new Date()) {
      return respond_(failure_('EXPIRY_IN_PAST', 'Expiry date must be in the future.'));
    }
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) {
    return respond_(failure_('SERVICE_BUSY', 'The shortener is busy. Try again shortly.'));
  }

  try {
    var sheet = getSheet_(SHEET_NAME);
    if (!sheet) {
      return respond_(failure_('DATABASE_UNAVAILABLE', 'Database unavailable. Ensure a "database" sheet tab exists.'));
    }
    ensureDatabaseHeaders_(sheet);

    var data = sheet.getLastRow() > 0 ? sheet.getDataRange().getValues() : [];
    var existingAliases = buildAliasMap_(data);
    var network = collectNetworkContext_(e);

    if (!passwordParam && !expiryParam) {
      var reusable = findReusableRowForUrl_(data, targetUrl);
      if (reusable) {
        var metadataStored = updateNetworkMetadata_(sheet, reusable.rowNumber, reusable.row, network);
        return respond_({ ok: true, shortUrl: BASE_URL + reusable.alias, reused: true, metadataStored: metadataStored });
      }
    }

    var alias;
    if (rawAlias) {
      alias = sanitizeAlias_(rawAlias);
      if (!alias) {
        return respond_(failure_('INVALID_ALIAS', 'Invalid alias. Use 2-64 alphanumeric characters, hyphens, or underscores.'));
      }
      if (isReserved_(alias)) {
        return respond_(failure_('RESERVED_ALIAS', 'Alias "' + alias + '" is reserved.'));
      }
      if (existingAliases[alias]) {
        return respond_(failure_('ALIAS_TAKEN', 'Alias "' + alias + '" is already taken.'));
      }
    } else {
      alias = generateUniqueAlias_(existingAliases);
      if (!alias) {
        return respond_(failure_('ALIAS_GENERATION_FAILED', 'Could not generate a unique alias. Try again.'));
      }
    }

    var analytics = collectAnalytics_(e);
    var passwordHash = passwordParam ? createPasswordHash_(passwordParam) : '';

    appendDatabaseRow_(sheet, [
      new Date().toISOString(), alias, targetUrl,
      analytics.uid, analytics.device, analytics.browser, analytics.os, analytics.lang, analytics.ref, analytics.scr,
      expiryParam || '', passwordHash,
      0, '', network.ip, network.ipHash, network.country, network.region, network.city, network.timezone,
    ]);

    var result = { ok: true, shortUrl: BASE_URL + alias };
    result.metadataStored = hasNetworkMetadata_(network);
    if (expiryParam) result.expiry = expiryParam;
    if (passwordParam) result.isProtected = true;

    return respond_(result);
  } finally {
    lock.releaseLock();
  }
}

function handleBulk_(e) {
  var rl = checkActionRateLimit_('bulk', getRequesterKey_(e));
  if (!rl.allowed) {
    return respond_(failure_('RATE_LIMITED', 'Rate limit exceeded. Try again in ' + rl.retryAfter + 's.'));
  }

  var urlsJson = getParam_(e, 'urls').trim();
  if (!urlsJson) return respond_(failure_('MISSING_URLS', 'Missing urls parameter.'));
  if (urlsJson.length > MAX_BULK_JSON_LENGTH) {
    return respond_(failure_('PAYLOAD_TOO_LARGE', 'Request payload is too large.'));
  }

  var urls;
  try {
    urls = JSON.parse(urlsJson);
  } catch (err) {
    return respond_(failure_('INVALID_URLS_JSON', 'Invalid JSON in urls parameter.'));
  }

  if (!Array.isArray(urls) || urls.length === 0) {
    return respond_(failure_('INVALID_URLS', 'urls must be a non-empty array.'));
  }
  if (urls.length > MAX_BULK_URLS) {
    return respond_(failure_('TOO_MANY_URLS', 'Maximum ' + MAX_BULK_URLS + ' URLs per bulk request.'));
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) {
    return respond_(failure_('SERVICE_BUSY', 'The shortener is busy. Try again shortly.'));
  }

  try {
    var sheet = getSheet_(SHEET_NAME);
    if (!sheet) return respond_(failure_('DATABASE_UNAVAILABLE', 'Database unavailable.'));
    ensureDatabaseHeaders_(sheet);

    var data = sheet.getLastRow() > 0 ? sheet.getDataRange().getValues() : [];
    var existingAliases = buildAliasMap_(data);
    var analytics = collectAnalytics_(e);
    var network = collectNetworkContext_(e);
    var preparedUrls = [];
    var requestedUrls = {};
    var results = [];
    var rows = [];

    for (var i = 0; i < urls.length; i++) {
      var targetUrl = String(urls[i] || '').trim();
      var urlErr = validateUrl_(targetUrl);
      preparedUrls.push({ targetUrl: targetUrl, urlErr: urlErr });
      if (urlErr) {
        continue;
      }
      requestedUrls[targetUrl] = true;
    }

    var reusableUrls = buildReusableUrlMap_(data, requestedUrls);

    for (var preparedIndex = 0; preparedIndex < preparedUrls.length; preparedIndex++) {
      var prepared = preparedUrls[preparedIndex];
      var targetUrl = prepared.targetUrl;
      var urlErr = prepared.urlErr;
      if (urlErr) {
        results.push({ url: targetUrl, ok: false, code: urlErr.code, error: urlErr.message });
        continue;
      }

      var reusableAlias = reusableUrls[targetUrl];
      if (reusableAlias) {
        var reusable = findReusableRowForUrl_(data, targetUrl);
        if (reusable) updateNetworkMetadata_(sheet, reusable.rowNumber, reusable.row, network);
        results.push({ url: targetUrl, ok: true, shortUrl: BASE_URL + reusableAlias, reused: true });
        continue;
      }

      var alias = generateUniqueAlias_(existingAliases);
      if (!alias) {
        results.push({ url: targetUrl, ok: false, code: 'ALIAS_GENERATION_FAILED', error: 'Could not generate alias.' });
        continue;
      }

      existingAliases[alias] = true;
      reusableUrls[targetUrl] = alias;
      var timestamp = new Date().toISOString();
      var row = [
        timestamp, alias, targetUrl,
        analytics.uid, analytics.device, analytics.browser, analytics.os, analytics.lang, analytics.ref, analytics.scr,
        '', '', 0, '', network.ip, network.ipHash, network.country, network.region, network.city, network.timezone,
      ];
      data.push(row);
      rows.push(row);
      results.push({ url: targetUrl, ok: true, shortUrl: BASE_URL + alias });
    }

    if (rows.length > 0) {
      var lastRow = sheet.getLastRow();
      sheet.getRange(lastRow + 1, 1, rows.length, rows[0].length).setValues(rows);
    }

    return respond_({ ok: true, results: results });
  } finally {
    lock.releaseLock();
  }
}

function handleReport_(e) {
  var rl = checkActionRateLimit_('report', getRequesterKey_(e));
  if (!rl.allowed) {
    return respond_(failure_('RATE_LIMITED', 'Rate limit exceeded. Try again in ' + rl.retryAfter + 's.'));
  }

  var alias = sanitizeAlias_(getParam_(e, 'name'));
  var reason = sanitizeReportReason_(getParam_(e, 'reason'));
  var description = sanitizeReportReason_(getParam_(e, 'description') || getParam_(e, 'details'));
  var destination = sanitizeReportDestination_(getParam_(e, 'destination') || getParam_(e, 'url'));
  var network = collectNetworkContext_(e);

  if (!alias) return respond_(failure_('INVALID_ALIAS', 'Missing alias.'));
  if (!reason || reason.length < 5) {
    return respond_(failure_('INVALID_REPORT_REASON', 'Please provide a reason with at least 5 characters.'));
  }

  var ss = getSpreadsheet_();
  if (!ss) return respond_(failure_('DATABASE_UNAVAILABLE', 'Database unavailable.'));

  var reportsSheet = ss.getSheetByName(REPORTS_SHEET);
  if (!reportsSheet) {
    reportsSheet = ss.insertSheet(REPORTS_SHEET);
    reportsSheet.appendRow(REPORT_HEADERS);
  } else {
    ensureReportHeaders_(reportsSheet);
  }

  reportsSheet.appendRow([
    new Date().toISOString(), alias, reason, description, destination,
    network.ip, network.ipHash, network.country, network.region, network.city, network.timezone, '',
  ]);
  return respond_({ ok: true, message: 'Report submitted. Thank you.' });
}

function handleHistory_(e) {
  var uid = sanitizeField_(getParam_(e, 'uid'), MAX_FIELD_LENGTH);
  var rl = checkActionRateLimit_('history', uid || getRequesterKey_(e));
  if (!rl.allowed) {
    return respond_(failure_('RATE_LIMITED', 'Rate limit exceeded. Try again in ' + rl.retryAfter + 's.'));
  }

  if (!/^[a-f0-9]{32}$/.test(uid)) {
    return respond_(failure_('INVALID_UID', 'Invalid or missing UID.'));
  }

  var sheet = getSheet_(SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 1) {
    return respond_({ ok: true, links: [] });
  }

  var data = sheet.getDataRange().getValues();
  var links = [];

  for (var i = 0; i < data.length; i++) {
    var rowUid = String(data[i][3] || '').trim();
    if (rowUid !== uid) continue;

    var alias = normalizeStoredAlias_(data[i][1]);
    var longUrl = String(data[i][2] || '').trim();
    var created = String(data[i][0] || '').trim();
    var expiry = String(data[i][10] || '').trim();
    var hasPassword = !!String(data[i][11] || '').trim();

    links.push({
      alias: alias,
      url: longUrl,
      shortUrl: BASE_URL + alias,
      created: created,
      expiry: expiry || null,
      isExpired: isExpired_(expiry),
      isProtected: hasPassword,
    });
  }

  links.reverse();
  return respond_({ ok: true, links: links });
}

function normalizeEvent_(e) {
  var params = {};
  if (e && e.parameter) {
    for (var key in e.parameter) {
      if (Object.prototype.hasOwnProperty.call(e.parameter, key) && isSafeParamKey_(key)) {
        params[key] = stringifyParam_(e.parameter[key]);
      }
    }
  }

  var body = e && e.postData && e.postData.contents ? String(e.postData.contents) : '';
  if (body.length > MAX_REQUEST_BODY_LENGTH) {
    return {
      parameter: params,
      error: failure_('PAYLOAD_TOO_LARGE', 'Request payload is too large.'),
    };
  }
  body = body.trim();
  if (body) {
    var parsed = parseBody_(body);
    for (var parsedKey in parsed) {
      if (Object.prototype.hasOwnProperty.call(parsed, parsedKey) && isSafeParamKey_(parsedKey)) {
        params[parsedKey] = stringifyParam_(parsed[parsedKey]);
      }
    }
  }

  return { parameter: params };
}

function parseBody_(body) {
  try {
    var json = JSON.parse(body);
    return json && typeof json === 'object' && !Array.isArray(json) ? json : {};
  } catch (err) {
    var params = {};
    var pairs = body.split('&');
    for (var i = 0; i < pairs.length; i++) {
      var pair = pairs[i];
      if (!pair) continue;
      var index = pair.indexOf('=');
      var key = index === -1 ? pair : pair.slice(0, index);
      var value = index === -1 ? '' : pair.slice(index + 1);
      try {
        var decodedKey = decodeURIComponent(key.replace(/\+/g, ' '));
        if (isSafeParamKey_(decodedKey)) {
          params[decodedKey] = decodeURIComponent(value.replace(/\+/g, ' '));
        }
      } catch (_) {
        // Ignore malformed parameter encodings.
      }
    }
    return params;
  }
}

function stringifyParam_(value) {
  if (value === null || typeof value === 'undefined') return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function isSafeParamKey_(key) {
  return key !== '__proto__' && key !== 'constructor' && key !== 'prototype';
}

function getParam_(e, key) {
  return e && e.parameter && Object.prototype.hasOwnProperty.call(e.parameter, key)
    ? String(e.parameter[key])
    : '';
}

function getSpreadsheet_() {
  if (SPREADSHEET_ID) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return SpreadsheetApp.getActive();
}

function getSheet_(name) {
  var ss = getSpreadsheet_();
  if (!ss) return null;
  return ss.getSheetByName(name);
}

function respond_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function failure_(code, message, extra) {
  var payload = { ok: false, code: code, error: message };
  if (extra) {
    for (var key in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, key)) payload[key] = extra[key];
    }
  }
  return payload;
}

function sanitizeAlias_(raw) {
  var cleaned = String(raw || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
  if (cleaned.length < ALIAS_MIN_LENGTH || cleaned.length > ALIAS_MAX_LENGTH) return '';
  return cleaned;
}

function normalizeStoredAlias_(raw) {
  return String(raw || '').trim().toLowerCase();
}

function isReserved_(alias) {
  return RESERVED_ALIASES.indexOf(alias.toLowerCase()) !== -1;
}

function validateUrl_(url) {
  if (!url) return { code: 'URL_REQUIRED', message: 'URL is required.' };
  if (url.length > MAX_URL_LENGTH) return { code: 'URL_TOO_LONG', message: 'URL exceeds maximum length.' };
  if (hasControlChars_(url)) return { code: 'URL_CONTROL_CHARS', message: 'URL contains invalid characters.' };
  if (!/^https?:\/\//i.test(url)) return { code: 'URL_PROTOCOL', message: 'URL must start with http:// or https://.' };

  for (var i = 0; i < BLOCKED_URL_PATTERNS.length; i++) {
    if (BLOCKED_URL_PATTERNS[i].test(url)) {
      return { code: 'URL_BLOCKED_SCHEME', message: 'URL contains a blocked scheme.' };
    }
  }

  var authority = extractAuthority_(url);
  if (!authority) return { code: 'URL_INVALID', message: 'Enter a complete URL with a valid host.' };
  if (authority.indexOf('@') !== -1) return { code: 'URL_CREDENTIALS', message: 'URL must not contain embedded credentials.' };
  var parsedAuthority = parseAuthority_(authority);
  if (!parsedAuthority.host) return { code: 'URL_INVALID', message: 'Enter a complete URL with a valid host.' };
  if (parsedAuthority.invalidPort) return { code: 'URL_INVALID', message: 'Enter a complete URL with a valid port.' };

  var domain = extractDomain_(url);
  if (isBlockedDomain_(domain)) return { code: 'URL_BLOCKED_DOMAIN', message: 'This domain is blocked.' };

  return null;
}

function extractAuthority_(url) {
  var rest = String(url || '').replace(/^https?:\/\//i, '');
  return rest.split(/[/?#]/)[0];
}

function extractDomain_(url) {
  return parseAuthority_(extractAuthority_(url)).host.toLowerCase();
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

function isBlockedDomain_(domain) {
  if (!domain) return false;
  for (var i = 0; i < BLOCKED_DOMAINS.length; i++) {
    var blocked = String(BLOCKED_DOMAINS[i]).toLowerCase();
    if (domain === blocked || domain.slice(-(blocked.length + 1)) === '.' + blocked) return true;
  }
  return false;
}

function hasControlChars_(value) {
  for (var i = 0; i < value.length; i++) {
    var code = value.charCodeAt(i);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

function buildAliasMap_(data) {
  var aliases = {};
  for (var i = 0; i < data.length; i++) {
    var alias = normalizeStoredAlias_(data[i][1]);
    if (alias) aliases[alias] = true;
  }
  return aliases;
}

function buildReusableUrlMap_(data, requestedUrls) {
  var urls = {};
  for (var i = 0; i < data.length; i++) {
    var storedUrl = String(data[i][2] || '').trim();
    if (requestedUrls && !requestedUrls[storedUrl]) continue;
    if (!isReusableRow_(data[i])) continue;
    if (!urls[storedUrl]) urls[storedUrl] = normalizeStoredAlias_(data[i][1]);
  }
  return urls;
}

function findReusableAliasForUrl_(data, targetUrl) {
  var reusable = findReusableRowForUrl_(data, targetUrl);
  return reusable ? reusable.alias : '';
}

function findReusableRowForUrl_(data, targetUrl) {
  for (var i = 0; i < data.length; i++) {
    var storedUrl = String(data[i][2] || '').trim();
    if (storedUrl !== targetUrl) continue;
    if (!isReusableRow_(data[i])) continue;
    return {
      alias: normalizeStoredAlias_(data[i][1]),
      row: data[i],
      rowNumber: i + 1,
    };
  }
  return null;
}

function isReusableRow_(row) {
  var alias = normalizeStoredAlias_(row[1]);
  var storedUrl = String(row[2] || '').trim();
  var expiry = String(row[10] || '').trim();
  var passwordHash = String(row[11] || '').trim();
  return !!alias && !validateUrl_(storedUrl) && !expiry && !passwordHash;
}

function collectAnalytics_(e) {
  return {
    uid: sanitizeSheetCell_(sanitizeField_(getParam_(e, 'uid'), MAX_FIELD_LENGTH)),
    device: sanitizeSheetCell_(sanitizeField_(getParam_(e, 'device'), MAX_FIELD_LENGTH)),
    browser: sanitizeSheetCell_(sanitizeField_(getParam_(e, 'browser'), MAX_FIELD_LENGTH)),
    os: sanitizeSheetCell_(sanitizeField_(getParam_(e, 'os'), MAX_FIELD_LENGTH)),
    lang: sanitizeSheetCell_(sanitizeField_(getParam_(e, 'lang'), MAX_FIELD_LENGTH)),
    ref: sanitizeSheetCell_(sanitizeField_(getParam_(e, 'ref'), MAX_FIELD_LENGTH)),
    scr: sanitizeSheetCell_(sanitizeField_(getParam_(e, 'scr'), MAX_FIELD_LENGTH)),
  };
}

function collectNetworkContext_(e) {
  var fallback = parseNetworkPayload_(getParam_(e, 'network'));
  var ip = sanitizeIp_(getParam_(e, 'ip') || fallback.ip);
  var country = sanitizeNetworkField_(getParam_(e, 'country') || fallback.country);
  var city = sanitizeNetworkField_(getParam_(e, 'city') || fallback.city);
  var region = sanitizeNetworkField_(getParam_(e, 'region') || fallback.region) || city || country;
  return {
    ip: ip,
    ipHash: ip ? sha256Hex_(ip) : '',
    country: country,
    region: region,
    city: city,
    timezone: sanitizeNetworkField_(getParam_(e, 'tz') || getParam_(e, 'timezone') || fallback.tz || fallback.timezone),
  };
}

function parseNetworkPayload_(raw) {
  if (!raw) return {};
  try {
    var parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function incrementAccessCounter_(sheet, rowNumber, row) {
  try {
    var current = parsePositiveInteger_((row || [])[ACCESS_COUNT_COLUMN - 1]);
    var columnCount = LAST_ACCESSED_COLUMN - ACCESS_COUNT_COLUMN + 1;
    sheet.getRange(rowNumber, ACCESS_COUNT_COLUMN, 1, columnCount).setValues([[current + 1, new Date().toISOString()]]);
  } catch (_) {
    // Counter writes must not break successful redirects.
  }
}

function parsePositiveInteger_(value) {
  var parsed = parseInt(String(value || '0'), 10);
  return isNaN(parsed) || parsed < 0 ? 0 : parsed;
}

function sanitizeIp_(raw) {
  var value = sanitizeField_(raw, 45);
  if (!value || !/^[a-fA-F0-9:.]+$/.test(value)) return '';
  return value;
}

function sanitizeNetworkField_(raw) {
  return sanitizeSheetCell_(sanitizeField_(raw, MAX_FIELD_LENGTH));
}

function sanitizeReportDestination_(raw) {
  var value = sanitizeField_(raw, MAX_URL_LENGTH);
  if (!value || validateUrl_(value)) return '';
  return sanitizeSheetCell_(value);
}

function ensureDatabaseHeaders_(sheet) {
  try {
    if (sheet.getLastRow() < 1) {
      sheet.appendRow(DATABASE_HEADERS);
      return;
    }

    var headerRange = sheet.getRange(1, 1, 1, DATABASE_HEADERS.length);
    var headers = headerRange.getValues()[0] || [];
    if (!isDatabaseHeaderRow_(headers)) return;

    for (var i = 0; i < DATABASE_HEADERS.length; i++) {
      if (headers[i] !== DATABASE_HEADERS[i]) {
        headerRange.setValues([DATABASE_HEADERS]);
        return;
      }
    }
  } catch (_) {
    // Link creation can still proceed if the header upgrade fails.
  }
}

function isDatabaseHeaderRow_(headers) {
  return String(headers[0] || '').toLowerCase() === 'timestamp'
    && String(headers[1] || '').toLowerCase() === 'alias'
    && String(headers[2] || '').toLowerCase() === 'long link';
}

function appendDatabaseRow_(sheet, row) {
  var normalizedRow = row.slice(0, DATABASE_HEADERS.length);
  while (normalizedRow.length < DATABASE_HEADERS.length) normalizedRow.push('');
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, DATABASE_HEADERS.length).setValues([normalizedRow]);
}

function updateNetworkMetadata_(sheet, rowNumber, row, network) {
  if (!hasNetworkMetadata_(network)) return false;

  var values = [
    chooseMetadataValue_(row[14], network.ip),
    chooseMetadataValue_(row[15], network.ipHash),
    chooseMetadataValue_(row[16], network.country),
    chooseMetadataValue_(row[17], network.region),
    chooseMetadataValue_(row[18], network.city),
    chooseMetadataValue_(row[19], network.timezone),
  ];

  if (values.join('|') === [
    String(row[14] || ''),
    String(row[15] || ''),
    String(row[16] || ''),
    String(row[17] || ''),
    String(row[18] || ''),
    String(row[19] || ''),
  ].join('|')) {
    return true;
  }

  sheet.getRange(rowNumber, 15, 1, values.length).setValues([values]);
  return true;
}

function chooseMetadataValue_(storedValue, nextValue) {
  var stored = String(storedValue || '');
  return stored || String(nextValue || '');
}

function hasNetworkMetadata_(network) {
  return !!(network && (network.ip || network.country || network.region || network.city || network.timezone));
}

function ensureReportHeaders_(sheet) {
  try {
    if (sheet.getLastRow() < 1) {
      sheet.appendRow(REPORT_HEADERS);
      return;
    }

    var headerRange = sheet.getRange(1, 1, 1, REPORT_HEADERS.length);
    var headers = headerRange.getValues()[0] || [];
    for (var i = 0; i < REPORT_HEADERS.length; i++) {
      if (headers[i] !== REPORT_HEADERS[i]) {
        headerRange.setValues([REPORT_HEADERS]);
        return;
      }
    }
  } catch (_) {
    // Report submission can still proceed if the header upgrade fails.
  }
}

function sanitizeField_(raw, maxLength) {
  var limit = maxLength || MAX_FIELD_LENGTH;
  return String(raw || '')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim()
    .substring(0, limit);
}

function sanitizeReportReason_(raw) {
  return sanitizeSheetCell_(sanitizeField_(raw, MAX_REPORT_REASON));
}

function sanitizeSheetCell_(raw) {
  var value = String(raw || '');
  return /^[=+\-@]/.test(value) ? "'" + value : value;
}

function generateUniqueAlias_(existingAliases) {
  for (var attempt = 0; attempt < 10; attempt++) {
    var alias = generateAlias_();
    if (!existingAliases[alias] && !isReserved_(alias)) return alias;
  }
  return null;
}

function generateAlias_() {
  var bytes = getRandomHex_(ALIAS_GEN_LENGTH * 2);
  var result = '';
  for (var i = 0; i < ALIAS_GEN_LENGTH; i++) {
    var index = parseInt(bytes.substr(i * 2, 2), 16) % ALIAS_CHARS.length;
    result += ALIAS_CHARS.charAt(index);
  }
  return result;
}

function getRandomHex_(length) {
  var hex = '';
  while (hex.length < length) {
    hex += Utilities.getUuid().replace(/-/g, '');
  }
  return hex.slice(0, length);
}

function checkActionRateLimit_(scope, identity) {
  var globalLimit = checkRateLimit_(scope + '_global', 'global', RATE_LIMIT_GLOBAL_MAX);
  if (!globalLimit.allowed) return globalLimit;
  return checkRateLimit_(scope, identity, RATE_LIMIT_MAX);
}

function checkPasswordAttemptRateLimit_(alias, identity) {
  var scope = 'password_' + sanitizeAlias_(alias);
  var globalLimit = checkRateLimit_(scope + '_global', 'global', PASSWORD_RATE_LIMIT_GLOBAL_MAX);
  if (!globalLimit.allowed) return globalLimit;
  return checkRateLimit_(scope, identity, PASSWORD_RATE_LIMIT_MAX);
}

function checkRateLimit_(scope, identity, maxRequests) {
  var cache = CacheService.getScriptCache();
  var key = 'rl_' + sanitizeField_(scope || 'default', 24) + '_' + sha256Hex_(identity || 'global').slice(0, 24);
  var raw = cache.get(key);
  var count = raw ? parseInt(raw, 10) : 0;
  var limit = maxRequests || RATE_LIMIT_MAX;

  if (count >= limit) {
    return { allowed: false, retryAfter: RATE_LIMIT_WINDOW };
  }

  cache.put(key, String(count + 1), RATE_LIMIT_WINDOW);
  return { allowed: true };
}

function getRequesterKey_(e) {
  var uid = sanitizeField_(getParam_(e, 'uid'), MAX_FIELD_LENGTH);
  if (uid) return 'uid:' + uid;

  var device = sanitizeField_(getParam_(e, 'device'), MAX_FIELD_LENGTH);
  var browser = sanitizeField_(getParam_(e, 'browser'), MAX_FIELD_LENGTH);
  var os = sanitizeField_(getParam_(e, 'os'), MAX_FIELD_LENGTH);
  var lang = sanitizeField_(getParam_(e, 'lang'), MAX_FIELD_LENGTH);
  var scr = sanitizeField_(getParam_(e, 'scr'), MAX_FIELD_LENGTH);

  return [device, browser, os, lang, scr].join('|') || 'global';
}

function isExpired_(expiry) {
  if (!expiry) return false;
  var expiryDate = new Date(expiry);
  return !isNaN(expiryDate.getTime()) && new Date() > expiryDate;
}

function createPasswordHash_(password) {
  var salt = Utilities.getUuid().replace(/-/g, '');
  return 'v1:' + salt + ':' + sha256Hex_(salt + ':' + password);
}

function verifyPassword_(password, storedHash) {
  var parts = String(storedHash || '').split(':');
  if (parts.length === 3 && parts[0] === 'v1') {
    return constantTimeEquals_(sha256Hex_(parts[1] + ':' + password), parts[2]);
  }
  return constantTimeEquals_(sha256Hex_(password), storedHash);
}

function constantTimeEquals_(left, right) {
  left = String(left || '');
  right = String(right || '');

  var maxLength = Math.max(left.length, right.length);
  var diff = left.length ^ right.length;
  for (var i = 0; i < maxLength; i++) {
    diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function sha256Hex_(value) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8);
  return raw.map(function (byte) {
    return ('0' + ((byte < 0 ? byte + 256 : byte)).toString(16)).slice(-2);
  }).join('');
}
