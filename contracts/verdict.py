"""Deterministic verdict derivation for DeliveryEscrow adjudication.

This module contains the pure decision logic shared by the on-chain adjudicate
method and the offline regression tests. Any change to the precedence order or
output enum MUST be reflected in both SPEC.md and this file.
"""


def derive_verdict(
    pickup: str, condition: str, delivery: str, sender_response: str
) -> str:
    """Return the payout verdict for the four bounded factual dimensions.

    Precedence (matches SPEC.md decision matrix):
      1. pickup = NO or condition = LOST  -> SENDER_REFUND
      2. any fact UNVERIFIED              -> EVIDENCE_CONFLICT
      3. condition = DAMAGED              -> PARTIAL_PAYOUT_50
      4. delivery = YES + ACCEPTED        -> FULL_PAYOUT
      5. delivery = YES                   -> PARTIAL_PAYOUT_75
      6. default                          -> PARTIAL_PAYOUT_50
    """
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
