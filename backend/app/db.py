import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

load_dotenv()  # load backend/.env into os.environ (no-op if absent)

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql+psycopg://zigzagi:zigzagi@localhost:5432/zigzagi"
)

engine = create_engine(DATABASE_URL, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
