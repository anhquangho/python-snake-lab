"""Ask one provider for a bounded Snake plan using a request-scoped API key."""

import json
import re
from time import perf_counter
from typing import Annotated, Literal

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field

router = APIRouter(prefix="/api/ai", tags=["AI Play"])

Provider = Literal["openai", "gemini", "anthropic"]
Coordinate = Annotated[int, Field(strict=True, ge=0, lt=20)]
Cell = tuple[Coordinate, Coordinate]
MODELS: dict[Provider, str] = {
    "openai": "gpt-4.1-mini",
    "gemini": "gemini-3.1-flash-lite",
    "anthropic": "claude-haiku-4-5",
}
OUTPUT_LIMIT = 96
PLAN_PATTERN = re.compile(r"[UDLR][1-9][0-9]?(?:,[UDLR][1-9][0-9]?)*")
RULES = (
    "Play Snake on a 20x20 grid (coordinates 0-19, x right, y down). "
    "Snake cells are ordered head to tail. Never reverse. Each move frees the tail "
    "cell unless the head eats food. Avoid walls and the body. Find a safe route to "
    "food or a safe partial route, at most 64 steps. Reply only with U,D,L,R followed "
    "by counts, joined by commas, e.g. R4,U3, or NONE if no route is found."
)


class PlanRequest(BaseModel):
    """Only board data enters the prompt. The API key is a separate header."""

    model_config = ConfigDict(extra="forbid")

    provider: Provider
    snake: Annotated[list[Cell], Field(min_length=3, max_length=399)]
    direction: Literal["up", "down", "left", "right"]
    food: Cell


class TokenUsage(BaseModel):
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None


class PlanResponse(BaseModel):
    model: str
    plan: str | None
    issue: str | None = None
    latency_ms: int
    usage: TokenUsage


def provider_request(board: PlanRequest, key: str) -> tuple[str, dict[str, str], dict]:
    """Build a request to a fixed provider endpoint with no tools or conversation history."""
    model = MODELS[board.provider]
    state = json.dumps(board.model_dump(exclude={"provider"}), separators=(",", ":"))
    if board.provider == "openai":
        return (
            "https://api.openai.com/v1/responses",
            {"Authorization": f"Bearer {key}"},
            {
                "model": model,
                "instructions": RULES,
                "input": state,
                "max_output_tokens": OUTPUT_LIMIT,
                "temperature": 0,
                "store": False,
            },
        )
    if board.provider == "gemini":
        return (
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            {"x-goog-api-key": key},
            {
                "systemInstruction": {"parts": [{"text": RULES}]},
                "contents": [{"parts": [{"text": state}]}],
                "generationConfig": {
                    "maxOutputTokens": OUTPUT_LIMIT,
                    "thinkingConfig": {"thinkingLevel": "MINIMAL"},
                },
            },
        )
    return (
        "https://api.anthropic.com/v1/messages",
        {"x-api-key": key, "anthropic-version": "2023-06-01"},
        {
            "model": model,
            "max_tokens": OUTPUT_LIMIT,
            "temperature": 0,
            "system": RULES,
            "messages": [{"role": "user", "content": state}],
        },
    )


def read_plan(provider: Provider, data: dict) -> tuple[str, TokenUsage, bool]:
    """Extract the provider's visible plan and normalize usage for the dashboard."""
    if provider == "openai":
        parts = [
            part["text"]
            for item in data["output"]
            if item["type"] == "message"
            for part in item["content"]
            if part["type"] == "output_text"
        ]
        usage = TokenUsage.model_validate(data.get("usage") or {})
        complete = data.get("status") == "completed"
    elif provider == "gemini":
        candidate = data["candidates"][0]
        parts = [
            part["text"]
            for part in candidate.get("content", {}).get("parts", [])
            if "text" in part and not part.get("thought")
        ]
        metadata = data.get("usageMetadata") or {}
        usage = TokenUsage(
            input_tokens=metadata.get("promptTokenCount"),
            output_tokens=metadata.get("candidatesTokenCount"),
            total_tokens=metadata.get("totalTokenCount"),
        )
        complete = candidate.get("finishReason") == "STOP"
    else:
        parts = [block["text"] for block in data["content"] if block["type"] == "text"]
        usage = TokenUsage.model_validate(data.get("usage") or {})
        complete = data.get("stop_reason") == "end_turn"

    if usage.total_tokens is None and None not in (usage.input_tokens, usage.output_tokens):
        usage.total_tokens = usage.input_tokens + usage.output_tokens
    return "".join(parts).strip(), usage, complete


def provider_error(status: int) -> HTTPException:
    """Map upstream status codes without exposing provider bodies or credentials."""
    if status in (401, 403):
        return HTTPException(401, "The provider rejected this API key or its permissions.")
    if status == 429:
        return HTTPException(429, "The provider reported a rate limit or quota issue.")
    if status == 404:
        return HTTPException(502, "The selected model is unavailable for this API key.")
    return HTTPException(502, "The provider could not complete the request.")


@router.post("/plan", response_model=PlanResponse)
async def plan_move(board: PlanRequest, request: Request, response: Response) -> PlanResponse:
    """Call a provider once and return only a short plan, a status, and usage counts."""
    scheme, _, key = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not re.fullmatch(r"[!-~]{1,512}", key):
        raise HTTPException(401, "Enter an API key for the selected provider.")

    url, headers, payload = provider_request(board, key)
    start = perf_counter()
    try:
        # Fixed destinations and no redirects keep credentials with the selected provider.
        async with httpx.AsyncClient(timeout=18, follow_redirects=False, trust_env=False) as client:
            upstream = await client.post(url, headers=headers, json=payload)
            if not upstream.is_success:
                raise provider_error(upstream.status_code)
            plan, usage, complete = read_plan(board.provider, upstream.json())
    except httpx.TimeoutException:
        raise HTTPException(504, "The provider took too long to respond.") from None
    except httpx.RequestError:
        raise HTTPException(502, "The app could not reach the provider.") from None
    except (ValueError, TypeError, KeyError, IndexError, AttributeError):
        raise HTTPException(502, "The provider returned an unreadable response.") from None

    issue = None
    if not complete:
        issue = "The provider stopped before completing a plan."
    elif plan == "NONE":
        issue = "The model did not find a route."
    elif len(plan) > 192 or not PLAN_PATTERN.fullmatch(plan):
        issue = "The model did not return a valid direction sequence."

    response.headers["Cache-Control"] = "no-store"
    return PlanResponse(
        model=MODELS[board.provider],
        plan=None if issue else plan,
        issue=issue,
        latency_ms=round((perf_counter() - start) * 1000),
        usage=usage,
    )
