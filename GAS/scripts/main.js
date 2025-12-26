/**
 * @fileoverview Main entry point for the Scoring System GAS application - UI only
 * @module Main
 */

// Global constants
var GLOBAL_WORKBOOK_ID_KEY = 'GLOBAL_WORKBOOK_ID';
var DATABASE_FOLDER_KEY = 'DATABASE_FOLDER';

/**
 * Main initialization function for the scoring system
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  
  ui.createMenu('Scoring System')
    .addItem('Initialize System', 'initializeSystem')
    .addItem('Create New Project', 'showCreateProjectDialog')
    .addSeparator()
    .addItem('Settings', 'showSettings')
    .addItem('About', 'showAbout')
    .addToUi();
}

/**
 * Initialize the scoring system
 */
function initializeSystem() {
  try {
    // Check if already initialized
    var globalWorkbookId = PropertiesService.getScriptProperties().getProperty(GLOBAL_WORKBOOK_ID_KEY);
    if (globalWorkbookId) {
      SpreadsheetApp.getUi().alert('System is already initialized!');
      return;
    }
    
    // Get database folder
    var databaseFolder = PropertiesService.getScriptProperties().getProperty(DATABASE_FOLDER_KEY);
    if (!databaseFolder) {
      SpreadsheetApp.getUi().alert(
        'Please set DATABASE_FOLDER in script properties first.\n' +
        'Go to Project Settings > Script Properties'
      );
      return;
    }
    
    // Initialize system (will be implemented in database module)
    var result = initializeDatabase();
    
    if (result.success) {
      SpreadsheetApp.getUi().alert('System initialized successfully!');
    } else {
      SpreadsheetApp.getUi().alert('Initialization failed: ' + result.error);
    }
  } catch (error) {
    SpreadsheetApp.getUi().alert('Error: ' + error.toString());
  }
}

/**
 * Show create project dialog
 */
function showCreateProjectDialog() {
  var htmlOutput = HtmlService
    .createHtmlOutput('<p>Project creation dialog - To be implemented</p>')
    .setWidth(400)
    .setHeight(300);
  
  SpreadsheetApp.getUi()
    .showModalDialog(htmlOutput, 'Create New Project');
}

/**
 * Show settings dialog
 */
function showSettings() {
  var htmlOutput = HtmlService
    .createHtmlOutput('<p>System settings - To be implemented</p>')
    .setWidth(400)
    .setHeight(300);
  
  SpreadsheetApp.getUi()
    .showModalDialog(htmlOutput, 'Settings');
}

/**
 * Show about dialog
 */
function showAbout() {
  var htmlOutput = HtmlService
    .createHtmlOutput('<p>Scoring System v1.0</p>' +
                     '<p>A stage-based project management system</p>' +
                     '<p>Built with Google Apps Script</p>')
    .setWidth(300)
    .setHeight(150);
  
  SpreadsheetApp.getUi()
    .showModalDialog(htmlOutput, 'About Scoring System');
}

/**
 * Utility function to include HTML files
 * Used by HtmlService templates
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Get the web app URL for frontend
 */
function getWebAppUrl() {
  return ScriptApp.getService().getUrl();
}

/**
 * Get system configuration for frontend
 */
function getSystemConfig() {
  return {
    version: '1.0.0',
    appName: 'Scoring System',
    features: {
      darkMode: true,
      markdownSupport: true,
      multiLanguage: false
    }
  };
}