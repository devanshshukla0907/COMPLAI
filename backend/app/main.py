from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import auth, analysis, dashboard

app = FastAPI(
    title="ComplAI SMART PREDICT API",
    description="API for AI-driven financial complaint analysis.",
    version="1.0.0"
)

origins = [
    "https://complai-orpin.vercel.app", 
    # Add your main production URL if different, e.g., your custom domain
    #"http://localhost:5173",  Keep for local dev
]

# CORS (Cross-Origin Resource Sharing)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins, # The default Vite dev server port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(analysis.router, prefix="/api", tags=["Analysis"])
app.include_router(dashboard.router, prefix="/api", tags=["Dashboard"])

@app.get("/", tags=["Root"])
async def read_root():
    return {"message": "Welcome to the ComplAI SMART PREDICT API"}