/**
 * Quality Issue Notification System
 * This script sends email notifications to sellers who have quality issues.
 * It reads data from a Google Sheet and uses an HTML template for the email content.
 * @Author 
 * @version 1.0
 * @lastModified 2025-03-27
 */

// Configuration constants - edit these as needed
const CONFIG = {
  QUALITY_SHEET_NAME: 'Seller Quality',
  EMAIL_TEMPLATE: 'email',
  EMAIL_SUBJECT: '⚠️ 品質問題アラート: {sellerName}',  // Using warning triangle emoji
  HEADER_ROW_COUNT: 1,
  DEBUG_MODE: true, // Set to true to enable verbose logging
  // Email configuration
  EMAIL_SENDER_NAME: 'Back Market Quality Team',
  EMAIL_SENDER_ADDRESS: 'quality@backmarket.com', // This will be used as the reply-to address
  // Tracking configuration
  TRACKING_SHEET_NAME: 'Email Tracking',
  // Web app URL for tracking pixel
  WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbweTiy5O4z3nhslHADVRH3ed_uxU_pnPxVARGX1eEDJprG54uaRXva2YI337l-9PWCfqA/exec',
  // Default timezone for all date formatting
  DEFAULT_TIMEZONE: 'Asia/Tokyo'
};

// Column indices (0 based) - matching the SQL query results
const COLUMNS = {
  DATE_KPI: 0,
  TIME_PERIOD: 1,
  SELLER_ID: 2,
  SELLER_NAME: 3,
  DEFECTIVE_RATE_30D: 4,
  DEFECTIVE_30D_LABEL: 5,
  APPEARANCE_ISSUE_30D: 6,
  APPEARANCE_ISSUE_LABEL: 7,
  EMAIL: 8
};

/**
 * Main function to send quality issue notifications
 * Can be triggered manually or via time-based trigger
 */
function main() {
  try {
    // Start logging
    Logger.log('Starting quality issue notification process');
    
    // Access the sheet and get data
    const data = getSheetData();
    if (!data || data.length <= CONFIG.HEADER_ROW_COUNT) {
      Logger.log('No data found or only header row exists');
      
      // Check if we're running from UI
      try {
        const ui = SpreadsheetApp.getUi();
        ui.alert('Warning', 'No data found or only header row exists.', ui.ButtonSet.OK);
      } catch (e) {
        // Running from trigger, just log the error
        Logger.log('Not displaying UI alert: running from trigger');
      }
      
      return;
    }
    
    // Process the data and send emails
    const stats = processData(data);
    
    // Log summary statistics
    Logger.log(`Process completed. Results: ${stats.processed} rows processed, ${stats.emailsSent} emails sent, ${stats.errors} errors, ${stats.skippedNoEmail} skipped due to missing email`);
    
    // Check if we're running from UI
    try {
      const ui = SpreadsheetApp.getUi();
      ui.alert('Success', 
              `Process completed:\n${stats.processed} rows processed\n${stats.emailsSent} emails sent\n${stats.errors} errors\n${stats.skippedNoEmail} skipped (no email)`, 
              ui.ButtonSet.OK);
    } catch (e) {
      // Running from trigger, just log the message
      Logger.log('Not displaying UI alert: running from trigger');
    }
    
    return stats;
    
  } catch (error) {
    Logger.log(`Critical error in main function: ${error.message}`);
    Logger.log(`Stack trace: ${error.stack}`);
    
    // Check if we're running from UI before showing alert
    try {
      const ui = SpreadsheetApp.getUi();
      ui.alert('Error', `An error occurred: ${error.message}`, ui.ButtonSet.OK);
    } catch (e) {
      // Running from trigger, just log the error
      Logger.log('Not displaying UI alert: running from trigger');
    }
    
    throw error; // Rethrow to see in Apps Script logs
  }
}

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
 * Processes data rows and sends emails for quality issues
 * @param {Array} data 2D array of sheet data
 * @return {Object} Statistics about the process
 */
