"""Component identifiers and the graph rules that group them."""

from enum import StrEnum


class ComponentType(StrEnum):
    CALLER_GROUP = "caller_group"
    LOAD_BALANCER = "load_balancer"
    GATEWAY = "gateway"
    SERVER = "server"
    DATABASE = "database"


COMPONENT_TYPES = frozenset(ComponentType)
ROUTER_COMPONENT_TYPES = frozenset({ComponentType.LOAD_BALANCER, ComponentType.GATEWAY})
SINGLE_DESTINATION_COMPONENT_TYPES = frozenset({ComponentType.CALLER_GROUP, ComponentType.SERVER})
DESTINATION_REQUIRED_COMPONENT_TYPES = ROUTER_COMPONENT_TYPES | {ComponentType.CALLER_GROUP}
