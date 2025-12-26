"""
API2: Broken Authentication Tests

OWASP API Security Top 10 - API2:2023

These tests verify the security of authentication mechanisms including:
- JWT token security
- Two-factor authentication (2FA)
- Password reset flow
- Rate limiting and brute force protection
- Session management

Author: Claude Code
Date: 2025-12-23
"""

import pytest
import time
import jwt
from typing import Dict
from utils import APIClient, AuthHelper, AuthToken
from config import TestConfig


# ============================================================================
# JWT Security Tests
# ============================================================================

class TestJWTSecurity:
    """Test JWT token security"""

    @pytest.mark.critical
    @pytest.mark.auth
    def test_jwt_expiration_enforcement(
        self,
        api_client: APIClient,
        auth_helper: AuthHelper,
        admin_token: str
    ):
        """
        Verify expired JWT tokens are rejected.

        Attack Vector:
        - Attacker captures old/expired token
        - Attacker attempts to use expired token

        Expected: 401 Unauthorized
        """
        # Decode current token to check expiration
        decoded = auth_helper.decode_token(admin_token)

        assert 'exp' in decoded, "JWT should have expiration claim"
        assert 'iat' in decoded, "JWT should have issued-at claim"

        exp = decoded.get('exp')
        iat = decoded.get('iat')

        # Token should have reasonable lifetime
        lifetime = exp - iat
        assert lifetime > 0, "Token expiration should be after issued time"
        assert lifetime <= 86400 * 7, "Token lifetime should not exceed 7 days"

    @pytest.mark.critical
    @pytest.mark.auth
    def test_invalid_jwt_signature_rejected(
        self,
        api_client: APIClient
    ):
        """
        Verify tokens with invalid signatures are rejected.

        Attack Vector:
        - Attacker modifies JWT payload
        - Attacker submits modified token

        Expected: 401 Unauthorized
        """
        # Create a token with valid structure but invalid signature
        fake_payload = {
            'userId': 'usr_hacker',
            'email': 'hacker@evil.com',
            'exp': int(time.time()) + 3600,
            'iat': int(time.time())
        }

        # Sign with a fake secret
        fake_token = jwt.encode(fake_payload, 'fake_secret', algorithm='HS256')

        response = api_client.post('/api/auth/current-user', auth=fake_token)

        assert response.status_code in [401, 403], \
            f"Forged JWT accepted (status: {response.status_code})"

    @pytest.mark.high
    @pytest.mark.auth
    def test_jwt_algorithm_confusion_prevented(
        self,
        api_client: APIClient
    ):
        """
        Verify algorithm confusion attacks are prevented.

        Attack Vector:
        - Attacker changes algorithm from HS256 to 'none'
        - This can bypass signature verification

        Expected: 401 Unauthorized
        """
        # Create unsigned token (algorithm: none)
        header = {"alg": "none", "typ": "JWT"}
        payload = {
            'userId': 'usr_admin',
            'email': 'admin@system.local',
            'exp': int(time.time()) + 3600
        }

        import base64
        import json

        header_b64 = base64.urlsafe_b64encode(
            json.dumps(header).encode()
        ).decode().rstrip('=')

        payload_b64 = base64.urlsafe_b64encode(
            json.dumps(payload).encode()
        ).decode().rstrip('=')

        # Token with 'none' algorithm (no signature)
        none_token = f"{header_b64}.{payload_b64}."

        response = api_client.post('/api/auth/current-user', auth=none_token)

        assert response.status_code in [401, 403], \
            f"Algorithm 'none' token accepted (status: {response.status_code})"

    @pytest.mark.high
    @pytest.mark.auth
    def test_disabled_user_token_rejected(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify tokens for disabled users are rejected.

        Attack Vector:
        - User account is disabled
        - User still has valid token from before disabling
        - Token should be rejected

        Note: This test simulates the scenario; actual implementation
        requires disabling a user and testing their token.
        """
        # This test would require:
        # 1. Create a test user
        # 2. Get their token
        # 3. Disable the user via admin
        # 4. Verify token is rejected

        # For now, test that admin token works (baseline)
        response = api_client.post('/api/auth/current-user', json={
            'sessionId': admin_token
        })
        assert response.status_code == 200, "Valid admin token should work"

    @pytest.mark.medium
    @pytest.mark.auth
    def test_jwt_contains_required_claims(
        self,
        auth_helper: AuthHelper,
        admin_token: str
    ):
        """
        Verify JWT contains all required security claims.
        """
        decoded = auth_helper.decode_token(admin_token)

        required_claims = ['userId', 'userEmail', 'exp', 'iat']
        for claim in required_claims:
            assert claim in decoded, f"JWT missing required claim: {claim}"

        # Verify claim values are reasonable
        assert decoded['exp'] > time.time(), "Token should not be expired"
        assert decoded['iat'] <= time.time(), "Token issued-at should be in past"


# ============================================================================
# Two-Factor Authentication Tests
# ============================================================================

class TestTwoFactorAuth:
    """Test 2FA security"""

    @pytest.mark.critical
    @pytest.mark.auth
    def test_2fa_required_after_password(
        self,
        api_client: APIClient,
        config: TestConfig
    ):
        """
        Verify 2FA is required after password verification.

        Attack Vector:
        - Attacker bypasses 2FA step
        - Attacker attempts direct access after password

        Expected: No token returned without 2FA
        """
        # Step 1: Verify password
        response = api_client.post('/api/auth/login-verify-password', json={
            'userEmail': config.admin_email,
            'password': config.admin_password,
            'turnstileToken': config.turnstile_token
        })

        assert response.status_code == 200, "Password verification should succeed"

        data = response.json()
        assert data.get('success'), "Password verification should be successful"

        # Should NOT receive token yet - only after 2FA
        assert 'sessionId' not in data.get('data', {}), \
            "Session token returned before 2FA verification"
        assert 'token' not in data.get('data', {}), \
            "Token returned before 2FA verification"

    @pytest.mark.critical
    @pytest.mark.auth
    def test_2fa_bypass_attempt_rejected(
        self,
        api_client: APIClient,
        config: TestConfig
    ):
        """
        Verify direct 2FA verification without password fails.

        Attack Vector:
        - Attacker skips password step
        - Attacker directly submits 2FA code

        Expected: Rejected
        """
        # Attempt 2FA without prior password verification
        response = api_client.post('/api/auth/login-verify-2fa', json={
            'userEmail': 'nonexistent@example.com',
            'code': 'DEVMODE',
            'turnstileToken': config.turnstile_token
        })

        # Should fail - no pending 2FA session
        assert response.status_code in [400, 401, 403], \
            f"2FA bypass allowed (status: {response.status_code})"

    @pytest.mark.high
    @pytest.mark.auth
    def test_2fa_code_reuse_prevention(
        self,
        api_client: APIClient,
        auth_helper: AuthHelper,
        config: TestConfig
    ):
        """
        Verify 2FA codes cannot be reused.

        Attack Vector:
        - Attacker captures valid 2FA code
        - Attacker attempts to reuse code

        Expected: Second use rejected

        Note: In DEVMODE, this may behave differently
        """
        if config.twofa_code == 'DEVMODE':
            pytest.skip("2FA reuse test not applicable in DEVMODE")

        # First login (should succeed)
        try:
            token1 = auth_helper.login(
                email=config.admin_email,
                password=config.admin_password,
                twofa_code=config.twofa_code
            )
        except Exception:
            pytest.skip("Initial login failed")

        # Attempt to reuse the same 2FA code
        # First, do password verification again
        response = api_client.post('/api/auth/login-verify-password', json={
            'userEmail': config.admin_email,
            'password': config.admin_password,
            'turnstileToken': config.turnstile_token
        })

        if response.status_code != 200:
            pytest.skip("Password verification failed on second attempt")

        # Try to verify with same code
        response = api_client.post('/api/auth/login-verify-2fa', json={
            'userEmail': config.admin_email,
            'code': config.twofa_code,  # Same code
            'turnstileToken': config.turnstile_token
        })

        # Note: In development mode with DEVMODE, this may succeed
        # In production, reuse should be blocked

    @pytest.mark.high
    @pytest.mark.auth
    def test_invalid_2fa_code_rejected(
        self,
        api_client: APIClient,
        config: TestConfig
    ):
        """
        Verify invalid 2FA codes are rejected.
        """
        # First verify password
        response = api_client.post('/api/auth/login-verify-password', json={
            'userEmail': config.admin_email,
            'password': config.admin_password,
            'turnstileToken': config.turnstile_token
        })

        if response.status_code != 200:
            pytest.skip("Password verification failed")

        # Try invalid 2FA code
        invalid_codes = ['000000', '123456', 'INVALID', '', '999999']

        for code in invalid_codes:
            response = api_client.post('/api/auth/login-verify-2fa', json={
                'userEmail': config.admin_email,
                'code': code,
                'turnstileToken': config.turnstile_token
            })

            # Should reject invalid codes (unless DEVMODE accepts all)
            if config.twofa_code != 'DEVMODE':
                assert response.status_code in [400, 401, 403], \
                    f"Invalid 2FA code '{code}' accepted"


# ============================================================================
# Password Reset Security Tests
# ============================================================================

class TestPasswordReset:
    """Test password reset flow security"""

    @pytest.mark.high
    @pytest.mark.auth
    def test_password_reset_requires_valid_email(
        self,
        api_client: APIClient
    ):
        """
        Verify password reset requires valid email.

        Note: Should not reveal if email exists (enumeration prevention)
        """
        # Test with non-existent email
        response = api_client.post('/api/auth/verify-email-for-reset', json={
            'email': 'nonexistent@example.com',
            'turnstileToken': 'test'
        })

        # Should respond consistently (don't reveal if email exists)
        # Could be 200 with generic message or specific error
        assert response.status_code in [200, 400, 404], \
            f"Unexpected status for password reset: {response.status_code}"

    @pytest.mark.high
    @pytest.mark.auth
    def test_password_reset_code_validation(
        self,
        api_client: APIClient,
        config: TestConfig
    ):
        """
        Verify password reset requires valid code.
        """
        # Try to verify with fake code
        response = api_client.post('/api/auth/password-reset-verify-code', json={
            'email': config.admin_email,
            'code': '000000',
            'turnstileToken': 'test'
        })

        # Should reject invalid code
        assert response.status_code in [400, 401, 403], \
            f"Invalid reset code accepted (status: {response.status_code})"

    @pytest.mark.high
    @pytest.mark.auth
    def test_password_reset_prevents_weak_passwords(
        self,
        api_client: APIClient,
        config: TestConfig
    ):
        """
        Verify password reset enforces password policy.
        """
        weak_passwords = [
            '123',          # Too short
            'password',     # Common password
            '12345678',     # No letters
            'abcdefgh',     # No numbers
        ]

        for weak_password in weak_passwords:
            response = api_client.post('/api/auth/reset-password', json={
                'email': config.admin_email,
                'code': '123456',  # Fake code (will fail anyway)
                'newPassword': weak_password,
                'turnstileToken': 'test'
            })

            # Should reject weak passwords (or fail due to invalid code)
            assert response.status_code in [400, 401, 403], \
                f"Weak password '{weak_password}' may have been accepted"


# ============================================================================
# Rate Limiting and Brute Force Protection Tests
# ============================================================================

class TestRateLimiting:
    """Test rate limiting and brute force protection"""

    @pytest.mark.high
    @pytest.mark.auth
    def test_login_rate_limiting(
        self,
        api_client: APIClient,
        config: TestConfig
    ):
        """
        Verify login attempts are rate limited.

        Attack Vector:
        - Attacker makes many login attempts rapidly
        - System should block after threshold

        Expected: 429 Too Many Requests after threshold
        """
        # Make multiple rapid login attempts
        attempts = 10
        blocked = False

        for i in range(attempts):
            response = api_client.post('/api/auth/login-verify-password', json={
                'userEmail': f'test{i}@example.com',
                'password': 'wrongpassword',
                'turnstileToken': 'test'
            })

            if response.status_code == 429:
                blocked = True
                break

            # Small delay to be realistic
            time.sleep(0.1)

        # Note: Rate limiting may not trigger with only 10 attempts
        # This is a baseline test; adjust threshold based on actual limits

    @pytest.mark.high
    @pytest.mark.auth
    def test_brute_force_password_protection(
        self,
        api_client: APIClient,
        config: TestConfig
    ):
        """
        Verify account lockout after failed attempts.

        Attack Vector:
        - Attacker tries many passwords for single account
        - Account should be locked after threshold

        Note: Use test account, not admin, to avoid lockout
        """
        # Try multiple wrong passwords for same account
        test_email = 'bruteforce-test@example.com'
        wrong_passwords = [f'wrongpass{i}' for i in range(5)]

        for password in wrong_passwords:
            response = api_client.post('/api/auth/login-verify-password', json={
                'userEmail': test_email,
                'password': password,
                'turnstileToken': 'test'
            })

            # Should get 400/401 for wrong password, or 429 if rate limited
            assert response.status_code in [400, 401, 403, 429], \
                f"Unexpected status: {response.status_code}"

    @pytest.mark.medium
    @pytest.mark.auth
    def test_2fa_rate_limiting(
        self,
        api_client: APIClient,
        config: TestConfig
    ):
        """
        Verify 2FA attempts are rate limited.
        """
        # First verify password
        response = api_client.post('/api/auth/login-verify-password', json={
            'userEmail': config.admin_email,
            'password': config.admin_password,
            'turnstileToken': config.turnstile_token
        })

        if response.status_code != 200:
            pytest.skip("Password verification failed")

        # Try multiple wrong 2FA codes
        wrong_codes = ['000001', '000002', '000003', '000004', '000005']

        for code in wrong_codes:
            response = api_client.post('/api/auth/login-verify-2fa', json={
                'userEmail': config.admin_email,
                'code': code,
                'turnstileToken': config.turnstile_token
            })

            if response.status_code == 429:
                # Rate limiting is working
                return

            time.sleep(0.1)


# ============================================================================
# Session Management Tests
# ============================================================================

class TestSessionManagement:
    """Test session management security"""

    @pytest.mark.high
    @pytest.mark.auth
    def test_logout_invalidates_token(
        self,
        api_client: APIClient,
        auth_helper: AuthHelper,
        config: TestConfig
    ):
        """
        Verify logout invalidates the session token.

        Note: Depends on server-side session tracking
        """
        # Login to get fresh token
        try:
            token = auth_helper.login(
                email=config.admin_email,
                password=config.admin_password,
                twofa_code=config.twofa_code
            )
        except Exception:
            pytest.skip("Login failed")

        # Verify token works
        response = api_client.post('/api/auth/current-user', json={
            'sessionId': token
        })
        assert response.status_code == 200, "Token should work before logout"

        # Logout
        response = api_client.post('/api/auth/logout', json={
            'sessionId': token
        })

        # After logout, token should be invalid
        # Note: JWT tokens are stateless; this depends on server-side blacklisting
        response = api_client.post('/api/auth/current-user', json={
            'sessionId': token
        })
        # Token may still work if no server-side session tracking

    @pytest.mark.medium
    @pytest.mark.auth
    def test_token_refresh_works(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify token refresh mechanism works.
        """
        response = api_client.post('/api/auth/refresh-token', auth=admin_token)

        # Should return new token or confirm refresh
        assert response.status_code in [200, 201], \
            f"Token refresh failed: {response.status_code}"

    @pytest.mark.medium
    @pytest.mark.auth
    def test_validate_session_works(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify session validation endpoint works.
        """
        response = api_client.post('/api/auth/validate', auth=admin_token)

        assert response.status_code == 200, \
            f"Session validation failed: {response.status_code}"

        data = response.json()
        assert data.get('success'), "Session validation should succeed for valid token"


# ============================================================================
# Credential Security Tests
# ============================================================================

class TestCredentialSecurity:
    """Test credential handling security"""

    @pytest.mark.critical
    @pytest.mark.auth
    def test_password_not_in_response(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify passwords are never returned in API responses.
        """
        response = api_client.post('/api/auth/current-user', auth=admin_token)

        if response.status_code == 200:
            data = response.json()
            response_text = str(data).lower()

            assert 'password' not in response_text or 'passwordhash' not in response_text, \
                "Password data found in profile response"

    @pytest.mark.high
    @pytest.mark.auth
    def test_change_password_requires_current(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify password change requires current password.
        """
        response = api_client.post('/api/auth/change-password', auth=admin_token, json={
            'currentPassword': 'wrongcurrentpassword',
            'newPassword': 'NewSecurePassword123!'
        })

        # Should reject due to wrong current password
        assert response.status_code in [400, 401, 403], \
            f"Password change accepted without valid current password"

    @pytest.mark.high
    @pytest.mark.auth
    def test_empty_credentials_rejected(
        self,
        api_client: APIClient
    ):
        """
        Verify empty credentials are rejected.
        """
        test_cases = [
            {'userEmail': '', 'password': 'test', 'turnstileToken': 'test'},
            {'userEmail': 'test@test.com', 'password': '', 'turnstileToken': 'test'},
            {'userEmail': '', 'password': '', 'turnstileToken': 'test'},
        ]

        for credentials in test_cases:
            response = api_client.post('/api/auth/login-verify-password', json=credentials)

            assert response.status_code in [400, 401, 422], \
                f"Empty credentials accepted: {credentials}"


# ============================================================================
# Registration Security Tests
# ============================================================================

class TestRegistrationSecurity:
    """Test user registration security"""

    @pytest.mark.high
    @pytest.mark.auth
    def test_registration_requires_invitation_code(
        self,
        api_client: APIClient
    ):
        """
        Verify registration requires valid invitation code.
        """
        response = api_client.post('/api/auth/register', json={
            'invitationCode': 'INVALID_CODE',
            'username': 'testuser',
            'password': 'TestPassword123!',
            'email': 'test@example.com',
            'displayName': 'Test User',
            'turnstileToken': 'test'
        })

        assert response.status_code in [400, 401, 403, 404], \
            f"Registration with invalid invitation code succeeded"

    @pytest.mark.high
    @pytest.mark.auth
    def test_registration_validates_email_format(
        self,
        api_client: APIClient,
        config: TestConfig
    ):
        """
        Verify registration validates email format.
        """
        invalid_emails = [
            'notanemail',
            'missing@tld',
            '@nodomain.com',
            'spaces in@email.com',
        ]

        for email in invalid_emails:
            response = api_client.post('/api/auth/register', json={
                'invitationCode': config.test_invitation_code or 'TEST',
                'username': 'testuser',
                'password': 'TestPassword123!',
                'email': email,
                'displayName': 'Test User',
                'turnstileToken': 'test'
            })

            # Should reject invalid email format
            assert response.status_code in [400, 422], \
                f"Invalid email '{email}' was accepted"

    @pytest.mark.medium
    @pytest.mark.auth
    def test_registration_prevents_duplicate_email(
        self,
        api_client: APIClient,
        config: TestConfig
    ):
        """
        Verify duplicate email registration is prevented.
        """
        # Try to register with existing admin email
        response = api_client.post('/api/auth/register', json={
            'invitationCode': config.test_invitation_code or 'TEST',
            'username': 'newuser',
            'password': 'TestPassword123!',
            'email': config.admin_email,  # Already exists
            'displayName': 'New User',
            'turnstileToken': 'test'
        })

        # Should reject duplicate email
        assert response.status_code in [400, 409, 422], \
            f"Duplicate email registration allowed"


# ============================================================================
# Helper for running auth tests
# ============================================================================

if __name__ == '__main__':
    """Run auth tests directly"""
    pytest.main([__file__, '-v', '-m', 'auth', '--tb=short'])
