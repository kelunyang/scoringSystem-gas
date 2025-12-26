/**
 * @fileoverview User registration with invitation codes
 * @module Registration
 */

/**
 * Register new user with invitation code
 */
function registerUser(invitationCode, userData) {
  try {
    // Trim whitespace from invitation code to avoid copy-paste issues
    invitationCode = (invitationCode || '').trim();

    // Validate input
    if (!invitationCode || !userData) {
      return createErrorResponse('INVALID_INPUT', 'Invitation code and user data are required');
    }

    const requiredFields = ['username', 'password', 'userEmail', 'displayName'];
    const missingFields = validateRequiredFields(userData, requiredFields);
    if (missingFields.length > 0) {
      return createErrorResponse('INVALID_INPUT', 'Missing required fields: ' + missingFields.join(', '));
    }

    // Validate invitation code
    const invitationResult = validateInvitationCode(invitationCode);
    if (!invitationResult.success) {
      return invitationResult;
    }

    // Trim and sanitize user data to avoid copy-paste issues
    const sanitizedData = {
      username: sanitizeString((userData.username || '').trim(), 50),
      password: (userData.password || '').trim(), // Will be hashed
      userEmail: sanitizeString((userData.userEmail || '').trim(), 100).toLowerCase(),
      displayName: sanitizeString((userData.displayName || '').trim(), 100)
    };
    
    // Validate email format
    if (!validateEmail(sanitizedData.userEmail)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid email format');
    }
    
    // Validate username format
    if (!/^[a-zA-Z0-9_-]+$/.test(sanitizedData.username)) {
      return createErrorResponse('INVALID_INPUT', 'Username can only contain letters, numbers, underscore, and hyphen');
    }
    
    if (sanitizedData.username.length < 3 || sanitizedData.username.length > 20) {
      return createErrorResponse('INVALID_INPUT', 'Username must be 3-20 characters long');
    }
    
    // Validate password
    if (sanitizedData.password.length < 6) {
      return createErrorResponse('INVALID_INPUT', 'Password must be at least 6 characters long');
    }
    
    // Check if user already exists
    const existingUserResult = checkUserExists(sanitizedData.username, sanitizedData.userEmail);
    if (!existingUserResult.success) {
      return existingUserResult;
    }
    
    // Hash password
    const hashedPassword = hashPassword(sanitizedData.password);
    
    // Generate user ID
    const userId = generateIdWithType('user');
    const timestamp = getCurrentTimestamp();
    
    // Create user record
    const userRecord = {
      userId: userId,
      username: sanitizedData.username,
      password: hashedPassword,
      userEmail: sanitizedData.userEmail,
      displayName: sanitizedData.displayName,
      registrationTime: timestamp,
      lastLoginTime: null,
      status: 'active',
      preferences: safeJsonStringify({
        theme: 'light',
        lang: 'zh-TW'
      })
    };
    
    // Add user to database
    addRowToSheet(null, 'Users', userRecord);
    
    // Use invitation code
    const useResult = useInvitationCode(invitationCode, sanitizedData.userEmail);
    if (!useResult.success) {
      console.warn('Failed to mark invitation as used:', useResult.error.message);
      // Don't fail registration, but log the issue
    }
    
    // Log registration
    logOperation(sanitizedData.userEmail, 'user_registered', 'user', userId, {
      username: sanitizedData.username,
      invitationCode: invitationCode,
      registrationTime: timestamp
    });
    
    return createSuccessResponse({
      userId: userId,
      username: sanitizedData.username,
      userEmail: sanitizedData.userEmail,
      displayName: sanitizedData.displayName,
      registrationTime: timestamp
    }, 'User registered successfully');
    
  } catch (error) {
    console.error('User registration error:', error.message);
    return createErrorResponse('SYSTEM_ERROR', 'User registration failed');
  }
}

/**
 * Check if user already exists
 */
function checkUserExists(username, userEmail) {
  try {
    const globalData = readGlobalData();
    
    // Check username
    const existingUsername = globalData.users.find(u => 
      u.username.toLowerCase() === username.toLowerCase()
    );
    if (existingUsername) {
      return createErrorResponse('USER_EXISTS', 'Username is already taken');
    }
    
    // Check email
    const existingEmail = globalData.users.find(u => 
      u.userEmail.toLowerCase() === userEmail.toLowerCase()
    );
    if (existingEmail) {
      return createErrorResponse('USER_EXISTS', 'Email is already registered');
    }
    
    return createSuccessResponse({ available: true });
    
  } catch (error) {
    console.error('Check user exists error:', error.message);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to check user existence');
  }
}

/**
 * Handle registration request (API endpoint)
 */
function handleRegister(data) {
  try {
    if (!data.invitationCode || !data.userData) {
      return createErrorResponse('INVALID_INPUT', 'Invitation code and user data are required');
    }
    
    return registerUser(data.invitationCode, data.userData);
    
  } catch (error) {
    console.error('Handle register error:', error.message);
    return createErrorResponse('SYSTEM_ERROR', 'Registration request failed');
  }
}

/**
 * Check username availability
 */
function checkUsernameAvailability(username) {
  try {
    if (!username || typeof username !== 'string') {
      return createErrorResponse('INVALID_INPUT', 'Username is required');
    }
    
    const sanitizedUsername = sanitizeString(username, 20);
    
    if (sanitizedUsername.length < 3) {
      return createErrorResponse('INVALID_INPUT', 'Username too short');
    }
    
    const globalData = readGlobalData();
    const exists = globalData.users.some(u => 
      u.username.toLowerCase() === sanitizedUsername.toLowerCase()
    );
    
    return createSuccessResponse({
      username: sanitizedUsername,
      available: !exists
    });
    
  } catch (error) {
    console.error('Check username availability error:', error.message);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to check username availability');
  }
}

/**
 * Check email availability
 */
function checkEmailAvailability(userEmail) {
  try {
    if (!userEmail || typeof userEmail !== 'string') {
      return createErrorResponse('INVALID_INPUT', 'Email is required');
    }
    
    const sanitizedEmail = sanitizeString(userEmail, 100).toLowerCase();
    
    if (!validateEmail(sanitizedEmail)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid email format');
    }
    
    const globalData = readGlobalData();
    const exists = globalData.users.some(u => 
      u.userEmail.toLowerCase() === sanitizedEmail
    );
    
    return createSuccessResponse({
      userEmail: sanitizedEmail,
      available: !exists
    });
    
  } catch (error) {
    console.error('Check email availability error:', error.message);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to check email availability');
  }
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    registerUser,
    handleRegister,
    checkUserExists,
    checkUsernameAvailability,
    checkEmailAvailability
  };
}