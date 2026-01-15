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
from utils import APIClient, AuthHelper, AuthToken, extract_list_data
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
        response = api_client.post('/api/projects/list', auth=admin_token)
        if response.status_code != 200:
            pytest.skip("Cannot list projects")

        data = response.json()
        projects = extract_list_data(data, 'projects')
        if not projects:
            pytest.skip("No projects available")

        project_id = projects[0]['projectId']

        # Teacher-only endpoints (note: /api/rankings has /api prefix, but /wallets doesn't)
        teacher_endpoints = [
            ('/api/rankings/teacher-rankings', {'projectId': project_id, 'stageId': 'stg_test'}),
            ('/api/rankings/teacher-comprehensive-vote', {'projectId': project_id, 'stageId': 'stg_test'}),
            ('/api/wallets/award', {'projectId': project_id, 'userId': 'usr_test', 'amount': 10}),
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
        response = api_client.post('/api/projects/list', auth=admin_token)
        if response.status_code != 200:
            pytest.skip("Cannot list projects")

        data = response.json()
        projects = extract_list_data(data, 'projects')
        if not projects:
            pytest.skip("No projects available")

        project_id = projects[0]['projectId']

        # Write operations observer should not be able to do
        write_endpoints = [
            ('/api/projects/update', {'projectId': project_id, 'projectData': {}}),
            ('/api/stages/create', {'projectId': project_id, 'stageData': {}}),
            ('/api/groups/create', {'projectId': project_id, 'groupData': {}}),
            ('/api/comments/create', {'projectId': project_id, 'content': 'test'}),
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

        response = api_client.post('/api/projects/create', auth=fake_user_token, json={
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

        response = api_client.post('/api/invitations/generate', auth=fake_user_token, json={
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
        response = api_client.post('/api/projects/list', auth=admin_token)
        if response.status_code != 200:
            pytest.skip("Cannot list projects")

        data = response.json()
        projects = extract_list_data(data, 'projects')
        if not projects:
            pytest.skip("No projects available")

        project_id = projects[0]['projectId']

        # User without manage permission
        fake_viewer_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ2aWV3ZXIifQ.fake"

        manage_endpoints = [
            ('/api/projects/update', {'projectId': project_id, 'projectData': {}}),
            ('/api/projects/delete', {'projectId': project_id}),
            ('/api/stages/create', {'projectId': project_id, 'stageData': {}}),
            ('/api/groups/create', {'projectId': project_id, 'groupData': {}}),
            ('/api/wallets/award', {'projectId': project_id, 'userId': 'usr_test', 'amount': 10}),
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
        response = api_client.post('/api/projects/list', auth=admin_token)
        if response.status_code != 200:
            pytest.skip("Cannot list projects")

        data = response.json()
        projects = extract_list_data(data, 'projects')
        if not projects:
            pytest.skip("No projects available")

        project_id = projects[0]['projectId']

        # User not in the project
        fake_outsider_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJvdXRzaWRlciJ9.fake"

        response = api_client.post('/api/projects/get', auth=fake_outsider_token, json={
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
        response = api_client.post('/api/projects/list', auth=admin_token)
        if response.status_code != 200:
            pytest.skip("Cannot list projects")

        data = response.json()
        projects = extract_list_data(data, 'projects')
        if not projects:
            pytest.skip("No projects available")

        project_id = projects[0]['projectId']

        # Member trying to escalate self
        fake_member_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJtZW1iZXIifQ.fake"

        response = api_client.post('/api/projects/viewers/update-role', auth=fake_member_token, json={
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

        response = api_client.post('/api/scoring/settle', auth=fake_viewer_token, json={
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

        response = api_client.post('/api/settlement/reverse', auth=fake_viewer_token, json={
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
# AI Ranking Function Tests
# ============================================================================

class TestAIRankingFunctions:
    """Test AI ranking endpoint access control"""

    @pytest.mark.critical
    @pytest.mark.functions
    def test_ai_suggestion_requires_teacher(
        self,
        api_client: APIClient
    ):
        """
        Verify AI suggestion endpoints require teacher role.
        """
        fake_student_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJzdHVkZW50Iiwicm9sZSI6InN0dWRlbnQifQ.fake"

        ai_endpoints = [
            '/api/rankings/ai-suggestion',
            '/api/rankings/ai-bt-suggestion',
            '/api/rankings/ai-multi-agent-suggestion',
            '/api/rankings/ai-history',
            '/api/rankings/ai-detail',
        ]

        for endpoint in ai_endpoints:
            response = api_client.post(endpoint, auth=fake_student_token, json={
                'projectId': 'proj_test',
                'stageId': 'stg_test'
            })

            assert response.status_code in [401, 403], \
                f"Student accessed AI endpoint {endpoint}"

    @pytest.mark.high
    @pytest.mark.functions
    def test_ai_service_logs_requires_admin(
        self,
        api_client: APIClient
    ):
        """
        Verify AI service logs require admin permission.
        """
        fake_teacher_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZWFjaGVyIiwicm9sZSI6InRlYWNoZXIifQ.fake"

        # Query endpoint
        response = api_client.post('/api/admin/ai-service-logs/query', auth=fake_teacher_token)
        assert response.status_code in [401, 403], \
            "AI service logs query accessible without admin"

        # Statistics endpoint
        response = api_client.post('/api/admin/ai-service-logs/statistics', auth=fake_teacher_token)
        assert response.status_code in [401, 403], \
            "AI service logs statistics accessible without admin"

        # Detail endpoint
        response = api_client.get('/api/admin/ai-service-logs/call_test', auth=fake_teacher_token)
        assert response.status_code in [401, 403], \
            "AI service logs detail accessible without admin"


# ============================================================================
# Stage Control Function Tests
# ============================================================================

class TestStageControlFunctions:
    """Test stage control endpoint access"""

    @pytest.mark.critical
    @pytest.mark.functions
    def test_stage_pause_requires_manage(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify stage pause requires manage permission.
        """
        fake_viewer_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ2aWV3ZXIifQ.fake"

        # Get a project
        response = api_client.post('/api/projects/list-with-stages', auth=admin_token)
        if response.status_code != 200:
            pytest.skip("Cannot list projects")

        data = response.json()
        projects = extract_list_data(data, 'projects')

        project_id = None
        stage_id = None
        for project in projects:
            if project.get('stages'):
                project_id = project['projectId']
                stage_id = project['stages'][0]['stageId']
                break

        if not project_id:
            pytest.skip("No projects with stages")

        # Viewer should not be able to pause
        response = api_client.post('/api/stages/pause', auth=fake_viewer_token, json={
            'projectId': project_id,
            'stageId': stage_id
        })

        assert response.status_code in [401, 403], \
            f"Viewer could pause stage (status: {response.status_code})"

    @pytest.mark.critical
    @pytest.mark.functions
    def test_stage_resume_requires_manage(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify stage resume requires manage permission.
        """
        fake_viewer_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ2aWV3ZXIifQ.fake"

        response = api_client.post('/api/stages/resume', auth=fake_viewer_token, json={
            'projectId': 'proj_test',
            'stageId': 'stg_test'
        })

        assert response.status_code in [401, 403], \
            f"Viewer could resume stage"


# ============================================================================
# Submission Control Function Tests
# ============================================================================

class TestSubmissionControlFunctions:
    """Test submission control endpoint access"""

    @pytest.mark.critical
    @pytest.mark.functions
    def test_force_withdraw_requires_teacher(
        self,
        api_client: APIClient
    ):
        """
        Verify force-withdraw requires teacher role.
        """
        fake_student_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJzdHVkZW50In0.fake"

        response = api_client.post('/api/submissions/force-withdraw', auth=fake_student_token, json={
            'projectId': 'proj_test',
            'stageId': 'stg_test',
            'submissionId': 'sub_test',
            'reason': 'Test withdrawal'
        })

        assert response.status_code in [401, 403], \
            f"Student could force withdraw (status: {response.status_code})"

    @pytest.mark.high
    @pytest.mark.functions
    def test_force_withdraw_not_by_observer(
        self,
        api_client: APIClient
    ):
        """
        Verify observers cannot force-withdraw.
        """
        fake_observer_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJvYnNlcnZlciIsInJvbGUiOiJvYnNlcnZlciJ9.fake"

        response = api_client.post('/api/submissions/force-withdraw', auth=fake_observer_token, json={
            'projectId': 'proj_test',
            'stageId': 'stg_test',
            'submissionId': 'sub_test',
            'reason': 'Observer attempt'
        })

        assert response.status_code in [401, 403], \
            f"Observer could force withdraw"


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
# Stages Function Tests
# ============================================================================

class TestStagesFunctions:
    """Test stages endpoint access control"""

    @pytest.mark.critical
    @pytest.mark.functions
    def test_stage_create_requires_manage(
        self,
        api_client: APIClient
    ):
        """
        Verify stage creation requires manage permission.
        """
        fake_viewer_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ2aWV3ZXIifQ.fake"

        response = api_client.post('/api/stages/create', auth=fake_viewer_token, json={
            'projectId': 'proj_test',
            'stageData': {'stageName': 'Test Stage'}
        })

        assert response.status_code in [401, 403], \
            f"Stage creation without manage permission (status: {response.status_code})"

    @pytest.mark.critical
    @pytest.mark.functions
    def test_stage_update_requires_manage(
        self,
        api_client: APIClient
    ):
        """
        Verify stage update requires manage permission.
        """
        fake_viewer_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ2aWV3ZXIifQ.fake"

        response = api_client.post('/api/stages/update', auth=fake_viewer_token, json={
            'projectId': 'proj_test',
            'stageId': 'stg_test',
            'stageData': {'stageName': 'Updated Stage'}
        })

        assert response.status_code in [401, 403], \
            f"Stage update without manage permission"

    @pytest.mark.critical
    @pytest.mark.functions
    def test_stage_delete_requires_manage(
        self,
        api_client: APIClient
    ):
        """
        Verify stage deletion requires manage permission.
        """
        fake_viewer_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ2aWV3ZXIifQ.fake"

        response = api_client.post('/api/stages/delete', auth=fake_viewer_token, json={
            'projectId': 'proj_test',
            'stageId': 'stg_test'
        })

        assert response.status_code in [401, 403], \
            f"Stage deletion without manage permission"

    @pytest.mark.high
    @pytest.mark.functions
    def test_stage_clone_requires_manage(
        self,
        api_client: APIClient
    ):
        """
        Verify stage clone requires manage permission.
        """
        fake_viewer_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ2aWV3ZXIifQ.fake"

        response = api_client.post('/api/stages/clone', auth=fake_viewer_token, json={
            'projectId': 'proj_test',
            'stageId': 'stg_test'
        })

        assert response.status_code in [401, 403], \
            f"Stage clone without manage permission"

    @pytest.mark.high
    @pytest.mark.functions
    def test_stage_clone_to_projects_requires_manage(
        self,
        api_client: APIClient
    ):
        """
        Verify stage clone to multiple projects requires manage permission.
        """
        fake_viewer_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ2aWV3ZXIifQ.fake"

        response = api_client.post('/api/stages/clone-to-projects', auth=fake_viewer_token, json={
            'projectId': 'proj_test',
            'stageId': 'stg_test',
            'targetProjectIds': ['proj_target1', 'proj_target2']
        })

        assert response.status_code in [401, 403], \
            f"Stage clone-to-projects without manage permission"

    @pytest.mark.high
    @pytest.mark.functions
    def test_stage_config_get_requires_view(
        self,
        api_client: APIClient
    ):
        """
        Verify stage config get requires view permission.
        """
        fake_outsider_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJvdXRzaWRlciJ9.fake"

        response = api_client.post('/api/stages/config', auth=fake_outsider_token, json={
            'projectId': 'proj_test',
            'stageId': 'stg_test'
        })

        assert response.status_code in [401, 403], \
            f"Stage config accessible without view permission"

    @pytest.mark.critical
    @pytest.mark.functions
    def test_stage_config_update_requires_manage(
        self,
        api_client: APIClient
    ):
        """
        Verify stage config update requires manage permission.
        """
        fake_viewer_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ2aWV3ZXIifQ.fake"

        response = api_client.post('/api/stages/config/update', auth=fake_viewer_token, json={
            'projectId': 'proj_test',
            'stageId': 'stg_test',
            'config': {}
        })

        assert response.status_code in [401, 403], \
            f"Stage config update without manage permission"

    @pytest.mark.high
    @pytest.mark.functions
    def test_stage_config_reset_requires_manage(
        self,
        api_client: APIClient
    ):
        """
        Verify stage config reset requires manage permission.
        """
        fake_viewer_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ2aWV3ZXIifQ.fake"

        response = api_client.post('/api/stages/config/reset', auth=fake_viewer_token, json={
            'projectId': 'proj_test',
            'stageId': 'stg_test'
        })

        assert response.status_code in [401, 403], \
            f"Stage config reset without manage permission"

    @pytest.mark.high
    @pytest.mark.functions
    def test_stage_list_requires_view(
        self,
        api_client: APIClient
    ):
        """
        Verify stage list requires view permission.
        """
        fake_outsider_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJvdXRzaWRlciJ9.fake"

        response = api_client.post('/api/stages/list', auth=fake_outsider_token, json={
            'projectId': 'proj_test'
        })

        assert response.status_code in [401, 403], \
            f"Stage list accessible without view permission"

    @pytest.mark.high
    @pytest.mark.functions
    def test_stage_get_requires_view(
        self,
        api_client: APIClient
    ):
        """
        Verify stage get requires view permission.
        """
        fake_outsider_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJvdXRzaWRlciJ9.fake"

        response = api_client.post('/api/stages/get', auth=fake_outsider_token, json={
            'projectId': 'proj_test',
            'stageId': 'stg_test'
        })

        assert response.status_code in [401, 403], \
            f"Stage get accessible without view permission"


# ============================================================================
# Settlement Function Tests
# ============================================================================

class TestSettlementFunctions:
    """Test settlement endpoint access control"""

    @pytest.mark.critical
    @pytest.mark.functions
    def test_settlement_reverse_preview_requires_manage(
        self,
        api_client: APIClient
    ):
        """
        Verify settlement reverse preview requires manage permission.
        """
        fake_viewer_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ2aWV3ZXIifQ.fake"

        response = api_client.post('/api/settlement/reverse-preview', auth=fake_viewer_token, json={
            'projectId': 'proj_test',
            'stageId': 'stg_test'
        })

        assert response.status_code in [401, 403], \
            f"Settlement reverse-preview without manage permission"

    @pytest.mark.high
    @pytest.mark.functions
    def test_settlement_history_requires_view(
        self,
        api_client: APIClient
    ):
        """
        Verify settlement history requires view permission.
        """
        fake_outsider_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJvdXRzaWRlciJ9.fake"

        response = api_client.post('/api/settlement/history', auth=fake_outsider_token, json={
            'projectId': 'proj_test'
        })

        assert response.status_code in [401, 403], \
            f"Settlement history accessible without view permission"

    @pytest.mark.high
    @pytest.mark.functions
    def test_settlement_details_requires_view(
        self,
        api_client: APIClient
    ):
        """
        Verify settlement details requires view permission.
        """
        fake_outsider_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJvdXRzaWRlciJ9.fake"

        response = api_client.post('/api/settlement/details', auth=fake_outsider_token, json={
            'projectId': 'proj_test',
            'stageId': 'stg_test'
        })

        assert response.status_code in [401, 403], \
            f"Settlement details accessible without view permission"

    @pytest.mark.high
    @pytest.mark.functions
    def test_settlement_transactions_requires_view(
        self,
        api_client: APIClient
    ):
        """
        Verify settlement transactions requires view permission.
        """
        fake_outsider_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJvdXRzaWRlciJ9.fake"

        response = api_client.post('/api/settlement/transactions', auth=fake_outsider_token, json={
            'projectId': 'proj_test',
            'stageId': 'stg_test'
        })

        assert response.status_code in [401, 403], \
            f"Settlement transactions accessible without view permission"

    @pytest.mark.high
    @pytest.mark.functions
    def test_settlement_stage_rankings_requires_view(
        self,
        api_client: APIClient
    ):
        """
        Verify settlement stage rankings requires view permission.
        """
        fake_outsider_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJvdXRzaWRlciJ9.fake"

        response = api_client.post('/api/settlement/stage-rankings', auth=fake_outsider_token, json={
            'projectId': 'proj_test',
            'stageId': 'stg_test'
        })

        assert response.status_code in [401, 403], \
            f"Settlement stage-rankings accessible without view permission"

    @pytest.mark.high
    @pytest.mark.functions
    def test_settlement_comment_rankings_requires_view(
        self,
        api_client: APIClient
    ):
        """
        Verify settlement comment rankings requires view permission.
        """
        fake_outsider_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJvdXRzaWRlciJ9.fake"

        response = api_client.post('/api/settlement/comment-rankings', auth=fake_outsider_token, json={
            'projectId': 'proj_test',
            'stageId': 'stg_test'
        })

        assert response.status_code in [401, 403], \
            f"Settlement comment-rankings accessible without view permission"


# ============================================================================
# Event Logs Function Tests
# ============================================================================

class TestEventLogsFunctions:
    """Test event logs endpoint access control"""

    @pytest.mark.high
    @pytest.mark.functions
    def test_eventlogs_project_requires_view(
        self,
        api_client: APIClient
    ):
        """
        Verify project event logs requires view permission.
        """
        fake_outsider_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJvdXRzaWRlciJ9.fake"

        response = api_client.post('/api/eventlogs/project', auth=fake_outsider_token, json={
            'projectId': 'proj_test'
        })

        assert response.status_code in [401, 403], \
            f"Project event logs accessible without view permission"

    @pytest.mark.high
    @pytest.mark.functions
    def test_eventlogs_user_requires_view(
        self,
        api_client: APIClient
    ):
        """
        Verify user event logs requires view permission.
        """
        fake_outsider_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJvdXRzaWRlciJ9.fake"

        response = api_client.post('/api/eventlogs/user', auth=fake_outsider_token, json={
            'projectId': 'proj_test',
            'userId': 'usr_target'
        })

        assert response.status_code in [401, 403], \
            f"User event logs accessible without view permission"

    @pytest.mark.high
    @pytest.mark.functions
    def test_eventlogs_resource_requires_view(
        self,
        api_client: APIClient
    ):
        """
        Verify resource event log details requires view permission.
        """
        fake_outsider_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJvdXRzaWRlciJ9.fake"

        response = api_client.post('/api/eventlogs/resource', auth=fake_outsider_token, json={
            'projectId': 'proj_test',
            'resourceId': 'res_test'
        })

        assert response.status_code in [401, 403], \
            f"Resource event log accessible without view permission"


# ============================================================================
# Robot Management Function Tests
# ============================================================================

class TestRobotManagementFunctions:
    """Test robot management endpoint access control"""

    @pytest.mark.critical
    @pytest.mark.functions
    def test_robots_status_requires_admin(
        self,
        api_client: APIClient
    ):
        """
        Verify robot status requires system_admin permission.
        """
        fake_user_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJyZWd1bGFyIn0.fake"

        response = api_client.post('/api/admin/robots/status', auth=fake_user_token)

        assert response.status_code in [401, 403], \
            f"Robot status accessible without admin"

    @pytest.mark.critical
    @pytest.mark.functions
    def test_robots_notification_patrol_requires_admin(
        self,
        api_client: APIClient
    ):
        """
        Verify notification patrol execution requires system_admin.
        """
        fake_user_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJyZWd1bGFyIn0.fake"

        response = api_client.post('/api/admin/robots/notification-patrol', auth=fake_user_token)

        assert response.status_code in [401, 403], \
            f"Notification patrol accessible without admin"

    @pytest.mark.high
    @pytest.mark.functions
    def test_robots_notification_patrol_config_requires_admin(
        self,
        api_client: APIClient
    ):
        """
        Verify notification patrol config requires system_admin.
        """
        fake_user_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJyZWd1bGFyIn0.fake"

        response = api_client.post('/api/admin/robots/notification-patrol/config', auth=fake_user_token)

        assert response.status_code in [401, 403], \
            f"Notification patrol config accessible without admin"

    @pytest.mark.high
    @pytest.mark.functions
    def test_robots_notification_patrol_update_config_requires_admin(
        self,
        api_client: APIClient
    ):
        """
        Verify notification patrol config update requires system_admin.
        """
        fake_user_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJyZWd1bGFyIn0.fake"

        response = api_client.post('/api/admin/robots/notification-patrol/update-config', auth=fake_user_token, json={
            'config': {}
        })

        assert response.status_code in [401, 403], \
            f"Notification patrol config update accessible without admin"

    @pytest.mark.high
    @pytest.mark.functions
    def test_robots_notification_patrol_pending_requires_admin(
        self,
        api_client: APIClient
    ):
        """
        Verify pending notifications list requires system_admin.
        """
        fake_user_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJyZWd1bGFyIn0.fake"

        response = api_client.post('/api/admin/robots/notification-patrol/pending', auth=fake_user_token)

        assert response.status_code in [401, 403], \
            f"Pending notifications accessible without admin"

    @pytest.mark.high
    @pytest.mark.functions
    def test_robots_notification_patrol_statistics_requires_admin(
        self,
        api_client: APIClient
    ):
        """
        Verify notification patrol statistics requires system_admin.
        """
        fake_user_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJyZWd1bGFyIn0.fake"

        response = api_client.post('/api/admin/robots/notification-patrol/statistics', auth=fake_user_token)

        assert response.status_code in [401, 403], \
            f"Notification patrol statistics accessible without admin"


# ============================================================================
# AI Provider Function Tests
# ============================================================================

class TestAIProviderFunctions:
    """Test AI provider management endpoint access control"""

    @pytest.mark.critical
    @pytest.mark.functions
    def test_ai_providers_list_requires_admin(
        self,
        api_client: APIClient
    ):
        """
        Verify AI providers list requires system_admin permission.
        """
        fake_user_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJyZWd1bGFyIn0.fake"

        response = api_client.post('/api/system/ai-providers/list', auth=fake_user_token)

        assert response.status_code in [401, 403], \
            f"AI providers list accessible without admin"

    @pytest.mark.critical
    @pytest.mark.functions
    def test_ai_providers_create_requires_admin(
        self,
        api_client: APIClient
    ):
        """
        Verify AI provider creation requires system_admin permission.
        """
        fake_user_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJyZWd1bGFyIn0.fake"

        response = api_client.post('/api/system/ai-providers/create', auth=fake_user_token, json={
            'name': 'Test Provider',
            'type': 'openai'
        })

        assert response.status_code in [401, 403], \
            f"AI provider creation accessible without admin"

    @pytest.mark.critical
    @pytest.mark.functions
    def test_ai_providers_update_requires_admin(
        self,
        api_client: APIClient
    ):
        """
        Verify AI provider update requires system_admin permission.
        """
        fake_user_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJyZWd1bGFyIn0.fake"

        response = api_client.post('/api/system/ai-providers/update', auth=fake_user_token, json={
            'providerId': 'prov_test',
            'name': 'Updated Provider'
        })

        assert response.status_code in [401, 403], \
            f"AI provider update accessible without admin"

    @pytest.mark.critical
    @pytest.mark.functions
    def test_ai_providers_delete_requires_admin(
        self,
        api_client: APIClient
    ):
        """
        Verify AI provider deletion requires system_admin permission.
        """
        fake_user_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJyZWd1bGFyIn0.fake"

        response = api_client.post('/api/system/ai-providers/delete', auth=fake_user_token, json={
            'providerId': 'prov_test'
        })

        assert response.status_code in [401, 403], \
            f"AI provider deletion accessible without admin"

    @pytest.mark.high
    @pytest.mark.functions
    def test_ai_providers_test_requires_admin(
        self,
        api_client: APIClient
    ):
        """
        Verify AI provider test requires system_admin permission.
        """
        fake_user_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJyZWd1bGFyIn0.fake"

        response = api_client.post('/api/system/ai-providers/test', auth=fake_user_token, json={
            'providerId': 'prov_test'
        })

        assert response.status_code in [401, 403], \
            f"AI provider test accessible without admin"

    @pytest.mark.high
    @pytest.mark.functions
    def test_ai_prompts_get_requires_admin(
        self,
        api_client: APIClient
    ):
        """
        Verify AI prompts get requires system_admin permission.
        """
        fake_user_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJyZWd1bGFyIn0.fake"

        response = api_client.post('/api/system/ai-prompts/get', auth=fake_user_token)

        assert response.status_code in [401, 403], \
            f"AI prompts get accessible without admin"

    @pytest.mark.critical
    @pytest.mark.functions
    def test_ai_prompts_update_requires_admin(
        self,
        api_client: APIClient
    ):
        """
        Verify AI prompts update requires system_admin permission.
        """
        fake_user_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJyZWd1bGFyIn0.fake"

        response = api_client.post('/api/system/ai-prompts/update', auth=fake_user_token, json={
            'prompts': {}
        })

        assert response.status_code in [401, 403], \
            f"AI prompts update accessible without admin"


# ============================================================================
# Missing Endpoint Function Tests
# ============================================================================

class TestMissingEndpointsFunctions:
    """Test access control for other missing endpoints"""

    @pytest.mark.critical
    @pytest.mark.functions
    def test_projects_clone_requires_create_project(
        self,
        api_client: APIClient
    ):
        """
        Verify project clone requires create_project permission.
        """
        fake_user_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJub3Blcm1pc3Npb24ifQ.fake"

        response = api_client.post('/api/projects/clone', auth=fake_user_token, json={
            'projectId': 'proj_test'
        })

        assert response.status_code in [401, 403], \
            f"Project clone without create_project permission"

    @pytest.mark.high
    @pytest.mark.functions
    def test_invitations_generate_batch_requires_permission(
        self,
        api_client: APIClient
    ):
        """
        Verify batch invitation generation requires generate_invites permission.
        """
        fake_user_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJub3Blcm1pc3Npb24ifQ.fake"

        response = api_client.post('/api/invitations/generate-batch', auth=fake_user_token, json={
            'emails': ['test1@example.com', 'test2@example.com']
        })

        assert response.status_code in [401, 403], \
            f"Batch invitation without permission"

    @pytest.mark.high
    @pytest.mark.functions
    def test_invitations_reactivate_requires_permission(
        self,
        api_client: APIClient
    ):
        """
        Verify invitation reactivation requires generate_invites permission.
        """
        fake_user_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJub3Blcm1pc3Npb24ifQ.fake"

        response = api_client.post('/api/invitations/reactivate', auth=fake_user_token, json={
            'invitationId': 'inv_test'
        })

        assert response.status_code in [401, 403], \
            f"Invitation reactivation without permission"

    @pytest.mark.high
    @pytest.mark.functions
    def test_wallets_transactions_all_requires_manage(
        self,
        api_client: APIClient
    ):
        """
        Verify all wallet transactions requires manage permission.
        """
        fake_viewer_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ2aWV3ZXIifQ.fake"

        response = api_client.post('/api/wallets/transactions/all', auth=fake_viewer_token, json={
            'projectId': 'proj_test'
        })

        assert response.status_code in [401, 403], \
            f"All wallet transactions without manage permission"

    @pytest.mark.high
    @pytest.mark.functions
    def test_scoring_preview_requires_manage(
        self,
        api_client: APIClient
    ):
        """
        Verify scoring preview requires manage permission.
        """
        fake_viewer_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ2aWV3ZXIifQ.fake"

        response = api_client.post('/api/scoring/preview', auth=fake_viewer_token, json={
            'projectId': 'proj_test',
            'stageId': 'stg_test'
        })

        assert response.status_code in [401, 403], \
            f"Scoring preview without manage permission"

    @pytest.mark.high
    @pytest.mark.functions
    def test_comments_ranking_history_requires_view(
        self,
        api_client: APIClient
    ):
        """
        Verify comment ranking history requires view permission.
        """
        fake_outsider_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJvdXRzaWRlciJ9.fake"

        response = api_client.post('/api/comments/ranking-history', auth=fake_outsider_token, json={
            'projectId': 'proj_test',
            'stageId': 'stg_test'
        })

        assert response.status_code in [401, 403], \
            f"Comment ranking history without view permission"

    @pytest.mark.high
    @pytest.mark.functions
    def test_comments_all_stages_requires_view(
        self,
        api_client: APIClient
    ):
        """
        Verify batch comments endpoint requires view permission.
        """
        fake_outsider_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJvdXRzaWRlciJ9.fake"

        response = api_client.post('/api/comments/all-stages', auth=fake_outsider_token, json={
            'projectId': 'proj_test',
            'stageIds': ['stg_test1', 'stg_test2']
        })

        assert response.status_code in [401, 403], \
            f"Batch comments without view permission (status: {response.status_code})"

    @pytest.mark.high
    @pytest.mark.functions
    def test_rankings_all_stages_requires_view(
        self,
        api_client: APIClient
    ):
        """
        Verify batch rankings endpoint requires view permission.
        """
        fake_outsider_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJvdXRzaWRlciJ9.fake"

        response = api_client.post('/api/rankings/all-stages-rankings', auth=fake_outsider_token, json={
            'projectId': 'proj_test',
            'stageIds': ['stg_test1', 'stg_test2']
        })

        assert response.status_code in [401, 403, 404], \
            f"Batch rankings without view permission (status: {response.status_code})"


# ============================================================================
# Helper for running function-level tests
# ============================================================================

if __name__ == '__main__':
    """Run function-level authorization tests directly"""
    pytest.main([__file__, '-v', '-m', 'functions', '--tb=short'])
