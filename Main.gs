/**
 * MainModule.gs - Main entry point for Quality Issue Notification System
 * Integrates all modules together
 * @version 3.0
 * @lastModified 2025-04-15
 */

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
    Logger.log(`Email types sent: ${stats.firstWarnings} first warnings, ${stats.lastWarnings} last warnings, ${stats.suspensions} suspensions`);
    
    // Check if we're running from UI
    try {
      const ui = SpreadsheetApp.getUi();
      ui.alert('Success', 
              `Process completed:\n${stats.processed} rows processed\n${stats.emailsSent} emails sent\n` + 
              `${stats.firstWarnings} first warnings\n${stats.lastWarnings} last warnings\n${stats.suspensions} suspensions\n` +
              `${stats.errors} errors\n${stats.skippedNoEmail} skipped (no email)`, 
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
 * Processes data rows and sends emails for quality issues
 * @param {Array} data 2D array of sheet data
 * @return {Object} Statistics about the process
 */
function processData(data) {
  // Statistics tracking
  const stats = {
    processed: 0,
    emailsSent: 0,
    firstWarnings: 0,
    lastWarnings: 0,
    suspensions: 0,
    errors: 0,
    skippedNoEmail: 0
  };
  
  // Create tracking sheets if they don't exist
  ensureTrackingSheets();
  
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
      
      // Skip if no action is required
      if (rowData.finalEmailAction === 'No Action') {
        Logger.log(`Row ${i+1}: No action required for seller ${rowData.sellerName} (ID: ${rowData.sellerId})`);
        continue;
      }
      
      // Send the appropriate email based on the final email action
      const emailSent = sendQualityNotification(rowData);
      
      if (emailSent) {
        stats.emailsSent++;
        
        // Update specific counters based on email type
        if (rowData.finalEmailAction === 'Send First Warning') {
          stats.firstWarnings++;
        } else if (rowData.finalEmailAction === 'Send Last Warning') {
          stats.lastWarnings++;
        } else if (rowData.finalEmailAction === 'Send Suspension Notice') {
          stats.suspensions++;
        }
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
