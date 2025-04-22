/**
 * EmailModule.gs - Email handling for Quality Issue Notification System
 * Handles email template loading, sending, and tracking
 * @version 3.1
 * @lastModified 2025-04-18
 */

/**
 * Sends a notification email based on the email action type
 * @param {Object} data Seller data with quality metrics
 * @return {Boolean} Whether the email was sent successfully
 */
function sendQualityNotification(data) {
  try {
    // Determine the template to use based on the final email action
    let templateName;
    let subjectTemplate;
    let trackingSheetName;
    
    switch (data.finalEmailAction) {
      case 'Send First Warning':
        templateName = CONFIG.EMAIL_TEMPLATES.FIRST_WARNING;
        subjectTemplate = CONFIG.EMAIL_SUBJECT.FIRST_WARNING;
        trackingSheetName = CONFIG.TRACKING_SHEETS.FIRST_WARNING;
        break;
      case 'Send Last Warning':
        templateName = CONFIG.EMAIL_TEMPLATES.LAST_WARNING;
        subjectTemplate = CONFIG.EMAIL_SUBJECT.LAST_WARNING;
        trackingSheetName = CONFIG.TRACKING_SHEETS.LAST_WARNING;
        break;
      case 'Send Suspension Notice':
        templateName = CONFIG.EMAIL_TEMPLATES.SUSPENSION;
        subjectTemplate = CONFIG.EMAIL_SUBJECT.SUSPENSION;
        trackingSheetName = CONFIG.TRACKING_SHEETS.SUSPENSION;
        break;
      default:
        Logger.log(`Unknown email action: ${data.finalEmailAction}`);
        return false;
    }
    
    // Load the template
    let htmlTemplate;
    try {
      htmlTemplate = HtmlService.createTemplateFromFile(templateName);
      Logger.log(`Email template loaded successfully: ${templateName}`);
    } catch (error) {
      Logger.log(`Error loading email template ${templateName}: ${error.message}`);
      // Fallback to the first warning template if the specific one is not found
      try {
        htmlTemplate = HtmlService.createTemplateFromFile(CONFIG.EMAIL_TEMPLATES.FIRST_WARNING);
        Logger.log(`Fallback to first warning template`);
      } catch (fallbackError) {
        Logger.log(`Error loading fallback template: ${fallbackError.message}`);
        return false;
      }
    }
    
    // Populate the template with data
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
    const trackingPixel = generateTrackingPixel(data.sellerEmail, data.sellerId, data.finalEmailAction);
    htmlForEmail += trackingPixel;
    
    // Create email subject with seller name
    const emailSubject = subjectTemplate.replace('{sellerName}', data.sellerName);
    
    // Handle multiple email addresses
    const emailAddresses = data.sellerEmail.split(',').map(email => email.trim());
    let successCount = 0;
    
    // Send email to each recipient
    for (const email of emailAddresses) {
      if (isValidEmail(email)) {
        GmailApp.sendEmail(
          email,
          emailSubject,
          generateFallbackText(data), // Plain text fallback
          {
            htmlBody: htmlForEmail,
            name: CONFIG.EMAIL_SENDER_NAME,     // The name displayed as the sender
            replyTo: CONFIG.EMAIL_SENDER_ADDRESS // The reply-to address
          }
        );
        Logger.log(`Email sent successfully to ${email} (${data.sellerName}) - ${data.finalEmailAction}`);
        successCount++;
        
        // Record this email in the specific tracking sheet
        recordEmailInTrackingSheet(trackingSheetName, {
          sellerId: data.sellerId,
          sellerName: data.sellerName,
          email: email,
          emailType: data.finalEmailAction,
          defectiveRate: data.defectiveRate,
          defectiveLabel: data.defectiveLabel,
          appearanceRate: data.appearanceRate,
          appearanceLabel: data.appearanceLabel,
          consecutiveDefectiveWeeks: data.consecutiveDefectiveWeeks,
          consecutiveAppearanceWeeks: data.consecutiveAppearanceWeeks,
          sendDate: new Date()
        });
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
 * Generate a plain text fallback for email clients that don't support HTML
 * @param {Object} data Seller data
 * @return {String} Plain text fallback
 */
function generateFallbackText(data) {
  let fallbackText = `⚠️ 品質問題アラート: ${data.sellerName}様`;
  
  switch (data.finalEmailAction) {
    case 'Send First Warning':
      fallbackText += `\n\n${data.sellerName}様のアカウントには品質の問題があり、対処が必要です。`;
      break;
    case 'Send Last Warning':
      fallbackText += `\n\n${data.sellerName}様のアカウントには継続的な品質の問題があり、至急対処が必要です。これは最終警告です。`;
      break;
    case 'Send Suspension Notice':
      fallbackText += `\n\n${data.sellerName}様のアカウントには重大な品質の問題があり、アカウントは一時停止される予定です。`;
      break;
  }
  
  fallbackText += `\n\nHTMLメールをご確認ください。このプレーンテキストメッセージはフォールバックです。`;
  return fallbackText;
}

/**
 * Generate a tracking pixel for email open tracking
 * @param {string} sellerEmail The email address of the recipient
 * @param {string} sellerId The ID of the seller
 * @param {string} emailAction The type of email sent
 * @return {string} HTML for a tracking pixel
 */
function generateTrackingPixel(sellerEmail, sellerId, emailAction) {
  try {
    // Create a unique tracking ID
    const trackingId = Utilities.getUuid();
    
    // Store this tracking ID in the main tracking sheet
    recordTrackingId(trackingId, sellerEmail, sellerId, emailAction);
    
    // Build the tracking URL
    const trackingUrl = `${CONFIG.WEB_APP_URL}?id=${encodeURIComponent(trackingId)}&action=open`;
    
    // Return HTML for a 1x1 transparent pixel with the tracking URL
    return `<img src="${trackingUrl}" width="1" height="1" alt="" style="display:none">`;
  } catch (error) {
    Logger.log(`Error generating tracking pixel: ${error.message}`);
    // Return empty string to avoid breaking email if tracking fails
    return '';
  }
}

/**
 * Record the tracking ID and email details in the main tracking sheet
 * @param {string} trackingId The unique tracking ID
 * @param {string} email The recipient email
 * @param {string} sellerId The seller ID
 * @param {string} emailAction The type of email sent
 */
function recordTrackingId(trackingId, email, sellerId, emailAction) {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    
    // Try to get the tracking sheet, or create it if it doesn't exist
    let trackingSheet = spreadsheet.getSheetByName(CONFIG.TRACKING_SHEETS.MAIN);
    if (!trackingSheet) {
      trackingSheet = spreadsheet.insertSheet(CONFIG.TRACKING_SHEETS.MAIN);
      // Add headers with proper formatting
      trackingSheet.appendRow([
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
      trackingSheet.getRange("A1:H1").setFontWeight("bold");
      trackingSheet.setFrozenRows(1);
    }
    
    // Format current date with time in Tokyo timezone
    const now = new Date();
    const formattedDate = Utilities.formatDate(now, CONFIG.DEFAULT_TIMEZONE, "yyyy/MM/dd HH:mm:ss");
    
    // Add the new tracking record
    trackingSheet.appendRow([
      trackingId,          // Tracking ID
      email,               // Email Address
      sellerId,            // Seller ID
      emailAction,         // Email Type
      formattedDate,       // Send Date/Time - formatted with time
      '',                  // Open Date/Time - initially empty
      'No',                // Email Opened - initially No
      0                    // View Count - initially 0
    ]);
    
    // Format the date cells
    const lastRow = trackingSheet.getLastRow();
    const sendDateCell = trackingSheet.getRange(lastRow, 5);
    
    // Apply formatting to make dates more readable
    sendDateCell.setNumberFormat('yyyy/MM/dd HH:mm:ss');
    
    Logger.log(`Tracking ID ${trackingId} recorded for ${email} (${emailAction})`);
  } catch (error) {
    Logger.log(`Error recording tracking ID: ${error.message}`);
  }
}

/**
 * Records email details in specialized tracking sheets
 * @param {string} sheetName The name of the specific tracking sheet
 * @param {object} data Email and seller data
 */
function recordEmailInTrackingSheet(sheetName, data) {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    
    // Try to get the tracking sheet, or create it if it doesn't exist
    let sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(sheetName);
      // Add headers specific to this tracking sheet with clear naming
      sheet.appendRow([
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
      sheet.getRange("A1:N1").setFontWeight("bold");
      sheet.setFrozenRows(1);
    }
    
    // Format current date with time in Tokyo timezone
    const formattedDate = Utilities.formatDate(data.sendDate, CONFIG.DEFAULT_TIMEZONE, "yyyy/MM/dd HH:mm:ss");
    
    // Add the new record
    sheet.appendRow([
      data.sellerId,
      data.sellerName,
      data.email,
      data.defectiveRate,
      data.defectiveLabel,
      data.appearanceRate,
      data.appearanceLabel,
      data.consecutiveDefectiveWeeks,
      data.consecutiveAppearanceWeeks,
      formattedDate,              // Send Date/Time - formatted with time
      '',                         // Response Date/Time - initially empty
      'No',                       // Response Received - initially No
      'Pending',                  // Resolution Status - initially Pending
      ''                          // Notes - initially empty
    ]);
    
    // Format the date cells in the last row
    const lastRow = sheet.getLastRow();
    const sendDateCell = sheet.getRange(lastRow, 10);
    
    // Apply formatting to make dates more readable
    sendDateCell.setNumberFormat('yyyy/MM/dd HH:mm:ss');
    
    Logger.log(`Record added to ${sheetName} for seller ${data.sellerName}`);
  } catch (error) {
    Logger.log(`Error recording in tracking sheet ${sheetName}: ${error.message}`);
  }
}

/**
 * Record that an email was opened
 * @param {string} trackingId The tracking ID from the pixel request
 */
function recordEmailOpen(trackingId) {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const trackingSheet = spreadsheet.getSheetByName(CONFIG.TRACKING_SHEETS.MAIN);
    
    if (!trackingSheet) {
      Logger.log('Tracking sheet not found');
      return;
    }
    
    // Get all tracking data
    const data = trackingSheet.getDataRange().getValues();
    
    // Skip the header row and find the tracking ID
    let foundRow = false;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === trackingId) {
        foundRow = true;
        // Only update if this is the first time the email was opened
        if (data[i][6] === 'No') {
          // Format date with time in Tokyo timezone
          const now = new Date();
          const formattedDate = Utilities.formatDate(now, 
                                                    CONFIG.DEFAULT_TIMEZONE, 
                                                    "yyyy/MM/dd HH:mm:ss");
          
          // Update the row to indicate the email was opened
          trackingSheet.getRange(i + 1, 6).setValue(formattedDate); // Open Date with time
          trackingSheet.getRange(i + 1, 7).setValue('Yes');         // Opened
          trackingSheet.getRange(i + 1, 8).setValue(1);             // Set Views to 1
          
          Logger.log(`Email open recorded for tracking ID: ${trackingId}`);
        } else {
          // Increment the views counter
          let currentViews = Number(data[i][7] || 0);
          trackingSheet.getRange(i + 1, 8).setValue(currentViews + 1);
          Logger.log(`Email view count incremented for tracking ID: ${trackingId}`);
        }
        break;
      }
    }
    
    if (!foundRow) {
      Logger.log(`Tracking ID not found: ${trackingId}`);
    }
  } catch (error) {
    Logger.log(`Error recording email open: ${error.message}`);
  }
}

/**
 * Get email statistics from the tracking sheets
 * @return {Object} Statistics about email opens and engagement
 */
function getEmailStats() {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const trackingSheet = spreadsheet.getSheetByName(CONFIG.TRACKING_SHEETS.MAIN);
    
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
    
    // Count by email type
    let firstWarnings = 0;
    let firstWarningsOpened = 0;
    let lastWarnings = 0;
    let lastWarningsOpened = 0;
    let suspensions = 0;
    let suspensionsOpened = 0;
    
    // Track date statistics
    const today = new Date();
    let lastWeekEmails = 0;
    let lastWeekOpened = 0;
    const oneWeekAgo = new Date(today);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    for (let i = 1; i < data.length; i++) {
      const sendDate = new Date(data[i][4]); // Send Date column
      const emailType = data[i][3]; // Email Type column
      const isOpened = data[i][6] === 'Yes'; // Opened column
      const views = Number(data[i][7] || 0); // Views column
      
      // Check if email was opened
      if (isOpened) {
        openedEmails++;
        totalViews += views;
      }
      
      // Count by email type
      if (emailType === 'Send First Warning') {
        firstWarnings++;
        if (isOpened) firstWarningsOpened++;
      } else if (emailType === 'Send Last Warning') {
        lastWarnings++;
        if (isOpened) lastWarningsOpened++;
      } else if (emailType === 'Send Suspension Notice') {
        suspensions++;
        if (isOpened) suspensionsOpened++;
      }
      
      // Count emails from last week
      if (sendDate > oneWeekAgo) {
        lastWeekEmails++;
        if (isOpened) {
          lastWeekOpened++;
        }
      }
    }
    
    // Calculate rates
    const openRate = totalEmails > 0 ? (openedEmails / totalEmails * 100).toFixed(2) : 0;
    const lastWeekOpenRate = lastWeekEmails > 0 ? (lastWeekOpened / lastWeekEmails * 100).toFixed(2) : 0;
    const avgViews = openedEmails > 0 ? (totalViews / openedEmails).toFixed(2) : 0;
    
    const firstWarningOpenRate = firstWarnings > 0 ? (firstWarningsOpened / firstWarnings * 100).toFixed(2) : 0;
    const lastWarningOpenRate = lastWarnings > 0 ? (lastWarningsOpened / lastWarnings * 100).toFixed(2) : 0;
    const suspensionOpenRate = suspensions > 0 ? (suspensionsOpened / suspensions * 100).toFixed(2) : 0;
    
    return {
      totalEmails: totalEmails,
      openedEmails: openedEmails,
      openRate: `${openRate}%`,
      totalViews: totalViews,
      averageViews: avgViews,
      
      // Email types
      firstWarnings: firstWarnings,
      firstWarningsOpened: firstWarningsOpened,
      firstWarningOpenRate: `${firstWarningOpenRate}%`,
      
      lastWarnings: lastWarnings,
      lastWarningsOpened: lastWarningsOpened,
      lastWarningOpenRate: `${lastWarningOpenRate}%`,
      
      suspensions: suspensions,
      suspensionsOpened: suspensionsOpened,
      suspensionOpenRate: `${suspensionOpenRate}%`,
      
      // Recent stats
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
 * Updates the response status for a seller in the tracking sheets
 * @param {string} sellerId The seller ID
 * @param {string} emailType The type of email sent (First Warning, Last Warning, etc.)
 * @param {string} status The new status (Resolved, In Progress, etc.)
 * @param {string} notes Optional notes about the resolution
 * @return {boolean} Whether the update was successful
 */
function updateSellerResponseStatus(sellerId, emailType, status, notes) {
  try {
    let trackingSheetName;
    
    // Determine which tracking sheet to use
    switch(emailType) {
      case 'Send First Warning':
        trackingSheetName = CONFIG.TRACKING_SHEETS.FIRST_WARNING;
        break;
      case 'Send Last Warning':
        trackingSheetName = CONFIG.TRACKING_SHEETS.LAST_WARNING;
        break;
      case 'Send Suspension Notice':
        trackingSheetName = CONFIG.TRACKING_SHEETS.SUSPENSION;
        break;
      default:
        Logger.log(`Unknown email type: ${emailType}`);
        return false;
    }
    
    // Prepare seller ID for comparison in different formats
    const searchIdString = String(sellerId).trim();
    const searchIdNumber = Number(sellerId);
    
    Logger.log(`Looking for seller ID "${searchIdString}" or ${searchIdNumber} in ${trackingSheetName}`);
    
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(trackingSheetName);
    
    if (!sheet) {
      Logger.log(`Tracking sheet not found: ${trackingSheetName}`);
      return false;
    }
    
    // Get all data from the sheet
    const data = sheet.getDataRange().getValues();
    
    // Find the row with the matching seller ID
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      const rowData = data[i][0];
      const rowIdString = String(rowData || "").trim();
      const rowIdNumber = Number(rowData);
      
      // Debug logging for first few rows
      if (i < 5) {
        Logger.log(`Row ${i+1}: Value: "${rowData}", As String: "${rowIdString}", As Number: ${rowIdNumber}`);
      }
      
      // Match by either string or number
      if (rowIdString === searchIdString || rowIdNumber === searchIdNumber) {
        Logger.log(`Match found in row ${i+1}`);
        rowIndex = i + 1; // 1-based row index for Sheets API
        break;
      }
    }
    
    if (rowIndex === -1) {
      Logger.log(`Seller ID not found in tracking sheet: ${sellerId}`);
      return false;
    }
    
    // Format current date with time in Tokyo timezone
    const now = new Date();
    const formattedDate = Utilities.formatDate(now, CONFIG.DEFAULT_TIMEZONE, "yyyy/MM/dd HH:mm:ss");
    
    // Log the update we're about to make
    Logger.log(`Updating seller ${sellerId} in sheet ${trackingSheetName} row ${rowIndex}:`);
    Logger.log(`- Response Date: ${formattedDate}`);
    Logger.log(`- Response Received: Yes`);
    Logger.log(`- Resolution Status: ${status}`);
    if (notes) {
      Logger.log(`- Notes: ${notes}`);
    }
    
    // Update response status
    sheet.getRange(rowIndex, 11).setValue(formattedDate);  // Response Date/Time
    sheet.getRange(rowIndex, 11).setNumberFormat('yyyy/MM/dd HH:mm:ss'); // Format date cell
    sheet.getRange(rowIndex, 12).setValue('Yes');          // Response Received
    sheet.getRange(rowIndex, 13).setValue(status);         // Resolution Status
    
    // Update notes if provided
    if (notes) {
      sheet.getRange(rowIndex, 14).setValue(notes);        // Notes
    }
    
    Logger.log(`Updated response status for seller ${sellerId} to ${status} at ${formattedDate}`);
    return true;
    
  } catch (error) {
    Logger.log(`Error updating seller response status: ${error.message}`);
    Logger.log(`Stack trace: ${error.stack}`);
    return false;
  }
}
