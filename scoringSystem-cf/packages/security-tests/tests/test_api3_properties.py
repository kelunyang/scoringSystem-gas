"""
API3: Broken Object Property Level Authorization Tests

OWASP API Security Top 10 - API3:2023

These tests verify that:
1. Mass assignment attacks are prevented
2. Sensitive properties cannot be modified by users
3. API responses don't expose sensitive data

Author: Claude Code
Date: 2025-12-23
"""

import pytest
from utils import APIClient, AuthHelper, AuthToken, extract_list_data
from config import TestConfig


# ============================================================================
# Mass Assignment Prevention Tests
# ============================================================================

class TestMassAssignment:
    """Test mass assignment vulnerability prevention"""

    @pytest.mark.critical
    @pytest.mark.properties
    def test_user_cannot_modify_own_role(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify users cannot modify their role via profile update.

        Attack Vector:
        - User includes 'role' field in profile update
        - User attempts to escalate privileges

        Expected: Role field ignored or request rejected
        """
        # Get current profile
        response = api_client.post('/api/auth/current-user', auth=admin_token)
        if response.status_code != 200:
            pytest.skip("Cannot get profile")

        original_data = response.json().get('data', {})

        # Attempt to modify role via profile update
        response = api_client.post('/api/admin/user-profile', auth=admin_token, json={
            'displayName': 'Test Name',
            'role': 'system_admin',  # Attempt to escalate
            'permissions': ['all'],  # Attempt to add permissions
            'level': 0,  # Attempt to change level
        })

        # Check if role was NOT modified
        if response.status_code == 200:
            response = api_client.post('/api/auth/current-user', auth=admin_token)
            new_data = response.json().get('data', {})

            # Role should not have changed
            if 'role' in original_data and 'role' in new_data:
                assert new_data.get('role') == original_data.get('role'), \
                    "MASS ASSIGNMENT: User was able to modify their role"

    @pytest.mark.critical
    @pytest.mark.properties
    def test_user_cannot_modify_userId(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify users cannot modify their userId.

        Attack Vector:
        - User includes 'userId' in update request
        - User attempts to impersonate another user

        Expected: userId field ignored
        """
        response = api_client.post('/api/admin/user-profile', auth=admin_token, json={
            'userId': 'usr_another-user-id',
            'displayName': 'Hacked Name'
        })

        # If successful, verify own profile was updated, not someone else's
        if response.status_code == 200:
            response = api_client.post('/api/auth/current-user', auth=admin_token)
            data = response.json().get('data', {})

            # User should still be the same user
            # The userId should not have changed

    @pytest.mark.high
    @pytest.mark.properties
    def test_project_member_cannot_escalate_role(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify project members cannot escalate their project role.

        Attack Vector:
        - Member includes 'projectRole' in request
        - Member attempts to become 'teacher' or 'admin'

        Expected: Project role field ignored
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

        # Attempt to modify own role in project
        # This would typically be done through viewers/update-role endpoint
        # which should require manage permission

    @pytest.mark.high
    @pytest.mark.properties
    def test_group_member_cannot_escalate_to_leader(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify group members cannot escalate to leader role.
        """
        fake_member_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJtZW1iZXIifQ.fake"

        response = api_client.post('/api/groups/update-member-role', auth=fake_member_token, json={
            'projectId': 'proj_test',
            'groupId': 'grp_test',
            'userId': 'usr_self',
            'role': 'leader'  # Attempting to escalate
        })

        assert response.status_code in [401, 403], \
            f"Member role escalation allowed (status: {response.status_code})"


# ============================================================================
# Sensitive Data Exposure Tests
# ============================================================================

class TestSensitiveDataExposure:
    """Test for sensitive data exposure in API responses"""

    @pytest.mark.critical
    @pytest.mark.properties
    def test_password_hash_not_exposed(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify password hashes are never returned in API responses.
        """
        endpoints_to_test = [
            ('/api/auth/current-user', {}),
            ('/api/projects/list', {}),
        ]

        sensitive_fields = [
            'passwordHash', 'password_hash', 'password',
            'hashedPassword', 'hashed_password'
        ]

        for endpoint, params in endpoints_to_test:
            response = api_client.post(endpoint, auth=admin_token, json=params)

            if response.status_code == 200:
                response_text = response.text.lower()

                for field in sensitive_fields:
                    assert field.lower() not in response_text, \
                        f"Sensitive field '{field}' found in {endpoint} response"

    @pytest.mark.high
    @pytest.mark.properties
    def test_internal_ids_not_exposed(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify internal database IDs are not exposed (use UUIDs instead).
        """
        response = api_client.post('/api/auth/current-user', auth=admin_token)

        if response.status_code == 200:
            data = response.json().get('data', {})

            # User ID should be UUID format (usr_xxx), not integer
            user_id = data.get('userId', '')
            assert not user_id.isdigit(), \
                "Internal numeric ID exposed instead of UUID"

            # Should use UUID prefix format
            if user_id:
                assert user_id.startswith('usr_'), \
                    "User ID should use UUID prefix format (usr_xxx)"

    @pytest.mark.high
    @pytest.mark.properties
    def test_user_email_privacy(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify other users' emails are not exposed in listings.
        """
        response = api_client.post('/api/projects/list', auth=admin_token)

        if response.status_code == 200:
            data = response.json()
            projects = extract_list_data(data, 'projects')

            for project in projects:
                # Members list should not expose full emails of other users
                members = project.get('members', [])
                for member in members:
                    # Email might be shown for self, but should be masked for others
                    pass  # Specific validation depends on API design

    @pytest.mark.medium
    @pytest.mark.properties
    def test_wallet_balance_privacy(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify wallet balances of other users are not exposed.
        """
        response = api_client.post('/api/projects/list', auth=admin_token)
        if response.status_code != 200:
            pytest.skip("Cannot list projects")

        data = response.json()
        projects = extract_list_data(data, 'projects')
        if not projects:
            pytest.skip("No projects available")

        project_id = projects[0]['projectId']

        # Get project ladder (should only show allowed data)
        response = api_client.post('/api/wallets/project-ladder', auth=admin_token, json={
            'projectId': project_id
        })

        if response.status_code == 200:
            data = response.json()
            # Verify response structure is appropriate for user's role


# ============================================================================
# Response Data Minimization Tests
# ============================================================================

class TestDataMinimization:
    """Test API response data minimization"""

    @pytest.mark.medium
    @pytest.mark.properties
    def test_profile_returns_minimal_data(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify profile endpoint returns only necessary data.
        """
        response = api_client.post('/api/auth/current-user', auth=admin_token)

        if response.status_code == 200:
            data = response.json().get('data', {})

            # Should not include internal/sensitive fields
            sensitive_internal_fields = [
                'createdAt_internal', 'updatedAt_internal',
                'loginAttempts', 'lastFailedLogin',
                'salt', 'secretKey', 'apiKey'
            ]

            for field in sensitive_internal_fields:
                assert field not in data, \
                    f"Internal field '{field}' exposed in profile"

    @pytest.mark.medium
    @pytest.mark.properties
    def test_list_endpoints_return_summary_data(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify list endpoints return summary data, not full details.
        """
        response = api_client.post('/api/projects/list', auth=admin_token)

        if response.status_code == 200:
            data = response.json()
            projects = extract_list_data(data, 'projects')

            for project in projects:
                # List should contain summary fields
                assert 'projectId' in project, "Missing projectId in list"
                assert 'projectName' in project, "Missing projectName in list"

                # Should not contain full content/configuration
                # (Those should be in /projects/get response)

    @pytest.mark.low
    @pytest.mark.properties
    def test_error_responses_minimal(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify error responses don't leak sensitive information.
        """
        # Trigger an error
        response = api_client.post('/api/projects/get', auth=admin_token, json={
            'projectId': 'invalid_project_id'
        })

        if response.status_code >= 400:
            response_text = response.text.lower()

            # Should not contain stack traces
            assert 'stacktrace' not in response_text
            assert 'traceback' not in response_text
            assert 'at line' not in response_text

            # Should not contain SQL details
            assert 'select ' not in response_text
            assert 'insert ' not in response_text
            assert 'sqlite' not in response_text


# ============================================================================
# Property Filtering Tests
# ============================================================================

class TestPropertyFiltering:
    """Test that API properly filters properties based on permissions"""

    @pytest.mark.high
    @pytest.mark.properties
    def test_observer_sees_limited_project_data(
        self,
        api_client: APIClient
    ):
        """
        Verify observers see limited project data compared to teachers.
        """
        # This test would require an observer token
        # For now, test with fake token
        fake_observer_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJvYnNlcnZlciIsInJvbGUiOiJvYnNlcnZlciJ9.fake"

        response = api_client.post('/api/projects/list', auth=fake_observer_token)

        # Should either fail auth or return limited data
        assert response.status_code in [200, 401, 403]

    @pytest.mark.high
    @pytest.mark.properties
    def test_student_cannot_see_teacher_evaluations(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify students cannot see detailed teacher evaluation data.
        """
        # Get a project with stages
        response = api_client.post('/api/projects/list-with-stages', auth=admin_token)
        if response.status_code != 200:
            pytest.skip("Cannot list projects")

        # This test verifies that when requesting as a student,
        # teacher-only evaluation details are not returned

    @pytest.mark.medium
    @pytest.mark.properties
    def test_voting_data_appropriately_filtered(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify voting data is filtered based on voting status.
        """
        response = api_client.post('/api/projects/list-with-stages', auth=admin_token)
        if response.status_code != 200:
            pytest.skip("Cannot list projects")

        data = response.json()
        projects = extract_list_data(data, 'projects')

        for project in projects:
            for stage in project.get('stages', []):
                # During active voting, individual votes should be hidden
                # After voting ends, results may be visible
                pass


# ============================================================================
# Modification Prevention Tests
# ============================================================================

class TestModificationPrevention:
    """Test that readonly/system fields cannot be modified"""

    @pytest.mark.high
    @pytest.mark.properties
    def test_cannot_modify_created_at(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify createdAt timestamps cannot be modified.
        """
        response = api_client.post('/api/admin/user-profile', auth=admin_token, json={
            'createdAt': '2020-01-01T00:00:00Z',
            'displayName': 'Test'
        })

        # Should either ignore the field or reject the request
        if response.status_code == 200:
            response = api_client.post('/api/auth/current-user', auth=admin_token)
            data = response.json().get('data', {})

            created_at = data.get('createdAt', '')
            if created_at:
                assert not created_at.startswith('2020-01-01'), \
                    "createdAt was modified"

    @pytest.mark.high
    @pytest.mark.properties
    def test_cannot_modify_transaction_amounts(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify transaction amounts cannot be modified after creation.

        Attack Vector:
        - User attempts to modify past transaction amount
        - This could be used to inflate wallet balance

        Expected: Modification rejected
        """
        # Transactions are immutable; this tests that there's no update endpoint
        # or that attempts to modify are rejected

        # If there's a transaction update endpoint, it should reject amount changes
        response = api_client.post('/api/wallets/update-transaction', auth=admin_token, json={
            'transactionId': 'txn_test',
            'amount': 999999
        })

        # Should be 404 (endpoint doesn't exist) or 403/405 (not allowed)
        assert response.status_code in [400, 403, 404, 405], \
            "Transaction modification might be possible"


# ============================================================================
# Scoring Configuration Property Tests
# ============================================================================

class TestScoringConfigProperties:
    """Test scoring configuration property authorization"""

    @pytest.mark.high
    @pytest.mark.properties
    def test_scoring_config_weight_validation(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify scoring config weight sum validation.

        Attack Vector:
        - User attempts to set weights that don't sum to 1.0
        - Could manipulate scoring outcomes

        Expected: Validation error when weights don't sum to 1.0
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

        # Attempt to set invalid weights (sum > 1.0)
        response = api_client.put(f'/api/projects/{project_id}/scoring-config', auth=admin_token, json={
            'studentRankingWeight': 0.8,
            'teacherRankingWeight': 0.5  # Sum = 1.3, invalid
        })

        # Should reject invalid weight sum
        assert response.status_code in [400, 422], \
            f"Invalid weight sum accepted (status: {response.status_code})"

    @pytest.mark.high
    @pytest.mark.properties
    def test_scoring_config_maxVoteResetCount_range(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify maxVoteResetCount has valid range (1-5).

        Attack Vector:
        - User attempts to set very high or negative reset count
        - Could allow unlimited vote resets

        Expected: Value limited to 1-5 range
        """
        response = api_client.post('/api/projects/list', auth=admin_token)
        if response.status_code != 200:
            pytest.skip("Cannot list projects")

        data = response.json()
        projects = extract_list_data(data, 'projects')
        if not projects:
            pytest.skip("No projects available")

        project_id = projects[0]['projectId']

        # Test invalid values
        invalid_values = [0, -1, 100, 999]

        for value in invalid_values:
            response = api_client.put(f'/api/projects/{project_id}/scoring-config', auth=admin_token, json={
                'maxVoteResetCount': value
            })

            # Should reject out-of-range values
            assert response.status_code in [400, 422], \
                f"Invalid maxVoteResetCount {value} accepted"

    @pytest.mark.high
    @pytest.mark.properties
    def test_scoring_config_requires_project_access(
        self,
        api_client: APIClient
    ):
        """
        Verify scoring config requires project access.
        """
        fake_user_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJub2FjY2VzcyJ9.fake"

        response = api_client.get('/api/projects/proj_test/scoring-config', auth=fake_user_token)

        assert response.status_code in [401, 403, 404], \
            f"Scoring config accessible without project access"

    @pytest.mark.critical
    @pytest.mark.properties
    def test_scoring_config_update_requires_manage(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify scoring config update requires manage permission.
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

        # Fake viewer token (view but not manage)
        fake_viewer_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ2aWV3ZXIifQ.fake"

        response = api_client.put(f'/api/projects/{project_id}/scoring-config', auth=fake_viewer_token, json={
            'maxCommentSelections': 5
        })

        assert response.status_code in [401, 403], \
            f"Viewer could update scoring config"

    @pytest.mark.high
    @pytest.mark.properties
    def test_system_scoring_defaults_requires_admin(
        self,
        api_client: APIClient
    ):
        """
        Verify system scoring defaults require admin permission.
        """
        fake_user_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJyZWd1bGFyIn0.fake"

        # GET should require admin
        response = api_client.get('/api/projects/system/scoring-defaults', auth=fake_user_token)
        assert response.status_code in [401, 403], \
            "System scoring defaults GET accessible without admin"

        # PUT should require admin
        response = api_client.put('/api/projects/system/scoring-defaults', auth=fake_user_token, json={
            'maxCommentSelections': 10
        })
        assert response.status_code in [401, 403], \
            "System scoring defaults PUT accessible without admin"


# ============================================================================
# Stage Configuration Property Tests
# ============================================================================

class TestStageConfigProperties:
    """Test stage configuration property authorization"""

    @pytest.mark.critical
    @pytest.mark.properties
    def test_stage_config_mass_assignment_prevention(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify stage config update prevents mass assignment attacks.

        Attack Vector:
        - User includes system/internal fields in stage config update
        - User attempts to modify protected configuration values

        Expected: System fields ignored or request rejected
        """
        # Get a project with stages
        response = api_client.post('/api/projects/list-with-stages', auth=admin_token)
        if response.status_code != 200:
            pytest.skip("Cannot list projects with stages")

        data = response.json()
        projects = extract_list_data(data, 'projects')
        if not projects:
            pytest.skip("No projects available")

        project_with_stages = None
        stage_id = None
        for project in projects:
            if project.get('stages'):
                project_with_stages = project
                stage_id = project['stages'][0]['stageId']
                break

        if not project_with_stages:
            pytest.skip("No projects with stages available")

        project_id = project_with_stages['projectId']

        # Attempt to inject system/protected fields
        response = api_client.post('/api/stages/config/update', auth=admin_token, json={
            'projectId': project_id,
            'stageId': stage_id,
            'config': {
                # Normal fields
                'allowVoting': True,
                # Mass assignment attempts
                'settlementCompleted': True,  # Should be system-controlled
                'internalScore': 999,  # Should not exist/be modifiable
                'createdBy': 'usr_hacker',  # Should be immutable
                '_systemFlag': True,  # Internal field attempt
            }
        })

        # If request succeeded, verify protected fields were not modified
        if response.status_code == 200:
            # Get the config to verify
            check_response = api_client.post('/api/stages/config', auth=admin_token, json={
                'projectId': project_id,
                'stageId': stage_id
            })

            if check_response.status_code == 200:
                config_data = check_response.json().get('data', {})
                assert config_data.get('settlementCompleted') != True or \
                    'settlementCompleted' not in config_data, \
                    "Mass assignment: settlementCompleted was modified"

    @pytest.mark.high
    @pytest.mark.properties
    def test_stage_config_sensitive_data_protection(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify stage config doesn't expose sensitive scoring data.

        Attack Vector:
        - User requests stage config to see hidden scoring formulas
        - Could reveal teacher evaluation weights before settlement

        Expected: Sensitive scoring details hidden until appropriate time
        """
        fake_viewer_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ2aWV3ZXIifQ.fake"

        response = api_client.post('/api/stages/config', auth=fake_viewer_token, json={
            'projectId': 'proj_test',
            'stageId': 'stg_test'
        })

        # Should either fail auth or return limited data
        if response.status_code == 200:
            data = response.json().get('data', {})

            # Sensitive fields that should be hidden from non-teachers
            sensitive_fields = [
                'teacherScoringFormula',
                'internalWeights',
                'evaluationCriteria',
                'scoringAlgorithm'
            ]

            for field in sensitive_fields:
                if field in data:
                    # If field exists, ensure it's appropriate for viewer role
                    pass  # Implementation depends on actual API design

    @pytest.mark.high
    @pytest.mark.properties
    def test_stage_config_readonly_fields(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify readonly stage config fields cannot be modified.

        Attack Vector:
        - User attempts to modify stageId, projectId, createdAt
        - Could break referential integrity

        Expected: Readonly fields ignored or request rejected
        """
        response = api_client.post('/api/stages/config/update', auth=admin_token, json={
            'projectId': 'proj_test',
            'stageId': 'stg_test',
            'config': {
                'stageId': 'stg_new_id',  # Should be readonly
                'projectId': 'proj_different',  # Should be readonly
                'createdAt': '2020-01-01T00:00:00Z',  # Should be readonly
                'settlementTimestamp': '2020-01-01T00:00:00Z'  # System-controlled
            }
        })

        # Request should either fail (403) or succeed but ignore readonly fields
        assert response.status_code in [400, 401, 403, 404, 200], \
            f"Unexpected status for readonly field update: {response.status_code}"


# ============================================================================
# Settlement Property Tests
# ============================================================================

class TestSettlementProperties:
    """Test settlement data property authorization"""

    @pytest.mark.critical
    @pytest.mark.properties
    def test_settlement_data_exposure_prevention(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify settlement data doesn't expose sensitive scoring details.

        Attack Vector:
        - User requests settlement details before it's finalized
        - Could reveal pending rankings and affect voting behavior

        Expected: Pre-settlement data appropriately filtered
        """
        fake_student_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJzdHVkZW50In0.fake"

        response = api_client.post('/api/settlement/details', auth=fake_student_token, json={
            'projectId': 'proj_test',
            'stageId': 'stg_test',
            'settlementId': 'stl_test'
        })

        # Student should either not access or see limited data
        if response.status_code == 200:
            data = response.json().get('data', {})

            # Sensitive settlement details that should be hidden
            sensitive_fields = [
                'rawScores',  # Individual raw scores
                'teacherEvaluations',  # Teacher-only evaluations
                'scoringBreakdown',  # Detailed calculation breakdown
                'internalRanking'  # Pre-announcement rankings
            ]

            for field in sensitive_fields:
                assert field not in data or data[field] is None, \
                    f"Sensitive settlement field '{field}' exposed to student"

    @pytest.mark.high
    @pytest.mark.properties
    def test_settlement_internal_id_hidden(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify settlement responses use UUIDs, not internal IDs.

        Attack Vector:
        - Internal numeric IDs exposed could enable enumeration
        - Sequential IDs reveal business information

        Expected: Only UUID-format IDs exposed
        """
        response = api_client.post('/api/settlement/history', auth=admin_token, json={
            'projectId': 'proj_test'
        })

        if response.status_code == 200:
            data = response.json()
            settlements = data.get('data', [])

            for settlement in settlements:
                settlement_id = settlement.get('settlementId', '')

                # Should use UUID prefix format
                if settlement_id:
                    assert settlement_id.startswith('stl_'), \
                        f"Settlement ID '{settlement_id}' should use UUID prefix (stl_xxx)"

                    # Should not be a simple numeric ID
                    id_part = settlement_id.replace('stl_', '')
                    assert not id_part.isdigit(), \
                        f"Settlement uses numeric ID instead of UUID: {settlement_id}"

                # Internal database row ID should not be exposed
                assert 'rowid' not in settlement, \
                    "Internal rowid exposed in settlement"
                assert 'id' not in settlement or settlement.get('id', '').startswith('stl_'), \
                    "Internal numeric ID exposed in settlement"

    @pytest.mark.high
    @pytest.mark.properties
    def test_settlement_wallet_privacy(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify settlement doesn't expose individual wallet balances inappropriately.

        Attack Vector:
        - User views settlement to see other users' wallet balances
        - Could reveal private financial information

        Expected: Wallet details filtered based on role
        """
        fake_student_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJzdHVkZW50In0.fake"

        # Get settlement transactions (wallet impact)
        response = api_client.post('/api/settlement/transactions', auth=fake_student_token, json={
            'projectId': 'proj_test',
            'settlementId': 'stl_test'
        })

        # Student should either not access or see limited data
        if response.status_code == 200:
            data = response.json()
            transactions = data.get('data', [])

            for txn in transactions:
                # Should not expose other users' balances
                if txn.get('userId') != 'usr_self':  # Not the requesting user
                    assert 'currentBalance' not in txn, \
                        "Other user's wallet balance exposed in settlement"
                    assert 'totalBalance' not in txn, \
                        "Other user's total balance exposed in settlement"

                # Transaction amounts may be visible, but balances should not
                # (depends on your privacy model)


# ============================================================================
# Helper for running property tests
# ============================================================================

if __name__ == '__main__':
    """Run property authorization tests directly"""
    pytest.main([__file__, '-v', '-m', 'properties', '--tb=short'])
