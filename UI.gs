/**
 * UIModule.gs - User Interface for Quality Issue Notification System
 * Manages user interface, menus, and interactive functions
 * @version 3.3
 * @lastModified 2025-04-22
 */

/**
 * Global function to handle status selection from dialog
 * @param {string} status The selected status
 */
function setSelectedStatus(status) {
  // Use script properties to pass the selected status back to the calling function
  const scriptProperties = PropertiesService.getScriptProperties();
  scriptProperties.setProperty('TEMP_SELECTED_STATUS', status);
  return true;
}

/**
 * Creates a custom menu in the Google Sheets UI when the spreadsheet is opened
 */
function onOpen() {
  try {
    const ui = SpreadsheetApp.getUi();

     // Create a menu
    ui.createMenu('JP Quality Notification')
      .addItem('Send Notifications Now', 'main')
      .addSeparator()
      .addItem('Test System', 'testSystem')
      .addItem('Set Weekly Schedule', 'setWeeklySchedule')
      .addSeparator()
      .addItem('Show Email Statistics', 'showEmailStats')
      .addItem('Search Seller History', 'showSellerSearchDialog')
      .addItem('Update Response Status', 'showImprovedUpdateStatusDialog') // Changed to improved version
      .addSeparator()
      .addItem('Add Response Indicators', 'addImprovedResponseButtons') // Changed to improved version
      .addItem('Add Quick Action Links', 'addActionLinksToSheet') // Added new action links feature
      .addToUi();
    
    Logger.log('Custom menu created successfully');
    
    // Check for any pending alerts
    showPendingAlerts();
  } catch (error) {
    Logger.log(`Error creating custom menu: ${error.message}`);
  }
}

/**
 * Function to show any pending alerts when the spreadsheet is opened
 */
function showPendingAlerts() {
  const props = PropertiesService.getScriptProperties();
  const title = props.getProperty('PENDING_ALERT_TITLE');
  const message = props.getProperty('PENDING_ALERT_MESSAGE');
  
  if (title && message) {
    // Show the pending alert
    const ui = SpreadsheetApp.getUi();
    ui.alert(title, message, ui.ButtonSet.OK);
    
    // Clear the properties
    props.deleteProperty('PENDING_ALERT_TITLE');
    props.deleteProperty('PENDING_ALERT_MESSAGE');
  }
}

/**
 * Helper function to display alerts that works from both UI and triggers
 * @param {string} title Alert title
 * @param {string} message Alert message
 * @param {Object} buttonSet Optional button set (defaults to OK)
 * @return {Object} Button selected by user, or null if displayed from trigger
 */
