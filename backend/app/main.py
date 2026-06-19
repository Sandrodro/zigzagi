from fastapi import FastAPI

from app.routers import play

app = FastAPI(title="Zigzagi")
app.include_router(play.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
