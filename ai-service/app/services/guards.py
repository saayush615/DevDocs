"""Guardrails wrapper service.

Everything here is built ONCE at import time (module-level singletons),
mirroring how `_graph` is compiled once in `routers/query.py`. The two public
functions are called from the LangGraph nodes:

    run_input_guard(question)  -> True = ALLOWED, False = BLOCKED
    run_output_guard(answer)   -> True = SAFE,    False = BLOCKED
"""
import re

# `Guard` is the container; we give it validators. `ValidationError` is raised
# by `guard.validate()` when a validator fails with on_fail="exception".
from guardrails import Guard
from guardrails import settings as gr_settings
from guardrails.errors import ValidationError
from guardrails_ai.ban_list import BanList
from guardrails_ai.profanity_free import ProfanityFree

from app.config import settings

# Guardrails hardcodes a hosted OTLP telemetry endpoint
# (https://hty0gc1ok3.execute-api.us-east-1.amazonaws.com/v1/traces) the tracer
# tries to reach on every validate() call. It's unreachable here, so disable
# tracing globally and opt each guard out of metrics collection (no spans are
# ever created -> no export attempts -> no retry/error log noise).
gr_settings.disable_tracing = True

# 1) Prompt-injection regex filter (pure Python, zero cost)
# Each string is ONE injection intent. `re` joins them with "|" and compiles a
# single case-insensitive regex at import time — reused for every request.
_PROMPT_INJECTION_PATTERNS = [
    r"ignore previous (instructions|all instructions)",  # "ignore previous instructions" (r"" — raw string)
    r"ignore all (previous )?instructions",             # "ignore all instructions above"
    r"ignore (the )?above",                             # "ignore the above text"
    r"disregard (all |the )?rules",                     # "disregard all rules"
    r"do not follow (the |any )?rules",                 # "do not follow any rules"
    r"act as if you have no restrictions",              # classic jailbreak
    r"act (with|under) no restrictions",                # same idea, other words
    r"reveal (your|the) system prompt",                 # "reveal your system prompt"
    r"show (your|the) system prompt",                   # "show your system prompt"
    r"print (your|the) (system )?prompt",               # "print your prompt"
    r"what are your (initial )?(instructions|prompt)",  # "what are your initial instructions?"
]

_INJECTION_RE = re.compile("|".join(_PROMPT_INJECTION_PATTERNS), re.IGNORECASE)

def has_prompt_injection(text: str) -> bool:
    """Return True if `text` looks like a prompt-injection attempt (regex only)."""
    return bool(_INJECTION_RE.search(text))


# 2) Guard objects (built ONCE, reused by every request)

def _parse_banned_words(raw: str) -> list[str]:
    return [w.strip() for w in raw.split(",") if w.strip()]


# ProfanityFree: tiny sklearn classifier (alt-profanity-check), ~2 ms per call.
# `on_fail="exception"` means `guard.validate()` raises on a profane match.
_profanity_guard = Guard().use(ProfanityFree(on_fail="exception"))
_profanity_guard.configure(allow_metrics_collection=False)

# BanList: pure fuzzy string matching (Levenshtein, max distance 1 default).
# Catches leaked secrets / codenames even if slightly misspelled ("A T H E N A").
# Empty banned list -> validator passes everything (harmless in dev).
_banlist_guard = Guard().use(
    BanList(
        banned_words=_parse_banned_words(settings.GUARD_BANNED_WORDS),
        on_fail="exception",
    )
)
_banlist_guard.configure(allow_metrics_collection=False)


# 3) Public entry points used by the graph nodes

def run_input_guard(question: str) -> bool:
    """Screen the USER'S question BEFORE the LLM is called (zero tokens spent).

    Returns True if the question is safe to process, False to short-circuit.
    Order runs cheapest check first: regex (free) -> sklearn (tiny).
    """
    if not settings.GUARD_INPUT_ENABLED:
        return True  # toggle off -> let everything through

    # 1) Regex prompt-injection filter (free, no model).
    if has_prompt_injection(question):
        return False  # looks like an injection attempt -> block

    # 2) Profanity check on the raw question text.
    try:
        _profanity_guard.validate(question)
        return True  # no profanity detected -> allowed
    except ValidationError:
        return False  # profane question -> block
    except Exception:
        return False  # any unexpected error -> fail CLOSED


def run_output_guard(answer: str) -> bool:
    """Screen the GENERATED ANSWER after grounding, before it reaches the user.

    Returns True if the answer is safe to stream, False to swap in the
    "not enough information" fallback. Runs ProfanityFree then BanList.
    We NEVER auto-redact and send a partial answer — all-or-nothing.
    """
    if not settings.GUARD_OUTPUT_ENABLED:
        return True  # toggle off -> let everything through

    # Check each validator in turn; first failure = BLOCKED.
    for guard in (_profanity_guard, _banlist_guard):
        try:
            guard.validate(answer)
        except ValidationError:
            return False  # profanity or banned term found
        except Exception:
            return False  # fail CLOSED on any unexpected error
    return True  # passed both checks