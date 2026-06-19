from pydantic import BaseModel


class CheckCell(BaseModel):
    row: int
    col: int
    value: str


class CheckRequest(BaseModel):
    cells: list[CheckCell]


class CellRef(BaseModel):
    row: int
    col: int


class RevealRequest(BaseModel):
    cells: list[CellRef]
