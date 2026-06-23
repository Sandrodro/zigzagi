"""rename wordlist_entries to wordpool_generic

Revision ID: d8f0a1b2c3e4
Revises: c7e8f9a0b1d2
Create Date: 2026-06-23 18:20:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd8f0a1b2c3e4'
down_revision: Union[str, Sequence[str], None] = 'c7e8f9a0b1d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.rename_table('wordlist_entries', 'wordpool_generic')


def downgrade() -> None:
    op.rename_table('wordpool_generic', 'wordlist_entries')
