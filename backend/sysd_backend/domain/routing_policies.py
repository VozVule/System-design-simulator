"""Routing policies with their existing JSON contract values."""

from enum import StrEnum
from typing import Literal, TypeAlias


class RoutingPolicy(StrEnum):
    ROUND_ROBIN = "round_robin"
    WEIGHTED = "weighted"


# Literal members retain the contract's inline enum and accept raw JSON strings.
RoutingPolicyValue: TypeAlias = Literal[RoutingPolicy.ROUND_ROBIN, RoutingPolicy.WEIGHTED]
