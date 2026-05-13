"""Negative fixture: raw POST whose URL path contains a read-shaped
keyword must not flag as a redundant read. HTTP method is authoritative."""
import os
import requests

def embed_text(text: str) -> dict:
    response = requests.post(
        "https://api.cohere.ai/v1/embed",
        headers={"Authorization": f"Bearer {os.environ['COHERE_API_KEY']}"},
        json={"texts": [text], "model": "embed-english-v3.0"},
        timeout=30,
    )
    response.raise_for_status()
    return response.json()
