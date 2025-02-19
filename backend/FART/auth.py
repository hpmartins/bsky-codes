from fastapi.security import api_key
from fastapi import Security, HTTPException

from backend.utils.core import Config

config = Config()
api_key_header = api_key.APIKeyHeader(name="X-API-Key")


async def get_api_key(api_key_header: str = Security(api_key_header)):
    if api_key_header == config.FART_KEY or len(api_key_header) == 0:
        return api_key_header
    else:
        raise HTTPException(status_code=401, detail="Missing or invalid API key")
