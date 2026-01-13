# API Security Testing Suite

Python-based security testing framework for the Scoring System Cloudflare Worker API, implementing **OWASP API Security Top 10 (2023)** tests.

## 📚 Quick Reference

**New to security testing? Start here:**
- 📖 **[TESTING_GUIDE.md](TESTING_GUIDE.md)** - 完整的測試執行指南與常見問題排查
- 🗺️ **[DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md)** - 測試開發規劃與優先級指南

**Quick Commands:**
```bash
# From project root
pnpm test:security           # Run all tests
pnpm test:security:critical  # Run critical tests only
pnpm test:security:report    # Generate HTML report

# From this directory
source venv/bin/activate && pytest -v
```

---

## Overview

This package provides automated security testing against the backend API, focusing on:
- Authentication & Authorization vulnerabilities
- Input validation & injection attacks
- Resource consumption & rate limiting
- Business logic security
- Data exposure & privacy issues

## Quick Start

### 1. Setup Python Environment

```bash
cd packages/security-tests

# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate  # Linux/Mac
# OR
venv\Scripts\activate     # Windows

# Install dependencies
pip install -r requirements.txt
```

### 2. Configure Test Environment

```bash
# Copy example config
cp .env.example .env

# Edit configuration
nano .env
```

### 3. Start Dev Server

```bash
# In another terminal, from project root
cd ../../
pnpm dev:backend
```

### 4. Run Security Tests

```bash
# Run all tests
pytest

# Run critical tests only
pytest -m critical

# Run specific OWASP category
pytest -m auth        # API2 - Authentication tests
pytest -m bola        # API1 - BOLA tests

# Generate HTML report
pytest --html=reports/security_report.html --self-contained-html

# Generate JSON report
pytest --json-report --json-report-file=reports/findings.json
```

## From Project Root

```bash
# Run security tests from root
pnpm test:security

# Run with HTML report
pnpm test:security:report
```

## Test Structure

```
tests/
├── conftest.py              # pytest fixtures (auth, API client)
├── test_smoke.py            # Basic connectivity & auth tests
├── test_api1_bola.py        # API1: Broken Object Level Authorization
├── test_api2_auth.py        # API2: Broken Authentication
├── test_api3_properties.py  # API3: Broken Object Property Level Authorization
├── test_api4_resources.py   # API4: Unrestricted Resource Consumption
├── test_api5_functions.py   # API5: Broken Function Level Authorization
├── test_api6_business.py    # API6: Unrestricted Access to Sensitive Business Flows
├── test_api8_misconfig.py   # API8: Security Misconfiguration
├── test_api9_10.py          # API9/10: Improper Inventory & Unsafe API Consumption
├── test_websocket.py        # WebSocket & Durable Objects Security
└── test_injection.py        # Injection Attack Prevention (SQL, XSS, etc.)
```

## Test Markers

Tests are categorized using pytest markers:

### Priority Levels
- `@pytest.mark.critical` - Must-pass security tests
- `@pytest.mark.high` - High priority
- `@pytest.mark.medium` - Medium priority
- `@pytest.mark.low` - Low priority

### OWASP Categories
- `@pytest.mark.bola` - API1: Broken Object Level Authorization
- `@pytest.mark.auth` - API2: Broken Authentication
- `@pytest.mark.properties` - API3: Broken Object Property Level Authorization
- `@pytest.mark.resources` - API4: Unrestricted Resource Consumption
- `@pytest.mark.functions` - API5: Broken Function Level Authorization
- `@pytest.mark.business` - API6: Unrestricted Access to Sensitive Business Flows
- `@pytest.mark.misconfig` - API8: Security Misconfiguration
- `@pytest.mark.inventory` - API9: Improper Inventory Management
- `@pytest.mark.external` - API10: Unsafe Consumption of APIs

### Additional Categories
- `@pytest.mark.injection` - Injection Attack Prevention (SQL, XSS, Command, NoSQL)
- `@pytest.mark.websocket` - WebSocket & Durable Objects Security

## Writing Tests

### Example: Testing Cross-User Access (BOLA)

```python
import pytest
from utils.api_client import APIClient
from utils.auth_helper import AuthHelper

@pytest.mark.critical
@pytest.mark.bola
def test_project_access_control(api_client: APIClient, test_users: dict):
    """Verify users cannot access other users' projects"""
    user1 = test_users['teacher1']
    user2 = test_users['teacher2']

    # User1 creates project
    response = api_client.post('/api/projects/create',
        auth=user1.token,
        json={'projectData': {'projectName': 'Secret Project'}}
    )
    assert response.status_code == 200
    project_id = response.json()['data']['projectId']

    # User2 attempts to access User1's project (should fail)
    response = api_client.post('/api/projects/get',
        auth=user2.token,
        json={'projectId': project_id}
    )

    assert response.status_code in [403, 404], \
        f"BOLA vulnerability: User2 accessed User1's project (status: {response.status_code})"
```

## Utility Classes

### APIClient

HTTP client wrapper with automatic JWT handling:

```python
from utils.api_client import APIClient

client = APIClient('http://localhost:8787')
response = client.post('/users/profile', auth=token, json={...})
```

### AuthHelper

Authentication utilities:

```python
from utils.auth_helper import AuthHelper

auth = AuthHelper(client)
token = auth.login('admin@system.local', 'admin123456')
```

## Configuration

Edit `.env` or `config/test_config.py`:

```python
API_BASE_URL=http://localhost:8787
ADMIN_EMAIL=admin@system.local
ADMIN_PASSWORD=admin123456
TEST_TIMEOUT=30
SKIP_DESTRUCTIVE_TESTS=true
```

## CI/CD Integration

```yaml
# .github/workflows/security-tests.yml
- name: Run security tests
  run: |
    cd packages/security-tests
    python -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    pytest -m "critical or high"
```

## Reports

Test reports are generated in `reports/`:
- `security_report.html` - HTML test report
- `findings.json` - JSON test results

## Troubleshooting

### Dev server not responding
```bash
# Check if backend is running
curl http://localhost:8787/

# Restart backend
pnpm dev:backend
```

### Import errors
```bash
# Ensure virtual environment is activated
source venv/bin/activate

# Reinstall dependencies
pip install -r requirements.txt
```

### Test failures
```bash
# Run with verbose output
pytest -vv

# Run single test
pytest tests/test_smoke.py::test_api_health -vv

# Show full traceback
pytest --tb=long
```

## Security Testing Best Practices

1. **Test Early, Test Often** - Run critical tests on every API change
2. **Automate in CI/CD** - Integrate into pull request checks
3. **Prioritize Findings** - Focus on critical/high severity first
4. **Maintain Test Data** - Keep test users/projects isolated
5. **Document Findings** - Track vulnerabilities in issue tracker

## OWASP Resources

- [OWASP API Security Top 10 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/)
- [OWASP Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
- [OWASP ZAP](https://www.zaproxy.org/)

## Contributing

When adding new tests:
1. Follow naming convention: `test_<owasp_category>_<vulnerability>.py`
2. Add appropriate markers (`@pytest.mark.critical`, `@pytest.mark.bola`, etc.)
3. Include docstrings explaining the vulnerability being tested
4. Update this README if adding new categories

## License

Internal use only - Scoring System Project
