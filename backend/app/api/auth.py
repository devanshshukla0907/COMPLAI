from fastapi import APIRouter, HTTPException, status
from app.models.schemas import UserCreate, UserLogin, Token
from app.services.supabase_client import supabase

router = APIRouter()

@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register_user(user_credentials: UserCreate):
    # This is a placeholder. Full implementation in Step 4.4
    # with password hashing and error handling.
    try:
        res = supabase.auth.sign_up({
            "email": user_credentials.email,
            "password": user_credentials.password,
        })
        return {"message": "User registered successfully. Please check your email for verification."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login", response_model=Token)
async def login_for_access_token(form_data: UserLogin):
    # This is a placeholder. Full implementation in Step 4.4.
    try:
        res = supabase.auth.sign_in_with_password({
            "email": form_data.email,
            "password": form_data.password
        })
        return {"access_token": res.session.access_token, "token_type": "bearer"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

@router.post("/logout")
async def logout():
    # Supabase handles logout on the client-side by removing the token.
    # This endpoint is for session invalidation if needed, but often not required.
    return {"message": "Logout successful"}