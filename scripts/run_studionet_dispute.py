"""DeliveryEscrow Studionet dispute flow.

Exercises: create -> fund -> both checkpoints -> open_dispute -> adjudicate -> settle.
Adjudicate is a nondeterministic call; this script waits for consensus.
"""

import json
import os
import time

from genlayer_py import create_account, create_client
from genlayer_py.chains import studionet


ADDRESS = os.environ.get("DELIVERYESCROW_CONTRACT_ADDRESS", "")
RPC_URL = "https://studio.genlayer.com/api"
FEE = 10**16
BOND = 10**15
URL = "https://ipfs.io/ipfs/QmbbFBJ3zdfjdPEXaAa6wNrPNnX6Cm4WENSbysAoCjhe8F"
DIGEST = "sha256:" + ("1" * 64)


def parse(value):
    return json.loads(value) if isinstance(value, str) else value


def main():
    sender_key = os.environ.get("DELIVERYESCROW_SENDER_PRIVATE_KEY", "")
    courier_key = os.environ.get("DELIVERYESCROW_COURIER_PRIVATE_KEY", "")
    if not sender_key or not courier_key:
        raise RuntimeError("Set both DeliveryEscrow test key environment variables.")
    if not ADDRESS:
        raise RuntimeError("Set DELIVERYESCROW_CONTRACT_ADDRESS.")

    sender_account = create_account(sender_key)
    courier_account = create_account(courier_key)
    if sender_account.address.lower() == courier_account.address.lower():
        raise RuntimeError("Sender and courier must be different wallets.")

    chain = create_client(chain=studionet, account=sender_account, endpoint=RPC_URL)

    def read(name, args=None):
        return parse(
            chain.read_contract(
                address=ADDRESS,
                function_name=name,
                args=args or [],
                account=sender_account,
            )
        )

    def submit(account, method, args, value=0):
        tx = chain.write_contract(
            address=ADDRESS,
            function_name=method,
            account=account,
            args=args,
            value=value,
        )
        tx_hash = str(tx)
        print(
            json.dumps(
                {"event": "TX_SUBMITTED", "method": method, "tx": tx_hash},
                sort_keys=True,
            ),
            flush=True,
        )
        return tx_hash

    def wait_for(label, predicate, timeout=480):
        deadline = time.time() + timeout
        last = ""
        while time.time() < deadline:
            state = predicate()
            encoded = json.dumps(state, sort_keys=True, default=str)
            if encoded != last:
                print(
                    json.dumps(
                        {"event": label, "state": state},
                        sort_keys=True,
                        default=str,
                    ),
                    flush=True,
                )
                last = encoded
            if state.get("ready"):
                return state
            time.sleep(5)
        raise TimeoutError(label + " did not reach expected state")

    initial = read("get_totals")
    delivery_id = int(initial["deliveries"])
    print(
        json.dumps(
            {
                "event": "START",
                "delivery_id": delivery_id,
                "sender": sender_account.address,
                "courier": courier_account.address,
            },
            sort_keys=True,
        ),
        flush=True,
    )

    transactions = {}
    now = int(time.time())

    transactions["create_delivery"] = submit(
        sender_account,
        "create_delivery",
        [
            "Dispute test delivery " + str(delivery_id),
            "Damaged package scenario",
            courier_account.address,
            FEE,
            URL,
            DIGEST,
        ],
    )
    wait_for(
        "DELIVERY_CREATED",
        lambda: {"ready": int(read("get_totals")["deliveries"]) > delivery_id},
    )

    transactions["set_schedule"] = submit(
        sender_account,
        "set_schedule",
        [delivery_id, now + 3600, now + 7200, now + 10800, now + 14400],
    )
    wait_for(
        "SCHEDULE_LOCKED",
        lambda: {
            "ready": int(read("get_delivery", [delivery_id])["pickup_deadline"]) > now
        },
    )

    transactions["accept_delivery"] = submit(
        courier_account, "accept_delivery", [delivery_id], BOND
    )
    wait_for(
        "BOND_HELD",
        lambda: {
            "ready": read("get_delivery", [delivery_id])["status"]
            == "COURIER_ACCEPTED"
        },
    )

    transactions["fund_delivery"] = submit(
        sender_account, "fund_delivery", [delivery_id], FEE
    )
    wait_for(
        "FULL_CUSTODY",
        lambda: {
            "ready": read("get_delivery", [delivery_id])["status"] == "IN_TRANSIT"
        },
    )

    transactions["courier_checkpoint"] = submit(
        courier_account,
        "record_checkpoint",
        [delivery_id, "DELIVERED", URL, DIGEST, 1],
    )
    wait_for(
        "COURIER_CHECKPOINT",
        lambda: {
            "ready": int(read("get_totals")["checkpoints"])
            > int(initial["checkpoints"])
        },
    )

    transactions["sender_checkpoint"] = submit(
        sender_account,
        "record_checkpoint",
        [delivery_id, "DAMAGE_REPORT", URL, DIGEST, 1],
    )
    wait_for(
        "SENDER_CHECKPOINT",
        lambda: {
            "ready": int(read("get_totals")["checkpoints"])
            > int(initial["checkpoints"]) + 1
        },
    )

    transactions["open_dispute"] = submit(sender_account, "open_dispute", [delivery_id])
    wait_for(
        "DISPUTED",
        lambda: {
            "ready": read("get_delivery", [delivery_id])["status"] == "DISPUTED"
        },
    )

    transactions["adjudicate"] = submit(sender_account, "adjudicate", [delivery_id])
    adjudicated = wait_for(
        "ADJUDICATED",
        lambda: {
            "ready": read("get_delivery", [delivery_id])["status"] in (
                "ADJUDICATED",
                "RECOVERY",
            ),
            "delivery": read("get_delivery", [delivery_id]),
        },
        timeout=600,
    )

    verdict = adjudicated["delivery"]["verdict"]
    if verdict == "EVIDENCE_CONFLICT":
        print(
            json.dumps(
                {"event": "CONFLICT_RECOVERY", "verdict": verdict}, sort_keys=True
            ),
            flush=True,
        )
        transactions["recover"] = submit(sender_account, "recover", [delivery_id])
        final = wait_for(
            "RECOVERED",
            lambda: {
                "ready": read("get_delivery", [delivery_id])["status"] == "SETTLED"
            },
        )
    else:
        transactions["settle"] = submit(sender_account, "settle", [delivery_id])
        final = wait_for(
            "SETTLED",
            lambda: {
                "ready": read("get_delivery", [delivery_id])["status"] == "SETTLED"
            },
        )

    print(
        json.dumps(
            {
                "event": "FINAL_RESULT",
                "address": ADDRESS,
                "delivery_id": delivery_id,
                "adjudicated": adjudicated,
                "final": final,
                "transactions": {
                    name: {"hash": h} for name, h in transactions.items()
                },
            },
            sort_keys=True,
            default=str,
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
