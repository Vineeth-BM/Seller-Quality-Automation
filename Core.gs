 /**
 * CoreModule.gs - Core functionality for Quality Issue Notification System
 * Contains configuration, utilities, and data access functions
 * @version 3.0
 * @lastModified 2025-04-15
 */

// Configuration constants - edit these as needed 
const CONFIG = {
  QUALITY_SHEET_NAME: 'Seller Quality',
  EMAIL_TEMPLATES: {
    FIRST_WARNING: 'email_first_warning',
    LAST_WARNING: 'email_last_warning',
    SUSPENSION: 'email_suspension'
  },
  EMAIL_SUBJECT: {
    FIRST_WARNING: '⚠️ 品質に関する重要なお知らせ - {sellerName} 様',
    LAST_WARNING: '⚠️ 最終警告: 品質問題の改善が必要です - {sellerName} 様',
    SUSPENSION: '⛔ アカウント一時停止通知: 継続的な品質問題 - {sellerName} 様'
  },
  HEADER_ROW_COUNT: 1,
  DEBUG_MODE: true, // Set to true to enable verbose logging
  // Email configuration
  EMAIL_SENDER_NAME: 'Back Market Quality Team',
  EMAIL_SENDER_ADDRESS: 'vineeth.guda@backmarket.com', // This will be used as the reply-to address
  // Tracking configuration
  TRACKING_SHEETS: {
    MAIN: 'Email Tracking',
    FIRST_WARNING: 'First Warning Log',
    LAST_WARNING: 'Last Warning Log',
    SUSPENSION: 'Suspension Log'
  },
  // Web app URL for tracking pixel
  WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbzj15xh8kAjWbpMWbbugzE3LVYGcaUOMBSTCQEvnXETlwBjYnyLMiEWrQ94rLiLHvCJMg/exec',
  // Default timezone for all date formatting
  DEFAULT_TIMEZONE: 'Asia/Tokyo'
};

// Column indices (0 based) - matching the SQL query results
const COLUMNS = {
  DATE_KPI: 0,
  TIME_PERIOD: 1,
  SELLER_ID: 2,
  SELLER_NAME: 3,
  SELLER_OWNER_NAME: 4,
  SELLER_TIERING: 5,
  TYPE_OF_ACTIVITY: 6,
  DEFECTIVE_RATE_30D: 7,
  NB_DEFECTIVE_30D: 8,
  CONSECUTIVE_DEFECTIVE_WEEKS: 9,
  DEFECTIVE_30D_LABEL: 10,
  DEFECTIVE_EMAIL_ACTION: 11,
  APPEARANCE_ISSUE_RATE_30D: 12,
  NB_APPEARANCE_ISSUE_30D: 13,
  CONSECUTIVE_APPEARANCE_WEEKS: 14,
  APPEARANCE_ISSUE_LABEL: 15,
  APPEARANCE_EMAIL_ACTION: 16,
  WEEK_NUMBER: 17,
  FINAL_EMAIL_ACTION: 18,
  EMAIL: 19
};

/**
 * Retrieves data from the specified sheet
 * @return {Array} 2D array of sheet data
 */
function getSheetData() {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    Logger.log(`Accessing spreadsheet: "${spreadsheet.getName()}"`);
    
    const sheet = spreadsheet.getSheetByName(CONFIG.QUALITY_SHEET_NAME);
    if (!sheet) {
      Logger.log(`Sheet "${CONFIG.QUALITY_SHEET_NAME}" not found!`);
      return null;
    }
    
    const data = sheet.getDataRange().getValues();
    Logger.log(`Retrieved ${data.length} rows from sheet "${CONFIG.QUALITY_SHEET_NAME}"`);
    
    return data;
  } catch (error) {
    Logger.log(`Error retrieving sheet data: ${error.message}`);
    return null;
  }
}

/**
 * Extracts and formats data from a single row
 * @param {Array} row Single row of data from the sheet
 * @return {Object} Formatted data object
 */
