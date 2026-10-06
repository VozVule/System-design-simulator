"""The two phases of an active request's round trip."""

from enum import StrEnum


class TrafficPhase(StrEnum):
    REQUEST = "request"
    RESPONSE = "response"
