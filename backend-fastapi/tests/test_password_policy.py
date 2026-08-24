# tests/test_password_policy.py
"""Unit tests for the password policy and strength scoring. No database, no server."""

from conftest import Results  # noqa: E402  (conftest sets sys.path)

from app.auth.password import hash_password  # noqa: E402
from app.auth.password_policy import (  # noqa: E402
    evaluate_password,
    is_password_reused,
    push_password_history,
)
from app.config import settings  # noqa: E402


def main() -> int:
    r = Results("Password policy")

    print("\n-- Length --")
    r.check(not evaluate_password("Ab3!efgh")["valid"], "8 characters rejected")
    r.check(evaluate_password("Kx7#mVpQz")["valid"], "9 characters accepted")
    r.check(settings.PASSWORD_MIN_LENGTH == 9, "minimum length is configurable and set to 9")

    print("\n-- Character classes --")
    r.check(not evaluate_password("kx7#mvpqz2")["checks"]["uppercase"], "missing uppercase detected")
    r.check(not evaluate_password("KX7#MVPQZ2")["checks"]["lowercase"], "missing lowercase detected")
    r.check(not evaluate_password("Kx#mVpQzWr")["checks"]["number"], "missing number detected")
    r.check(not evaluate_password("Kx7mVpQz2A")["checks"]["special"], "missing special character detected")
    r.check(evaluate_password("Kx7#mVpQz2")["valid"], "all four classes accepted")

    print("\n-- Identity --")
    john = evaluate_password("Johnsmith1!", email="john.smith@company.com", name="John Smith")
    r.check(not john["valid"], "password containing the user's name rejected")
    email_pwd = evaluate_password("Jsmith99!Xq", email="jsmith@company.com")
    r.check(not email_pwd["valid"], "password containing the email local part rejected")

    print("\n-- Weak and predictable --")
    r.check(not evaluate_password("Password1!")["valid"], "common password rejected")
    r.check(not evaluate_password("Abcdefgh1!")["valid"], "sequential letters rejected")
    r.check(not evaluate_password("Xy12345678!")["valid"], "sequential digits rejected")
    r.check(not evaluate_password("Xaaaa9#Qbz")["valid"], "four repeated characters rejected")
    r.check(not evaluate_password("Adani@1234")["valid"], "organisation name rejected")

    print("\n-- Strength levels --")
    weak = evaluate_password("abc")
    r.check(weak["level"] == "Weak" and weak["score"] == 0, "invalid password scores Weak")
    fair = evaluate_password("Kx7#mVpQz")
    r.check(fair["valid"] and fair["level"] in ("Fair", "Good"), f"minimal valid password is {fair['level']}")
    strong = evaluate_password("Kx7#mVpQz2wR")
    r.check(strong["score"] >= 2, f"longer password scores higher ({strong['level']})")
    very = evaluate_password("Kx7#mVpQz2wR$5tYb")
    r.check(very["level"] == "Very Strong", f"long, varied password is Very Strong (got {very['level']})")
    r.check(
        evaluate_password("Kx7#mVpQz2wR")["score"] <= evaluate_password("Kx7#mVpQz2wR$5tYb")["score"],
        "score increases monotonically with length",
    )

    print("\n-- History --")
    history = []
    for pwd in ["Kx7#mVpQz2", "Rt4$wNbLy8", "Hj9!zTcMk3", "Qw2%vFdRn6", "Zp5^xGhBt1"]:
        history = push_password_history(history, hash_password(pwd))
    r.check(len(history) == 5, f"history capped at {settings.PASSWORD_HISTORY_COUNT} (got {len(history)})")
    r.check(is_password_reused("Kx7#mVpQz2", history), "oldest stored password detected as reused")
    r.check(is_password_reused("Zp5^xGhBt1", history), "newest stored password detected as reused")
    r.check(not is_password_reused("Lm8&yJkWs4", history), "unused password accepted")

    history = push_password_history(history, hash_password("Lm8&yJkWs4"))
    r.check(len(history) == 5, "history stays capped after a sixth password")
    r.check(not is_password_reused("Kx7#mVpQz2", history), "sixth change evicts the oldest entry")
    r.check(
        all(isinstance(e, dict) and e["hash"].startswith("$2") for e in history),
        "history stores bcrypt hashes only, never plaintext",
    )

    return r.report()


if __name__ == "__main__":
    raise SystemExit(main())