function showAlert(title, message, buttonSet) {
  // Check if we're running from UI context or trigger
  let runningFromTrigger = false;
  let buttonSelected = null;
  
  try {
    // Try to get the UI - this will throw an error if running from trigger
    const ui = SpreadsheetApp.getUi();
    buttonSet = buttonSet || ui.ButtonSet.OK;
    buttonSelected = ui.alert(title, message, buttonSet);
    return buttonSelected;
  } catch (e) {
    // Running from trigger
    runningFromTrigger = true;
    Logger.log(`Alert would show: "${title}" - "${message}"`);
    
    // Store the message to display later
    PropertiesService.getScriptProperties().setProperty('PENDING_ALERT_TITLE', title);
    PropertiesService.getScriptProperties().setProperty('PENDING_ALERT_MESSAGE', message);
  }
  
  if (runningFromTrigger) {
    // Create a trigger to show the alert when a user opens the spreadsheet
    const triggers = ScriptApp.getProjectTriggers();
    let hasOpenTrigger = false;
    
    // Check if we already have an onOpen trigger
    for (const trigger of triggers) {
      if (trigger.getEventType() === ScriptApp.EventType.ON_OPEN) {
        hasOpenTrigger = true;
        break;
      }
    }
    
    // If no onOpen trigger exists, create one
    if (!hasOpenTrigger) {
      ScriptApp.newTrigger('showPendingAlerts')
               .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
               .onOpen()
               .create();
    }
  }
  
  return buttonSelected;
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
      message = `Email Statistics Summary:\n\n` +
                `Total emails sent: ${stats.totalEmails}\n` +
                `Emails opened: ${stats.openedEmails} (${stats.openRate})\n` +
                `Total views: ${stats.totalViews}\n` +
                `Average views per opened email: ${stats.averageViews}\n\n` +
                
                `Email Types:\n` +
                `First warnings: ${stats.firstWarnings} (${stats.firstWarningOpenRate} opened)\n` +
                `Last warnings: ${stats.lastWarnings} (${stats.lastWarningOpenRate} opened)\n` +
                `Suspensions: ${stats.suspensions} (${stats.suspensionOpenRate} opened)\n\n` +
                
                `Last 7 days:\n` +
                `Emails: ${stats.lastWeekEmails}\n` +
                `Opened: ${stats.lastWeekOpened} (${stats.lastWeekOpenRate})`;
    }
    
    Logger.log('Email statistics:\n' + message);
    
    // Use the improved alert function instead
    showAlert('Email Statistics', message);
  } catch (error) {
    Logger.log(`Error showing email stats: ${error.message}`);
    showAlert('Error', `Could not retrieve email statistics: ${error.message}`);
  }
}

/**
 * Shows a dialog to search for a seller by ID
 */
function showSellerSearchDialog() {
  try {
    const ui = SpreadsheetApp.getUi();
    const result = ui.prompt(
      'Seller Search',
      'Enter the Seller ID to view tracking history:',
      ui.ButtonSet.OK_CANCEL
    );
    
    // Check if the user clicked "OK"
    if (result.getSelectedButton() === ui.Button.OK) {
      const sellerId = result.getResponseText().trim();
      if (sellerId) {
        Logger.log(`User requested tracking history for Seller ID: ${sellerId}`);
        showSellerTrackingHistory(sellerId);
      } else {
        showAlert('Error', 'Please enter a valid Seller ID.');
      }
    }
  } catch (error) {
    Logger.log(`Error showing seller search dialog: ${error.message}`);
    Logger.log(error.stack);
    showAlert('Error', `An error occurred: ${error.message}`);
  }
}

/**
 * Improved version of the update status dialog with better UI and validation
 */
