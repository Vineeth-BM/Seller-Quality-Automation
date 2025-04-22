/**
 * WebhookModule.gs - Web App functionality for Quality Issue Notification System
 * Handles web app requests for email tracking and action handling
 * @Author BackMarket Quality Team
 * @version 3.1
 * @lastModified 2025-04-18
 */

/**
 * Web app doGet function that handles tracking pixel requests and action URLs
 * This function will be called when the tracking pixel is loaded or an action is requested
 * 
 * Note: For this to work, you must:
 * 1. Deploy this script as a web app (Publish > Deploy as web app)
 * 2. Set "Execute the app as" to "Me"
 * 3. Set "Who has access to the app" to "Anyone, even anonymous"
 * 4. After deployment, update the WEB_APP_URL in CONFIG with your deployment URL
 */
function doGet(e) {
  try {
    // Get parameters from the request
    const action = e.parameter.action;
    
    // Handle tracking pixel requests (from email opens)
    if (action === 'open' && e.parameter.id) {
      const trackingId = e.parameter.id;
      recordEmailOpen(trackingId);
      
      // Return a 1x1 transparent GIF for tracking pixels
      return ContentService.createTextOutput('GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;')
        .setMimeType(ContentService.MimeType.IMAGE);
    }
    
    // Handle direct response update requests
    if (action === 'updateResponse') {
      const sellerId = e.parameter.sellerId;
      const emailType = e.parameter.emailType;
      const status = e.parameter.status || 'Resolved';
      const notes = e.parameter.notes || `Updated via direct action on ${new Date().toLocaleString()}`;
      
      if (!sellerId || !emailType) {
        return createHtmlResponse('Error', 'Missing required parameters: sellerId and emailType are required.');
      }
      
      // Update the seller response status
      const success = updateSellerResponseStatus(sellerId, emailType, status, notes);
      
      if (success) {
        return createHtmlResponse('Success', 
          `Response status for seller ${sellerId} has been updated to "${status}".`,
          `#${sellerId}`);
      } else {
        return createHtmlResponse('Error', 
          `Failed to update response status for seller ${sellerId}. Please check the seller ID and email type.`,
          `#${sellerId}`);
      }
    }
    
    // Handle seller history lookup
    if (action === 'viewHistory' && e.parameter.sellerId) {
      const sellerId = e.parameter.sellerId;
      const historyText = showSellerTrackingHistory(sellerId);
      return createHtmlResponse('Seller History', historyText, `#${sellerId}`);
    }
    
    // If no recognized action, return documentation page
    return createDocumentationPage();
    
  } catch (error) {
    Logger.log(`Error processing request: ${error.message}`);
    return ContentService.createTextOutput(`Error: ${error.message}`).setMimeType(ContentService.MimeType.TEXT);
  }
}

/**
 * Creates a simple HTML response page
 * @param {string} title Title of the page
 * @param {string} message Message to display
 * @param {string} backLink Optional back link anchor
 * @return {Object} HtmlOutput object
 */
function createHtmlResponse(title, message, backLink) {
  let html = `
    <!DOCTYPE html>
    <html>
      <head>
        <base target="_top">
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${title}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 40px;
            line-height: 1.6;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            border: 1px solid #ccc;
            border-radius: 5px;
            background-color: #f9f9f9;
          }
          h1 {
            color: ${title.includes('Error') ? '#cc0000' : '#006600'};
          }
          .btn {
            display: inline-block;
            padding: 10px 15px;
            background-color: #4285f4;
            color: white;
            text-decoration: none;
            border-radius: 4px;
            margin-top: 20px;
          }
          pre {
            white-space: pre-wrap;
            background-color: #f0f0f0;
            padding: 10px;
            border-radius: 4px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>${title}</h1>
          <p>${message.replace(/\n/g, '<br>')}</p>
          <a href="javascript:window.close();" class="btn">Close Window</a>
        </div>
      </body>
    </html>
  `;
  
  return HtmlService.createHtmlOutput(html);
}

/**
 * Creates a documentation page explaining how to use the web app
 * @return {Object} HtmlOutput object with documentation
 */
