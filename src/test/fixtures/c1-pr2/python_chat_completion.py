"""Negative case: chat-completion calls must NOT trigger the missing-guard finding."""
from openai import OpenAI

client = OpenAI()

def ask(prompt: str) -> str:
    r = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
    )
    return r.choices[0].message.content or ""
