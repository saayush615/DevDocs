from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials


# HTTPBearer extracts the "Authorization: Bearer <token>" header
security = HTTPBearer()


def verify_token(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> str:
    """
    Verify the service-to-service token from the Authorization header.
    
    Args:
        credentials: Automatically extracted from Authorization header
        
    Returns:
        The verified user_id (for future use)
        
    Raises:
        HTTPException: 401 if token is invalid
    """
    from app.config import settings  # Import here to avoid circular imports
    
    token = credentials.credentials
    
    if token != settings.SERVICE_TOKEN:
        raise HTTPException(
            status_code=401,
            detail="Invalid service token",
        )
    
    return token