function createDocumentationPage() {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <base target="_top">
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>JP Quality Notification System API</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 40px;
            line-height: 1.6;
          }
          .container {
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            border: 1px solid #ccc;
            border-radius: 5px;
            background-color: #f9f9f9;
          }
          h1 {
            color: #333;
          }
          h2 {
            color: #4285f4;
            margin-top: 30px;
          }
          code {
            background-color: #f0f0f0;
            padding: 2px 5px;
            border-radius: 3px;
          }
          pre {
            white-space: pre-wrap;
            background-color: #f0f0f0;
            padding: 10px;
            border-radius: 4px;
          }
          .endpoint {
            margin-bottom: 20px;
            padding: 10px;
            background-color: #e8f0fe;
            border-left: 4px solid #4285f4;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>JP Quality Notification System API</h1>
          <p>This web application provides endpoints for email tracking and seller response management.</p>
          
          <h2>Available Endpoints</h2>
          
          <div class="endpoint">
            <h3>Email Tracking</h3>
            <p>Records when a recipient opens an email by loading a tracking pixel.</p>
            <p><strong>Endpoint:</strong> <code>?action=open&id=[tracking_id]</code></p>
            <p><strong>Parameters:</strong></p>
            <ul>
              <li><code>action</code>: Must be "open"</li>
              <li><code>id</code>: The tracking ID of the email</li>
            </ul>
            <p><strong>Note:</strong> This endpoint returns a transparent 1x1 pixel image.</p>
          </div>
          
          <div class="endpoint">
            <h3>Update Response Status</h3>
            <p>Updates the response status for a seller.</p>
            <p><strong>Endpoint:</strong> <code>?action=updateResponse&sellerId=[seller_id]&emailType=[email_type]&status=[status]&notes=[notes]</code></p>
            <p><strong>Parameters:</strong></p>
            <ul>
              <li><code>action</code>: Must be "updateResponse"</li>
              <li><code>sellerId</code>: The ID of the seller (required)</li>
              <li><code>emailType</code>: The type of email (required, e.g., "Send First Warning")</li>
              <li><code>status</code>: The new status (optional, defaults to "Resolved")</li>
              <li><code>notes</code>: Additional notes (optional)</li>
            </ul>
          </div>
          
          <div class="endpoint">
            <h3>View Seller History</h3>
            <p>Displays the tracking history for a specific seller.</p>
            <p><strong>Endpoint:</strong> <code>?action=viewHistory&sellerId=[seller_id]</code></p>
            <p><strong>Parameters:</strong></p>
            <ul>
              <li><code>action</code>: Must be "viewHistory"</li>
              <li><code>sellerId</code>: The ID of the seller (required)</li>
            </ul>
          </div>
          
          <h2>Integration Examples</h2>
          <p>To add direct action links to your spreadsheet, you can use the following formula example:</p>
          <pre>=HYPERLINK("[WEB_APP_URL]?action=updateResponse&sellerId="&A2&"&emailType=Send%20First%20Warning&status=Resolved", "Mark as Resolved")</pre>
          <p>Replace <code>[WEB_APP_URL]</code> with your deployed web app URL.</p>
          
          <p>For more information, contact the BackMarket Quality Team.</p>
        </div>
      </body>
    </html>
  `;
  
  return HtmlService.createHtmlOutput(html);
}

/**
 * Creates action links to be used in spreadsheet cells
 * @return {boolean} Success status
 */
function addActionLinksToSheet() {
  try {
    const ui = SpreadsheetApp.getUi();
    const response = ui.alert('Add Action Links', 
                            'This will add direct action links to the tracking sheets. You need to have deployed the web app first. Continue?', 
                            ui.ButtonSet.YES_NO);
    
    if (response !== ui.Button.YES) {
      return false;
    }
    
    // Get web app URL
    const webAppUrl = CONFIG.WEB_APP_URL;
    if (!webAppUrl) {
      ui.alert('Error', 'Web app URL is not configured. Please set the WEB_APP_URL in the CONFIG object first.', ui.ButtonSet.OK);
      return false;
    }
    
    // Get the spreadsheet
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    
    // Get all tracking sheets
    const trackingSheets = [
      CONFIG.TRACKING_SHEETS.FIRST_WARNING,
      CONFIG.TRACKING_SHEETS.LAST_WARNING,
      CONFIG.TRACKING_SHEETS.SUSPENSION
    ];
    
    for (const sheetName of trackingSheets) {
      const sheet = spreadsheet.getSheetByName(sheetName);
      if (!sheet) continue;
      
      // Add action links header in column P (16)
      sheet.getRange("P1").setValue("Quick Actions");
      sheet.getRange("P1").setFontWeight("bold");
      sheet.getRange("P1").setBackground("#f3f3f3");
      sheet.setColumnWidth(16, 200);
      
      // Get the data range to know how many rows to process
      const dataRange = sheet.getDataRange();
      const lastRow = dataRange.getLastRow();
      
      // Determine which emailType to use for this sheet
      let emailType;
      if (sheetName === CONFIG.TRACKING_SHEETS.FIRST_WARNING) {
        emailType = "Send First Warning";
      } else if (sheetName === CONFIG.TRACKING_SHEETS.LAST_WARNING) {
        emailType = "Send Last Warning";
      } else if (sheetName === CONFIG.TRACKING_SHEETS.SUSPENSION) {
        emailType = "Send Suspension Notice";
      }
      
      // Skip header row, add action links to all data rows
      if (lastRow > 1) {
        for (let row = 2; row <= lastRow; row++) {
          const sellerId = sheet.getRange(row, 1).getValue();
          const responseReceived = sheet.getRange(row, 12).getValue() === "Yes";
          const resolutionStatus = String(sheet.getRange(row, 13).getValue() || "");
          
          let formula;
          if (!responseReceived) {
            // No response yet - add Mark Responded link
            formula = `=HYPERLINK("${webAppUrl}?action=updateResponse&sellerId=${sellerId}&emailType=${encodeURIComponent(emailType)}&status=In Progress", "Mark Responded")`;
          } else if (resolutionStatus !== "Resolved") {
            // Response received but not resolved - add Mark Resolved link
            formula = `=HYPERLINK("${webAppUrl}?action=updateResponse&sellerId=${sellerId}&emailType=${encodeURIComponent(emailType)}&status=Resolved", "Mark Resolved")`;
          } else {
            // Already resolved - add View History link
            formula = `=HYPERLINK("${webAppUrl}?action=viewHistory&sellerId=${sellerId}", "View History")`;
          }
          
          // Set the formula
          sheet.getRange(row, 16).setFormula(formula);
        }
      }
    }
    
    ui.alert('Success', 'Action links have been added to all tracking sheets. These links will open in a new window and allow quick updates without going through the menus.', ui.ButtonSet.OK);
    return true;
    
  } catch (error) {
    Logger.log(`Error adding action links: ${error.message}`);
    Logger.log(error.stack);
    
    // Try to show an error alert
    try {
      const ui = SpreadsheetApp.getUi();
      ui.alert('Error', `Could not add action links: ${error.message}`, ui.ButtonSet.OK);
    } catch (e) {
      Logger.log('Cannot display UI alert when running from trigger');
    }
    return false;
  }
}
