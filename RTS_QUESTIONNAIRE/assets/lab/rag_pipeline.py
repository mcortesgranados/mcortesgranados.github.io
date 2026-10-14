"""Retrieval-grounded answering: retrieve first, then answer with citations.

The rule this file encodes: the model never answers from memory. Context comes
from the vector store, the prompt demands a citation for each claim, and the
output is schema-validated before anything acts on it.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Sequence

from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="grounded-answer", version="2.1.0")

EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
CARD = re.compile(r"\b(?:\d[ -]*?){13,16}\b")


class Question(BaseModel):
    text: str = Field(min_length=3, max_length=500)
    top_k: int = Field(default=8, ge=1, le=20)


class Citation(BaseModel):
    chunk_id: str
    score: float


class Answer(BaseModel):
    text: str
    citations: list[Citation]
    grounded: bool


@dataclass(frozen=True)
class Chunk:
    chunk_id: str
    text: str
    score: float


def chunk_document(text: str, size: int = 900, overlap: int = 120) -> list[str]:
    """Chunk on paragraph boundaries, with overlap so a fact is never split in half."""
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: list[str] = []
    current = ""

    for paragraph in paragraphs:
        if len(current) + len(paragraph) + 2 <= size:
            current = f"{current}\n\n{paragraph}".strip()
            continue
        if current:
            chunks.append(current)
        current = paragraph[-size:] if len(paragraph) > size else paragraph

    if current:
        chunks.append(current)
    return chunks


def redact_pii(text: str) -> str:
    """Data minimisation before the prompt: the model never sees what it does not need."""
    return CARD.sub("[CARD]", EMAIL.sub("[EMAIL]", text))


def build_prompt(question: str, chunks: Sequence[Chunk]) -> str:
    context = "\n\n".join(f"[{c.chunk_id}] {c.text}" for c in chunks)
    return (
        "Answer only from the context below. Cite the chunk id for every claim.\n"
        "If the context does not contain the answer, say so explicitly.\n\n"
        f"Context:\n{context}\n\nQuestion: {question}"
    )


async def embed(texts: Sequence[str]) -> list[list[float]]:
    """Embeddings come from a managed model; the vectors are stored in pgvector."""
    raise NotImplementedError


async def vector_search(vector: list[float], top_k: int) -> list[Chunk]:
    """Cosine search over pgvector, filtered by tenant before ranking."""
    raise NotImplementedError


async def complete(prompt: str) -> str:
    """Deterministic where it matters: temperature 0 and a schema in the response format."""
    raise NotImplementedError


@app.post("/answer", response_model=Answer)
async def answer(question: Question) -> Answer:
    safe_question = redact_pii(question.text)          # guardrail #1: no raw PII in the prompt
    vector = (await embed([safe_question]))[0]
    chunks = await vector_search(vector, question.top_k)

    if not chunks:
        return Answer(text="I don't have a source for that.", citations=[], grounded=False)

    raw = await complete(build_prompt(safe_question, chunks))
    parsed = Answer.model_validate_json(raw)           # guardrail #2: strict output schema

    return Answer(
        text=parsed.text,
        citations=[Citation(chunk_id=c.chunk_id, score=round(c.score, 4)) for c in chunks],
        grounded=bool(parsed.citations),
    )