function processData(data) {
  // Statistics tracking
  const stats = {
    processed: 0,
    emailsSent: 0,
    errors: 0,
    skippedNoEmail: 0
  };
  
  // Create template object for dynamically constructing HTML
  let htmlTemplate;
  try {
    htmlTemplate = HtmlService.createTemplateFromFile(CONFIG.EMAIL_TEMPLATE);
    Logger.log('Email template loaded successfully');
  } catch (error) {
    Logger.log(`Error loading email template: ${error.message}`);
    stats.errors++;
    return stats;
  }
  
  // Iterate over each row of data (skip the header row)
  for (let i = CONFIG.HEADER_ROW_COUNT; i < data.length; i++) {
    try {
      stats.processed++;
      
      // Skip rows that don't have enough columns
      if (data[i].length <= COLUMNS.EMAIL) {
        Logger.log(`Row ${i+1}: Not enough columns (${data[i].length} found)`);
        continue;
      }
      
      // Extract row data
      const rowData = extractRowData(data[i]);
      
      // Skip if no email is available
      if (!rowData.sellerEmail) {
        Logger.log(`Row ${i+1}: No email found for seller ${rowData.sellerName} (ID: ${rowData.sellerId})`);
        stats.skippedNoEmail++;
        continue;
      }
      
      // Send the email
      const emailSent = sendNotificationEmail(htmlTemplate, rowData);
      if (emailSent) {
        stats.emailsSent++;
      } else {
        stats.errors++;
      }
      
    } catch (error) {
      Logger.log(`Error processing row ${i+1}: ${error.message}`);
      stats.errors++;
      continue; // Continue with the next row
    }
  }
  
  return stats;
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
    sellerEmail: row[COLUMNS.EMAIL] || '',
    defectiveRate: row[COLUMNS.DEFECTIVE_RATE_30D] || 0,
    defectiveLabel: row[COLUMNS.DEFECTIVE_30D_LABEL] || '',
    appearanceRate: row[COLUMNS.APPEARANCE_ISSUE_30D] || 0,
    appearanceLabel: row[COLUMNS.APPEARANCE_ISSUE_LABEL] || '',
    
    // Helper flags
    hasDefectiveIssue: Boolean(row[COLUMNS.DEFECTIVE_30D_LABEL]),
    hasAppearanceIssue: Boolean(row[COLUMNS.APPEARANCE_ISSUE_LABEL]),
    
    // Format rates for display
    defectiveRateFormatted: formatPercentage(row[COLUMNS.DEFECTIVE_RATE_30D]),
    appearanceRateFormatted: formatPercentage(row[COLUMNS.APPEARANCE_ISSUE_30D])
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
 * Sends a notification email using the provided template and data
 * @param {Object} htmlTemplate The HTML template to use
 * @param {Object} data Data to populate the template
 * @return {Boolean} Whether the email was sent successfully
 */
function sendNotificationEmail(htmlTemplate, data) {
  try {
    // Populate the template
    for (const key in data) {
      htmlTemplate[key] = data[key];
    }
    
    // Add additional template helpers
    htmlTemplate.formatDate = function(dateStr) {
      if (!dateStr) return '';
      try {
        const date = new Date(dateStr);
        return Utilities.formatDate(date, CONFIG.DEFAULT_TIMEZONE, 'yyyy年MM月dd日'); // Japanese date format
      } catch (e) {
        return dateStr;
      }
    };
    
    // Add helper for thresholds so they can be displayed in the email
    htmlTemplate.thresholds = {
      defectiveCritical: '4%',
      defectiveAlerting: '3%',
      appearanceCritical: '1%',
      appearanceAlerting: '0.75%'
    };
    
    // Evaluate the template and get the HTML content
    let htmlForEmail = htmlTemplate.evaluate().getContent();
    
    // Add tracking pixel to the HTML content
    const trackingPixel = generateTrackingPixel(data.sellerEmail, data.sellerId);
    htmlForEmail += trackingPixel;
    
    // Create email subject with seller name
    const emailSubject = CONFIG.EMAIL_SUBJECT.replace('{sellerName}', data.sellerName);
    
    // Handle multiple email addresses
    const emailAddresses = data.sellerEmail.split(',').map(email => email.trim());
    let successCount = 0;
    
    // Send email to each recipient
    for (const email of emailAddresses) {
      if (isValidEmail(email)) {
        GmailApp.sendEmail(
          email,
          emailSubject,
          `⚠️ 品質問題アラート: ${data.sellerName}様のアカウントには品質の問題があり、すぐに対処する必要があります。HTMLメールをご確認ください。`, // Japanese fallback text with warning emoji
          {
            htmlBody: htmlForEmail,
            name: CONFIG.EMAIL_SENDER_NAME,     // The name displayed as the sender
            replyTo: CONFIG.EMAIL_SENDER_ADDRESS // The reply-to address
          }
        );
        Logger.log(`Email sent successfully to ${email} (${data.sellerName})`);
        successCount++;
      } else {
        Logger.log(`Invalid email address skipped: ${email}`);
      }
    }
    
    return successCount > 0; // Return true if at least one email was sent successfully
    
  } catch (error) {
    Logger.log(`Error sending email for ${data.sellerName}: ${error.message}`);
    return false;
  }
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
 * Generate a tracking pixel for email open tracking
 * @param {string} sellerEmail The email address of the recipient
 * @param {string} sellerId The ID of the seller
 * @return {string} HTML for a tracking pixel
 */
function generateTrackingPixel(sellerEmail, sellerId) {
  // Create a unique tracking ID
  const trackingId = Utilities.getUuid();
  
  // Store this tracking ID in a separate sheet for later reference
  recordTrackingId(trackingId, sellerEmail, sellerId);
  
  // Build the tracking URL
  const trackingUrl = `${CONFIG.WEB_APP_URL}?id=${trackingId}&action=open`;
  
  // Return HTML for a 1x1 transparent pixel with the tracking URL
  return `<img src="${trackingUrl}" width="1" height="1" alt="" style="display:none">`;
}

/**
 * Record the tracking ID and email details in a separate sheet
 * @param {string} trackingId The unique tracking ID
 * @param {string} email The recipient email
 * @param {string} sellerId The seller ID
 */
function recordTrackingId(trackingId, email, sellerId) {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    
    // Try to get the tracking sheet, or create it if it doesn't exist
    let trackingSheet = spreadsheet.getSheetByName(CONFIG.TRACKING_SHEET_NAME);
    if (!trackingSheet) {
      trackingSheet = spreadsheet.insertSheet(CONFIG.TRACKING_SHEET_NAME);
      // Add headers
      trackingSheet.appendRow(['Tracking ID', 'Email', 'Seller ID', 'Send Date', 'Open Date', 'Opened', 'Views']);
    }
    
    // Add the new tracking record
    trackingSheet.appendRow([
      trackingId,
      email,
      sellerId,
      new Date(),
      '',
      'No',
      0 // Initialize Views count to 0
    ]);
    
    Logger.log(`Tracking ID ${trackingId} recorded for ${email}`);
  } catch (error) {
    Logger.log(`Error recording tracking ID: ${error.message}`);
  }
}

/**
 * Web app doGet function that handles tracking pixel requests
 * This function will be called when the tracking pixel is loaded
 */
function doGet(e) {
  try {
    // Get the tracking ID from the request
    const trackingId = e.parameter.id;
    const action = e.parameter.action;
    
    if (action === 'open' && trackingId) {
      // Record that the email was opened
      recordEmailOpen(trackingId);
    }
    
    // Return a 1x1 transparent GIF
    return ContentService.createTextOutput('GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;')
      .setMimeType(ContentService.MimeType.IMAGE);
  } catch (error) {
    Logger.log(`Error processing tracking request: ${error.message}`);
    return ContentService.createTextOutput('Error').setMimeType(ContentService.MimeType.TEXT);
  }
}

/**
 * Record that an email was opened
 * @param {string} trackingId The tracking ID from the pixel request
 */
function recordEmailOpen(trackingId) {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const trackingSheet = spreadsheet.getSheetByName(CONFIG.TRACKING_SHEET_NAME);
    
    if (!trackingSheet) {
      Logger.log('Tracking sheet not found');
      return;
    }
    
    // Get all tracking data
    const data = trackingSheet.getDataRange().getValues();
    
    // Skip the header row and find the tracking ID
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === trackingId) {
        // Only update if this is the first time the email was opened
        if (data[i][5] === 'No') {
          // Format date with time in Tokyo timezone
          const now = new Date();
          const formattedDate = Utilities.formatDate(now, 
                                                    CONFIG.DEFAULT_TIMEZONE, 
                                                    "yyyy/MM/dd HH:mm:ss");
          
          // Update the row to indicate the email was opened
          trackingSheet.getRange(i + 1, 5).setValue(formattedDate); // Open Date with time
          trackingSheet.getRange(i + 1, 6).setValue('Yes');         // Opened
        } else {
          // Increment the views counter
          let currentViews = data[i][6] || 0;
          trackingSheet.getRange(i + 1, 7).setValue(currentViews + 1);
        }
        break;
      }
    }
  } catch (error) {
    Logger.log(`Error recording email open: ${error.message}`);
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
 * Get email statistics from the tracking sheet
 * @return {Object} Statistics about email opens and engagement
 */
function getEmailStats() {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const trackingSheet = spreadsheet.getSheetByName(CONFIG.TRACKING_SHEET_NAME);
    
    if (!trackingSheet) {
      return { error: 'Tracking sheet not found. It will be created automatically after sending emails.' };
    }
    
    const data = trackingSheet.getDataRange().getValues();
    
    // Skip header row
    if (data.length <= 1) {
      return { error: 'No tracking data available. Statistics will appear after emails are sent.' };
    }
    
    let totalEmails = data.length - 1;
    let openedEmails = 0;
    let totalViews = 0;
    let sellersWithCritical = 0;
    let sellersWithAlerting = 0;
    let sellerResponseCount = 0; // This would need additional data collection
    
    // Track date statistics
    const today = new Date();
    let lastWeekEmails = 0;
    let lastWeekOpened = 0;
    const oneWeekAgo = new Date(today);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    for (let i = 1; i < data.length; i++) {
      const sendDate = new Date(data[i][3]);
      
      // Check if email was opened
      if (data[i][5] === 'Yes') {
        openedEmails++;
        totalViews += Number(data[i][6] || 1);
      }
      
      // Count emails from last week
      if (sendDate > oneWeekAgo) {
        lastWeekEmails++;
        if (data[i][5] === 'Yes') {
          lastWeekOpened++;
        }
      }
    }
    
    const openRate = totalEmails > 0 ? (openedEmails / totalEmails * 100).toFixed(2) : 0;
    const lastWeekOpenRate = lastWeekEmails > 0 ? (lastWeekOpened / lastWeekEmails * 100).toFixed(2) : 0;
    const avgViews = openedEmails > 0 ? (totalViews / openedEmails).toFixed(2) : 0;
    
    return {
      totalEmails: totalEmails,
      openedEmails: openedEmails,
      openRate: `${openRate}%`,
      totalViews: totalViews,
      averageViews: avgViews,
      lastWeekEmails: lastWeekEmails,
      lastWeekOpened: lastWeekOpened,
      lastWeekOpenRate: `${lastWeekOpenRate}%`
    };
  } catch (error) {
    Logger.log(`Error getting email stats: ${error.message}`);
    return { error: error.message };
  }
}