function showImprovedUpdateStatusDialog() {
  try {
    const ui = SpreadsheetApp.getUi();
    
    // First get the seller ID
    const sellerResult = ui.prompt(
      'Update Response Status',
      'Enter the Seller ID:',
      ui.ButtonSet.OK_CANCEL
    );
    
    // Check if the user clicked "OK"
    if (sellerResult.getSelectedButton() !== ui.Button.OK) {
      return;
    }
    
    const sellerId = sellerResult.getResponseText().trim();
    if (!sellerId) {
      showAlert('Error', 'Please enter a valid Seller ID.');
      return;
    }
    
    // Verify that the seller exists in any of the tracking sheets
    const validSeller = verifySellerExists(sellerId);
    if (!validSeller.exists) {
      showAlert('Error', `Seller ID ${sellerId} not found in any tracking sheet. Please verify the ID is correct.`);
      return;
    }
    
    // If the seller exists, show which email types are available for this seller
    let emailTypeMessage = 'Select the email type to update:\n\n';
    if (validSeller.emailTypes.length > 0) {
      validSeller.emailTypes.forEach((type, index) => {
        emailTypeMessage += `${index + 1}. ${type} (sent on ${validSeller.sentDates[index]})\n`;
      });
    }
    
    // Get the email type
    const typeResult = ui.prompt(
      'Update Response Status',
      emailTypeMessage + '\nEnter the number of the email type to update:',
      ui.ButtonSet.OK_CANCEL
    );
    
    if (typeResult.getSelectedButton() !== ui.Button.OK) {
      return;
    }
    
    const typeIndex = parseInt(typeResult.getResponseText().trim()) - 1;
    if (isNaN(typeIndex) || typeIndex < 0 || typeIndex >= validSeller.emailTypes.length) {
      showAlert('Error', 'Please enter a valid option number.');
      return;
    }
    
    const emailType = validSeller.emailTypes[typeIndex];
    
    // Show a more explicit status selection dialog
    const statusDialogHtml = HtmlService
      .createHtmlOutput(`
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 20px;
          }
          h3 {
            margin-top: 0;
          }
          .button-container {
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-top: 20px;
          }
          .status-btn {
            padding: 10px 15px;
            font-size: 14px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            text-align: left;
            font-weight: bold;
          }
          .resolved {
            background-color: #d9ead3;
            color: #38761d;
          }
          .in-progress {
            background-color: #fff2cc;
            color: #e69138;
          }
          .pending {
            background-color: #f4cccc;
            color: #cc0000;
          }
          .other {
            background-color: #d0e0e3;
            color: #0b5394;
          }
          .description {
            font-weight: normal;
            font-size: 12px;
            display: block;
            margin-top: 4px;
          }
        </style>
        <h3>Select Response Status</h3>
        <p>Updating status for Seller ID: ${sellerId} - ${emailType}</p>
        <div class="button-container">
          <button class="status-btn resolved" onclick="google.script.run.withSuccessHandler(google.script.host.close).setSelectedStatus('Resolved')">
            ✅ Resolved
            <span class="description">Issue has been completely addressed by the seller</span>
          </button>
          <button class="status-btn in-progress" onclick="google.script.run.withSuccessHandler(google.script.host.close).setSelectedStatus('In Progress')">
            ⏳ In Progress
            <span class="description">Seller is working on the issue</span>
          </button>
          <button class="status-btn pending" onclick="google.script.run.withSuccessHandler(google.script.host.close).setSelectedStatus('Pending')">
            ⚠️ Pending
            <span class="description">Waiting for action or response</span>
          </button>
          <button class="status-btn other" onclick="google.script.run.withSuccessHandler(google.script.host.close).setSelectedStatus('Custom')">
            ℹ️ Enter Custom Status
            <span class="description">Specify a different status</span>
          </button>
          <button onclick="google.script.host.close()">Cancel</button>
        </div>
      `)
      .setWidth(350)
      .setHeight(370);
    
    ui.showModalDialog(statusDialogHtml, 'Select Status');
    
    // Wait for the status selection (this is handled by the global setSelectedStatus function)
    // We'll need to implement a synchronous wait here
    
    // Get the script properties to use for status passing
    const scriptProperties = PropertiesService.getScriptProperties();
    
    // Wait for the status to be set (timeout after 2 minutes)
    const startTime = new Date().getTime();
    let status = null;
    while (!status && (new Date().getTime() - startTime < 120000)) {
      // Check if status has been set
      status = scriptProperties.getProperty('TEMP_SELECTED_STATUS');
      if (status) {
        // Clear the property
        scriptProperties.deleteProperty('TEMP_SELECTED_STATUS');
        break;
      }
      
      // Wait a bit before checking again
      Utilities.sleep(500);
    }
    
    // If no status was selected (e.g., dialog was closed), exit
    if (!status) {
      return;
    }
    
    // Handle custom status entry
    if (status === 'Custom') {
      const customStatusResult = ui.prompt(
        'Custom Status',
        'Enter a custom status:',
        ui.ButtonSet.OK_CANCEL
      );
      
      if (customStatusResult.getSelectedButton() !== ui.Button.OK) {
        return;
      }
      
      status = customStatusResult.getResponseText().trim();
      if (!status) {
        showAlert('Error', 'Please enter a valid status.');
        return;
      }
    }
    
    // Get optional notes
    const notesResult = ui.prompt(
      'Update Response Status',
      'Enter optional notes about the resolution:',
      ui.ButtonSet.OK_CANCEL
    );
    
    let notes = '';
    if (notesResult.getSelectedButton() === ui.Button.OK) {
      notes = notesResult.getResponseText().trim();
    }
    
    // Confirm the update
    const confirmResult = showAlert(
      'Confirm Update',
      `Are you sure you want to update the response status for:\n\nSeller ID: ${sellerId}\nEmail Type: ${emailType}\nNew Status: ${status}\nNotes: ${notes || '(none)'}`,
      ui.ButtonSet.YES_NO
    );
    
    if (confirmResult !== ui.Button.YES) {
      return;
    }
    
    // Update the status
    const updated = updateSellerResponseStatus(sellerId, emailType, status, notes);
    
    if (updated) {
      showAlert('Success', `Response status updated for seller ${sellerId} to "${status}".`);
      
      // Offer to view the seller's updated history
      const viewHistoryResult = showAlert(
        'View Updated History',
        'Would you like to view the updated tracking history for this seller?',
        ui.ButtonSet.YES_NO
      );
      
      if (viewHistoryResult === ui.Button.YES) {
        showSellerTrackingHistory(sellerId);
      }
    } else {
      showAlert('Error', `Could not update response status for seller ${sellerId}. Please check the logs for details.`);
    }
    
  } catch (error) {
    Logger.log(`Error showing update status dialog: ${error.message}`);
    Logger.log(error.stack);
    showAlert('Error', `An error occurred: ${error.message}`);
  }
}

