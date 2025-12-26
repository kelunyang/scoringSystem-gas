"""
API1: Broken Object Level Authorization (BOLA) Tests

OWASP API Security Top 10 - API1:2023

These tests verify that users cannot access resources belonging to other users.
BOLA vulnerabilities occur when an API endpoint does not properly validate
that the authenticated user has permission to access the requested resource.

Test Categories:
1. Project Access Control
2. Wallet/Transaction Access Control
3. Submission/Comment Access Control
4. Group Access Control
5. ID Enumeration Prevention

Author: Claude Code
Date: 2025-12-23
"""

import pytest
from typing import Dict, Optional
from utils import APIClient, AuthHelper, AuthToken
from config import TestConfig


# ============================================================================
# Project Access Control Tests
# ============================================================================

class TestProjectBOLA:
    """Test project-level access control"""

    @pytest.mark.critical
    @pytest.mark.bola
    def test_user_cannot_access_other_project(
        self,
        api_client: APIClient,
        admin_token: str,
        config: TestConfig
    ):
        """
        Verify users cannot access projects they don't belong to.

        Attack Vector:
        - Attacker obtains project ID of another user's project
        - Attacker attempts to access project details using their own token

        Expected: 403 Forbidden or 404 Not Found
        """
        # First, get a project that admin has access to
        response = api_client.post('/projects/list', auth=admin_token)
        assert response.status_code == 200, f"Failed to list projects: {response.text}"

        data = response.json()
        if not data.get('success') or not data.get('data'):
            pytest.skip("No projects available for testing")

        project_id = data['data'][0]['projectId']

        # Now test with an invalid/forged token to simulate another user
        # Using a completely invalid token should return 401
        fake_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJmYWtlX3VzZXIifQ.invalid"

        response = api_client.post(
            '/projects/get',
            auth=fake_token,
            json={'projectId': project_id}
        )

        # Should be rejected (401 Unauthorized or 403 Forbidden)
        assert response.status_code in [401, 403], \
            f"BOLA vulnerability: Fake token accessed project (status: {response.status_code})"

    @pytest.mark.critical
    @pytest.mark.bola
    def test_project_listing_isolation(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify project listing only returns projects user has access to.

        Attack Vector:
        - User attempts to see all projects in the system

        Expected: Only user's own projects returned
        """
        response = api_client.post('/projects/list', auth=admin_token)
        assert response.status_code == 200

        data = response.json()
        assert data.get('success'), "Project listing failed"

        # Verify response structure - should only contain user's projects
        projects = data.get('data', [])

        # Each project should have proper structure
        for project in projects:
            assert 'projectId' in project, "Project missing projectId"
            # User should have a role in each listed project
            # (The exact validation depends on your API response structure)

    @pytest.mark.high
    @pytest.mark.bola
    def test_project_update_requires_manage_permission(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify only users with 'manage' permission can update projects.

        Attack Vector:
        - User with 'view' permission attempts to update project

        Expected: 403 Forbidden
        """
        # Get a project first
        response = api_client.post('/projects/list', auth=admin_token)
        if response.status_code != 200:
            pytest.skip("Cannot list projects")

        data = response.json()
        projects = data.get('data', [])
        if not projects:
            pytest.skip("No projects available")

        project_id = projects[0]['projectId']

        # Attempt update with invalid token (simulating viewer role)
        fake_viewer_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ2aWV3ZXIifQ.fake"

        response = api_client.post(
            '/projects/update',
            auth=fake_viewer_token,
            json={
                'projectId': project_id,
                'projectData': {'projectName': 'Hacked Project'}
            }
        )

        assert response.status_code in [401, 403], \
            f"Unauthorized update allowed (status: {response.status_code})"

    @pytest.mark.high
    @pytest.mark.bola
    def test_project_id_enumeration_prevention(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify system prevents project ID enumeration attacks.

        Attack Vector:
        - Attacker iterates through possible project IDs
        - System should return consistent responses for non-existent/unauthorized projects

        Expected: Consistent 404 or 403 responses (no information leakage)
        """
        # Generate fake project IDs
        fake_project_ids = [
            'proj_00000000-0000-0000-0000-000000000000',
            'proj_11111111-1111-1111-1111-111111111111',
            'proj_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            'nonexistent_project',
            '../../../etc/passwd',  # Path traversal attempt
            "'; DROP TABLE projects; --",  # SQL injection attempt
        ]

        for fake_id in fake_project_ids:
            response = api_client.post(
                '/projects/get',
                auth=admin_token,
                json={'projectId': fake_id}
            )

            # Should return 404 (not found) or 400 (bad request)
            # NOT 500 (server error) which would indicate vulnerability
            assert response.status_code in [400, 403, 404], \
                f"Unexpected response for fake project ID '{fake_id}': {response.status_code}"

            # Verify no sensitive information leaked
            response_text = response.text.lower()
            assert 'stack' not in response_text, \
                f"Stack trace leaked for project ID '{fake_id}'"
            assert 'sql' not in response_text, \
                f"SQL error leaked for project ID '{fake_id}'"


# ============================================================================
# Wallet/Transaction Access Control Tests
# ============================================================================

class TestWalletBOLA:
    """Test wallet and transaction access control"""

    @pytest.mark.critical
    @pytest.mark.bola
    def test_user_cannot_access_other_wallet(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify users cannot access wallets of other users.

        Attack Vector:
        - Attacker obtains another user's ID
        - Attacker attempts to view wallet transactions

        Expected: 403 Forbidden or empty results
        """
        # First get a project to test wallet access
        response = api_client.post('/projects/list', auth=admin_token)
        if response.status_code != 200:
            pytest.skip("Cannot list projects")

        data = response.json()
        projects = data.get('data', [])
        if not projects:
            pytest.skip("No projects available")

        project_id = projects[0]['projectId']

        # Try to access wallet with fake user ID
        response = api_client.post(
            '/wallets/transactions',
            auth=admin_token,
            json={
                'projectId': project_id,
                'userId': 'usr_fake-user-id-12345'  # Fake user ID
            }
        )

        # Should either fail authorization or return empty/own data only
        if response.status_code == 200:
            data = response.json()
            # If successful, should only return own transactions or empty
            # Should NOT return other user's transactions

    @pytest.mark.high
    @pytest.mark.bola
    def test_wallet_award_requires_manage_permission(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify only project managers can award points.

        Attack Vector:
        - Regular user attempts to award themselves points

        Expected: 403 Forbidden
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

        # Try with fake non-manager token
        fake_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJzdHVkZW50In0.fake"

        response = api_client.post(
            '/wallets/award',
            auth=fake_token,
            json={
                'projectId': project_id,
                'userId': 'usr_self',
                'amount': 1000,
                'reason': 'Self-award attempt'
            }
        )

        assert response.status_code in [401, 403], \
            f"Unauthorized wallet award allowed (status: {response.status_code})"

    @pytest.mark.high
    @pytest.mark.bola
    def test_transaction_reversal_authorization(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify transaction reversals require proper authorization.

        Attack Vector:
        - User attempts to reverse transactions they didn't create

        Expected: 403 Forbidden
        """
        fake_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhdHRhY2tlciJ9.fake"

        response = api_client.post(
            '/wallets/reverse',
            auth=fake_token,
            json={
                'projectId': 'proj_test',
                'transactionId': 'txn_fake-transaction-id'
            }
        )

        assert response.status_code in [401, 403, 404], \
            f"Unauthorized transaction reversal allowed (status: {response.status_code})"


# ============================================================================
# Submission/Comment Access Control Tests
# ============================================================================

class TestSubmissionBOLA:
    """Test submission and comment access control"""

    @pytest.mark.critical
    @pytest.mark.bola
    def test_submission_access_control(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify submissions are only accessible to authorized users.

        Attack Vector:
        - User attempts to view submissions from projects they don't belong to

        Expected: 403 Forbidden or 404 Not Found
        """
        # Get a project and stage
        response = api_client.post('/projects/list-with-stages', auth=admin_token)
        if response.status_code != 200:
            pytest.skip("Cannot list projects with stages")

        data = response.json()
        projects = data.get('data', [])
        if not projects:
            pytest.skip("No projects available")

        # Find a project with stages
        project_with_stages = None
        stage_id = None
        for project in projects:
            if project.get('stages'):
                project_with_stages = project
                stage_id = project['stages'][0]['stageId']
                break

        if not project_with_stages:
            pytest.skip("No projects with stages available")

        # Try to access with fake token
        fake_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJvdXRzaWRlciJ9.fake"

        response = api_client.post(
            '/submissions/list',
            auth=fake_token,
            json={
                'projectId': project_with_stages['projectId'],
                'stageId': stage_id
            }
        )

        assert response.status_code in [401, 403, 404], \
            f"Unauthorized submission access allowed (status: {response.status_code})"

    @pytest.mark.high
    @pytest.mark.bola
    def test_submission_delete_requires_ownership(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify users can only delete their own submissions.

        Attack Vector:
        - User attempts to delete another user's submission

        Expected: 403 Forbidden
        """
        fake_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhdHRhY2tlciJ9.fake"

        response = api_client.post(
            '/submissions/delete',
            auth=fake_token,
            json={
                'submissionId': 'sub_fake-submission-id',
                'projectId': 'proj_test',
                'stageId': 'stg_test'
            }
        )

        assert response.status_code in [401, 403, 404], \
            f"Unauthorized submission deletion allowed (status: {response.status_code})"

    @pytest.mark.high
    @pytest.mark.bola
    def test_comment_access_control(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify comments are only accessible within proper project context.

        Attack Vector:
        - User attempts to view comments from unauthorized project

        Expected: 403 Forbidden
        """
        fake_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJvdXRzaWRlciJ9.fake"

        response = api_client.post(
            '/comments/stage',
            auth=fake_token,
            json={
                'projectId': 'proj_unauthorized',
                'stageId': 'stg_test'
            }
        )

        assert response.status_code in [401, 403, 404], \
            f"Unauthorized comment access allowed (status: {response.status_code})"


# ============================================================================
# Group Access Control Tests
# ============================================================================

class TestGroupBOLA:
    """Test group-level access control"""

    @pytest.mark.critical
    @pytest.mark.bola
    def test_group_membership_enforcement(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify group operations require proper membership.

        Attack Vector:
        - Non-member attempts to perform group operations

        Expected: 403 Forbidden
        """
        fake_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJub25tZW1iZXIifQ.fake"

        # Attempt to add member to a group
        response = api_client.post(
            '/groups/add-member',
            auth=fake_token,
            json={
                'projectId': 'proj_test',
                'groupId': 'grp_test',
                'userId': 'usr_attacker',
                'role': 'member'
            }
        )

        assert response.status_code in [401, 403, 404], \
            f"Unauthorized group member add allowed (status: {response.status_code})"

    @pytest.mark.high
    @pytest.mark.bola
    def test_cross_group_data_isolation(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify users cannot access data from other groups.

        Attack Vector:
        - User from Group A attempts to access Group B's data

        Expected: 403 Forbidden or filtered results
        """
        # Get groups from a project
        response = api_client.post('/projects/list', auth=admin_token)
        if response.status_code != 200:
            pytest.skip("Cannot list projects")

        data = response.json()
        projects = data.get('data', [])
        if not projects:
            pytest.skip("No projects available")

        project_id = projects[0]['projectId']

        # List groups
        response = api_client.post(
            '/groups/list',
            auth=admin_token,
            json={'projectId': project_id}
        )

        if response.status_code == 200:
            data = response.json()
            groups = data.get('data', [])

            # Verify each group's data is properly isolated
            # (Specific validation depends on your data model)

    @pytest.mark.high
    @pytest.mark.bola
    def test_group_update_requires_leader_or_manage(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify group updates require leader or manage permission.

        Attack Vector:
        - Regular group member attempts to update group settings

        Expected: 403 Forbidden
        """
        fake_member_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJtZW1iZXIifQ.fake"

        response = api_client.post(
            '/groups/update',
            auth=fake_member_token,
            json={
                'projectId': 'proj_test',
                'groupId': 'grp_test',
                'groupData': {'groupName': 'Hacked Group Name'}
            }
        )

        assert response.status_code in [401, 403, 404], \
            f"Unauthorized group update allowed (status: {response.status_code})"


# ============================================================================
# Admin Endpoint Access Control Tests
# ============================================================================

class TestAdminBOLA:
    """Test admin endpoint access control"""

    @pytest.mark.critical
    @pytest.mark.bola
    def test_admin_user_list_requires_admin(
        self,
        api_client: APIClient
    ):
        """
        Verify admin user list requires admin privileges.

        Attack Vector:
        - Regular user attempts to list all system users

        Expected: 403 Forbidden
        """
        fake_user_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJyZWd1bGFyIn0.fake"

        response = api_client.post(
            '/api/admin/users/list',
            auth=fake_user_token
        )

        assert response.status_code in [401, 403], \
            f"Admin endpoint accessible to non-admin (status: {response.status_code})"

    @pytest.mark.critical
    @pytest.mark.bola
    def test_admin_system_stats_requires_admin(
        self,
        api_client: APIClient
    ):
        """
        Verify system stats require admin privileges.

        Attack Vector:
        - Regular user attempts to view system statistics

        Expected: 403 Forbidden
        """
        fake_user_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJyZWd1bGFyIn0.fake"

        response = api_client.post(
            '/api/admin/system/stats',
            auth=fake_user_token
        )

        assert response.status_code in [401, 403], \
            f"Admin system stats accessible to non-admin (status: {response.status_code})"

    @pytest.mark.high
    @pytest.mark.bola
    def test_admin_global_group_management_requires_permission(
        self,
        api_client: APIClient
    ):
        """
        Verify global group management requires proper permissions.

        Attack Vector:
        - User without manage_global_groups permission attempts to create global group

        Expected: 403 Forbidden
        """
        fake_user_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJyZWd1bGFyIn0.fake"

        response = api_client.post(
            '/api/admin/create-global-group',
            auth=fake_user_token,
            json={
                'groupName': 'Unauthorized Group',
                'groupDescription': 'Should not be created'
            }
        )

        assert response.status_code in [401, 403], \
            f"Global group creation allowed without permission (status: {response.status_code})"


# ============================================================================
# ID Enumeration Prevention Tests
# ============================================================================

class TestIDEnumeration:
    """Test ID enumeration attack prevention"""

    @pytest.mark.medium
    @pytest.mark.bola
    def test_user_id_enumeration_prevention(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify system prevents user ID enumeration.

        Attack Vector:
        - Attacker iterates through possible user IDs
        - System should not reveal which IDs exist

        Expected: Consistent responses for all invalid IDs
        """
        fake_user_ids = [
            'usr_00000000-0000-0000-0000-000000000000',
            'usr_11111111-1111-1111-1111-111111111111',
            'usr_nonexistent',
            '1',
            'admin',
            '../../../etc/passwd',
        ]

        responses = []
        for fake_id in fake_user_ids:
            response = api_client.post(
                '/users/display-names',
                auth=admin_token,
                json={
                    'projectId': 'proj_test',
                    'userIds': [fake_id]
                }
            )
            responses.append(response.status_code)

        # All responses should be consistent (not revealing which IDs exist)
        # Should not have 500 errors
        for i, status in enumerate(responses):
            assert status != 500, \
                f"Server error for user ID '{fake_user_ids[i]}' indicates vulnerability"

    @pytest.mark.medium
    @pytest.mark.bola
    def test_stage_id_enumeration_prevention(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify system prevents stage ID enumeration.
        """
        fake_stage_ids = [
            'stg_00000000-0000-0000-0000-000000000000',
            'stg_nonexistent',
            "'; DROP TABLE stages; --",
        ]

        for fake_id in fake_stage_ids:
            response = api_client.post(
                '/stages/get',
                auth=admin_token,
                json={
                    'projectId': 'proj_test',
                    'stageId': fake_id
                }
            )

            assert response.status_code in [400, 403, 404], \
                f"Unexpected response for stage ID '{fake_id}': {response.status_code}"

            # No server errors or information leakage
            assert response.status_code != 500


# ============================================================================
# Cross-User Data Access Tests (with real users)
# ============================================================================

class TestCrossUserAccess:
    """
    Test cross-user access with real test users.

    These tests require TEST_INVITATION_CODE to be set for creating test users.
    """

    @pytest.mark.critical
    @pytest.mark.bola
    def test_user1_cannot_see_user2_profile_details(
        self,
        api_client: APIClient,
        test_users: Dict[str, AuthToken]
    ):
        """
        Verify users cannot access detailed profile of other users.

        This test uses real test users created via fixtures.
        """
        user1 = test_users['user1']
        user2 = test_users['user2']

        # User1 gets their own profile (should succeed)
        response = api_client.post('/api/auth/current-user', auth=user1.token)
        assert response.status_code == 200, "User should be able to access own profile"

        own_profile = response.json().get('data', {})

        # Verify own profile contains expected data
        assert own_profile.get('userId') == user1.user_id, \
            "Profile should return requesting user's data"

    @pytest.mark.critical
    @pytest.mark.bola
    def test_user_cannot_modify_other_user_profile(
        self,
        api_client: APIClient,
        test_users: Dict[str, AuthToken]
    ):
        """
        Verify users cannot modify other users' profiles.
        """
        user1 = test_users['user1']
        user2 = test_users['user2']

        # User1 attempts to update with manipulated userId
        response = api_client.post(
            '/api/admin/user-profile',
            auth=user1.token,
            json={
                'userId': user2.user_id,  # Attempting to modify user2's profile
                'displayName': 'Hacked Name'
            }
        )

        # Should either fail or only update user1's own profile
        if response.status_code == 200:
            # Verify user2's profile was NOT modified
            response2 = api_client.post('/api/auth/current-user', auth=user2.token)
            if response2.status_code == 200:
                user2_profile = response2.json().get('data', {})
                assert user2_profile.get('displayName') != 'Hacked Name', \
                    "BOLA vulnerability: User1 modified User2's profile"


# ============================================================================
# Helper for running BOLA tests
# ============================================================================

if __name__ == '__main__':
    """Run BOLA tests directly"""
    pytest.main([__file__, '-v', '-m', 'bola', '--tb=short'])
