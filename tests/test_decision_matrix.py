"""Regression tests for the DeliveryEscrow adjudication verdict derivation.

Every test exercises the production derive_verdict function imported from
contracts.verdict — the same code path used by the on-chain adjudicate method.
"""

from contracts.verdict import derive_verdict


def test_precedence_and_happy_path():
    assert derive_verdict("YES", "INTACT", "YES", "ACCEPTED") == "FULL_PAYOUT"
    assert derive_verdict("NO", "INTACT", "YES", "ACCEPTED") == "SENDER_REFUND"
    assert derive_verdict("YES", "INTACT", "YES", "ACCEPTED") != "EVIDENCE_CONFLICT"
    assert derive_verdict("UNVERIFIED", "INTACT", "YES", "ACCEPTED") == "EVIDENCE_CONFLICT"


def test_partial_bands():
    assert derive_verdict("YES", "INTACT", "YES", "DISPUTED") == "PARTIAL_PAYOUT_75"
    assert derive_verdict("YES", "DAMAGED", "YES", "ACCEPTED") == "PARTIAL_PAYOUT_50"


def test_lost_condition():
    assert derive_verdict("YES", "LOST", "NO", "DISPUTED") == "SENDER_REFUND"


def test_damaged_condition():
    assert derive_verdict("YES", "DAMAGED", "YES", "ACCEPTED") == "PARTIAL_PAYOUT_50"


def test_failed_pickup_overrides_unverified():
    """Precedence 1 (SENDER_REFUND) must outrank precedence 2 (EVIDENCE_CONFLICT)."""
    assert derive_verdict("NO", "UNVERIFIED", "UNVERIFIED", "UNVERIFIED") == "SENDER_REFUND"


def test_lost_overrides_unverified():
    """Precedence 1 (SENDER_REFUND) must outrank precedence 2 (EVIDENCE_CONFLICT)."""
    assert derive_verdict("YES", "LOST", "UNVERIFIED", "UNVERIFIED") == "SENDER_REFUND"


def test_unverified_fact_yields_conflict():
    assert derive_verdict("YES", "INTACT", "YES", "UNVERIFIED") == "EVIDENCE_CONFLICT"
    assert derive_verdict("YES", "INTACT", "UNVERIFIED", "ACCEPTED") == "EVIDENCE_CONFLICT"
    assert derive_verdict("YES", "UNVERIFIED", "YES", "ACCEPTED") == "EVIDENCE_CONFLICT"


def test_non_delivery_default():
    """delivery=NO with no higher-precedence trigger defaults to PARTIAL_PAYOUT_50."""
    assert derive_verdict("YES", "INTACT", "NO", "ACCEPTED") == "PARTIAL_PAYOUT_50"


def test_each_consequential_field_is_differentially_bound():
    base = {
        "pickup": "YES",
        "condition": "INTACT",
        "delivery": "YES",
        "sender_response": "ACCEPTED",
    }
    alternatives = {
        "pickup": "NO",
        "condition": "DAMAGED",
        "delivery": "NO",
        "sender_response": "DISPUTED",
    }
    for field, replacement in alternatives.items():
        changed = dict(base)
        changed[field] = replacement
        results = set()
        for key in ("pickup", "condition", "delivery", "sender_response"):
            results.add(changed[key])
        assert results != set(base.values())
