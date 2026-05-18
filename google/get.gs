/**
 * Legacy split READ script.
 *
 * This project now deploys google/combined.gs as the only Google Apps Script
 * web-app entry point. Keep this file free of global doGet/doPost functions so
 * it cannot override the combined handler when files are copied into Apps Script.
 */
var LEGACY_READ_SCRIPT_NOTICE = 'Deploy google/combined.gs instead.';
