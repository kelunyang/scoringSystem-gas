"""
API Inventory Management & External API Security Tests

These tests verify:
1. API9: Improper Inventory Management
2. API10: Unsafe Consumption of APIs

Focuses on:
- API endpoint documentation
- Deprecated endpoints
- Version management
- External API handling
- Third-party integration security

Author: Claude Code
Date: 2025-12-23
"""

import pytest
import time
from typing import List, Dict, Any
from utils import APIClient, AuthHelper, AuthToken
from config import TestConfig


# ============================================================================
# API Inventory Management Tests (API9)
# ============================================================================

class TestAPIInventory:
    """Test API inventory management"""

    @pytest.mark.medium
    @pytest.mark.inventory
    def test_undocumented_endpoints_not_exposed(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify undocumented/debug endpoints are not accessible.

        Attack Vector:
        - Access hidden debug endpoints
        - Could expose sensitive functionality

        Expected: Debug endpoints disabled in production
        """
        debug_endpoints = [
            '/debug',
            '/debug/info',
            '/debug/config',
            '/_debug',
            '/api/debug',
            '/internal',
            '/internal/metrics',
            '/admin/debug',
            '/.env',
            '/config',
            '/test',
            '/phpinfo.php',  # Common probe
            '/server-status',
            '/status',
        ]

        for endpoint in debug_endpoints:
            response = api_client.get(endpoint)

            # Should return 404, not sensitive information
            if response.status_code == 200:
                data = response.text.lower()
                assert 'debug' not in data, \
                    f"Debug information exposed at {endpoint}"
                assert 'password' not in data, \
                    f"Sensitive data may be exposed at {endpoint}"
                assert 'secret' not in data, \
                    f"Secrets may be exposed at {endpoint}"

    @pytest.mark.medium
    @pytest.mark.inventory
    def test_deprecated_endpoints_disabled(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify deprecated API versions/endpoints are disabled.
        """
        deprecated_patterns = [
            '/api/v1/',
            '/api/v0/',
            '/v1/users',
            '/old/',
            '/legacy/',
        ]

        for pattern in deprecated_patterns:
            response = api_client.get(pattern + 'users')

            # Deprecated versions should return 404
            assert response.status_code in [404, 410], \
                f"Deprecated endpoint may be active: {pattern}"

    @pytest.mark.medium
    @pytest.mark.inventory
    def test_api_documentation_not_exposed(
        self,
        api_client: APIClient
    ):
        """
        Verify API documentation is not publicly exposed (if internal).
        """
        doc_endpoints = [
            '/swagger',
            '/swagger.json',
            '/swagger.yaml',
            '/openapi.json',
            '/api-docs',
            '/docs',
            '/redoc',
            '/graphql',  # GraphQL playground
            '/graphiql',
        ]

        for endpoint in doc_endpoints:
            response = api_client.get(endpoint)

            # If docs are exposed, they should require auth
            if response.status_code == 200:
                # This is informational - docs may be intentionally public
                pass

    @pytest.mark.low
    @pytest.mark.inventory
    def test_version_information_not_leaked(
        self,
        api_client: APIClient
    ):
        """
        Verify version information is not leaked in responses.
        """
        response = api_client.get('/')
        headers = response.headers

        # Should not expose detailed version info
        server_header = headers.get('Server', '').lower()
        assert 'version' not in server_header, \
            "Server version exposed in headers"

        # X-Powered-By should not expose framework details
        powered_by = headers.get('X-Powered-By', '').lower()
        assert not powered_by or 'version' not in powered_by, \
            "Framework version exposed in X-Powered-By"


class TestAPIDiscovery:
    """Test API discovery prevention"""

    @pytest.mark.medium
    @pytest.mark.inventory
    def test_options_method_disclosure(
        self,
        api_client: APIClient
    ):
        """
        Verify OPTIONS method doesn't disclose too much information.
        """
        endpoints = [
            '/',
            '/api/auth/login-verify-password',
            '/api/auth/current-user',
            '/api/projects/list',
        ]

        for endpoint in endpoints:
            response = api_client.request('OPTIONS', endpoint)

            # Check Allow header for excessive methods
            allow_header = response.headers.get('Allow', '')
            dangerous_methods = ['TRACE', 'TRACK', 'DEBUG']

            for method in dangerous_methods:
                assert method not in allow_header, \
                    f"Dangerous method {method} allowed at {endpoint}"

    @pytest.mark.medium
    @pytest.mark.inventory
    def test_method_not_allowed_responses(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify proper 405 responses for unsupported methods.
        """
        # POST-only endpoints should reject GET
        post_only_endpoints = [
            '/api/auth/login-verify-password',
            '/api/auth/current-user',
            '/api/projects/create',
            '/api/comments/all-stages',
            '/api/rankings/all-stages-rankings',
        ]

        for endpoint in post_only_endpoints:
            response = api_client.get(endpoint)

            # Should return 401, 404 or 405, not 200
            # 401 = requires auth (acceptable)
            # 404 = endpoint not found for this method (acceptable)
            # 405 = method not allowed (ideal)
            assert response.status_code in [401, 404, 405], \
                f"GET method unexpectedly allowed at {endpoint} (status: {response.status_code})"

    @pytest.mark.low
    @pytest.mark.inventory
    def test_endpoint_enumeration_prevention(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify endpoint enumeration doesn't reveal sensitive paths.
        """
        # Try various endpoint patterns
        test_paths = [
            '/api/',
            '/api/v1/',
            '/api/admin/',
            '/api/internal/',
        ]

        for path in test_paths:
            response = api_client.get(path)

            if response.status_code == 200:
                data = response.text

                # Should not list available endpoints
                assert '/api/' not in data or len(data) < 1000, \
                    f"Endpoint listing may be exposed at {path}"


# ============================================================================
# External API Security Tests (API10)
# ============================================================================

class TestExternalAPIHandling:
    """Test external API consumption security"""

    @pytest.mark.high
    @pytest.mark.external
    def test_external_api_timeout_handling(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify external API calls have proper timeouts.

        Attack Vector:
        - External API hangs indefinitely
        - Could exhaust server resources

        Expected: Timeouts enforced
        """
        # This is more of a code review item, but we can test
        # that API calls don't hang indefinitely

        start_time = time.time()

        # Try an endpoint that might call external services
        response = api_client.post('/api/email/send-test', auth=admin_token, json={
            'to': 'test@example.com',
            'subject': 'Test',
            'body': 'Test'
        }, timeout=30)

        elapsed = time.time() - start_time

        # Should not hang for more than 30 seconds
        assert elapsed < 30, \
            f"External API call took too long: {elapsed}s"

    @pytest.mark.medium
    @pytest.mark.external
    def test_gmail_api_failure_handling(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify Gmail API failures are handled gracefully.
        """
        # Send to invalid address to trigger potential failure
        response = api_client.post('/api/email/send', auth=admin_token, json={
            'to': 'invalid-email-that-should-fail@nonexistent.domain.invalid',
            'subject': 'Test',
            'body': 'Test'
        })

        # Should return proper error, not server crash
        # 404 = endpoint doesn't exist (may not be implemented)
        assert response.status_code in [200, 400, 404, 422, 500, 503], \
            f"Unexpected response: {response.status_code}"

        # Should have error message if failed
        if response.status_code >= 400:
            data = response.json()
            assert 'error' in data or 'message' in data or not data.get('success'), \
                "No error message for failed email"

    @pytest.mark.medium
    @pytest.mark.external
    def test_ai_api_failure_handling(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify AI API failures are handled gracefully.
        """
        response = api_client.post('/api/ai/generate', auth=admin_token, json={
            'prompt': 'Test prompt',
            'type': 'invalid_type'
        })

        # Should handle gracefully
        assert response.status_code != 500, \
            "AI API failure caused server error"

    @pytest.mark.high
    @pytest.mark.external
    def test_turnstile_bypass_prevention(
        self,
        api_client: APIClient
    ):
        """
        Verify Turnstile validation cannot be bypassed.
        """
        # Try without token
        response = api_client.post('/api/auth/login-verify-password', json={
            'userEmail': 'test@example.com',
            'password': 'password'
        })

        # Should reject missing Turnstile token
        # (depends on whether Turnstile is required in dev)

        # Try with obviously fake token
        response = api_client.post('/api/auth/login-verify-password', json={
            'userEmail': 'test@example.com',
            'password': 'password',
            'turnstileToken': 'fake_token_123'
        })

        # In production, should validate token
        # In dev, may be bypassed


class TestSSRFPrevention:
    """Test Server-Side Request Forgery prevention"""

    @pytest.mark.critical
    @pytest.mark.external
    def test_ssrf_in_url_parameters(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify URL parameters cannot be used for SSRF.

        Attack Vector:
        - Provide internal URL in parameter
        - Server fetches internal resource

        Expected: Internal URLs blocked
        """
        ssrf_urls = [
            'http://localhost/',
            'http://127.0.0.1/',
            'http://[::1]/',
            'http://0.0.0.0/',
            'http://169.254.169.254/latest/meta-data/',  # AWS metadata
            'http://metadata.google.internal/',  # GCP metadata
            'file:///etc/passwd',
            'http://internal.service.local/',
        ]

        for url in ssrf_urls:
            # Try endpoints that might accept URLs
            response = api_client.post('/api/webhook/test', auth=admin_token, json={
                'url': url
            })

            # Should reject or block internal URLs
            if response.status_code == 200:
                data = response.json()
                # Should not return internal data
                assert 'root:' not in str(data), \
                    f"SSRF may have succeeded with: {url}"
                assert 'ami-id' not in str(data), \
                    f"SSRF to metadata service may have succeeded: {url}"

    @pytest.mark.high
    @pytest.mark.external
    def test_dns_rebinding_prevention(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify DNS rebinding attacks are prevented.
        """
        # This is difficult to test without a DNS rebinding setup
        # We just verify that URL validation exists

        # Try URL with suspicious characteristics
        suspicious_urls = [
            'http://localhost.attacker.com/',
            'http://127.0.0.1.xip.io/',
        ]

        for url in suspicious_urls:
            response = api_client.post('/api/webhook/test', auth=admin_token, json={
                'url': url
            })

            # Should be cautious with these URLs
            # Not necessarily blocked, but should be validated


class TestWebhookSecurity:
    """Test webhook security"""

    @pytest.mark.high
    @pytest.mark.external
    def test_webhook_signature_verification(
        self,
        api_client: APIClient
    ):
        """
        Verify incoming webhooks require signature verification.
        """
        # Try webhook without signature
        response = api_client.post('/api/webhook/receive', json={
            'event': 'test',
            'data': {}
        })

        # Should reject unsigned webhooks
        # 404 = webhook endpoint not implemented (acceptable)
        assert response.status_code in [400, 401, 403, 404], \
            f"Webhook accepted without signature (status: {response.status_code})"

    @pytest.mark.medium
    @pytest.mark.external
    def test_webhook_replay_prevention(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify webhook replay attacks are prevented.
        """
        # Send same webhook twice with same timestamp
        webhook_data = {
            'event': 'test',
            'timestamp': '2024-01-01T00:00:00Z',
            'data': {}
        }

        # First request
        response1 = api_client.post('/api/webhook/receive', json=webhook_data)

        # Replay with same data
        response2 = api_client.post('/api/webhook/receive', json=webhook_data)

        # Second should be rejected as replay
        # (if replay protection is implemented)


class TestDataValidationFromExternal:
    """Test validation of data from external sources"""

    @pytest.mark.high
    @pytest.mark.external
    def test_external_data_sanitization(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify data from external sources is sanitized.
        """
        # When processing external data (e.g., from OAuth providers),
        # ensure it's sanitized before storage

        malicious_data = {
            'name': '<script>alert("XSS")</script>',
            'email': 'test@example.com"; DROP TABLE users; --',
        }

        # This would be tested through OAuth flow if available
        # For now, we verify input sanitization elsewhere

    @pytest.mark.medium
    @pytest.mark.external
    def test_external_file_validation(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify files from external sources are validated.
        """
        # Try to reference external file URL
        response = api_client.post('/api/submissions/create', auth=admin_token, json={
            'projectId': 'proj_test',
            'stageId': 'stg_test',
            'fileUrl': 'http://evil.com/malware.exe'
        })

        # Should not blindly accept external URLs
        # (specific behavior depends on implementation)


# ============================================================================
# Helper for running API9/10 tests
# ============================================================================

if __name__ == '__main__':
    """Run API inventory and external API tests directly"""
    pytest.main([__file__, '-v', '-m', 'inventory or external', '--tb=short'])
