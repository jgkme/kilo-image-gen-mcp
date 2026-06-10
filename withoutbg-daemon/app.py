from io import BytesIO

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from withoutbg import WithoutBG


app = FastAPI(title="withoutBG local daemon", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_MODEL = None


def get_model():
    global _MODEL
    if _MODEL is None:
        _MODEL = WithoutBG.opensource()
    return _MODEL


@app.get("/health")
def health():
    return {"ok": True, "service": "withoutbg-local-daemon"}


@app.post("/remove-background")
async def remove_background(file: UploadFile = File(...)):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="file is required")

    try:
        result = get_model().remove_background(data)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    output = BytesIO()
    result.save(output, format="PNG")
    return Response(content=output.getvalue(), media_type="image/png")
