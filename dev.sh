#!/bin/sh
trap 'kill 0' EXIT

cd backend && uv run uvicorn app.main:app --reload &
cd frontend && npm run dev &

wait
