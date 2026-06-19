import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401  ensure models are registered on Base
from app.db import Base, get_db
from app.main import app

TEST_DATABASE_URL = "postgresql+psycopg://zigzagi:zigzagi@localhost:5432/zigzagi_test"


@pytest.fixture(scope="session")
def engine():
    eng = create_engine(TEST_DATABASE_URL, future=True)
    Base.metadata.drop_all(eng)
    Base.metadata.create_all(eng)
    yield eng
    Base.metadata.drop_all(eng)


@pytest.fixture
def db_session(engine):
    connection = engine.connect()
    transaction = connection.begin()
    # create_savepoint: a commit() inside a test (e.g. worker.tick) only commits a
    # savepoint, so the outer transaction still rolls back and isolation holds.
    Session = sessionmaker(
        bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
    )
    session = Session()
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
