from pathlib import Path
import ast

SOURCE = Path(__file__).parents[1] / "contracts" / "DeliveryEscrow.py"
TEXT = SOURCE.read_text(encoding="utf-8")


def test_header_and_ascii():
    lines = TEXT.splitlines()
    assert lines[0] == '# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }'
    TEXT.encode("ascii")


def test_ast_and_required_surfaces():
    ast.parse(TEXT)
    for marker in (
        "@gl.public.write.payable",
        "prompt_comparative",
        "emit_transfer",
        "record_checkpoint",
        "get_delivery",
        "SENDER_NON_FUNDING",
        "COURIER_DELIVERY_DEFAULT",
        "SENDER_CONFIRMATION_DEFAULT",
        "ADJUDICATION_TIMEOUT",
    ):
        assert marker in TEXT


def test_nondeterminism_is_local_and_writes_do_not_scan_history():
    assert "def evaluate()" in TEXT
    assert "gl.nondet.web.render" in TEXT
    assert (
        "for "
        not in TEXT[
            TEXT.index("def record_checkpoint") : TEXT.index("def confirm_completion")
        ]
    )
    assert (
        "courier_id = self.courier_delivery_checkpoint[delivery_id]" in TEXT
    )
    assert (
        "sender_id = self.sender_confirmation_checkpoint[delivery_id]" in TEXT
    )


def test_no_secret_material():
    lowered = TEXT.lower()
    assert "private_key" not in lowered
    assert "pinata_jwt" not in lowered
