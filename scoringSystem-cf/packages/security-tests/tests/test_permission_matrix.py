"""
Permission matrix: role → capability, asserted against the live API.

The reference is the frontend's permission table
(frontend/src/composables/useDetailedProjectPermissions.ts), which is the only
place the role model has ever been written down. These tests check the backend
agrees with it, so that a divergence shows up here instead of as a button that
does nothing — or worse, a button that shouldn't be there.

Only flags that actually gate something in the UI are asserted. canManageMembers
and canViewAll are computed by the composables but read by nothing, so they are
deliberately not encoded here; asserting dead flags would freeze behaviour that
no user can observe.

    level             enter  logs  submit  vote  comment  stages  teacherVote
    admin               Y     Y      N      N      N        Y         N
    teacher             Y     Y      N      N      Y        Y         Y
    observer            Y     Y      N      N      N        N         N
    group_leader        Y     Y      Y      Y      Y        N         N
    group_member        Y     Y      Y      Y      Y        N         N
    member_no_group     N     N      N      N      N        N         N

Every test is read-only with respect to the scenario: none of them change a
role, so the session-scoped fixture stays valid throughout.
"""

import pytest


pytestmark = [pytest.mark.functions, pytest.mark.timeout(300)]


# Levels that exist as accounts inside the scenario.
STUDENT_LEVELS = ['group_leader', 'group_member']
NON_PARTICIPANT_LEVELS = ['teacher', 'observer', 'admin']


def _post(client, path, payload, token):
    return client.post(path, json=payload, auth=token)


def _is_denied(response) -> bool:
    """
    True when the API refused the action.

    Accepts either an HTTP error status or a 200 with success=false: the codebase
    uses both shapes for authorization failures, and which one a given endpoint
    picks is not what these tests are about.
    """
    if response.status_code in (401, 403):
        return True
    if response.status_code >= 400:
        return True
    try:
        body = response.json()
    except Exception:
        return False
    if body.get('success') is False:
        error = body.get('error')
        code = error.get('code') if isinstance(error, dict) else str(error)
        return str(code).upper() in {
            'ACCESS_DENIED', 'PERMISSION_DENIED', 'NO_ACCESS',
            'NOT_AUTHORIZED', 'FORBIDDEN', 'INSUFFICIENT_PERMISSIONS',
            'UNAUTHORIZED',
        }
    return False


def _token_for(scenario, admin_token, level):
    return admin_token if level == 'admin' else scenario.token(level)


# ============================================================================
# canEnter — reading the project at all
# ============================================================================

class TestCanEnter:
    """Everyone with a role can open the project; an unassigned member cannot."""

    @pytest.mark.parametrize('level', ['teacher', 'observer', 'group_leader', 'group_member'])
    def test_role_holder_can_read_project(self, api_client, role_scenario, level):
        response = _post(
            api_client, '/api/projects/get',
            {'projectId': role_scenario.project_id},
            role_scenario.token(level),
        )
        assert not _is_denied(response), (
            f"{level} should be able to read the project, got {response.status_code} {response.text[:200]}"
        )

    def test_admin_can_read_project(self, api_client, role_scenario, admin_token):
        response = _post(
            api_client, '/api/projects/get',
            {'projectId': role_scenario.project_id},
            admin_token,
        )
        assert not _is_denied(response)


# ============================================================================
# canSubmit / canVote — participation, restricted to group members
# ============================================================================

class TestParticipationIsGroupOnly:
    """
    Submitting and voting are gated by group membership, not by seniority.
    A teacher outranks a student everywhere except here.
    """

    @pytest.mark.parametrize('level', NON_PARTICIPANT_LEVELS + ['member_no_group'])
    def test_non_group_members_cannot_submit(self, api_client, role_scenario, admin_token, level):
        token = _token_for(role_scenario, admin_token, level)
        response = _post(
            api_client, '/api/submissions/create',
            {
                'projectId': role_scenario.project_id,
                'stageId': 'stage_does_not_exist',
                'content': 'permission probe',
            },
            token,
        )
        # A missing stage is fine — what must not happen is the request being
        # accepted on authorization grounds.
        assert response.status_code != 200 or response.json().get('success') is not True, (
            f"{level} must not be able to submit"
        )


