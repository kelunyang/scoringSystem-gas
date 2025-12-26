"""
Authentication Helper for Security Testing

Handles the two-step login process:
1. Password verification
2. 2FA verification (can use 'DEVMODE' in development)
"""

from typing import Optional, Dict, Any
from dataclasses import dataclass
import jwt
from .api_client import APIClient


@dataclass
class AuthToken:
    """Authentication token information"""
    token: str
    user_id: str
    email: str
    username: Optional[str] = None
    role: Optional[str] = None

    def decode(self) -> Dict:
        """Decode JWT token (without verification for testing)"""
        return jwt.decode(self.token, options={"verify_signature": False})


class AuthHelper:
    """Helper class for authentication operations"""

    def __init__(self, api_client: APIClient):
        """
        Initialize authentication helper

        Args:
            api_client: APIClient instance
        """
        self.client = api_client

    def login(
        self,
        email: str,
        password: str,
        twofa_code: str = 'DEVMODE',
        turnstile_token: str = 'test'
    ) -> str:
        """
        Perform complete login flow and return JWT token

        Args:
            email: User email
            password: User password
            twofa_code: 2FA code (default: 'DEVMODE' for dev mode)
            turnstile_token: Cloudflare Turnstile token (default: 'test' for dev)

        Returns:
            JWT token string

        Raises:
            Exception: If login fails at any step
        """
        # Step 1: Verify password
        response = self.client.post('/api/auth/login-verify-password', json={
            'userEmail': email,
            'password': password,
            'turnstileToken': turnstile_token
        })

        if response.status_code != 200:
            raise Exception(
                f"Password verification failed: {response.status_code} - {response.text}"
            )

        data = response.json()
        if not data.get('success'):
            raise Exception(f"Password verification failed: {data.get('error', 'Unknown error')}")

        # Step 2: Verify 2FA
        response = self.client.post('/api/auth/login-verify-2fa', json={
            'userEmail': email,
            'code': twofa_code,
            'turnstileToken': turnstile_token
        })

        if response.status_code != 200:
            raise Exception(
                f"2FA verification failed: {response.status_code} - {response.text}"
            )

        data = response.json()
        if not data.get('success'):
            raise Exception(f"2FA verification failed: {data.get('error', 'Unknown error')}")

        # Extract token (sessionId is the JWT token)
        token = data.get('data', {}).get('sessionId')
        if not token:
            raise Exception("No session token returned from login")

        return token

    def login_with_token_info(
        self,
        email: str,
        password: str,
        twofa_code: str = 'DEVMODE',
        turnstile_token: str = 'test'
    ) -> AuthToken:
        """
        Perform login and return AuthToken with decoded info

        Returns:
            AuthToken object with token and user information
        """
        token = self.login(email, password, twofa_code, turnstile_token)

        # Decode token to extract user info
        decoded = jwt.decode(token, options={"verify_signature": False})

        return AuthToken(
            token=token,
            user_id=decoded.get('userId', ''),
            email=decoded.get('email', email),
            username=decoded.get('username'),
            role=decoded.get('role')
        )

    def verify_token(self, token: str) -> bool:
        """
        Verify if token is valid by making an authenticated request

        Args:
            token: JWT token to verify

        Returns:
            True if token is valid, False otherwise
        """
        try:
            response = self.client.post('/api/auth/current-user', json={
                'sessionId': token
            })
            if response.status_code != 200:
                return False
            data = response.json()
            return data.get('success', False)
        except Exception:
            return False

    def decode_token(self, token: str) -> Dict:
        """
        Decode JWT token without verification (for testing)

        Args:
            token: JWT token string

        Returns:
            Decoded token payload
        """
        return jwt.decode(token, options={"verify_signature": False})

    def get_user_profile(self, token: str) -> Optional[Dict]:
        """
        Get user profile using auth token

        Args:
            token: JWT token

        Returns:
            User profile data or None if request fails
        """
        response = self.client.post('/api/auth/current-user', json={
            'sessionId': token
        })

        if response.status_code != 200:
            return None

        data = response.json()
        return data.get('data') if data.get('success') else None

    def register_user(
        self,
        invitation_code: str,
        username: str,
        password: str,
        email: str,
        display_name: str,
        turnstile_token: str = 'test'
    ) -> Dict[str, Any]:
        """
        Register a new user

        Args:
            invitation_code: Valid invitation code
            username: Desired username
            password: User password
            email: User email
            display_name: User's display name
            turnstile_token: Turnstile token (default: 'test' for dev)

        Returns:
            Registration response data

        Raises:
            Exception: If registration fails
        """
        response = self.client.post('/api/auth/register', json={
            'invitationCode': invitation_code,
            'username': username,
            'password': password,
            'email': email,
            'displayName': display_name,
            'turnstileToken': turnstile_token
        })

        if response.status_code != 200:
            raise Exception(
                f"Registration failed: {response.status_code} - {response.text}"
            )

        data = response.json()
        if not data.get('success'):
            raise Exception(f"Registration failed: {data.get('error', 'Unknown error')}")

        return data.get('data', {})

    def logout(self, token: str) -> bool:
        """
        Logout user (if logout endpoint exists)

        Args:
            token: JWT token

        Returns:
            True if logout successful, False otherwise
        """
        try:
            response = self.client.post('/api/auth/logout', auth=token)
            return response.status_code == 200
        except Exception:
            return False


class TestUserFactory:
    """Factory for creating test users"""

    def __init__(self, auth_helper: AuthHelper):
        """
        Initialize test user factory

        Args:
            auth_helper: AuthHelper instance
        """
        self.auth_helper = auth_helper
        self._created_users = []

    def create_test_user(
        self,
        username_prefix: str = 'testuser',
        password: str = 'TestPassword123!',
        invitation_code: Optional[str] = None
    ) -> AuthToken:
        """
        Create a test user and return auth token

        Args:
            username_prefix: Prefix for username (will be made unique)
            password: User password
            invitation_code: Invitation code (must be provided or pre-generated)

        Returns:
            AuthToken for the created user

        Raises:
            Exception: If user creation fails
        """
        import time
        import random

        # Generate unique username and email
        timestamp = int(time.time())
        random_suffix = random.randint(1000, 9999)
        username = f"{username_prefix}_{timestamp}_{random_suffix}"
        email = f"{username}@test.local"
        display_name = f"Test User {timestamp}"

        if not invitation_code:
            raise ValueError("invitation_code is required for user creation")

        # Register user
        self.auth_helper.register_user(
            invitation_code=invitation_code,
            username=username,
            password=password,
            email=email,
            display_name=display_name
        )

        # Login to get token
        token_info = self.auth_helper.login_with_token_info(email, password)
        self._created_users.append(token_info)

        return token_info

    def get_created_users(self):
        """Get list of all created test users"""
        return self._created_users

    def cleanup(self):
        """Placeholder for cleanup logic (if needed)"""
        # In a real scenario, you might want to delete test users
        # For now, just clear the list
        self._created_users.clear()
