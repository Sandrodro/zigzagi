#!/bin/sh
trap 'kill 0' EXIT

cd backend && uv run uvicorn app.main:app --reload &
cd backend && uv run python -m app.worker &
cd frontend && npm run dev &

wait
