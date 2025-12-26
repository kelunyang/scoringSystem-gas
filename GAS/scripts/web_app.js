/**
 * @fileoverview Web app entry points for GAS
 * @module WebApp
 */

/**
 * Web app GET handler
 * Default: Serves HTML pages
 * API mode: Use ?mode=api to get JSON API responses
 * @param {Object} e - Event object containing request parameters
 * @return {HtmlOutput|ContentService.TextOutput} Response
 */
function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};

    // ===== API MODE (Optional - for future Cloudflare Workers integration) =====
    // Use ?mode=api to get JSON API responses instead of HTML
    if (params.mode === 'api') {
      console.log('API mode requested');

      // Handle API requests
      const path = params.path || '';

      // If no path specified, return API info
      if (!path) {
        return ContentService
          .createTextOutput(JSON.stringify({
            success: true,
            message: 'Scoring System API',
            version: '1.0.0',
            mode: 'api',
            usage: 'Use ?path=/endpoint for API calls',
            endpoints: {
              auth: '/auth/*',
              projects: '/projects/*',
              users: '/users/*',
              system: '/system/*'
            },
            timestamp: new Date().toISOString()
          }, null, 2))
          .setMimeType(ContentService.MimeType.JSON);
      }

      // Route to API handler
      return handleAPIRequest('GET', path, params);
    }

    // ===== HTML MODE (Default) =====
    console.log('HTML mode (default)');

    // Session test page
    if (params.sessionTest === 'true') {
      return doGetTest(e);
    }

    // Debug mode
    if (params.debug === 'true') {
      return doGetDebug(e);
    }

    // Simple debug page
    if (params.test === 'true') {
      console.log('Serving debug HTML page');
      return HtmlService.createHtmlOutput(getDebugHTML())
        .setTitle('除錯模式')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    // Simplest test page
    if (params.simple === 'true') {
      console.log('Serving simple test page');
      return HtmlService.createHtmlOutput(getMainHTML())
        .setTitle('簡單測試')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    // Library test page
    if (params.libraries === 'true') {
      console.log('Serving library test page');
      return HtmlService.createHtmlOutput(getMainHTML())
        .setTitle('專案評分系統 - Library 測試')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    // Vue test page
    if (params.vuetest === 'true') {
      console.log('Serving Vue test page');
      return doGetVueTest();
    }

    // Vue debug page
    if (params.vuedebug === 'true') {
      console.log('Serving Vue debug page');
      return doGetVueDebug();
    }

    // Check if this is an API call (backward compatibility)
    if (params.path || params.api) {
      // Route to API handler
      return handleAPIRequest('GET', params.path || '', params);
    }

    // Default: serve HTML page
    return serveHtmlPage(e || {});

  } catch (error) {
    console.error('doGet error:', error);

    // Return HTML error page
    const errorMessage = error.toString();
    return HtmlService.createHtmlOutput(`
      <html>
        <head><title>Error</title></head>
        <body>
          <h1>抱歉，發生錯誤</h1>
          <p>錯誤訊息：${errorMessage}</p>
          <p>請稍後再試或聯繫管理員。</p>
        </body>
      </html>
    `)
      .setTitle('錯誤')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
}

/**
 * Web app POST handler
 * All POST requests are API calls
 * @param {Object} e - Event object containing POST data
 * @return {ContentService.TextOutput} JSON response
 */
function doPost(e) {
  try {
    const path = e.parameter.path || '';
    
    // Parse JSON body if present
    let postData = {};
    if (e.postData && e.postData.contents) {
      try {
        postData = JSON.parse(e.postData.contents);
      } catch (parseError) {
        console.warn('JSON parse error:', parseError.message);
      }
    }
    
    // Merge parameters
    const parameters = Object.assign({}, e.parameter, postData);
    
    return handleAPIRequest('POST', path, parameters);
    
  } catch (error) {
    console.error('doPost error:', error.message);
    return createJSONResponse(createErrorResponse('SYSTEM_ERROR', 'Server error'));
  }
}

/**
 * Serve HTML pages
 * @param {Object} e - Event object
 * @return {HtmlOutput} HTML page
 */
function serveHtmlPage(e) {
  try {
    console.log('Serving HTML page...');

    // Handle special pages
    if (e && e.parameter && e.parameter.action === 'resetPassword' && e.parameter.token) {
      // For special pages, create custom HTML with token
      const htmlContent = getMainHTML().replace('{{resetToken}}', e.parameter.token);
      return HtmlService.createHtmlOutput(htmlContent)
        .setTitle('評分系統 - 重設密碼')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    } else {
      // Default to main SPA page
      console.log('Getting main HTML content...');

      // Use only Vue frontend from frontend-vue/
      const htmlContent = getMainHTML();
      console.log('HTML content length:', htmlContent.length);

      // Check if HTML contains template syntax
      if (htmlContent.includes('<?=')) {
        console.log('Using HtmlTemplate for dynamic content');
        const template = HtmlService.createTemplate(htmlContent);
        const output = template.evaluate();
        output.setTitle('評分系統');
        output.addMetaTag('viewport', 'width=device-width, initial-scale=1');
        output.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
        return output;
      } else {
        const output = HtmlService.createHtmlOutput(htmlContent);
        output.setTitle('評分系統');
        output.addMetaTag('viewport', 'width=device-width, initial-scale=1');
        output.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
        return output;
      }
    }
  } catch (error) {
    console.error('Error in serveHtmlPage:', error);
    const errorMessage = error.toString();
    return HtmlService.createHtmlOutput(`
      <html>
        <head><title>Error</title></head>
        <body>
          <h1>載入錯誤</h1>
          <p>${errorMessage}</p>
        </body>
      </html>
    `).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
}

/**
 * Handle OPTIONS requests for CORS preflight
 * Note: GAS Web Apps automatically handle CORS when deployed as "Anyone" can access
 * This function is mainly for completeness
 * @param {Object} e - Event object
 * @return {ContentService.TextOutput} Empty response
 */
function doOptions(e) {
  // GAS doesn't support setHeaders(), but it handles CORS automatically
  // when the web app is deployed with "Anyone" access
  return ContentService
    .createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT);
}

// API handler will be provided by api_router.js

