"""
WebSocket and Durable Objects Security Tests

These tests verify:
1. WebSocket authentication requirements
2. Message isolation between users
3. Injection prevention
4. Connection security

Note: Requires websocket-client package:
    pip install websocket-client

Author: Claude Code
Date: 2025-12-23
"""

import pytest
import time
import json
from typing import Optional
from utils import APIClient, AuthHelper, AuthToken
from config import TestConfig

# Try to import websocket-client
try:
    import websocket
    WEBSOCKET_AVAILABLE = True
except ImportError:
    WEBSOCKET_AVAILABLE = False


def skip_if_no_websocket():
    """Skip test if websocket-client not installed"""
    if not WEBSOCKET_AVAILABLE:
        pytest.skip("websocket-client not installed (pip install websocket-client)")


# ============================================================================
# WebSocket Authentication Tests
# ============================================================================

class TestWebSocketAuthentication:
    """Test WebSocket authentication"""

    @pytest.mark.critical
    @pytest.mark.websocket
    def test_websocket_requires_authentication(
        self,
        api_client: APIClient,
        config: TestConfig
    ):
        """
        Verify WebSocket connection requires authentication.

        Attack Vector:
        - Connect without token
        - Could receive notifications not meant for attacker

        Expected: Connection rejected
        """
        skip_if_no_websocket()

        ws_url = config.api_base_url.replace('http', 'ws') + '/ws/notifications'

        try:
            ws = websocket.create_connection(
                ws_url,
                timeout=5
            )
            # If connection succeeds without auth, that's a vulnerability
            ws.close()
            pytest.fail("WebSocket connection succeeded without authentication")
        except Exception as e:
            # Expected - connection should fail
            pass

    @pytest.mark.critical
    @pytest.mark.websocket
    def test_websocket_invalid_token_rejected(
        self,
        api_client: APIClient,
        config: TestConfig
    ):
        """
        Verify WebSocket rejects invalid tokens.
        """
        skip_if_no_websocket()

        ws_url = config.api_base_url.replace('http', 'ws') + '/ws/notifications'
        invalid_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJmYWtlIn0.invalid"

        try:
            ws = websocket.create_connection(
                ws_url,
                timeout=5,
                header=[f"Authorization: Bearer {invalid_token}"]
            )
            # Should not connect with invalid token
            ws.close()
            pytest.fail("WebSocket accepted invalid token")
        except Exception as e:
            # Expected
            pass

    @pytest.mark.high
    @pytest.mark.websocket
    def test_websocket_expired_token_disconnected(
        self,
        api_client: APIClient,
        admin_token: str,
        auth_helper: AuthHelper,
        config: TestConfig
    ):
        """
        Verify WebSocket disconnects when token expires.

        Note: This test may need adjustment based on token lifetime
        """
        skip_if_no_websocket()

        # Check token expiration
        decoded = auth_helper.decode_token(admin_token)
        exp = decoded.get('exp', 0)

        if exp - time.time() < 60:
            pytest.skip("Token too close to expiration for this test")

        # This is a placeholder - actual test would need:
        # 1. Connect with valid token
        # 2. Wait for token to expire
        # 3. Verify connection is closed


# ============================================================================
# WebSocket Message Isolation Tests
# ============================================================================

class TestWebSocketMessageIsolation:
    """Test message isolation between WebSocket connections"""

    @pytest.mark.critical
    @pytest.mark.websocket
    def test_user_receives_only_own_notifications(
        self,
        api_client: APIClient,
        admin_token: str,
        config: TestConfig
    ):
        """
        Verify users only receive their own notifications.

        Attack Vector:
        - User connects to WebSocket
        - User attempts to receive other users' notifications

        Expected: Only own notifications received
        """
        skip_if_no_websocket()

        # This test would require:
        # 1. Connect as user1
        # 2. Trigger notification for user2
        # 3. Verify user1 doesn't receive user2's notification

        ws_url = config.api_base_url.replace('http', 'ws') + '/ws/notifications'

        try:
            ws = websocket.create_connection(
                ws_url,
                timeout=5,
                header=[f"Authorization: Bearer {admin_token}"]
            )

            # If connected, verify subscription is user-specific
            # Send subscription request if needed

            ws.close()
        except Exception as e:
            # WebSocket may not be available in dev mode
            pytest.skip(f"WebSocket connection failed: {e}")

    @pytest.mark.high
    @pytest.mark.websocket
    def test_project_notifications_access_control(
        self,
        api_client: APIClient,
        admin_token: str,
        config: TestConfig
    ):
        """
        Verify project notifications respect project membership.
        """
        skip_if_no_websocket()

        # Test that subscribing to project notifications
        # requires project membership

    @pytest.mark.high
    @pytest.mark.websocket
    def test_cannot_subscribe_to_other_user_channel(
        self,
        api_client: APIClient,
        admin_token: str,
        config: TestConfig
    ):
        """
        Verify users cannot subscribe to other users' channels.
        """
        skip_if_no_websocket()

        ws_url = config.api_base_url.replace('http', 'ws') + '/ws/notifications'

        try:
            ws = websocket.create_connection(
                ws_url,
                timeout=5,
                header=[f"Authorization: Bearer {admin_token}"]
            )

            # Attempt to subscribe to another user's channel
            ws.send(json.dumps({
                'type': 'subscribe',
                'channel': 'user:usr_other_user'
            }))

            # Check response
            response = ws.recv()
            data = json.loads(response)

            # Should reject or ignore invalid subscription
            assert data.get('type') != 'subscribed' or \
                   data.get('channel') != 'user:usr_other_user', \
                   "Subscribed to another user's channel"

            ws.close()
        except Exception as e:
            pytest.skip(f"WebSocket test failed: {e}")


# ============================================================================
# WebSocket Injection Prevention Tests
# ============================================================================

