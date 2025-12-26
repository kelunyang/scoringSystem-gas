"""
pytest configuration and fixtures for security tests

This file provides shared fixtures for all test files.
"""

import pytest
import sys
import os
from typing import Dict

# Add parent directory to path for imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from utils import APIClient, AuthHelper, AuthToken
from config import TestConfig, get_config


# ============================================================================
# Session-scoped fixtures (created once per test session)
# ============================================================================

@pytest.fixture(scope='session')
def config() -> TestConfig:
    """
    Load test configuration

    Returns:
        TestConfig instance with environment variables
    """
    return get_config()


@pytest.fixture(scope='session')
def api_client(config: TestConfig) -> APIClient:
    """
    Create API client instance

    Returns:
        Configured APIClient instance
    """
    client = APIClient(
        base_url=config.api_base_url,
        timeout=config.test_timeout
    )
    yield client
    client.close()


@pytest.fixture(scope='session')
def auth_helper(api_client: APIClient) -> AuthHelper:
    """
    Create authentication helper

    Returns:
        AuthHelper instance
    """
    return AuthHelper(api_client)


@pytest.fixture(scope='session')
def admin_token(auth_helper: AuthHelper, config: TestConfig) -> str:
    """
    Authenticate as admin and return JWT token

    This fixture performs the two-step login:
    1. Password verification
    2. 2FA verification (uses DEVMODE for development)

    Returns:
        Admin JWT token string

    Raises:
        Exception: If admin login fails
    """
    try:
        token = auth_helper.login(
            email=config.admin_email,
            password=config.admin_password,
            twofa_code=config.twofa_code,
            turnstile_token=config.turnstile_token
        )
        return token
    except Exception as e:
        pytest.fail(f"Admin login failed: {str(e)}")


@pytest.fixture(scope='session')
def admin_auth(auth_helper: AuthHelper, config: TestConfig) -> AuthToken:
    """
    Authenticate as admin and return AuthToken with user info

    Returns:
        AuthToken object with admin token and user information
    """
    try:
        auth_token = auth_helper.login_with_token_info(
            email=config.admin_email,
            password=config.admin_password,
            twofa_code=config.twofa_code,
            turnstile_token=config.turnstile_token
        )
        return auth_token
    except Exception as e:
        pytest.fail(f"Admin login failed: {str(e)}")


# ============================================================================
# Function-scoped fixtures (created for each test function)
# ============================================================================

@pytest.fixture
def test_user(auth_helper: AuthHelper, config: TestConfig) -> AuthToken:
    """
    Create a temporary test user for a single test

    NOTE: This requires a valid invitation code to be set in config.
    Set TEST_INVITATION_CODE in .env or generate one via admin.

    Returns:
        AuthToken for the created test user

    Raises:
        pytest.skip: If no invitation code is available
    """
    if not config.test_invitation_code:
        pytest.skip("No test invitation code available (set TEST_INVITATION_CODE in .env)")

    from utils import TestUserFactory
    factory = TestUserFactory(auth_helper)

    try:
        user = factory.create_test_user(
            invitation_code=config.test_invitation_code
        )
        yield user
        factory.cleanup()
    except Exception as e:
        pytest.fail(f"Test user creation failed: {str(e)}")


@pytest.fixture
def test_users(auth_helper: AuthHelper, config: TestConfig) -> Dict[str, AuthToken]:
    """
    Create multiple test users for cross-user testing

    Returns:
        Dictionary of test users: {'user1': AuthToken, 'user2': AuthToken, ...}

    Raises:
        pytest.skip: If no invitation code is available
    """
    if not config.test_invitation_code:
        pytest.skip("No test invitation code available (set TEST_INVITATION_CODE in .env)")

    from utils import TestUserFactory
    factory = TestUserFactory(auth_helper)

    try:
        users = {
            'user1': factory.create_test_user(username_prefix='testuser1'),
            'user2': factory.create_test_user(username_prefix='testuser2'),
        }
        yield users
        factory.cleanup()
    except Exception as e:
        pytest.fail(f"Test users creation failed: {str(e)}")


# ============================================================================
# Utility fixtures
# ============================================================================

@pytest.fixture(autouse=True)
def skip_destructive_tests(request, config: TestConfig):
    """
    Automatically skip destructive tests if configured

    Add @pytest.mark.destructive to tests that modify/delete data
    """
    if config.skip_destructive_tests and request.node.get_closest_marker('destructive'):
        pytest.skip('Destructive tests disabled (SKIP_DESTRUCTIVE_TESTS=true)')


@pytest.fixture
def api_health_check(api_client: APIClient):
    """
    Check if API is reachable before running tests

    This fixture can be added to tests that require API connectivity
    """
    if not api_client.health_check():
        pytest.fail("API is not reachable. Please start the dev server.")


# ============================================================================
# Hooks for test reporting
# ============================================================================

def pytest_configure(config):
    """Configure pytest with custom markers"""
    config.addinivalue_line(
        "markers", "destructive: tests that modify or delete data"
    )
    config.addinivalue_line(
        "markers", "requires_api: tests that require API to be running"
    )


def pytest_collection_modifyitems(config, items):
    """Modify test collection"""
    # Add 'requires_api' marker to all tests automatically
    for item in items:
        if "test_" in item.nodeid:
            item.add_marker(pytest.mark.requires_api)


@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    """
    Hook to capture test results for reporting

    This allows us to track security vulnerabilities found
    """
    outcome = yield
    report = outcome.get_result()

    # Only process failed tests
    if report.when == "call" and report.failed:
        # Extract vulnerability information if available
        if hasattr(item, 'vulnerability_info'):
            report.vulnerability = item.vulnerability_info
