"""
Multi-role scenario builder.

The existing fixtures only give you an admin and an anonymous test user, which
means every role-dependent authorization path is untested. This builds a complete
project with one account per permission level so those paths can be exercised.

Levels mirror the frontend's permission table
(frontend/src/composables/useDetailedProjectPermissions.ts):

    admin            system_admin, no project role
    teacher          projectviewers.role = 'teacher'
    observer         projectviewers.role = 'observer'
    group_leader     projectviewers.role = 'member' + usergroups.role = 'leader'
    group_member     projectviewers.role = 'member' + usergroups.role = 'member'
    member_no_group  projectviewers.role = 'member', no group at all

Nothing here is destructive to existing data: it creates its own project, its own
group and its own users, and deletes the project on teardown. The users remain
(there is no user-deletion endpoint) but hold no roles once the project is gone.
"""

import os
import time
import random
import string
from dataclasses import dataclass, field
from typing import Dict, List, Optional
from urllib.parse import urlparse

from .api_client import APIClient
from .auth_helper import AuthHelper


# Password used for every generated account. Must satisfy the registration
# schema (length + character classes); it is local-only test data.
TEST_PASSWORD = 'TestPass123!'

# Global group used to own the scenario's project. The per-creator project cap
# is counted against createdBy, so the project cannot be owned by the operator's
# own admin account without eating into their quota. This group carries
# create_project and nothing else — deliberately not system_admin.
OWNER_GROUP_NAME = 'security-test-project-owner'
OWNER_GROUP_PERMISSIONS = ['create_project']

_LOCAL_HOSTS = {'localhost', '127.0.0.1', '0.0.0.0', '::1'}


def assert_safe_target(base_url: str) -> None:
    """
    Refuse to build the scenario against a non-local API.

    Building registers accounts and creates a global group — side effects that
    must never land in a real deployment by accident. Override deliberately with
    ALLOW_REMOTE_ROLE_SCENARIO=1 if you really are testing a disposable
    environment.
    """
    if os.environ.get('ALLOW_REMOTE_ROLE_SCENARIO') == '1':
        return
    host = (urlparse(base_url).hostname or '').lower()
    if host not in _LOCAL_HOSTS:
        raise RuntimeError(
            f"refusing to create test accounts against non-local host '{host}'. "
            f"This fixture registers users and a global group. "
            f"Set ALLOW_REMOTE_ROLE_SCENARIO=1 only for a disposable environment."
        )


@dataclass
class RoleAccount:
    """One test account plus the token it authenticates with."""
    level: str
    email: str
    username: str
    token: str
    user_id: str = ''


@dataclass
class RoleScenario:
    """A project wired up with one account per permission level."""
    project_id: str
    group_id: str
    accounts: Dict[str, RoleAccount] = field(default_factory=dict)
    _created_codes: List[str] = field(default_factory=list)

    def token(self, level: str) -> str:
        """Token for the given level, e.g. scenario.token('observer')."""
        return self.accounts[level].token

    def email(self, level: str) -> str:
        return self.accounts[level].email


def _unique_suffix() -> str:
    stamp = int(time.time() * 1000)
    noise = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
    return f"{stamp}_{noise}"


