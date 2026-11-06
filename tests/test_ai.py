"""Verify provider requests and safe responses without making paid API calls."""

import json

import httpx
import pytest
from fastapi.testclient import TestClient

from snake_lab import ai

BOARD = {"snake": [[8, 10], [7, 10], [6, 10]], "direction": "right", "food": [12, 7]}
KEY = "test-key-never-published"


def mock_provider(monkeypatch: pytest.MonkeyPatch, handler) -> None:
    """Replace the outbound transport while leaving the local HTTP route intact."""
    client_class = httpx.AsyncClient

    def client_factory(**kwargs):
        assert kwargs["follow_redirects"] is False
        return client_class(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(ai.httpx, "AsyncClient", client_factory)


@pytest.mark.parametrize(
    ("provider", "host", "auth_header", "response_data"),
    [
        (
            "openai",
            "api.openai.com",
            "Authorization",
            {
                "status": "completed",
                "output": [
                    {"type": "message", "content": [{"type": "output_text", "text": "R4,U3"}]}
                ],
                "usage": {"input_tokens": 110, "output_tokens": 5, "total_tokens": 115},
            },
        ),
        (
            "gemini",
            "generativelanguage.googleapis.com",
            "x-goog-api-key",
            {
                "candidates": [
                    {
                        "finishReason": "STOP",
                        "content": {
                            "parts": [{"text": "Ignored", "thought": True}, {"text": "R4,U3"}]
                        },
                    }
                ],
                "usageMetadata": {
                    "promptTokenCount": 110,
                    "candidatesTokenCount": 5,
                    "totalTokenCount": 115,
                },
            },
        ),
        (
            "anthropic",
            "api.anthropic.com",
            "x-api-key",
            {
                "stop_reason": "end_turn",
                "content": [{"type": "text", "text": "R4,U3"}],
                "usage": {"input_tokens": 110, "output_tokens": 5},
            },
        ),
    ],
)
def test_ai_plan_routes_key_and_normalizes_usage(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    provider: str,
    host: str,
    auth_header: str,
    response_data: dict,
) -> None:
    calls = []

    def respond(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        assert request.url.host == host
        assert request.headers[auth_header] == (f"Bearer {KEY}" if provider == "openai" else KEY)
        assert KEY not in str(request.url)
        assert KEY.encode() not in request.content
        body = json.loads(request.content)
        if provider == "openai":
            assert body["store"] is False
            assert body["max_output_tokens"] == 96
            state = body["input"]
        elif provider == "gemini":
            assert body["generationConfig"]["maxOutputTokens"] == 96
            state = body["contents"][0]["parts"][0]["text"]
        else:
            assert body["max_tokens"] == 96
            assert request.headers["anthropic-version"] == "2023-06-01"
            state = body["messages"][0]["content"]
        assert json.loads(state) == BOARD
        return httpx.Response(200, json=response_data)

    mock_provider(monkeypatch, respond)
    result = client.post(
        "/api/ai/plan",
        json={**BOARD, "provider": provider},
        headers={"Authorization": f"Bearer {KEY}"},
    )
    assert result.status_code == 200
    assert result.headers["Cache-Control"] == "no-store"
    assert len(calls) == 1
    assert KEY not in result.text
    assert result.json()["plan"] == "R4,U3"
    assert result.json()["issue"] is None
    assert result.json()["usage"] == {"input_tokens": 110, "output_tokens": 5, "total_tokens": 115}


@pytest.mark.parametrize(("status", "expected"), [(401, 401), (429, 429), (404, 502), (307, 502)])
def test_provider_errors_are_sanitized_and_not_retried(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, status: int, expected: int
) -> None:
    calls = []

    def respond(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(status, text=KEY, headers={"Location": "https://example.com/"})

    mock_provider(monkeypatch, respond)
    result = client.post(
        "/api/ai/plan",
        json={**BOARD, "provider": "openai"},
        headers={"Authorization": f"Bearer {KEY}"},
    )
    assert result.status_code == expected
    assert KEY not in result.text
    assert len(calls) == 1


def test_no_provider_call_when_key_or_provider_invalid(client: TestClient) -> None:
    assert client.post("/api/ai/plan", json={**BOARD, "provider": "openai"}).status_code == 401
    assert client.post("/api/ai/plan", json={**BOARD, "provider": "custom"}).status_code == 422


@pytest.mark.parametrize(
    ("text", "stop", "issue"),
    [
        ("NONE", "end_turn", "did not find"),
        ("R4, write an explanation", "end_turn", "valid direction"),
        ("R4", "max_tokens", "before completing"),
    ],
)
def test_rejected_model_output_preserves_usage(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, text: str, stop: str, issue: str
) -> None:
    def respond(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "stop_reason": stop,
                "content": [{"type": "text", "text": text}],
                "usage": {"input_tokens": 104, "output_tokens": 9},
            },
        )

    mock_provider(monkeypatch, respond)
    result = client.post(
        "/api/ai/plan",
        json={**BOARD, "provider": "anthropic"},
        headers={"Authorization": f"Bearer {KEY}"},
    ).json()
    assert result["plan"] is None
    assert issue in result["issue"]
    assert result["usage"]["total_tokens"] == 113
