def derive(pickup, condition, delivery, sender_response):
    if pickup == "NO" or condition == "LOST":
        return "SENDER_REFUND"
    if "UNVERIFIED" in (pickup, condition, delivery, sender_response):
        return "EVIDENCE_CONFLICT"
    if condition == "DAMAGED":
        return "PARTIAL_PAYOUT_50"
    if delivery == "YES" and sender_response == "ACCEPTED":
        return "FULL_PAYOUT"
    if delivery == "YES":
        return "PARTIAL_PAYOUT_75"
    return "PARTIAL_PAYOUT_50"


def test_precedence_and_happy_path():
    assert derive("YES", "INTACT", "YES", "ACCEPTED") == "FULL_PAYOUT"
    assert derive("NO", "INTACT", "YES", "ACCEPTED") == "SENDER_REFUND"
    assert derive("YES", "INTACT", "YES", "ACCEPTED") != "EVIDENCE_CONFLICT"
    assert derive("UNVERIFIED", "INTACT", "YES", "ACCEPTED") == "EVIDENCE_CONFLICT"


def test_partial_bands():
    assert derive("YES", "INTACT", "YES", "DISPUTED") == "PARTIAL_PAYOUT_75"
    assert derive("YES", "DAMAGED", "YES", "ACCEPTED") == "PARTIAL_PAYOUT_50"


def test_lost_condition():
    assert derive("YES", "LOST", "NO", "DISPUTED") == "SENDER_REFUND"


def test_damaged_condition():
    assert derive("YES", "DAMAGED", "YES", "ACCEPTED") == "PARTIAL_PAYOUT_50"


def signature(facts):
    return "|".join(
        facts[key]
        for key in ("pickup", "condition", "delivery", "sender_response")
    )


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
        assert signature(changed) != signature(base)
