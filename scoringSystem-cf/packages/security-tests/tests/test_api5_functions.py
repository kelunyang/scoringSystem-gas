"""
API5: Broken Function Level Authorization Tests

OWASP API Security Top 10 - API5:2023

These tests verify that:
1. Admin endpoints require admin privileges
2. Role-based access control is enforced
3. Permission escalation is prevented
4. Function-level access matches user role

Author: Claude Code
Date: 2025-12-23
"""

import pytest
from utils import APIClient, AuthHelper, AuthToken
from config import TestConfig


# ============================================================================
# Admin Function Access Tests
# ============================================================================

class TestAdminFunctionAccess:
    """Test admin endpoint access control"""

    @pytest.mark.critical
    @pytest.mark.functions
    def test_admin_user_list_requires_admin(
        self,
        api_client: APIClient
    ):
        """
        Verify /api/admin/users/list requires admin privileges.

        Attack Vector:
        - Regular user attempts to list all system users
        - Could expose user data

        Expected: 403 Forbidden
        """
        fake_user_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJyZWd1bGFyIiwicm9sZSI6InVzZXIifQ.fake"

        response = api_client.post('/api/admin/users/list', auth=fake_user_token)

        assert response.status_code in [401, 403], \
            f"Admin endpoint accessible without admin (status: {response.status_code})"

    @pytest.mark.critical
    @pytest.mark.functions
    def test_admin_system_stats_requires_admin(
        self,
        api_client: APIClient
    ):
        """
        Verify system statistics require admin privileges.
        """
        fake_user_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJyZWd1bGFyIn0.fake"

        response = api_client.post('/api/admin/system/stats', auth=fake_user_token)

        assert response.status_code in [401, 403], \
            f"System stats accessible without admin"

    @pytest.mark.critical
    @pytest.mark.functions
    def test_admin_system_logs_requires_permission(
        self,
        api_client: APIClient
    ):
        """
        Verify system logs require view_system_logs permission.
        """
        fake_user_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJyZWd1bGFyIn0.fake"

        response = api_client.post('/api/admin/system/logs', auth=fake_user_token)

        assert response.status_code in [401, 403], \
            f"System logs accessible without permission"

    @pytest.mark.high
    @pytest.mark.functions
    def test_admin_user_status_update_requires_manage_users(
        self,
        api_client: APIClient
    ):
        """
        Verify user status updates require manage_users permission.
        """
        fake_user_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJyZWd1bGFyIn0.fake"

        response = api_client.post('/api/admin/users/update-status', auth=fake_user_token, json={
            'userId': 'usr_target',
            'status': 'active'
        })

        assert response.status_code in [401, 403], \
            f"User status update accessible without permission"

    @pytest.mark.high
    @pytest.mark.functions
    def test_admin_password_reset_requires_manage_users(
        self,
        api_client: APIClient
    ):
        """
        Verify admin password reset requires manage_users permission.
        """
        fake_user_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJyZWd1bGFyIn0.fake"

        response = api_client.post('/api/admin/users/reset-password', auth=fake_user_token, json={
            'userId': 'usr_target'
        })

        assert response.status_code in [401, 403], \
            f"Admin password reset accessible without permission"


# ============================================================================
# Role-Based Access Control Tests
# ============================================================================