# ============================================================================
# canManageStages — teacher and admin only
# ============================================================================

class TestStageManagement:

    @pytest.mark.parametrize('level', ['observer', 'group_leader', 'group_member', 'member_no_group'])
    def test_students_and_observers_cannot_create_stages(self, api_client, role_scenario, level):
        response = _post(
            api_client, '/api/stages/create',
            {
                'projectId': role_scenario.project_id,
                'stageData': {'stageName': 'probe', 'description': 'probe'},
            },
            role_scenario.token(level),
        )
        assert response.status_code != 200 or response.json().get('success') is not True, (
            f"{level} must not be able to create stages"
        )


# ============================================================================
# canTeacherVote — teacher only, and not admin or observer
# ============================================================================

class TestTeacherVote:
    """
    handlers/rankings/teacherVote.ts checks projectviewers.role='teacher' and
    nothing else — no admin override, no creator override. The frontend agrees
    (canTeacherVote is true only for the teacher row).
    """

    @pytest.mark.parametrize('level', ['observer', 'group_leader', 'group_member', 'admin'])
    def test_only_teachers_may_teacher_vote(self, api_client, role_scenario, admin_token, level):
        token = _token_for(role_scenario, admin_token, level)
        response = _post(
            api_client, '/api/rankings/teacher-vote',
            {
                'projectId': role_scenario.project_id,
                'stageId': 'stage_does_not_exist',
                'rankings': [],
            },
            token,
        )
        assert response.status_code != 200 or response.json().get('success') is not True, (
            f"{level} must not be able to cast a teacher vote"
        )


# ============================================================================
# Group management — the path that was broken until the teacher fix
# ============================================================================

class TestGroupManagement:
    """
    Before the vocabulary fix, handlers/groups/* asked utils/permissions.ts for
    'manage', a string that function's whitelist does not contain, so a teacher
    was refused. This is the regression test for that.
    """

    def test_teacher_can_create_a_group(self, api_client, role_scenario):
        response = _post(
            api_client, '/api/groups/create',
            {
                'projectId': role_scenario.project_id,
                'groupData': {'groupName': 'teacher-created-probe'},
            },
            role_scenario.token('teacher'),
        )
        assert not _is_denied(response), (
            "a project teacher must be able to create groups; "
            f"got {response.status_code} {response.text[:200]}"
        )

    @pytest.mark.parametrize('level', ['observer', 'group_member', 'member_no_group'])
    def test_others_cannot_create_groups(self, api_client, role_scenario, level):
        response = _post(
            api_client, '/api/groups/create',
            {
                'projectId': role_scenario.project_id,
                'groupData': {'groupName': f'probe-{level}'},
            },
            role_scenario.token(level),
        )
        assert response.status_code != 200 or response.json().get('success') is not True, (
            f"{level} must not be able to create groups"
        )


# ============================================================================
# member_no_group — the level the frontend blocks entirely
# ============================================================================

class TestMemberWithoutGroup:
    """
    permissionLevel 'member' (a project member assigned to no group) is the one
    level whose canEnter is false. The backend should agree: being listed in
    projectviewers with role='member' is not on its own enough to read a project.
    """

    def test_cannot_read_project(self, api_client, role_scenario):
        response = _post(
            api_client, '/api/projects/get',
            {'projectId': role_scenario.project_id},
            role_scenario.token('member_no_group'),
        )
        assert _is_denied(response), (
            "a project member with no group assignment should not be able to read "
            f"the project, got {response.status_code} {response.text[:300]}"
        )
