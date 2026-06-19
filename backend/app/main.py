from fastapi import FastAPI

app = FastAPI(title="Zigzagi")


@app.get("/api/health")
def health():
    return {"status": "ok"}