function extractRowData(row) {
  return {
    dateKPI: row[COLUMNS.DATE_KPI] || new Date(),
    timePeriod: row[COLUMNS.TIME_PERIOD] || '',
    sellerId: row[COLUMNS.SELLER_ID] || '',
    sellerName: row[COLUMNS.SELLER_NAME] || '',
    sellerOwnerName: row[COLUMNS.SELLER_OWNER_NAME] || '',
    sellerTiering: row[COLUMNS.SELLER_TIERING] || '',
    typeOfActivity: row[COLUMNS.TYPE_OF_ACTIVITY] || '',
    
    // Defective metrics
    defectiveRate: row[COLUMNS.DEFECTIVE_RATE_30D] || 0,
    nbDefective30d: row[COLUMNS.NB_DEFECTIVE_30D] || 0,
    consecutiveDefectiveWeeks: row[COLUMNS.CONSECUTIVE_DEFECTIVE_WEEKS] || 0,
    defectiveLabel: row[COLUMNS.DEFECTIVE_30D_LABEL] || '',
    defectiveEmailAction: row[COLUMNS.DEFECTIVE_EMAIL_ACTION] || 'No Action',
    
    // Appearance metrics
    appearanceRate: row[COLUMNS.APPEARANCE_ISSUE_RATE_30D] || 0,
    nbAppearanceIssue30d: row[COLUMNS.NB_APPEARANCE_ISSUE_30D] || 0,
    consecutiveAppearanceWeeks: row[COLUMNS.CONSECUTIVE_APPEARANCE_WEEKS] || 0,
    appearanceLabel: row[COLUMNS.APPEARANCE_ISSUE_LABEL] || '',
    appearanceEmailAction: row[COLUMNS.APPEARANCE_EMAIL_ACTION] || 'No Action',
    
    // Final data
    weekNumber: row[COLUMNS.WEEK_NUMBER] || '',
    finalEmailAction: row[COLUMNS.FINAL_EMAIL_ACTION] || 'No Action',
    sellerEmail: row[COLUMNS.EMAIL] || '',
    
    // Helper flags
    hasDefectiveIssue: Boolean(row[COLUMNS.DEFECTIVE_30D_LABEL]),
    hasAppearanceIssue: Boolean(row[COLUMNS.APPEARANCE_ISSUE_LABEL]),
    
    // Format rates for display
    defectiveRateFormatted: formatPercentage(row[COLUMNS.DEFECTIVE_RATE_30D]),
    appearanceRateFormatted: formatPercentage(row[COLUMNS.APPEARANCE_ISSUE_RATE_30D])
  };
}

/**
 * Format a decimal as a percentage
 * @param {number} value Value to format as percentage
 * @return {string} Formatted percentage
 */
function formatPercentage(value) {
  if (value === null || value === undefined) return '0%';
  return (value * 100).toFixed(2) + '%';
}

/**
 * Validates an email address format
 * @param {String} email The email address to validate
 * @return {Boolean} Whether the email is valid
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  
  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Helper function to format a date for display
 * @param {Date|string} date The date to format
 * @return {string} Formatted date string
 */
function formatDate(date) {
  if (!date) return '';
  try {
    const dateObj = new Date(date);
    return Utilities.formatDate(dateObj, CONFIG.DEFAULT_TIMEZONE, 'yyyy/MM/dd HH:mm:ss');
  } catch (e) {
    return String(date);
  }
}

/**
 * Ensures all tracking sheets exist with proper headers
 */