/**
 * Verify if a seller exists in any of the tracking sheets
 * @param {string} sellerId The seller ID to look for
 * @return {Object} Object with exists flag and available email types
 */
function verifySellerExists(sellerId) {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const result = {
      exists: false,
      emailTypes: [],
      sentDates: []
    };
    
    // Convert sellerId to string, trim, and handle numeric IDs properly
    const searchId = String(sellerId).trim();
    const searchIdNumber = Number(searchId);
    
    // Log debug info
    Logger.log(`Looking for seller ID: "${searchId}" (as string) or ${searchIdNumber} (as number)`);
    
    // Check each tracking sheet
    const trackingSheetNames = [
      CONFIG.TRACKING_SHEETS.FIRST_WARNING,
      CONFIG.TRACKING_SHEETS.LAST_WARNING,
      CONFIG.TRACKING_SHEETS.SUSPENSION
    ];
    
    const emailTypeMap = {
      [CONFIG.TRACKING_SHEETS.FIRST_WARNING]: 'Send First Warning',
      [CONFIG.TRACKING_SHEETS.LAST_WARNING]: 'Send Last Warning',
      [CONFIG.TRACKING_SHEETS.SUSPENSION]: 'Send Suspension Notice'
    };
    
    for (const sheetName of trackingSheetNames) {
      const sheet = spreadsheet.getSheetByName(sheetName);
      if (!sheet) continue;
      
      const data = sheet.getDataRange().getValues();
      
      // Skip header row
      for (let i = 1; i < data.length; i++) {
        // Check for the seller ID in various formats (string, number, etc.)
        const rowData = data[i][0];
        const rowSellerId = String(rowData || "").trim();
        const rowSellerIdNumber = Number(rowData);
        
        // Log the first few rows for debugging
        if (i < 5) {
          Logger.log(`${sheetName} Row ${i+1}: Value: "${rowData}", As String: "${rowSellerId}", As Number: ${rowSellerIdNumber}`);
        }
        
        // Match by either string or number format
        if (rowSellerId === searchId || rowSellerIdNumber === searchIdNumber) {
          // Found a match!
          Logger.log(`Match found in ${sheetName} at row ${i+1}: "${rowData}"`);
          result.exists = true;
          result.emailTypes.push(emailTypeMap[sheetName]);
          result.sentDates.push(formatDate(data[i][9]) || 'Unknown date');
        }
      }
    }
    
    return result;
  } catch (error) {
    Logger.log(`Error verifying seller existence: ${error.message}`);
    return { exists: false, emailTypes: [], sentDates: [] };
  }
}

