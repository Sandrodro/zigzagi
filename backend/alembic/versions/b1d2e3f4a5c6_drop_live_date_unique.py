"""drop one-puzzle-per-date unique index (dev convenience)

Revision ID: b1d2e3f4a5c6
Revises: a35786bd100c
Create Date: 2026-06-22

"""
from alembic import op

revision = "b1d2e3f4a5c6"
down_revision = "a35786bd100c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("uq_puzzle_live_date_active", table_name="puzzles")


def downgrade() -> None:
    op.create_index(
        "uq_puzzle_live_date_active",
        "puzzles",
        ["live_date"],
        unique=True,
        postgresql_where="status IN ('scheduled', 'published')",
    )