function ensureTrackingSheets() {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    
    // Check and create main tracking sheet
    if (!spreadsheet.getSheetByName(CONFIG.TRACKING_SHEETS.MAIN)) {
      const mainSheet = spreadsheet.insertSheet(CONFIG.TRACKING_SHEETS.MAIN);
      mainSheet.appendRow([
        'Tracking ID', 
        'Email Address', 
        'Seller ID', 
        'Email Type', 
        'Send Date/Time', 
        'Open Date/Time', 
        'Email Opened', 
        'View Count'
      ]);
      
      // Format headers
      mainSheet.getRange("A1:H1").setFontWeight("bold");
      mainSheet.setFrozenRows(1);
      
      // Set column widths for better readability
      mainSheet.setColumnWidth(1, 250);  // Tracking ID
      mainSheet.setColumnWidth(2, 200);  // Email
      mainSheet.setColumnWidth(3, 150);  // Seller ID
      mainSheet.setColumnWidth(4, 150);  // Email Type
      mainSheet.setColumnWidth(5, 180);  // Send Date/Time
      mainSheet.setColumnWidth(6, 180);  // Open Date/Time
      
      Logger.log(`Created main tracking sheet: ${CONFIG.TRACKING_SHEETS.MAIN}`);
    }
    
    // Check and create First Warning tracking sheet
    if (!spreadsheet.getSheetByName(CONFIG.TRACKING_SHEETS.FIRST_WARNING)) {
      const firstWarningSheet = spreadsheet.insertSheet(CONFIG.TRACKING_SHEETS.FIRST_WARNING);
      firstWarningSheet.appendRow([
        'Seller ID',
        'Seller Name',
        'Email Address',
        'Defective Rate',
        'Defective Status',
        'Appearance Rate',
        'Appearance Status',
        'Consecutive Defective Weeks',
        'Consecutive Appearance Weeks',
        'Send Date/Time',
        'Response Date/Time',
        'Response Received',
        'Resolution Status',
        'Notes'
      ]);
      
      // Format headers
      firstWarningSheet.getRange("A1:N1").setFontWeight("bold");
      firstWarningSheet.setFrozenRows(1);
      
      // Set column widths
      firstWarningSheet.setColumnWidth(2, 180);  // Seller Name
      firstWarningSheet.setColumnWidth(3, 200);  // Email
      firstWarningSheet.setColumnWidth(10, 180); // Send Date/Time
      firstWarningSheet.setColumnWidth(11, 180); // Response Date/Time
      firstWarningSheet.setColumnWidth(13, 150); // Resolution Status
      firstWarningSheet.setColumnWidth(14, 250); // Notes
      
      Logger.log(`Created tracking sheet: ${CONFIG.TRACKING_SHEETS.FIRST_WARNING}`);
    }
    
    // Check and create Last Warning tracking sheet
    if (!spreadsheet.getSheetByName(CONFIG.TRACKING_SHEETS.LAST_WARNING)) {
      const lastWarningSheet = spreadsheet.insertSheet(CONFIG.TRACKING_SHEETS.LAST_WARNING);
      lastWarningSheet.appendRow([
        'Seller ID',
        'Seller Name',
        'Email Address',
        'Defective Rate',
        'Defective Status',
        'Appearance Rate',
        'Appearance Status',
        'Consecutive Defective Weeks',
        'Consecutive Appearance Weeks',
        'Send Date/Time',
        'Response Date/Time',
        'Response Received',
        'Resolution Status',
        'Notes'
      ]);
      
      // Format headers
      lastWarningSheet.getRange("A1:N1").setFontWeight("bold");
      lastWarningSheet.setFrozenRows(1);
      
      // Set column widths (same as first warning sheet)
      lastWarningSheet.setColumnWidth(2, 180);  // Seller Name
      lastWarningSheet.setColumnWidth(3, 200);  // Email
      lastWarningSheet.setColumnWidth(10, 180); // Send Date/Time
      lastWarningSheet.setColumnWidth(11, 180); // Response Date/Time
      lastWarningSheet.setColumnWidth(13, 150); // Resolution Status
      lastWarningSheet.setColumnWidth(14, 250); // Notes
      
      Logger.log(`Created tracking sheet: ${CONFIG.TRACKING_SHEETS.LAST_WARNING}`);
    }
    
    // Check and create Suspension tracking sheet
    if (!spreadsheet.getSheetByName(CONFIG.TRACKING_SHEETS.SUSPENSION)) {
      const suspensionSheet = spreadsheet.insertSheet(CONFIG.TRACKING_SHEETS.SUSPENSION);
      suspensionSheet.appendRow([
        'Seller ID',
        'Seller Name',
        'Email Address',
        'Defective Rate',
        'Defective Status',
        'Appearance Rate',
        'Appearance Status',
        'Consecutive Defective Weeks',
        'Consecutive Appearance Weeks',
        'Send Date/Time',
        'Response Date/Time',
        'Response Received',
        'Resolution Status',
        'Notes'
      ]);
      
      // Format headers
      suspensionSheet.getRange("A1:N1").setFontWeight("bold");
      suspensionSheet.setFrozenRows(1);
      
      // Set column widths (same as other sheets)
      suspensionSheet.setColumnWidth(2, 180);  // Seller Name
      suspensionSheet.setColumnWidth(3, 200);  // Email
      suspensionSheet.setColumnWidth(10, 180); // Send Date/Time
      suspensionSheet.setColumnWidth(11, 180); // Response Date/Time
      suspensionSheet.setColumnWidth(13, 150); // Resolution Status
      suspensionSheet.setColumnWidth(14, 250); // Notes
      
      Logger.log(`Created tracking sheet: ${CONFIG.TRACKING_SHEETS.SUSPENSION}`);
    }
  } catch (error) {
    Logger.log(`Error ensuring tracking sheets: ${error.message}`);
  }
}

/**
 * Set up a weekly trigger to run every Monday
 */
function setWeeklySchedule() {
  try {
    // Delete any existing triggers
    const triggers = ScriptApp.getProjectTriggers();
    for (const trigger of triggers) {
      ScriptApp.deleteTrigger(trigger);
    }
    Logger.log(`Deleted ${triggers.length} existing triggers`);
    
    // Create a new trigger to run every Monday at 9:00 AM
    ScriptApp.newTrigger('main')
      .timeBased()
      .onWeekDay(ScriptApp.WeekDay.MONDAY)
      .atHour(9)
      .create();
    
    Logger.log('Weekly trigger created to run at 9:00 AM every Monday');
    
    // Check if we're running from UI
    try {
      const ui = SpreadsheetApp.getUi();
      ui.alert('Success', 'Weekly schedule set! The script will run automatically at 9:00 AM every Monday.', ui.ButtonSet.OK);
    } catch (e) {
      // Running from trigger, just log the message
      Logger.log('Not displaying UI alert: running from trigger');
    }
    
    return true;
  } catch (error) {
    Logger.log(`Error setting up trigger: ${error.message}`);
    
    // Check if we're running from UI
    try {
      const ui = SpreadsheetApp.getUi();
      ui.alert('Error', `Could not set up weekly schedule: ${error.message}`, ui.ButtonSet.OK);
    } catch (e) {
      // Running from trigger, just log the error
      Logger.log('Not displaying UI alert: running from trigger');
    }
    
    return false;
  }
}

