"""drop wordpool_generic (crosswords now use only the lemma pool)

Revision ID: f1b2c3d4e5a6
Revises: e9a1c2d3f4b5
Create Date: 2026-06-30 19:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f1b2c3d4e5a6'
down_revision: Union[str, Sequence[str], None] = 'e9a1c2d3f4b5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table('wordpool_generic')


def downgrade() -> None:
    op.create_table(
        'wordpool_generic',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('word', sa.String(), nullable=False),
        sa.Column('length', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('word'),
    )
