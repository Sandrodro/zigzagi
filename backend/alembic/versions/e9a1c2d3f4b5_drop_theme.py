"""drop puzzles.theme and word_candidates.theme_tags

Revision ID: e9a1c2d3f4b5
Revises: d8f0a1b2c3e4
Create Date: 2026-06-30 18:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'e9a1c2d3f4b5'
down_revision: Union[str, Sequence[str], None] = 'd8f0a1b2c3e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('puzzles', 'theme')
    op.drop_column('word_candidates', 'theme_tags')


def downgrade() -> None:
    op.add_column('puzzles', sa.Column('theme', sa.String(), nullable=False, server_default=''))
    op.alter_column('puzzles', 'theme', server_default=None)
    op.add_column(
        'word_candidates',
        sa.Column('theme_tags', postgresql.ARRAY(sa.String()), nullable=False, server_default='{}'),
    )
    op.alter_column('word_candidates', 'theme_tags', server_default=None)
