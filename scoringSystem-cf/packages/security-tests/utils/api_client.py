"""
API Client for Security Testing

Provides a convenient wrapper around requests library for testing
the Cloudflare Worker API endpoints.
"""

import requests
from typing import Optional, Dict, Any, Union
import json as json_lib


class APIClient:
    """HTTP client for API security testing with automatic authentication"""

    def __init__(self, base_url: str, timeout: int = 30):
        """
        Initialize API client

        Args:
            base_url: Base URL of the API (e.g., 'http://localhost:8787')
            timeout: Default timeout for requests in seconds
        """
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        })

    def _build_url(self, endpoint: str) -> str:
        """Build full URL from endpoint"""
        endpoint = endpoint if endpoint.startswith('/') else f'/{endpoint}'
        return f"{self.base_url}{endpoint}"

    def _prepare_headers(self, auth: Optional[str] = None, headers: Optional[Dict] = None) -> Dict:
        """Prepare request headers with optional authentication"""
        request_headers = self.session.headers.copy()

        if headers:
            request_headers.update(headers)

        if auth:
            request_headers['Authorization'] = f'Bearer {auth}'

        return request_headers

    def post(
        self,
        endpoint: str,
        auth: Optional[str] = None,
        json: Optional[Dict] = None,
        data: Optional[Any] = None,
        headers: Optional[Dict] = None,
        timeout: Optional[int] = None,
        **kwargs
    ) -> requests.Response:
        """
        Send POST request

        Args:
            endpoint: API endpoint (e.g., '/api/auth/current-user')
            auth: JWT token for authentication (auto-added to json body as sessionId)
            json: JSON data to send
            data: Raw data to send
            headers: Additional headers
            timeout: Request timeout (overrides default)
            **kwargs: Additional arguments passed to requests.post

        Returns:
            requests.Response object
        """
        url = self._build_url(endpoint)
        request_headers = self._prepare_headers(auth, headers)
        timeout = timeout or self.timeout

        # Auto-include sessionId in JSON body when auth is provided
        # This is required by most API endpoints
        if auth and json is None and data is None:
            json = {'sessionId': auth}
        elif auth and json is not None and 'sessionId' not in json:
            json = {'sessionId': auth, **json}

        return self.session.post(
            url,
            json=json,
            data=data,
            headers=request_headers,
            timeout=timeout,
            **kwargs
        )

    def get(
        self,
        endpoint: str,
        auth: Optional[str] = None,
        params: Optional[Dict] = None,
        headers: Optional[Dict] = None,
        timeout: Optional[int] = None,
        **kwargs
    ) -> requests.Response:
        """
        Send GET request

        Args:
            endpoint: API endpoint
            auth: JWT token for authentication
            params: Query parameters
            headers: Additional headers
            timeout: Request timeout
            **kwargs: Additional arguments

        Returns:
            requests.Response object
        """
        url = self._build_url(endpoint)
        request_headers = self._prepare_headers(auth, headers)
        timeout = timeout or self.timeout

        return self.session.get(
            url,
            params=params,
            headers=request_headers,
            timeout=timeout,
            **kwargs
        )

    def put(
        self,
        endpoint: str,
        auth: Optional[str] = None,
        json: Optional[Dict] = None,
        headers: Optional[Dict] = None,
        timeout: Optional[int] = None,
        **kwargs
    ) -> requests.Response:
        """Send PUT request"""
        url = self._build_url(endpoint)
        request_headers = self._prepare_headers(auth, headers)
        timeout = timeout or self.timeout

        return self.session.put(
            url,
            json=json,
            headers=request_headers,
            timeout=timeout,
            **kwargs
        )

    def delete(
        self,
        endpoint: str,
        auth: Optional[str] = None,
        json: Optional[Dict] = None,
        headers: Optional[Dict] = None,
        timeout: Optional[int] = None,
        **kwargs
    ) -> requests.Response:
        """Send DELETE request"""
        url = self._build_url(endpoint)
        request_headers = self._prepare_headers(auth, headers)
        timeout = timeout or self.timeout

        return self.session.delete(
            url,
            json=json,
            headers=request_headers,
            timeout=timeout,
            **kwargs
        )

    def patch(
        self,
        endpoint: str,
        auth: Optional[str] = None,
        json: Optional[Dict] = None,
        headers: Optional[Dict] = None,
        timeout: Optional[int] = None,
        **kwargs
    ) -> requests.Response:
        """Send PATCH request"""
        url = self._build_url(endpoint)
        request_headers = self._prepare_headers(auth, headers)
        timeout = timeout or self.timeout

        return self.session.patch(
            url,
            json=json,
            headers=request_headers,
            timeout=timeout,
            **kwargs
        )

    def request(
        self,
        method: str,
        endpoint: str,
        auth: Optional[str] = None,
        **kwargs
    ) -> requests.Response:
        """
        Send request with arbitrary HTTP method

        Useful for testing unusual methods or security testing
        """
        url = self._build_url(endpoint)
        headers = self._prepare_headers(auth, kwargs.pop('headers', None))

        return self.session.request(
            method,
            url,
            headers=headers,
            timeout=self.timeout,
            **kwargs
        )

    def health_check(self) -> bool:
        """
        Check if API is reachable

        Returns:
            True if API responds, False otherwise
        """
        try:
            response = self.get('/')
            return response.status_code < 500
        except requests.RequestException:
            return False

    def close(self):
        """Close the session"""
        self.session.close()

    def __enter__(self):
        """Context manager entry"""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.close()


class APIResponse:
    """Helper class for parsing API responses"""

    def __init__(self, response: requests.Response):
        self.response = response
        self.status_code = response.status_code
        self.headers = response.headers

    @property
    def json(self) -> Dict:
        """Parse JSON response"""
        try:
            return self.response.json()
        except json_lib.JSONDecodeError:
            return {}

    @property
    def success(self) -> bool:
        """Check if request was successful (2xx status)"""
        return 200 <= self.status_code < 300

    @property
    def data(self) -> Optional[Any]:
        """Extract data field from response"""
        json_data = self.json
        return json_data.get('data')

    @property
    def error(self) -> Optional[str]:
        """Extract error message from response"""
        json_data = self.json
        return json_data.get('error')

    def assert_success(self, message: Optional[str] = None):
        """Assert that response was successful"""
        assert self.success, message or f"Request failed with status {self.status_code}: {self.error}"

    def assert_error(self, message: Optional[str] = None):
        """Assert that response was an error"""
        assert not self.success, message or f"Expected error but got status {self.status_code}"