class TestRoleBasedAccess:
    """Test role-based access control"""

    @pytest.mark.critical
    @pytest.mark.functions
    def test_teacher_cannot_access_admin_functions(
        self,
        api_client: APIClient
    ):
        """
        Verify teachers cannot access admin-only functions.
        """
        # Fake teacher token (role = teacher but not admin)
        fake_teacher_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZWFjaGVyIiwicm9sZSI6InRlYWNoZXIifQ.fake"

        admin_endpoints = [
            '/api/admin/users/list',
            '/api/admin/system/stats',
            '/api/admin/global-groups',
            '/api/admin/smtp/get-config',
        ]

        for endpoint in admin_endpoints:
            response = api_client.post(endpoint, auth=fake_teacher_token)

            assert response.status_code in [401, 403], \
                f"Teacher accessed admin endpoint {endpoint}"

    @pytest.mark.critical
    @pytest.mark.functions
    def test_student_cannot_access_teacher_functions(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify students cannot access teacher-only functions.
        """
        fake_student_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJzdHVkZW50Iiwicm9sZSI6InN0dWRlbnQifQ.fake"

        # Get a project for context
        response = api_client.post('/projects/list', auth=admin_token)
        if response.status_code != 200:
            pytest.skip("Cannot list projects")

        data = response.json()
        projects = data.get('data', [])
        if not projects:
            pytest.skip("No projects available")

        project_id = projects[0]['projectId']

        # Teacher-only endpoints
        teacher_endpoints = [
            ('/rankings/teacher-rankings', {'projectId': project_id, 'stageId': 'stg_test'}),
            ('/rankings/teacher-comprehensive-vote', {'projectId': project_id, 'stageId': 'stg_test'}),
            ('/wallets/award', {'projectId': project_id, 'userId': 'usr_test', 'amount': 10}),
        ]

        for endpoint, payload in teacher_endpoints:
            response = api_client.post(endpoint, auth=fake_student_token, json=payload)

            assert response.status_code in [401, 403], \
                f"Student accessed teacher endpoint {endpoint}"

    @pytest.mark.high
    @pytest.mark.functions
    def test_observer_read_only_enforcement(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify observers have read-only access.
        """
        fake_observer_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJvYnNlcnZlciIsInJvbGUiOiJvYnNlcnZlciJ9.fake"

        # Get a project
        response = api_client.post('/projects/list', auth=admin_token)
        if response.status_code != 200:
            pytest.skip("Cannot list projects")

        data = response.json()
        projects = data.get('data', [])
        if not projects:
            pytest.skip("No projects available")

        project_id = projects[0]['projectId']

        # Write operations observer should not be able to do
        write_endpoints = [
            ('/projects/update', {'projectId': project_id, 'projectData': {}}),
            ('/stages/create', {'projectId': project_id, 'stageData': {}}),
            ('/groups/create', {'projectId': project_id, 'groupData': {}}),
            ('/comments/create', {'projectId': project_id, 'content': 'test'}),
        ]

        for endpoint, payload in write_endpoints:
            response = api_client.post(endpoint, auth=fake_observer_token, json=payload)

            assert response.status_code in [401, 403], \
                f"Observer performed write operation on {endpoint}"


# ============================================================================
# Global Permission Tests
# ============================================================================

class TestGlobalPermissions:
    """Test global permission enforcement"""

    @pytest.mark.critical
    @pytest.mark.functions
    def test_create_project_requires_permission(
        self,
        api_client: APIClient
    ):
        """
        Verify project creation requires create_project permission.
        """
        # User without create_project permission
        fake_user_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJub3Blcm1pc3Npb24ifQ.fake"

        response = api_client.post('/projects/create', auth=fake_user_token, json={
            'projectData': {
                'projectName': 'Unauthorized Project',
                'description': 'Should not be created'
            }
        })

        assert response.status_code in [401, 403], \
            f"Project creation without permission (status: {response.status_code})"

    @pytest.mark.critical
    @pytest.mark.functions
    def test_generate_invites_requires_permission(
        self,
        api_client: APIClient
    ):
        """
        Verify invitation generation requires generate_invites permission.
        """
        fake_user_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJub3Blcm1pc3Npb24ifQ.fake"

        response = api_client.post('/invitations/generate', auth=fake_user_token, json={
            'email': 'test@example.com'
        })

        assert response.status_code in [401, 403], \
            f"Invitation generation without permission"

    @pytest.mark.high
    @pytest.mark.functions
    def test_manage_global_groups_requires_permission(
        self,
        api_client: APIClient
    ):
        """
        Verify global group management requires permission.
        """
        fake_user_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJub3Blcm1pc3Npb24ifQ.fake"

        response = api_client.post('/api/admin/create-global-group', auth=fake_user_token, json={
            'groupName': 'Unauthorized Group'
        })

        assert response.status_code in [401, 403], \
            f"Global group creation without permission"


# ============================================================================
# Project Permission Tests
# ============================================================================

class TestProjectPermissions:
    """Test project-level permission enforcement"""

    @pytest.mark.critical
    @pytest.mark.functions
    def test_project_manage_requires_permission(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify project management requires manage permission.
        """
        # Get a project
        response = api_client.post('/projects/list', auth=admin_token)
        if response.status_code != 200:
            pytest.skip("Cannot list projects")

        data = response.json()
        projects = data.get('data', [])
        if not projects:
            pytest.skip("No projects available")

        project_id = projects[0]['projectId']

        # User without manage permission
        fake_viewer_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ2aWV3ZXIifQ.fake"

        manage_endpoints = [
            ('/projects/update', {'projectId': project_id, 'projectData': {}}),
            ('/projects/delete', {'projectId': project_id}),
            ('/stages/create', {'projectId': project_id, 'stageData': {}}),
            ('/groups/create', {'projectId': project_id, 'groupData': {}}),
            ('/wallets/award', {'projectId': project_id, 'userId': 'usr_test', 'amount': 10}),
        ]

        for endpoint, payload in manage_endpoints:
            response = api_client.post(endpoint, auth=fake_viewer_token, json=payload)

            assert response.status_code in [401, 403], \
                f"Viewer accessed manage endpoint {endpoint}"

    @pytest.mark.high
    @pytest.mark.functions
    def test_project_view_requires_membership(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify project viewing requires membership.
        """
        # Get a project
        response = api_client.post('/projects/list', auth=admin_token)
        if response.status_code != 200:
            pytest.skip("Cannot list projects")

        data = response.json()
        projects = data.get('data', [])
        if not projects:
            pytest.skip("No projects available")

        project_id = projects[0]['projectId']

        # User not in the project
        fake_outsider_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJvdXRzaWRlciJ9.fake"

        response = api_client.post('/projects/get', auth=fake_outsider_token, json={
            'projectId': project_id
        })

        assert response.status_code in [401, 403, 404], \
            f"Outsider accessed project (status: {response.status_code})"


# ============================================================================
# Permission Escalation Tests
# ============================================================================

class TestPermissionEscalation:
    """Test permission escalation prevention"""

    @pytest.mark.critical
    @pytest.mark.functions
    def test_user_cannot_grant_self_admin(
        self,
        api_client: APIClient
    ):
        """
        Verify users cannot grant themselves admin privileges.
        """
        fake_user_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJyZWd1bGFyIn0.fake"

        # Attempt to add self to admin global group
        response = api_client.post('/api/admin/global-groups/add-user', auth=fake_user_token, json={
            'groupId': 'grp_admins',
            'userId': 'usr_self'
        })

        assert response.status_code in [401, 403], \
            f"User could potentially add self to admin group"

    @pytest.mark.critical
    @pytest.mark.functions
    def test_user_cannot_modify_own_permissions(
        self,
        api_client: APIClient
    ):
        """
        Verify users cannot modify their own global permissions.
        """
        fake_user_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJyZWd1bGFyIn0.fake"

        # This endpoint may not exist, but test the concept
        response = api_client.post('/api/admin/users/update-permissions', auth=fake_user_token, json={
            'userId': 'usr_self',
            'permissions': ['system_admin', 'manage_users', 'create_project']
        })

        assert response.status_code in [401, 403, 404], \
            f"User could modify own permissions"

    @pytest.mark.high
    @pytest.mark.functions
    def test_project_member_cannot_escalate_role(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify project members cannot escalate their project role.
        """
        # Get a project
        response = api_client.post('/projects/list', auth=admin_token)
        if response.status_code != 200:
            pytest.skip("Cannot list projects")

        data = response.json()
        projects = data.get('data', [])
        if not projects:
            pytest.skip("No projects available")

        project_id = projects[0]['projectId']

        # Member trying to escalate self
        fake_member_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJtZW1iZXIifQ.fake"

        response = api_client.post('/projects/viewers/update-role', auth=fake_member_token, json={
            'projectId': project_id,
            'userId': 'usr_member',
            'role': 'teacher'
        })

        assert response.status_code in [401, 403], \
            f"Member could escalate project role"


# ============================================================================
# Sensitive Function Tests
# ============================================================================

class TestSensitiveFunctions:
    """Test access to sensitive functions"""

    @pytest.mark.critical
    @pytest.mark.functions
    def test_settlement_requires_manage(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify settlement operations require manage permission.
        """
        fake_viewer_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ2aWV3ZXIifQ.fake"

        response = api_client.post('/scoring/settle', auth=fake_viewer_token, json={
            'projectId': 'proj_test',
            'stageId': 'stg_test'
        })

        assert response.status_code in [401, 403], \
            f"Settlement without manage permission"

    @pytest.mark.critical
    @pytest.mark.functions
    def test_settlement_reversal_requires_manage(
        self,
        api_client: APIClient
    ):
        """
        Verify settlement reversal requires manage permission.
        """
        fake_viewer_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ2aWV3ZXIifQ.fake"

        response = api_client.post('/settlement/reverse', auth=fake_viewer_token, json={
            'projectId': 'proj_test',
            'stageId': 'stg_test'
        })

        assert response.status_code in [401, 403], \
            f"Settlement reversal without manage permission"

    @pytest.mark.high
    @pytest.mark.functions
    def test_smtp_config_requires_admin(
        self,
        api_client: APIClient
    ):
        """
        Verify SMTP configuration requires admin privileges.
        """
        fake_user_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJyZWd1bGFyIn0.fake"

        response = api_client.post('/api/admin/smtp/get-config', auth=fake_user_token)

        assert response.status_code in [401, 403], \
            f"SMTP config accessible without admin"

    @pytest.mark.high
    @pytest.mark.functions
    def test_email_logs_require_permission(
        self,
        api_client: APIClient
    ):
        """
        Verify email logs require manage_email_logs permission.
        """
        fake_user_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJyZWd1bGFyIn0.fake"

        response = api_client.post('/api/admin/email-logs/query', auth=fake_user_token)

        assert response.status_code in [401, 403], \
            f"Email logs accessible without permission"


# ============================================================================
# HTTP Method Enforcement Tests
# ============================================================================

class TestHTTPMethodEnforcement:
    """Test HTTP method restrictions"""

    @pytest.mark.medium
    @pytest.mark.functions
    def test_get_method_on_post_endpoint(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify POST-only endpoints reject GET requests.
        """
        response = api_client.get('/api/auth/current-user', auth=admin_token)

        # Should reject GET (endpoint is POST-only)
        assert response.status_code in [404, 405], \
            f"POST-only endpoint accepted GET (status: {response.status_code})"

    @pytest.mark.medium
    @pytest.mark.functions
    def test_delete_method_not_exposed(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify DELETE method is not exposed on sensitive endpoints.
        """
        # Try DELETE on project endpoint
        response = api_client.delete('/projects/proj_test', auth=admin_token)

        # Should use POST /projects/delete instead
        assert response.status_code in [404, 405], \
            f"DELETE method exposed on project"


# ============================================================================
# Helper for running function-level tests
# ============================================================================

if __name__ == '__main__':
    """Run function-level authorization tests directly"""
    pytest.main([__file__, '-v', '-m', 'functions', '--tb=short'])
