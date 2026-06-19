from fastapi import FastAPI

from app.routers import admin, play

app = FastAPI(title="Zigzagi")
app.include_router(play.router)
app.include_router(admin.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
