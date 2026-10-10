import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('DATABASE_PATH', str(tmp_path / 'test.sqlite3'))
    monkeypatch.setenv('LLM_ENABLED', 'false')
    with TestClient(app) as c:
        yield c


def task(candidate, code):
    return next(t for t in candidate['tasks'] if t['code'] == code)


def action(client, candidate, code, action, role, **extra):
    return client.post(f"/api/tasks/{task(candidate, code)['id']}/action",
                       json={'action': action, 'role': role, 'candidate_id': candidate['id'], **extra})