/**
 * Improved version of the response buttons function
 * Creates more visually distinct indicators and instructions
 */
function addImprovedResponseButtons() {
  try {
    const result = showAlert('Add Response Indicators', 
                            'This will add response status indicators to tracking sheets and format them for better visibility. Continue?', 
                            SpreadsheetApp.getUi().ButtonSet.YES_NO);
    
    if (result !== SpreadsheetApp.getUi().Button.YES) {
      return;
    }
    
    // Get the spreadsheet
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    
    // Get all tracking sheets
    const trackingSheets = [
      CONFIG.TRACKING_SHEETS.FIRST_WARNING,
      CONFIG.TRACKING_SHEETS.LAST_WARNING,
      CONFIG.TRACKING_SHEETS.SUSPENSION
    ];
    
    // For each sheet, add status indicators and improve formatting
    for (const sheetName of trackingSheets) {
      const sheet = spreadsheet.getSheetByName(sheetName);
      if (!sheet) continue;
      
      // Add an "Action" header in column O (15)
      sheet.getRange("O1").setValue("Action Required");
      sheet.getRange("O1").setFontWeight("bold");
      sheet.getRange("O1").setBackground("#f3f3f3");
      sheet.setColumnWidth(15, 150);
      
      // Get the data range to know how many rows to process
      const dataRange = sheet.getDataRange();
      const lastRow = dataRange.getLastRow();
      
      // Skip header row, add status indicators to all data rows
      if (lastRow > 1) {
        for (let row = 2; row <= lastRow; row++) {
          // Get the current response status
          const responseReceived = sheet.getRange(row, 12).getValue() === "Yes";
          const resolutionStatus = sheet.getRange(row, 13).getValue();
          
          // Format the cell based on status
          const actionCell = sheet.getRange(row, 15);
          
          if (!responseReceived) {
            // No response yet - needs attention
            actionCell.setValue("⚠️ NEEDS RESPONSE");
            actionCell.setBackground("#ffe6e6"); // Light red
            actionCell.setFontWeight("bold");
          } else if (resolutionStatus === "Pending" || resolutionStatus === "In Progress") {
            // Response received but not resolved
            actionCell.setValue("⏳ IN PROGRESS");
            actionCell.setBackground("#fff2cc"); // Light yellow
            actionCell.setFontWeight("bold");
          } else if (resolutionStatus === "Resolved") {
            // Fully resolved
            actionCell.setValue("✅ RESOLVED");
            actionCell.setBackground("#d9ead3"); // Light green
            actionCell.setFontWeight("normal");
          } else {
            // Other status
            actionCell.setValue("ℹ️ " + resolutionStatus.toUpperCase());
            actionCell.setBackground("#d0e0e3"); // Light blue
          }
        }
      }
      
      // Also add conditional formatting to the entire sheet based on resolution status
      // We'll use cell coloring instead of conditional formatting rules since the syntax may vary across Apps Script versions
      if (lastRow > 1) {
        for (let row = 2; row <= lastRow; row++) {
          const responseReceived = sheet.getRange(row, 12).getValue() === "Yes";
          const resolutionStatus = sheet.getRange(row, 13).getValue();
          
          // Color the entire row based on status
          const rowRange = sheet.getRange(row, 1, 1, sheet.getLastColumn());
          
          if (!responseReceived) {
            // No response yet - light red background
            rowRange.setBackground("#fce8e6");
          } else if (resolutionStatus === "Resolved") {
            // Resolved - light green background
            rowRange.setBackground("#edf7ed");
          } else if (resolutionStatus === "In Progress") {
            // In progress - light yellow background
            rowRange.setBackground("#fff2cc");
          } else {
            // Other status - no background
            rowRange.setBackground(null);
          }
        }
      }
    }
    
    // Show instructions in a more helpful way
    const htmlOutput = HtmlService
      .createHtmlOutput(`
        <h2>Response Indicators Added Successfully</h2>
        <p>The tracking sheets now have improved response status indicators:</p>
        <ul>
          <li><b style="color: #cc0000;">⚠️ NEEDS RESPONSE</b> - No response received yet</li>
          <li><b style="color: #e69138;">⏳ IN PROGRESS</b> - Response received but not fully resolved</li>
          <li><b style="color: #38761d;">✅ RESOLVED</b> - Issue has been fully resolved</li>
        </ul>
        <p>To update a response status, use the "Update Response Status" option from the JP Quality Notification menu.</p>
        <hr>
        <p><i>The row background colors will also change based on status to help you quickly identify issues that need attention.</i></p>
      `)
      .setWidth(450)
      .setHeight(300);
    
    SpreadsheetApp.getUi().showModalDialog(htmlOutput, "Response Indicators Added");
    
  } catch (error) {
    Logger.log(`Error adding response indicators: ${error.message}`);
    Logger.log(error.stack);
    showAlert('Error', `An error occurred: ${error.message}`);
  }
}

