"""Typed response models for the public Clone app-key API."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ResponseModel(BaseModel):
    model_config = ConfigDict(strict=True)


class PredictionUsage(ResponseModel):
    prediction_units: int = Field(ge=0, le=1)


class MediaReceipt(ResponseModel):
    ref: str
    sha256: str
    timestamp_seconds: float | None = None


class Prediction(ResponseModel):
    request_id: str
    prediction_id: str
    session_id: str
    connection_id: str | None
    draft_revision: int = Field(ge=0)
    context_revision: str
    profile_revision: str
    grant_revision: int = Field(ge=0)
    status: Literal["suggested", "abstained"]
    completion: str
    expires_at: int
    context_truncated: bool
    usage: PredictionUsage
    feedback_revision: str = ""
    media_review: list[MediaReceipt] = Field(default_factory=list)


class Usage(ResponseModel):
    app_id: str
    month: str
    plan: Literal["sandbox", "paid"]
    prediction_units: int = Field(ge=0)
    reserved_units: int = Field(ge=0)
    paid_prediction_units: int = Field(ge=0)
    invoice_cents: int = Field(ge=0)
    monthly_cap_cents: int | None = Field(ge=0)
    billing_model: str = "manual"
    cap_scope: str = "app"
    sandbox_remaining: int = Field(ge=0)
    currency: Literal["USD"]


class CancelResult(ResponseModel):
    status: Literal["cancelled", "suggested", "abstained", "failed"]
    prediction_units: int = Field(ge=0, le=1)


class ConnectionStarted(ResponseModel):
    request_id: str
    expires_at: int
    authorize_url: str


class Connection(ResponseModel):
    connection_id: str
    profile_revision: str
    grant_revision: int = Field(ge=0)
    status: Literal["connected"]


class EventResult(ResponseModel):
    status: Literal["recorded"]


class FeedbackCleared(ResponseModel):
    status: Literal["cleared"]
    deleted: int = Field(ge=0)


class RevokeResult(ResponseModel):
    status: Literal["revoked"]
