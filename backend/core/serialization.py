import base64
import json
from typing import Dict, Any


def serialize_data(data: Dict[str, Any]) -> Dict[str, Any]:
    """Convert bytes and other non-serializable types to JSON-compatible formats."""
    serialized_data = {}

    for key, value in data.items():
        if isinstance(value, bytes):
            # Convert bytes to base64 encoded string
            serialized_data[key] = {
                "_encoding": "base64",
                "data": base64.b64encode(value).decode("ascii"),
            }
        elif isinstance(value, dict):
            # Recursively serialize nested dictionaries
            serialized_data[key] = serialize_data(value)
        elif isinstance(value, list):
            # Recursively serialize lists
            serialized_data[key] = [
                (
                    serialize_data(item)
                    if isinstance(item, dict)
                    else (base64.b64encode(item).decode("ascii") if isinstance(item, bytes) else item)
                )
                for item in value
            ]
        else:
            # Other types pass through as-is
            serialized_data[key] = value

    return serialized_data


def deserialize_data(data: Dict[str, Any]) -> Dict[str, Any]:
    """Convert serialized data back to Python native types."""
    deserialized_data = {}

    for key, value in data.items():
        if isinstance(value, dict) and "_encoding" in value and value["_encoding"] == "base64":
            # Convert base64 back to bytes
            deserialized_data[key] = base64.b64decode(value["data"])
        elif isinstance(value, dict):
            # Recursively deserialize nested dictionaries
            deserialized_data[key] = deserialize_data(value)
        elif isinstance(value, list):
            # Recursively deserialize lists
            deserialized_data[key] = [deserialize_data(item) if isinstance(item, dict) else item for item in value]
        else:
            # Other types pass through as-is
            deserialized_data[key] = value

    return deserialized_data


def extract_record_from_raw(record: Any) -> dict:
    """Extract record data from a raw record."""
    if isinstance(record, bytes):
        # Try to decode as JSON
        try:
            return json.loads(record)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return {}
    return record