/**
 * Show detailed tracking information for a specific seller
 * @param {string} sellerId The seller ID to look up
 */
function showSellerTrackingHistory(sellerId) {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    let results = [];
    let foundSeller = false;
    let sellerEmails = [];
    
    // Log for debugging
    Logger.log(`Searching for tracking information for Seller ID: ${sellerId}`);
    
    // Trim the seller ID and convert to string to ensure consistent matching
    const searchId = String(sellerId).trim();
    
    // Check the main tracking sheet first
    const mainSheet = spreadsheet.getSheetByName(CONFIG.TRACKING_SHEETS.MAIN);
    if (mainSheet) {
      const mainData = mainSheet.getDataRange().getValues();
      Logger.log(`Checking main tracking sheet with ${mainData.length} rows`);
      
      // Filter for this seller
      for (let i = 1; i < mainData.length; i++) {
        const rowSellerId = String(mainData[i][2] || "").trim(); // Seller ID column
        
        // Log for debugging
        if (i < 5 || rowSellerId === searchId) {
          Logger.log(`Row ${i}: ID in sheet: "${rowSellerId}", Looking for: "${searchId}", Match: ${rowSellerId === searchId}`);
        }
        
        if (rowSellerId === searchId) {
          foundSeller = true;
          sellerEmails.push({
            trackingId: mainData[i][0],
            email: mainData[i][1],
            emailType: mainData[i][3],
            sentDate: formatDate(mainData[i][4]),
            openDate: mainData[i][5] ? formatDate(mainData[i][5]) : 'Not opened',
            opened: mainData[i][6] === 'Yes',
            views: mainData[i][7] || 0
          });
        }
      }
      
      if (sellerEmails.length > 0) {
        results.push(`Found ${sellerEmails.length} email(s) sent to seller ${sellerId}:`);
        
        // Sort by sent date (newest first)
        sellerEmails.sort((a, b) => new Date(b.sentDate) - new Date(a.sentDate));
        
        sellerEmails.forEach((email, index) => {
          results.push(`\n${index + 1}. ${email.emailType} (${email.sentDate})`);
          results.push(`   To: ${email.email}`);
          results.push(`   Status: ${email.opened ? `Opened on ${email.openDate} (${email.views} views)` : 'Not opened'}`);
        });
      } else {
        Logger.log(`No emails found for seller ${sellerId} in main tracking sheet`);
      }
    } else {
      Logger.log(`Main tracking sheet not found`);
    }
    
    // Check the specialized tracking sheets
    const trackingSheetNames = [
      CONFIG.TRACKING_SHEETS.FIRST_WARNING,
      CONFIG.TRACKING_SHEETS.LAST_WARNING,
      CONFIG.TRACKING_SHEETS.SUSPENSION
    ];
    
    let detailedInfo = [];
    
    for (const sheetName of trackingSheetNames) {
      const sheet = spreadsheet.getSheetByName(sheetName);
      if (!sheet) {
        Logger.log(`Sheet ${sheetName} not found`);
        continue;
      }
      
      const data = sheet.getDataRange().getValues();
      Logger.log(`Checking ${sheetName} sheet with ${data.length} rows`);
      
      // Look for the seller
      for (let i = 1; i < data.length; i++) {
        const rowSellerId = String(data[i][0] || "").trim(); // Seller ID column
        
        // Log first few rows for debugging
        if (i < 5 || rowSellerId === searchId) {
          Logger.log(`${sheetName} Row ${i}: ID in sheet: "${rowSellerId}", Looking for: "${searchId}", Match: ${rowSellerId === searchId}`);
        }
        
        if (rowSellerId === searchId) {
          foundSeller = true;
          detailedInfo.push({
            type: sheetName.replace(' Log', ''),
            sellerName: data[i][1],
            email: data[i][2],
            defectiveRate: formatPercentage(data[i][3]),
            defectiveLabel: data[i][4],
            appearanceRate: formatPercentage(data[i][5]),
            appearanceLabel: data[i][6],
            consecutiveDefectiveWeeks: data[i][7],
            consecutiveAppearanceWeeks: data[i][8],
            sendDate: formatDate(data[i][9]),
            responseDate: data[i][10] ? formatDate(data[i][10]) : 'No response',
            responseReceived: data[i][11] === 'Yes',
            resolutionStatus: data[i][12] || 'Pending',
            notes: data[i][13] || 'No notes'
          });
        }
      }
    }
    
    if (detailedInfo.length > 0) {
      results.push(`\nDetailed tracking information for seller ${sellerId}:`);
      
      // Sort by sent date (newest first)
      detailedInfo.sort((a, b) => new Date(b.sendDate) - new Date(a.sendDate));
      
      detailedInfo.forEach((info, index) => {
        results.push(`\n${info.type} sent on ${info.sendDate}:`);
        results.push(`   Seller: ${info.sellerName}`);
        results.push(`   Quality issues: ${info.defectiveRate} (${info.defectiveLabel}), ${info.appearanceRate} (${info.appearanceLabel})`);
        results.push(`   Consecutive weeks: ${info.consecutiveDefectiveWeeks} defective, ${info.consecutiveAppearanceWeeks} appearance`);
        results.push(`   Response status: ${info.responseReceived ? `Received on ${info.responseDate}` : 'No response'}`);
        results.push(`   Resolution: ${info.resolutionStatus}`);
        if (info.notes !== 'No notes') {
          results.push(`   Notes: ${info.notes}`);
        }
      });
    } else {
      Logger.log(`No detailed info found for seller ${sellerId} in any specialized tracking sheet`);
    }
    
    if (!foundSeller) {
      results = [`No tracking information found for seller ID: ${sellerId}`];
      Logger.log(`No tracking information found for seller ID: ${sellerId} in any sheet`);
    }
    
    // Display results in a more readable format (HTML)
    const resultText = results.join('\n');
    Logger.log(`Final tracking history result: ${resultText}`);
    
    try {
      // For better readability, show as HTML if it's a complex result
      if (foundSeller && detailedInfo.length > 0) {
        // Create HTML view
        let htmlOutput = '<h3>Tracking History for Seller ' + sellerId + '</h3>';
        
        // Add seller info if available
        if (detailedInfo.length > 0) {
          htmlOutput += '<p><strong>Seller Name:</strong> ' + detailedInfo[0].sellerName + '</p>';
        }
        
        // Add email history
        if (sellerEmails && sellerEmails.length > 0) {
          htmlOutput += '<h4>Email History:</h4><ul>';
          sellerEmails.forEach(email => {
            const openStatus = email.opened ? 
              '<span style="color:green">Opened on ' + email.openDate + ' (' + email.views + ' views)</span>' : 
              '<span style="color:red">Not opened</span>';
            
            htmlOutput += '<li><strong>' + email.emailType + '</strong> (' + email.sentDate + ')<br>' +
                         'To: ' + email.email + '<br>' +
                         'Status: ' + openStatus + '</li>';
          });
          htmlOutput += '</ul>';
        }
        
        // Add detailed tracking info
        if (detailedInfo.length > 0) {
          htmlOutput += '<h4>Notification Tracking:</h4>';
          detailedInfo.forEach(info => {
            // Set status color
            let statusColor = 'black';
            if (!info.responseReceived) {
              statusColor = 'red';
            } else if (info.resolutionStatus === 'Resolved') {
              statusColor = 'green';
            } else if (info.resolutionStatus === 'In Progress') {
              statusColor = 'orange';
            }
            
            htmlOutput += '<div style="margin-bottom:15px; padding:10px; border:1px solid #ddd; border-radius:5px;">' +
                         '<h4 style="margin-top:0">' + info.type + ' (' + info.sendDate + ')</h4>' +
                         '<div><strong>Quality Issues:</strong></div>' +
                         '<ul>' +
                         '<li>Defective Rate: ' + info.defectiveRate + ' (' + info.defectiveLabel + ')</li>' +
                         '<li>Appearance Rate: ' + info.appearanceRate + ' (' + info.appearanceLabel + ')</li>' +
                         '<li>Consecutive Weeks: ' + info.consecutiveDefectiveWeeks + ' defective, ' + 
                         info.consecutiveAppearanceWeeks + ' appearance</li>' +
                         '</ul>' +
                         '<div><strong>Response Status: </strong>' +
                         '<span style="color:' + statusColor + ';font-weight:bold;">' + 
                         (info.responseReceived ? 'Received on ' + info.responseDate : 'No response') + 
                         '</span></div>' +
                         '<div><strong>Resolution: </strong>' + info.resolutionStatus + '</div>';
                         
            if (info.notes !== 'No notes') {
              htmlOutput += '<div><strong>Notes:</strong> ' + info.notes + '</div>';
            }
            
            htmlOutput += '</div>';
          });
        }
        
        const htmlUI = HtmlService
          .createHtmlOutput(htmlOutput)
          .setWidth(500)
          .setHeight(400);
        
        SpreadsheetApp.getUi().showModalDialog(htmlUI, 'Seller Tracking History');
      } else {
        // Simple dialog for no results or simple results
        showAlert(`Tracking History for ${sellerId}`, resultText);
      }
    } catch (error) {
      Logger.log(`Error showing seller tracking history HTML: ${error.message}`);
      Logger.log(error.stack);
      showAlert('Error', `Could not display tracking history: ${error.message}`);
    }
    
    return resultText;
    
  } catch (error) {
    Logger.log(`Error showing seller tracking history: ${error.message}`);
    Logger.log(error.stack);
    showAlert('Error', `Could not retrieve seller tracking history: ${error.message}`);
    
    return `Error: ${error.message}`;
  }
}

/**
 * Manual function to record a seller response (can be called directly from script editor)
 * @param {string} sellerId The seller ID
 * @param {string} emailType The email type (First Warning, Last Warning, Suspension Notice)
 * @param {string} status The status of the resolution
 * @param {string} notes Any notes about the response
 * @return {boolean} Whether the update was successful
 */
function recordSellerResponse(sellerId, emailType, status, notes) {
  try {
    Logger.log(`Manually recording response for seller ${sellerId} (${emailType})`);
    return updateSellerResponseStatus(sellerId, emailType, status, notes);
  } catch (error) {
    Logger.log(`Error recording seller response: ${error.message}`);
    Logger.log(error.stack);
    return false;
  }
}
