import os
import tempfile

# Uses a throwaway SQLite file by default. Set TEST_DATABASE_URL to run against another
# database (e.g. an empty PostgreSQL database) instead.
_db_file = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL") or f"sqlite:///{_db_file}"
os.environ["ENABLE_REMINDER_SCHEDULER"] = "false"
os.environ["SEED_DEMO_DATA"] = "true"
os.environ["OPENAI_API_KEY"] = ""
os.environ["AI_RATE_LIMIT_PER_MINUTE"] = "3"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


def login(client, email, password="password123"):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="session")
def alice(client):
    return login(client, "alice@campusbite.dev")


@pytest.fixture(scope="session")
def bob(client):
    return login(client, "bob@campusbite.dev")


@pytest.fixture(scope="session")
def spice_owner(client):
    return login(client, "owner.spice@campusbite.dev")


@pytest.fixture(scope="session")
def pizza_owner(client):
    return login(client, "owner.pizza@campusbite.dev")


@pytest.fixture(scope="session")
def ravi(client):
    return login(client, "rider.ravi@campusbite.dev")


@pytest.fixture(scope="session")
def maya(client):
    return login(client, "rider.maya@campusbite.dev")