class RoleScenarioBuilder:
    """
    Builds a RoleScenario against a live backend.

    Requires an admin token with system_admin (to mint invitation codes, create
    the project and assign roles).
    """

    # Levels that need their own registered account. 'admin' is supplied by the
    # existing admin fixture and is deliberately not re-created here.
    STUDENT_LEVELS = ('group_leader', 'group_member', 'member_no_group')
    VIEWER_LEVELS = ('teacher', 'observer')

    def __init__(self, client: APIClient, auth: AuthHelper, admin_token: str):
        assert_safe_target(client.base_url)
        self.client = client
        self.auth = auth
        self.admin_token = admin_token
        self._project_id: Optional[str] = None
        self._owner_token: Optional[str] = None

    # ------------------------------------------------------------------
    # low-level API calls
    # ------------------------------------------------------------------

    def _post(self, path: str, payload: dict, token: Optional[str] = None) -> dict:
        response = self.client.post(
            path, json=payload, auth=token if token is not None else self.admin_token
        )
        if response.status_code != 200:
            raise RuntimeError(f"{path} -> HTTP {response.status_code}: {response.text}")
        body = response.json()
        if not body.get('success'):
            raise RuntimeError(f"{path} -> {body.get('error')}")
        return body.get('data') or {}

    def _mint_invitation(self, target_email: str, global_groups: Optional[List[str]] = None) -> str:
        payload = {'targetEmail': target_email, 'validDays': 1}
        if global_groups:
            payload['defaultGlobalGroups'] = global_groups
        data = self._post('/api/invitations/generate', payload)
        code = data.get('invitationCode') or data.get('code')
        if not code:
            raise RuntimeError(f"invitation response missing code: {data}")
        return code

    def _ensure_owner_group(self) -> str:
        """Return the id of the create_project-only group, creating it if absent."""
        response = self.client.get('/api/admin/global-groups', auth=self.admin_token)
        if response.status_code == 200:
            body = response.json()
            groups = (body.get('data') or {}).get('groups') or body.get('data') or []
            if isinstance(groups, list):
                for group in groups:
                    if isinstance(group, dict) and group.get('groupName') == OWNER_GROUP_NAME:
                        return group['globalGroupId']

        # NB: the route is /create-global-group, not /global-groups/create — the
        # latter is only mentioned in a stale comment at the top of router/admin.ts.
        data = self._post('/api/admin/create-global-group', {
            'groupData': {
                'groupName': OWNER_GROUP_NAME,
                'description': 'Owns projects created by the security test suite. create_project only.',
                'globalPermissions': OWNER_GROUP_PERMISSIONS,
            }
        })
        # The create response names it groupId; the list response names it
        # globalGroupId. Accept either rather than depending on one.
        group_id = (
            data.get('globalGroupId')
            or data.get('groupId')
            or (data.get('group') or {}).get('globalGroupId')
        )
        if not group_id:
            raise RuntimeError(f"create global group returned no id: {data}")
        return group_id

    def _register_and_login(self, level: str, global_groups: Optional[List[str]] = None) -> RoleAccount:
        suffix = _unique_suffix()
        username = f"role_{level}_{suffix}"
        email = f"{username}@test.local"

        code = self._mint_invitation(email, global_groups)
        self.auth.register_user(
            invitation_code=code,
            username=username,
            password=TEST_PASSWORD,
            email=email,
            display_name=f"Role {level}",
        )
        token_info = self.auth.login_with_token_info(email, TEST_PASSWORD)
        return RoleAccount(
            level=level,
            email=email,
            username=username,
            token=token_info.token,
            user_id=token_info.user_id,
        )

    # ------------------------------------------------------------------
    # scenario assembly
    # ------------------------------------------------------------------

    def build(self) -> RoleScenario:
        accounts: Dict[str, RoleAccount] = {}

        # 1. One account per non-admin level.
        for level in self.VIEWER_LEVELS + self.STUDENT_LEVELS:
            accounts[level] = self._register_and_login(level)

        # 2. A project, owned by a dedicated account rather than the operator's
        #    admin. The concurrent-project cap is per creator, so borrowing the
        #    operator's quota would make the fixture fail once they have 5 live
        #    projects — which is exactly what happened the first time.
        owner_group = self._ensure_owner_group()
        owner = self._register_and_login('project_owner', [owner_group])
        accounts['project_owner'] = owner
        self._owner_token = owner.token

        project = self._post('/api/projects/create', {
            'projectData': {
                'projectName': f"perm-matrix-{_unique_suffix()}",
                'description': 'Auto-generated by RoleScenarioBuilder. Safe to delete.',
            }
        }, token=owner.token)
        project_id = project.get('projectId')
        if not project_id:
            raise RuntimeError(f"create project returned no projectId: {project}")
        self._project_id = project_id

        # 3. Project roles. Students are viewers with role='member'; the group
        #    membership added below is what separates leader from member.
        for level in self.VIEWER_LEVELS:
            self._post('/api/projects/viewers/add', {
                'projectId': project_id,
                'userEmail': accounts[level].email,
                'role': level,
            })
        for level in self.STUDENT_LEVELS:
            self._post('/api/projects/viewers/add', {
                'projectId': project_id,
                'userEmail': accounts[level].email,
                'role': 'member',
            })

        # 4. One group, holding the leader and the plain member.
        #    member_no_group is deliberately left out.
        group = self._post('/api/groups/create', {
            'projectId': project_id,
            'groupData': {'groupName': 'perm-matrix-group'},
        })
        group_id = group.get('groupId')
        if not group_id:
            raise RuntimeError(f"create group returned no groupId: {group}")

        self._post('/api/groups/add-member', {
            'projectId': project_id,
            'groupId': group_id,
            'userEmail': accounts['group_leader'].email,
            'role': 'leader',
        })
        self._post('/api/groups/add-member', {
            'projectId': project_id,
            'groupId': group_id,
            'userEmail': accounts['group_member'].email,
            'role': 'member',
        })

        return RoleScenario(
            project_id=project_id,
            group_id=group_id,
            accounts=accounts,
        )

    def teardown(self) -> None:
        """Delete the generated project. Failures are non-fatal."""
        if not self._project_id:
            return
        try:
            self.client.post(
                '/api/projects/delete',
                json={'projectId': self._project_id},
                auth=self._owner_token or self.admin_token,
            )
        except Exception:
            pass
