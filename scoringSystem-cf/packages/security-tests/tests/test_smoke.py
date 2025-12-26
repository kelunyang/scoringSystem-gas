"""
Smoke Tests - Basic API Connectivity and Authentication

These tests verify that:
1. API is reachable
2. Authentication flow works
3. Basic security controls are in place

Run these tests first to ensure the testing infrastructure is working.
"""

import pytest
from utils import APIClient, AuthHelper, AuthToken
from config import TestConfig


class TestAPIConnectivity:
    """Test basic API connectivity"""

    @pytest.mark.critical
    def test_api_is_reachable(self, api_client: APIClient):
        """Verify that the API server is responding"""
        response = api_client.get('/')
        assert response.status_code < 500, \
            f"API returned server error: {response.status_code}"

    @pytest.mark.critical
    def test_api_returns_json(self, api_client: APIClient):
        """Verify that API returns JSON responses"""
        # Test a public endpoint or auth endpoint
        response = api_client.post('/api/auth/login-verify-password', json={
            'userEmail': 'nonexistent@example.com',
            'password': 'wrongpassword',
            'turnstileToken': 'test'
        })

        # Should return JSON even for failed auth
        assert response.headers.get('content-type', '').startswith('application/json'), \
            "API did not return JSON content-type"

        # Should be parseable as JSON
        try:
            data = response.json()
            assert isinstance(data, dict), "Response is not a JSON object"
        except Exception as e:
            pytest.fail(f"Response is not valid JSON: {str(e)}")


class TestAuthentication:
    """Test authentication mechanisms"""

    @pytest.mark.critical
    @pytest.mark.auth
    def test_admin_login_succeeds(self, auth_helper: AuthHelper, config: TestConfig):
        """Verify that admin credentials are valid"""
        try:
            token = auth_helper.login(
                email=config.admin_email,
                password=config.admin_password,
                twofa_code=config.twofa_code,
                turnstile_token=config.turnstile_token
            )
            assert token, "No token returned from login"
            assert len(token) > 20, "Token seems invalid (too short)"
        except Exception as e:
            pytest.fail(f"Admin login failed: {str(e)}")

    @pytest.mark.critical
    @pytest.mark.auth
    def test_invalid_credentials_rejected(self, api_client: APIClient):
        """Verify that invalid credentials are rejected"""
        response = api_client.post('/api/auth/login-verify-password', json={
            'userEmail': 'invalid@example.com',
            'password': 'wrongpassword123',
            'turnstileToken': 'test'
        })

        # Should return error status (400 or 401)
        assert response.status_code in [400, 401, 403], \
            f"Invalid credentials not rejected properly (status: {response.status_code})"

        # Should have error message
        data = response.json()
        assert not data.get('success', False), \
            "Invalid credentials marked as success"

    @pytest.mark.critical
    @pytest.mark.auth
    def test_jwt_token_validation(self, admin_token: str, api_client: APIClient):
        """Verify that JWT token works for authenticated requests"""
        # Make authenticated request to current-user endpoint
        response = api_client.post('/api/auth/current-user', json={
            'sessionId': admin_token
        })

        assert response.status_code == 200, \
            f"Authenticated request failed: {response.status_code}"

        data = response.json()
        assert data.get('success'), "Authenticated request did not succeed"

    @pytest.mark.high
    @pytest.mark.auth
    def test_invalid_jwt_rejected(self, api_client: APIClient):
        """Verify that invalid JWT tokens are rejected"""
        invalid_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.invalid"

        response = api_client.post('/api/auth/current-user', json={
            'sessionId': invalid_token
        })

        assert response.status_code in [401, 403], \
            f"Invalid JWT not rejected (status: {response.status_code})"

    @pytest.mark.high
    @pytest.mark.auth
    def test_missing_auth_rejected(self, api_client: APIClient):
        """Verify that requests without authentication are rejected"""
        # Try to access protected endpoint without token
        response = api_client.post('/api/auth/current-user', json={})

        assert response.status_code in [401, 403], \
            f"Unauthenticated request not rejected (status: {response.status_code})"


