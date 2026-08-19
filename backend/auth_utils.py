import os
import re
import time
from typing import Optional

import jwt

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "reelscribe_super_secret_key_987654321")

# List of common disposable email domains
DISPOSABLE_DOMAINS = {
    "mailinator.com", "yopmail.com", "tempmail.com", "10minutemail.com",
    "temp-mail.org", "guerrillamail.com", "sharklasers.com", "dispostable.com",
    "getairmail.com", "maildrop.cc", "mintemail.com", "throwawaymail.com",
    "guerillamail.co.uk", "guerrillamailblock.com", "guerrillamail.net",
    "guerrillamail.org", "mailnesia.com", "maildrop.cc", "mailinator.net",
    "mailinator2.com", "sogetthis.com", "mailin8r.com", "streetwisemail.com",
    "mailinator.co.uk", "spamgourmet.com", "trashmail.com", "tempmailaddress.com",
    "mytemp.email", "temp-mail.ru", "temp-mail.io", "tempmail.net",
    "discard.email", "dispostable.com", "spambox.us", "jetable.org",
    "anonymbox.com", "harakirimail.com", "mailexpire.com", "pichumail.com",
    "guerrillamail.biz", "guerrillamail.de", "grr.la", "guerrillamail.la",
    "pokemail.net", "disposable.com", "throwaway.com", "temp-mail.co",
    "mailtemp.com", "tempmail.net", "duck.com"  # commonly used for anonymous forwarding
}


def is_valid_email_provider(email: str) -> bool:
    email = email.strip().lower()
    # Validate format
    if not re.match(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$", email):
        return False

    parts = email.split('@')
    if len(parts) != 2:
        return False
    domain = parts[1]

    # Check blocklist
    if domain in DISPOSABLE_DOMAINS:
        return False

    # Heuristic for subdomains or domains containing disposable terms
    disposable_keywords = ["temp", "disposable", "throwaway", "mailinator", "yopmail", "10min", "trashmail", "fakeemail"]
    for keyword in disposable_keywords:
        if keyword in domain:
            return False

    return True


def create_token(data: dict, expires_in: int = 86400 * 7) -> str:
    """
    Creates a standard JWT (HS256) with the given payload and expiration.
    `exp` is automatically added as a Unix timestamp.
    """
    payload = data.copy()
    payload["exp"] = int(time.time()) + expires_in
    token = jwt.encode(payload, SECRET_KEY, algorithm="HS256")
    return token


def verify_token(token: str) -> Optional[dict]:
    """
    Verifies the token's signature and expiration.
    Returns the decoded payload if valid, otherwise None.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None