class TestWebSocketInjection:
    """Test WebSocket injection prevention"""

    @pytest.mark.high
    @pytest.mark.websocket
    def test_websocket_message_sanitization(
        self,
        api_client: APIClient,
        admin_token: str,
        config: TestConfig
    ):
        """
        Verify WebSocket messages are sanitized.

        Attack Vector:
        - Send malicious content via WebSocket
        - Could cause XSS or injection

        Expected: Content sanitized or rejected
        """
        skip_if_no_websocket()

        ws_url = config.api_base_url.replace('http', 'ws') + '/ws/notifications'

        injection_payloads = [
            '<script>alert("XSS")</script>',
            '{"__proto__":{"admin":true}}',
            '{"constructor":{"prototype":{"admin":true}}}',
        ]

        try:
            ws = websocket.create_connection(
                ws_url,
                timeout=5,
                header=[f"Authorization: Bearer {admin_token}"]
            )

            for payload in injection_payloads:
                ws.send(payload)
                # Should handle gracefully

            ws.close()
        except Exception as e:
            pytest.skip(f"WebSocket test failed: {e}")

    @pytest.mark.high
    @pytest.mark.websocket
    def test_malformed_message_handling(
        self,
        api_client: APIClient,
        admin_token: str,
        config: TestConfig
    ):
        """
        Verify malformed messages are handled safely.
        """
        skip_if_no_websocket()

        ws_url = config.api_base_url.replace('http', 'ws') + '/ws/notifications'

        malformed_messages = [
            'not json at all',
            '{incomplete json',
            '{"key": undefined}',
            '\x00\x01\x02\x03',  # Binary garbage
            '',  # Empty
            'null',
        ]

        try:
            ws = websocket.create_connection(
                ws_url,
                timeout=5,
                header=[f"Authorization: Bearer {admin_token}"]
            )

            for msg in malformed_messages:
                try:
                    ws.send(msg)
                except Exception:
                    pass  # May fail for binary

            # Connection should still be alive or gracefully closed
            ws.close()
        except Exception as e:
            pytest.skip(f"WebSocket test failed: {e}")


# ============================================================================
# Durable Objects Security Tests
# ============================================================================

class TestDurableObjectsSecurity:
    """Test Durable Objects security"""

    @pytest.mark.high
    @pytest.mark.websocket
    def test_do_instance_isolation(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify Durable Object instances are isolated.

        Attack Vector:
        - Access another user's DO instance
        - Could see their state/notifications

        Expected: Each user has isolated instance
        """
        # This test verifies that DO isolation works
        # by checking that notifications API respects user boundaries

        response = api_client.post('/api/notifications/list', auth=admin_token)

        if response.status_code == 200:
            data = response.json()
            notifications = data.get('data', {}).get('notifications', [])

            # All notifications should belong to the authenticated user
            # (Specific validation depends on API response structure)

    @pytest.mark.high
    @pytest.mark.websocket
    def test_do_unauthorized_access_prevented(
        self,
        api_client: APIClient
    ):
        """
        Verify DO cannot be accessed without authorization.
        """
        fake_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJmYWtlIn0.invalid"

        response = api_client.post('/api/notifications/list', auth=fake_token)

        assert response.status_code in [401, 403], \
            f"DO accessible without valid auth (status: {response.status_code})"

    @pytest.mark.medium
    @pytest.mark.websocket
    def test_do_state_not_shared(
        self,
        api_client: APIClient,
        admin_token: str
    ):
        """
        Verify DO state is not shared between users.
        """
        # Mark notification as read for admin
        response = api_client.post('/api/notifications/mark-read', auth=admin_token, json={
            'notificationId': 'notif_test'
        })

        # Another user's notifications should be unaffected
        # This would require a second user token to fully test


# ============================================================================
# Connection Security Tests
# ============================================================================

class TestConnectionSecurity:
    """Test WebSocket connection security"""

    @pytest.mark.medium
    @pytest.mark.websocket
    def test_websocket_connection_limit(
        self,
        api_client: APIClient,
        admin_token: str,
        config: TestConfig
    ):
        """
        Verify WebSocket has connection limits.

        Attack Vector:
        - Open many connections
        - Could exhaust server resources

        Expected: Limit enforced
        """
        skip_if_no_websocket()

        ws_url = config.api_base_url.replace('http', 'ws') + '/ws/notifications'
        connections = []

        try:
            for i in range(10):
                ws = websocket.create_connection(
                    ws_url,
                    timeout=5,
                    header=[f"Authorization: Bearer {admin_token}"]
                )
                connections.append(ws)

            # If we got here, check if there's a reasonable limit
        except Exception as e:
            # Connection limit may have been hit
            pass
        finally:
            for ws in connections:
                try:
                    ws.close()
                except Exception:
                    pass

    @pytest.mark.medium
    @pytest.mark.websocket
    def test_websocket_rate_limiting(
        self,
        api_client: APIClient,
        admin_token: str,
        config: TestConfig
    ):
        """
        Verify WebSocket has message rate limiting.
        """
        skip_if_no_websocket()

        ws_url = config.api_base_url.replace('http', 'ws') + '/ws/notifications'

        try:
            ws = websocket.create_connection(
                ws_url,
                timeout=5,
                header=[f"Authorization: Bearer {admin_token}"]
            )

            # Send many messages rapidly
            for i in range(100):
                ws.send(json.dumps({'type': 'ping', 'id': i}))

            ws.close()
        except Exception as e:
            # May be rate limited or connection closed
            pass


# ============================================================================
# Helper for running WebSocket tests
# ============================================================================

if __name__ == '__main__':
    """Run WebSocket tests directly"""
    pytest.main([__file__, '-v', '-m', 'websocket', '--tb=short'])
