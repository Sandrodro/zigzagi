"""wordpool_lemmas

Revision ID: c7e8f9a0b1d2
Revises: b1d2e3f4a5c6
Create Date: 2026-06-23 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c7e8f9a0b1d2'
down_revision: Union[str, Sequence[str], None] = 'b1d2e3f4a5c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('wordpool_lemmas',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('word', sa.String(), nullable=False),
    sa.Column('length', sa.Integer(), nullable=False),
    sa.Column('source', sa.String(), nullable=False),
    sa.Column('status', sa.String(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('word')
    )


def downgrade() -> None:
    op.drop_table('wordpool_lemmas')
