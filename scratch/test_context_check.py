import re

def _is_contextual_query(nl_query: str) -> bool:
    ref_pattern = r"\b(that|those|them|these|it|him|her|they|this|there|above|earlier|previous)\b"
    trans_pattern = r"^\s*(also|and|how\s+about|what\s+about|instead|but)\b"
    
    q_lower = nl_query.lower()
    return bool(re.search(ref_pattern, q_lower) or re.search(trans_pattern, q_lower))

queries = [
    # Standalone queries (should return False)
    ("show all farmers", False),
    ("list all details of the farmers", False),
    ("Show the farmer table.", False),
    ("list all farmers residing in mehsana", False),
    ("list farmers who grows cotten", False),
    ("show all glossy tiles", False),
    ("name all glossy tiles", False),
    
    # Contextual follow-up queries (should return True)
    ("show them", True),
    ("also show their village", True),
    ("and sort by land size", True),
    ("how about those residing in surat?", True),
    ("what about matte tiles?", True),
    ("show those", True),
    ("filter these by crop", True),
]

for q, expected in queries:
    actual = _is_contextual_query(q)
    print(f"Query: {q:<40} | Expected: {expected:<5} | Actual: {actual:<5} | Match: {expected == actual}")
