"""DeliveryEscrow two-wallet Studionet custody happy path.

Private keys are read only from process environment and are never persisted.
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
    held_before = int(initial["held"])
    contract_before = int(chain.get_balance(ADDRESS))
    courier_before = int(chain.get_balance(courier_account.address))
    print(
        json.dumps(
            {
                "event": "START",
                "delivery_id": delivery_id,
                "sender": sender_account.address,
                "courier": courier_account.address,
                "contract_balance": contract_before,
                "totals": initial,
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
            "Studionet delivery payout " + str(delivery_id),
            "Electronics package to downtown office",
            courier_account.address,
            FEE,
            URL,
            DIGEST,
        ],
    )
    wait_for(
        "DELIVERY_CREATED",
        lambda: {
            "ready": int(read("get_totals")["deliveries"]) > delivery_id,
            "totals": read("get_totals"),
        },
    )

    transactions["set_schedule"] = submit(
        sender_account,
        "set_schedule",
        [delivery_id, now + 3600, now + 7200, now + 10800, now + 14400],
    )
    wait_for(
        "SCHEDULE_LOCKED",
        lambda: {
            "ready": int(read("get_delivery", [delivery_id])["pickup_deadline"]) > now,
            "delivery": read("get_delivery", [delivery_id]),
        },
    )

    transactions["accept_delivery"] = submit(
        courier_account, "accept_delivery", [delivery_id], BOND
    )
    wait_for(
        "BOND_HELD",
        lambda: {
            "ready": read("get_delivery", [delivery_id])["status"] == "COURIER_ACCEPTED"
            and int(read("get_totals")["held"]) == held_before + BOND,
            "delivery": read("get_delivery", [delivery_id]),
            "totals": read("get_totals"),
        },
    )

    transactions["fund_delivery"] = submit(
        sender_account, "fund_delivery", [delivery_id], FEE
    )
    custody = wait_for(
        "FULL_CUSTODY",
        lambda: {
            "ready": read("get_delivery", [delivery_id])["status"] == "IN_TRANSIT"
            and int(read("get_totals")["held"]) == held_before + FEE + BOND
            and int(chain.get_balance(ADDRESS)) >= contract_before + FEE + BOND,
            "delivery": read("get_delivery", [delivery_id]),
            "totals": read("get_totals"),
            "contract_balance": int(chain.get_balance(ADDRESS)),
        },
    )

    transactions["record_checkpoint"] = submit(
        courier_account,
        "record_checkpoint",
        [delivery_id, "DELIVERED", URL, DIGEST, 1],
    )
    wait_for(
        "COURIER_CHECKPOINT",
        lambda: {
            "ready": int(read("get_totals")["checkpoints"])
            > int(initial["checkpoints"]),
            "totals": read("get_totals"),
        },
    )

    transactions["confirm_completion"] = submit(
        sender_account, "confirm_completion", [delivery_id]
    )
    final = wait_for(
        "PAYOUT_SETTLED",
        lambda: {
            "ready": read("get_delivery", [delivery_id])["status"] == "SETTLED"
            and read("get_delivery", [delivery_id])["verdict"] == "FULL_PAYOUT"
            and int(read("get_delivery", [delivery_id])["courier_paid"]) == FEE
            and int(read("get_delivery", [delivery_id])["courier_refunded"]) == BOND
            and int(read("get_totals")["held"]) == held_before
            and int(chain.get_balance(ADDRESS)) == contract_before,
            "delivery": read("get_delivery", [delivery_id]),
            "totals": read("get_totals"),
            "contract_balance": int(chain.get_balance(ADDRESS)),
        },
    )

    tx_results = {}
    for name, tx_hash in transactions.items():
        tx = chain.get_transaction(tx_hash)
        tx_results[name] = {
            "hash": tx_hash,
            "status": tx.get("status_name"),
            "result": tx.get("result_name"),
            "execution": tx.get("tx_execution_result_name"),
        }

    print(
        json.dumps(
            {
                "event": "FINAL_RESULT",
                "address": ADDRESS,
                "delivery_id": delivery_id,
                "custody": custody,
                "final": final,
                "transactions": tx_results,
                "courier_balance_before": courier_before,
                "courier_balance_after": int(
                    chain.get_balance(courier_account.address)
                ),
            },
            sort_keys=True,
            default=str,
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
