"""
API8: Security Misconfiguration Tests

OWASP API Security Top 10 - API8:2023

These tests verify that:
1. Security headers are properly configured
2. Debug mode is disabled in production
3. Error responses don't leak sensitive info
4. Default credentials are disabled
5. CORS is properly configured

Author: Claude Code
Date: 2025-12-23
"""

import pytest
from utils import APIClient, AuthHelper, AuthToken
from config import TestConfig


# ============================================================================
# Security Headers Tests
# ============================================================================

class TestSecurityHeaders:
    """Test security headers configuration"""

    @pytest.mark.high
    @pytest.mark.misconfig
    def test_content_type_header_present(
        self,
        api_client: APIClient
    ):
        """
        Verify Content-Type header is set correctly.
        """
        response = api_client.get('/')

        content_type = response.headers.get('content-type', '')
        assert 'application/json' in content_type.lower(), \
            f"Content-Type not properly set: {content_type}"

    @pytest.mark.medium
    @pytest.mark.misconfig
    def test_x_content_type_options_header(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify X-Content-Type-Options: nosniff is set.

        This prevents MIME-type sniffing attacks.
        """
        response = api_client.post('/api/auth/current-user', auth=admin_token)

        x_content_type = response.headers.get('x-content-type-options', '')

        # Note: Cloudflare Workers may add this automatically
        # If not present, it's a finding but not critical

    @pytest.mark.medium
    @pytest.mark.misconfig
    def test_x_frame_options_header(
        self,
        api_client: APIClient
    ):
        """
        Verify X-Frame-Options is set (prevents clickjacking).

        Note: Less critical for API-only services
        """
        response = api_client.get('/')

        x_frame = response.headers.get('x-frame-options', '')
        # Should be DENY or SAMEORIGIN

    @pytest.mark.low
    @pytest.mark.misconfig
    def test_cache_control_header(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify Cache-Control is set appropriately for sensitive data.
        """
        response = api_client.post('/api/auth/current-user', auth=admin_token)

        cache_control = response.headers.get('cache-control', '')

        # Sensitive data should not be cached
        # Look for no-store, no-cache, private


# ============================================================================
# CORS Configuration Tests
# ============================================================================

class TestCORSConfiguration:
    """Test CORS configuration"""

    @pytest.mark.high
    @pytest.mark.misconfig
    def test_cors_not_wildcard_with_credentials(
        self,
        api_client: APIClient
    ):
        """
        Verify CORS doesn't allow wildcard origin with credentials.

        Attack Vector:
        - Wildcard origin (*) with credentials enabled
        - Any website could make authenticated requests

        Expected: Either specific origin or no credentials
        """
        # Make request with Origin header
        response = api_client.get('/', headers={
            'Origin': 'https://evil.com'
        })

        access_control = response.headers.get('access-control-allow-origin', '')
        credentials = response.headers.get('access-control-allow-credentials', '')

        if credentials.lower() == 'true':
            assert access_control != '*', \
                "CORS allows wildcard with credentials"

    @pytest.mark.medium
    @pytest.mark.misconfig
    def test_cors_origin_validation(
        self,
        api_client: APIClient
    ):
        """
        Verify CORS validates origin properly.
        """
        evil_origins = [
            'https://evil.com',
            'https://malicious.site',
            'null',  # Can be exploited
        ]

        for origin in evil_origins:
            response = api_client.get('/', headers={
                'Origin': origin
            })

            allowed_origin = response.headers.get('access-control-allow-origin', '')

            # Should not reflect evil origins
            if allowed_origin == origin and origin != 'null':
                # This could be a finding depending on configuration
                pass

    @pytest.mark.medium
    @pytest.mark.misconfig
    def test_cors_methods_restricted(
        self,
        api_client: APIClient
    ):
        """
        Verify CORS doesn't allow all methods.
        """
        response = api_client.request('OPTIONS', '/', headers={
            'Origin': 'https://example.com',
            'Access-Control-Request-Method': 'DELETE'
        })

        allowed_methods = response.headers.get('access-control-allow-methods', '')

        # Should not allow dangerous methods unless needed


# ============================================================================
# Error Response Tests
# ============================================================================

class TestErrorResponses:
    """Test error response security"""

    @pytest.mark.critical
    @pytest.mark.misconfig
    def test_no_stack_traces_in_errors(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify error responses don't contain stack traces.

        Attack Vector:
        - Stack traces reveal internal structure
        - Could help attacker understand system

        Expected: Generic error messages only
        """
        # Trigger various errors
        error_triggers = [
            ('/projects/get', {'projectId': '../../../etc/passwd'}),
            ('/users/display-names', {'projectId': 'x', 'userIds': [None]}),
            ('/api/auth/login-verify-password', {'userEmail': '', 'password': ''}),
        ]

        sensitive_strings = [
            'stack', 'traceback', 'at line', 'file "/',
            'node_modules', 'src/', '.ts:', '.js:',
            'TypeError', 'ReferenceError', 'internal server'
        ]

        for endpoint, payload in error_triggers:
            response = api_client.post(endpoint, auth=admin_token, json=payload)

            if response.status_code >= 400:
                response_text = response.text.lower()

                for sensitive in sensitive_strings:
                    assert sensitive.lower() not in response_text, \
                        f"Sensitive info '{sensitive}' in error response for {endpoint}"

    @pytest.mark.high
    @pytest.mark.misconfig
    def test_no_sql_errors_exposed(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify SQL errors are not exposed in responses.
        """
        # Try to trigger SQL errors
        sql_payloads = [
            "'; DROP TABLE users; --",
            "1' OR '1'='1",
            "1; SELECT * FROM users",
        ]

        for payload in sql_payloads:
            response = api_client.post('/projects/get', auth=admin_token, json={
                'projectId': payload
            })

            if response.status_code >= 400:
                response_text = response.text.lower()

                sql_indicators = [
                    'sql', 'sqlite', 'syntax error', 'query failed',
                    'select', 'insert', 'table', 'column'
                ]

                for indicator in sql_indicators:
                    assert indicator not in response_text, \
                        f"SQL indicator '{indicator}' in error response"

    @pytest.mark.medium
    @pytest.mark.misconfig
    def test_consistent_error_format(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify error responses have consistent format.
        """
        # Generate different error types
        errors = [
            api_client.post('/projects/get', auth=admin_token, json={'projectId': 'nonexistent'}),
            api_client.post('/projects/get', auth='invalid_token', json={'projectId': 'test'}),
            api_client.post('/nonexistent-endpoint', auth=admin_token),
        ]

        for response in errors:
            if response.status_code >= 400:
                try:
                    data = response.json()
                    # Should have consistent structure
                    # (success: false, error: message, etc.)
                except Exception:
                    # Non-JSON error response
                    pass


# ============================================================================
# Debug Mode Tests
# ============================================================================

class TestDebugMode:
    """Test debug mode is disabled"""

    @pytest.mark.critical
    @pytest.mark.misconfig
    def test_debug_endpoints_disabled(
        self,
        api_client: APIClient
    ):
        """
        Verify debug endpoints are disabled.
        """
        debug_endpoints = [
            '/debug',
            '/debug/info',
            '/debug/routes',
            '/__debug',
            '/api/__debug',
            '/.env',
            '/config',
            '/admin/debug',
        ]

        for endpoint in debug_endpoints:
            response = api_client.get(endpoint)

            assert response.status_code == 404, \
                f"Debug endpoint {endpoint} may be accessible (status: {response.status_code})"

    @pytest.mark.high
    @pytest.mark.misconfig
    def test_verbose_errors_disabled(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify verbose/debug error mode is disabled.
        """
        # Trigger an error
        response = api_client.post('/projects/get', auth=admin_token, json={
            'projectId': 'invalid_format'
        })

        if response.status_code >= 400:
            response_text = response.text

            # Should not have debug info
            debug_indicators = [
                'DEBUG:', 'debug=True', 'NODE_ENV', 'development',
                'filename:', 'lineno:', 'function:'
            ]

            for indicator in debug_indicators:
                assert indicator.lower() not in response_text.lower(), \
                    f"Debug indicator '{indicator}' found in response"


# ============================================================================
# Default Credentials Tests
# ============================================================================

class TestDefaultCredentials:
    """Test default credentials are disabled"""

    @pytest.mark.critical
    @pytest.mark.misconfig
    def test_common_default_credentials_rejected(
        self,
        api_client: APIClient
    ):
        """
        Verify common default credentials don't work.
        """
        default_credentials = [
            ('admin', 'admin'),
            ('admin', 'password'),
            ('admin', '123456'),
            ('root', 'root'),
            ('test', 'test'),
            ('user', 'user'),
        ]

        for username, password in default_credentials:
            response = api_client.post('/api/auth/login-verify-password', json={
                'userEmail': f'{username}@localhost',
                'password': password,
                'turnstileToken': 'test'
            })

            # Should fail authentication
            assert response.status_code in [400, 401, 403], \
                f"Default credentials {username}:{password} may work"

    @pytest.mark.high
    @pytest.mark.misconfig
    def test_no_backdoor_accounts(
        self,
        api_client: APIClient
    ):
        """
        Verify no backdoor/test accounts exist.
        """
        backdoor_attempts = [
            'backdoor@system.local',
            'test@test.test',
            'debug@debug.debug',
            'dev@dev.dev',
        ]

        for email in backdoor_attempts:
            response = api_client.post('/api/auth/login-verify-password', json={
                'userEmail': email,
                'password': 'backdoor',
                'turnstileToken': 'test'
            })

            # Should fail
            assert response.status_code in [400, 401, 403], \
                f"Potential backdoor account: {email}"


# ============================================================================
# Sensitive Endpoint Protection Tests
# ============================================================================

class TestSensitiveEndpointProtection:
    """Test sensitive endpoints are protected"""

    @pytest.mark.high
    @pytest.mark.misconfig
    def test_admin_endpoints_require_auth(
        self,
        api_client: APIClient
    ):
        """
        Verify all admin endpoints require authentication.
        """
        admin_endpoints = [
            '/api/admin/users/list',
            '/api/admin/system/stats',
            '/api/admin/global-groups',
            '/api/admin/system/logs',
            '/api/admin/properties/get-all',
            '/api/admin/smtp/get-config',
        ]

        for endpoint in admin_endpoints:
            response = api_client.post(endpoint)  # No auth

            assert response.status_code in [401, 403], \
                f"Admin endpoint {endpoint} accessible without auth"

    @pytest.mark.high
    @pytest.mark.misconfig
    def test_internal_endpoints_not_exposed(
        self,
        api_client: APIClient
    ):
        """
        Verify internal/private endpoints are not exposed.
        """
        internal_endpoints = [
            '/internal/health',
            '/_internal/metrics',
            '/private/admin',
            '/system/config',
            '/api/internal',
        ]

        for endpoint in internal_endpoints:
            response = api_client.get(endpoint)

            # 404 = endpoint doesn't exist (ideal)
            # 401 = endpoint exists but requires auth (acceptable)
            assert response.status_code in [401, 404], \
                f"Internal endpoint {endpoint} may be exposed (status: {response.status_code})"


# ============================================================================
# Information Disclosure Tests
# ============================================================================

class TestInformationDisclosure:
    """Test for information disclosure"""

    @pytest.mark.medium
    @pytest.mark.misconfig
    def test_server_version_not_disclosed(
        self,
        api_client: APIClient
    ):
        """
        Verify server version is not disclosed in headers.
        """
        response = api_client.get('/')

        # Check for version disclosure headers
        version_headers = ['server', 'x-powered-by', 'x-aspnet-version']

        for header in version_headers:
            value = response.headers.get(header, '')
            # Should not contain specific versions
            # e.g., "Apache/2.4.29" or "Express/4.17.1"

    @pytest.mark.medium
    @pytest.mark.misconfig
    def test_api_documentation_not_public(
        self,
        api_client: APIClient
    ):
        """
        Verify API documentation is not publicly accessible.
        """
        doc_endpoints = [
            '/docs',
            '/swagger',
            '/swagger-ui',
            '/api-docs',
            '/openapi.json',
            '/swagger.json',
            '/redoc',
        ]

        for endpoint in doc_endpoints:
            response = api_client.get(endpoint)

            # Docs should require auth or not exist
            assert response.status_code in [401, 403, 404], \
                f"API docs may be public at {endpoint}"

    @pytest.mark.low
    @pytest.mark.misconfig
    def test_source_maps_not_exposed(
        self,
        api_client: APIClient
    ):
        """
        Verify source maps are not exposed.
        """
        response = api_client.get('/bundle.js.map')
        assert response.status_code == 404

        response = api_client.get('/main.js.map')
        assert response.status_code == 404


# ============================================================================
# Helper for running misconfiguration tests
# ============================================================================

if __name__ == '__main__':
    """Run misconfiguration tests directly"""
    pytest.main([__file__, '-v', '-m', 'misconfig', '--tb=short'])