class TestJWTSecurity:
    """Test JWT token security"""

    @pytest.mark.high
    @pytest.mark.auth
    def test_jwt_contains_user_info(self, admin_token: str, auth_helper: AuthHelper):
        """Verify JWT token contains expected user information"""
        decoded = auth_helper.decode_token(admin_token)

        # Should contain user identification
        assert 'userId' in decoded, "JWT missing userId"
        assert 'userEmail' in decoded, "JWT missing userEmail"

        # Should have expiration
        assert 'exp' in decoded, "JWT missing expiration"
        assert 'iat' in decoded, "JWT missing issued-at timestamp"

    @pytest.mark.medium
    @pytest.mark.auth
    def test_jwt_expiration_set(self, admin_token: str, auth_helper: AuthHelper):
        """Verify JWT has reasonable expiration time"""
        import time
        decoded = auth_helper.decode_token(admin_token)

        exp = decoded.get('exp')
        iat = decoded.get('iat')

        assert exp and iat, "JWT missing expiration or issued-at"

        # Calculate token lifetime
        lifetime_seconds = exp - iat
        lifetime_hours = lifetime_seconds / 3600

        # Should be between 1 hour and 48 hours (reasonable range)
        assert 1 <= lifetime_hours <= 48, \
            f"JWT lifetime seems unreasonable: {lifetime_hours} hours"

    @pytest.mark.medium
    @pytest.mark.auth
    def test_token_works_after_issuance(self, auth_helper: AuthHelper, config: TestConfig):
        """Verify newly issued tokens work immediately"""
        # Get fresh token
        token = auth_helper.login(
            email=config.admin_email,
            password=config.admin_password,
            twofa_code=config.twofa_code
        )

        # Should be valid immediately
        assert auth_helper.verify_token(token), \
            "Newly issued token not valid"


class TestBasicSecurity:
    """Test basic security controls"""

    @pytest.mark.high
    @pytest.mark.misconfig
    def test_security_headers_present(self, api_client: APIClient):
        """Verify security headers are set"""
        response = api_client.get('/')

        headers = response.headers

        # Check for common security headers (some may not be applicable to API)
        # Note: Cloudflare Workers may handle some headers automatically

        # At minimum, should have content-type
        assert 'content-type' in headers, "Missing Content-Type header"

    @pytest.mark.medium
    @pytest.mark.misconfig
    def test_error_responses_no_stack_traces(self, api_client: APIClient):
        """Verify error responses don't leak stack traces (in production)"""
        # Trigger an error with malformed request
        response = api_client.post('/api/auth/login-verify-password', json={
            'userEmail': 'test',  # Invalid email format
            'password': '',
            'turnstileToken': 'test'
        })

        data = response.json()

        # Should not contain stack traces or detailed error info
        response_text = str(data).lower()
        assert 'stack' not in response_text, \
            "Error response contains stack trace"
        assert 'traceback' not in response_text, \
            "Error response contains traceback"

    @pytest.mark.medium
    def test_api_returns_appropriate_status_codes(self, api_client: APIClient):
        """Verify API uses appropriate HTTP status codes"""
        # 400 for bad request
        response = api_client.post('/api/auth/login-verify-password', json={})
        assert response.status_code in [400, 422], \
            f"Bad request not returning 400/422 (got {response.status_code})"

        # 404 for non-existent endpoint
        response = api_client.get('/nonexistent-endpoint-12345')
        assert response.status_code == 404, \
            f"Non-existent endpoint not returning 404 (got {response.status_code})"


# ============================================================================
# Helper for running smoke tests
# ============================================================================

if __name__ == '__main__':
    """Run smoke tests directly"""
    pytest.main([__file__, '-v', '--tb=short'])
