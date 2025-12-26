/**
 * @fileoverview Cloudflare Turnstile 驗證模組
 * @module TurnstileVerify
 *
 * 提供 Cloudflare Turnstile CAPTCHA 驗證功能
 * 用於防止機器人攻擊和暴力破解
 */

/**
 * 驗證 Turnstile token
 * @param {string} token - 前端獲取的 Turnstile token
 * @param {string} remoteIp - 使用者 IP 地址（可選）
 * @returns {Object} 驗證結果
 */
function verifyTurnstileToken(token, remoteIp) {
  try {
    // 檢查是否啟用 Turnstile
    const properties = PropertiesService.getScriptProperties();
    const enabled = properties.getProperty('TURNSTILE_ENABLED') === 'true';

    if (!enabled) {
      // 未啟用時直接通過
      return {
        success: true,
        bypassed: true,
        message: 'Turnstile verification is disabled'
      };
    }

    // 檢查 token 是否存在
    if (!token) {
      return {
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: '缺少驗證 token'
        }
      };
    }

    // 獲取 Secret Key
    const secretKey = properties.getProperty('TURNSTILE_SECRET_KEY');
    if (!secretKey) {
      console.error('TURNSTILE_SECRET_KEY 未設定');
      return {
        success: false,
        error: {
          code: 'CONFIGURATION_ERROR',
          message: '系統配置錯誤，請聯繫管理員'
        }
      };
    }

    // 呼叫 Cloudflare Turnstile API 驗證
    const verifyUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

    // 使用 application/x-www-form-urlencoded 格式（Turnstile API 標準格式）
    const formData = {
      secret: secretKey,
      response: token
    };

    // 如果有 IP，加入驗證參數
    if (remoteIp) {
      formData.remoteip = remoteIp;
    }

    const options = {
      method: 'post',
      contentType: 'application/x-www-form-urlencoded',
      payload: formData,
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(verifyUrl, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    // 解析回應
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      console.error('無法解析 Turnstile API 回應:', responseText);
      return {
        success: false,
        error: {
          code: 'API_PARSE_ERROR',
          message: '驗證服務回應格式錯誤'
        }
      };
    }

    // 檢查驗證結果
    if (responseCode !== 200) {
      console.error('Turnstile API 返回錯誤狀態:', responseCode, result);
      return {
        success: false,
        error: {
          code: 'API_ERROR',
          message: '驗證服務暫時無法使用，請稍後再試',
          details: result
        }
      };
    }

    if (!result.success) {
      // 驗證失敗
      const errorCodes = result['error-codes'] || [];
      console.warn('Turnstile 驗證失敗:', errorCodes);

      return {
        success: false,
        error: {
          code: 'VERIFICATION_FAILED',
          message: '驗證失敗，請重新嘗試',
          errorCodes: errorCodes
        }
      };
    }

    // 驗證成功
    return {
      success: true,
      data: {
        challengeTimestamp: result.challenge_ts,
        hostname: result.hostname
      }
    };

  } catch (error) {
    console.error('Turnstile 驗證過程發生錯誤:', error);
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '驗證過程發生錯誤',
        details: error.toString()
      }
    };
  }
}

/**
 * 獲取 Turnstile 配置（僅返回公開資訊）
 * @returns {Object} Turnstile 配置
 */
function getTurnstileConfig() {
  const properties = PropertiesService.getScriptProperties();

  return {
    success: true,
    data: {
      enabled: properties.getProperty('TURNSTILE_ENABLED') === 'true',
      siteKey: properties.getProperty('TURNSTILE_SITE_KEY')
      // 注意：絕不回傳 Secret Key
    }
  };
}

/**
 * 檢查 Turnstile 配置是否完整
 * @returns {Object} 配置檢查結果
 */
function checkTurnstileConfiguration() {
  const properties = PropertiesService.getScriptProperties();

  const siteKey = properties.getProperty('TURNSTILE_SITE_KEY');
  const secretKey = properties.getProperty('TURNSTILE_SECRET_KEY');
  const enabled = properties.getProperty('TURNSTILE_ENABLED');

  const issues = [];

  if (!siteKey) {
    issues.push('TURNSTILE_SITE_KEY 未設定');
  }

  if (!secretKey) {
    issues.push('TURNSTILE_SECRET_KEY 未設定');
  }

  if (!enabled) {
    issues.push('TURNSTILE_ENABLED 未設定（預設為 false）');
  }

  return {
    success: issues.length === 0,
    configured: siteKey && secretKey,
    enabled: enabled === 'true',
    issues: issues
  };
}

/**
 * 測試 Turnstile 配置
 * 使用測試 token 驗證配置是否正確
 * @returns {Object} 測試結果
 */
function testTurnstileConfiguration() {
  const configCheck = checkTurnstileConfiguration();

  if (!configCheck.configured) {
    return {
      success: false,
      message: 'Turnstile 配置不完整',
      issues: configCheck.issues
    };
  }

  // 注意：實際測試需要有效的 token
  // 這裡只檢查配置是否設定
  return {
    success: true,
    message: 'Turnstile 配置檢查通過',
    enabled: configCheck.enabled,
    note: '實際驗證需要前端提供有效的 token'
  };
}