/**
 * Test system function
 */
function testSystem() {
  try {
    let results = [];
    
    // Test spreadsheet access
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    results.push(`✓ Spreadsheet access OK: "${spreadsheet.getName()}"`);
    
    // Test quality sheet access
    const sheet = spreadsheet.getSheetByName(CONFIG.QUALITY_SHEET_NAME);
    if (sheet) {
      results.push(`✓ Quality sheet access OK: "${CONFIG.QUALITY_SHEET_NAME}"`);
      
      // Test data access
      const data = sheet.getDataRange().getValues();
      results.push(`✓ Data access OK: ${data.length} rows retrieved`);
      
      // Count rows with quality issues and valid emails
      if (data.length > CONFIG.HEADER_ROW_COUNT) {
        let totalIssueCount = 0;
        let emailCount = 0;
        let firstWarningCount = 0;
        let lastWarningCount = 0;
        let suspensionCount = 0;
        
        for (let i = CONFIG.HEADER_ROW_COUNT; i < data.length; i++) {
          if (data[i].length > COLUMNS.EMAIL) {
            // Check if there's a final email action
            if (data[i][COLUMNS.FINAL_EMAIL_ACTION] && data[i][COLUMNS.FINAL_EMAIL_ACTION] !== 'No Action') {
              totalIssueCount++;
              
              // Count by email action type
              if (data[i][COLUMNS.FINAL_EMAIL_ACTION] === 'Send First Warning') {
                firstWarningCount++;
              } else if (data[i][COLUMNS.FINAL_EMAIL_ACTION] === 'Send Last Warning') {
                lastWarningCount++;
              } else if (data[i][COLUMNS.FINAL_EMAIL_ACTION] === 'Send Suspension Notice') {
                suspensionCount++;
              }
              
              // Check if there's a valid email
              if (data[i][COLUMNS.EMAIL]) {
                emailCount++;
              }
            }
          }
        }
        
        results.push(`${totalIssueCount} rows requiring email actions found:`);
        results.push(`  - ${firstWarningCount} first warnings`);
        results.push(`  - ${lastWarningCount} last warnings`);
        results.push(`  - ${suspensionCount} suspension notices`);
        results.push(`  - ${emailCount} with valid emails (${totalIssueCount - emailCount} missing emails)`);
      }
    } else {
      results.push(`✗ Quality sheet not found: "${CONFIG.QUALITY_SHEET_NAME}"`);
    }
    
    // Test email template access
    for (const templateType in CONFIG.EMAIL_TEMPLATES) {
      const templateName = CONFIG.EMAIL_TEMPLATES[templateType];
      try {
        const template = HtmlService.createTemplateFromFile(templateName);
        results.push(`✓ Email template access OK: "${templateName}"`);
      } catch (e) {
        results.push(`✗ Email template access failed: "${templateName}"`);
      }
    }
    
    // Check timezone setting
    results.push(`✓ Using timezone: "${CONFIG.DEFAULT_TIMEZONE}" (Tokyo/Japan)`);
    
    // Check Gmail access
    try {
      // Just checking if we can access Gmail without actually sending
      const quota = MailApp.getRemainingDailyQuota();
      results.push(`✓ Email sending available (${quota} emails remaining in daily quota)`);
    } catch (e) {
      results.push(`✗ Email sending access failed: ${e.message}`);
    }
    
    // Log results
    const resultsText = results.join('\n');
    Logger.log('Test completed:\n' + resultsText);
    
    // Check if we're running from UI
    try {
      const ui = SpreadsheetApp.getUi();
      ui.alert('System Test Results', resultsText, ui.ButtonSet.OK);
    } catch (e) {
      // Running from trigger, just log the message
      Logger.log('Not displaying UI alert: running from trigger');
    }
    
    return true;
  } catch (error) {
    Logger.log(`Test failed: ${error.message}`);
    
    // Check if we're running from UI
    try {
      const ui = SpreadsheetApp.getUi();
      ui.alert('Test Failed', `Error: ${error.message}`, ui.ButtonSet.OK);
    } catch (e) {
      // Running from trigger, just log the error
      Logger.log('Not displaying UI alert: running from trigger');
    }
    
    return false;
  }
}
