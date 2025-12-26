"""
Test Configuration

Manages test configuration from environment variables and defaults.
"""

import os
from typing import Optional
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class TestConfig(BaseSettings):
    """Security test configuration with environment variable support"""

    model_config = SettingsConfigDict(
        env_file='.env',
        env_file_encoding='utf-8',
        case_sensitive=False,
        extra='ignore'
    )

    # API Configuration
    api_base_url: str = Field(
        default='http://localhost:8787',
        description='Base URL of the API to test'
    )

    # Authentication Credentials
    admin_email: str = Field(
        default='admin@system.local',
        description='Admin user email for testing'
    )

    admin_password: str = Field(
        default='admin123456',
        description='Admin user password'
    )

    # Test Behavior
    test_timeout: int = Field(
        default=30,
        description='Default timeout for API requests (seconds)'
    )

    skip_destructive_tests: bool = Field(
        default=True,
        description='Skip tests that modify/delete data'
    )

    parallel_workers: int = Field(
        default=1,
        description='Number of parallel test workers'
    )

    # Test Data
    test_invitation_code: Optional[str] = Field(
        default=None,
        description='Pre-generated invitation code for test user creation'
    )

    # Reporting
    html_report_path: str = Field(
        default='reports/security_report.html',
        description='Path for HTML test report'
    )

    json_report_path: str = Field(
        default='reports/findings.json',
        description='Path for JSON test report'
    )

    # OWASP ZAP Integration (Optional)
    zap_enabled: bool = Field(
        default=False,
        description='Enable OWASP ZAP proxy integration'
    )

    zap_api_key: Optional[str] = Field(
        default=None,
        description='OWASP ZAP API key'
    )

    zap_proxy_url: str = Field(
        default='http://localhost:8080',
        description='OWASP ZAP proxy URL'
    )

    # Cloudflare Turnstile
    turnstile_token: str = Field(
        default='test',
        description='Cloudflare Turnstile token (use "test" for dev mode)'
    )

    # 2FA
    twofa_code: str = Field(
        default='DEVMODE',
        description='2FA code (use "DEVMODE" for dev mode)'
    )

    # Logging
    log_level: str = Field(
        default='INFO',
        description='Logging level (DEBUG, INFO, WARNING, ERROR)'
    )

    verbose: bool = Field(
        default=False,
        description='Enable verbose output'
    )

    def __str__(self) -> str:
        """String representation (hides sensitive data)"""
        return f"TestConfig(api_base_url={self.api_base_url}, admin_email={self.admin_email})"

    def is_dev_mode(self) -> bool:
        """Check if running in development mode"""
        return 'localhost' in self.api_base_url or '127.0.0.1' in self.api_base_url

    def get_proxy_config(self) -> Optional[dict]:
        """Get proxy configuration for requests library"""
        if not self.zap_enabled:
            return None

        return {
            'http': self.zap_proxy_url,
            'https': self.zap_proxy_url,
        }


# Global config instance
_config: Optional[TestConfig] = None


def get_config() -> TestConfig:
    """
    Get global test configuration instance

    Returns:
        TestConfig instance (singleton)
    """
    global _config
    if _config is None:
        _config = TestConfig()
    return _config


def reset_config():
    """Reset global config (useful for testing)"""
    global _config
    _config = None