/**
 * Show email statistics to the user
 */
function showEmailStats() {
  try {
    const stats = getEmailStats();
    
    let message;
    if (stats.error) {
      message = `Error: ${stats.error}`;
    } else {
      message = `Email Statistics:\n\n` +
                `Total emails sent: ${stats.totalEmails}\n` +
                `Emails opened: ${stats.openedEmails}\n` +
                `Open rate: ${stats.openRate}\n` +
                `Total views: ${stats.totalViews}\n` +
                `Average views per opened email: ${stats.averageViews}\n\n` +
                `Last 7 days emails: ${stats.lastWeekEmails}\n` +
                `Last 7 days opened: ${stats.lastWeekOpened}\n` +
                `Last 7 days open rate: ${stats.lastWeekOpenRate}`;
    }
    
    Logger.log('Email statistics:\n' + message);
    
    // Check if we're running from UI
    try {
      const ui = SpreadsheetApp.getUi();
      ui.alert('Email Statistics', message, ui.ButtonSet.OK);
    } catch (e) {
      // Running from trigger, just log the message
      Logger.log('Not displaying UI alert: running from trigger');
    }
  } catch (error) {
    Logger.log(`Error showing email stats: ${error.message}`);
    
    // Check if we're running from UI
    try {
      const ui = SpreadsheetApp.getUi();
      ui.alert('Error', `Could not retrieve email statistics: ${error.message}`, ui.ButtonSet.OK);
    } catch (e) {
      // Running from trigger, just log the error
      Logger.log('Not displaying UI alert: running from trigger');
    }
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
        let issueCount = 0;
        let emailCount = 0;
        
        for (let i = CONFIG.HEADER_ROW_COUNT; i < data.length; i++) {
          if (data[i].length > COLUMNS.EMAIL) {
            const hasDefectiveIssue = Boolean(data[i][COLUMNS.DEFECTIVE_30D_LABEL]);
            const hasAppearanceIssue = Boolean(data[i][COLUMNS.APPEARANCE_ISSUE_LABEL]);
            const hasEmail = Boolean(data[i][COLUMNS.EMAIL]);
            
            if (hasDefectiveIssue || hasAppearanceIssue) {
              issueCount++;
              if (hasEmail) {
                emailCount++;
              }
            }
          }
        }
        results.push(`${issueCount} rows with quality issues found (${emailCount} with valid emails)`);
      }
    } else {
      results.push(`✗ Quality sheet not found: "${CONFIG.QUALITY_SHEET_NAME}"`);
    }
    
    // Test email template access
    try {
      const template = HtmlService.createTemplateFromFile(CONFIG.EMAIL_TEMPLATE);
      results.push(`✓ Email template access OK: "${CONFIG.EMAIL_TEMPLATE}"`);
    } catch (e) {
      results.push(`✗ Email template access failed: "${CONFIG.EMAIL_TEMPLATE}"`);
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

/**
 * Creates a custom menu in the Google Sheets UI when the spreadsheet is opened
 */
function onOpen() {
  try {
    const ui = SpreadsheetApp.getUi();

     // Create a menu
    ui.createMenu('Quality Notification')
      .addItem('Send Notifications Now', 'main')
      .addSeparator()
      .addItem('Test System', 'testSystem')
      .addItem('Set Weekly Schedule', 'setWeeklySchedule')
      .addSeparator()
      .addItem('Show Email Statistics', 'showEmailStats')
      .addToUi();
    
    Logger.log('Custom menu created successfully');
  } catch (error) {
    Logger.log(`Error creating custom menu: ${error.message}`);
  }
}