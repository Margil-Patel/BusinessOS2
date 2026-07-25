# Project Rules: NL2SQL Context & Validation Safety

To prevent regressions around filter bleeding, silent schema stripping, and loop validation skipping, follow these rules:

## 1. Context Isolation for LLM SQL Generation
* **Rule**: Standalone queries must be strictly isolated from conversational history.
* **Implementation Guideline**: Detect whether the natural language query contains follow-up pronouns (e.g., `that`, `those`, `them`, `these`, `it`) or start transitions (e.g., `also`, `and`, `instead`, `how about`). 
* **Action**:
  * If the query is **standalone**, omit `history` and `PREVIOUS QUERY` contexts from the prompt to avoid filter leakage (such as retaining a `WHERE` filter from the previous turn).
  * If the query **is contextual**, supply the history and previous query context to allow the LLM to resolve references.

## 2. EXPLAIN Exception Validation
* **Rule**: Never check for SQL-related keywords (like `"EXPLAIN"`) by doing a substring search on the entire raw database exception message.
* **Reason**: Database exception wrappers (like SQLAlchemy) append the executed query string to the exception. Doing a substring search on the full exception will falsely catch `"EXPLAIN"` from the query block, causing the validator to skip database relation/syntax errors.
* **Action**: Split or strip the exception message to check only the database engine message (e.g., before any query trace/sql printout).

## 3. Strict Table Registry Verification
* **Rule**: Always perform a direct lookup against the `TableRegistry` for all tables referenced in the generated SQL.
* **Action**: Extract referenced tables (ignoring local CTEs/subquery aliases) and reject the query with a clean ValidationError if any table is not loaded in the active schema context. Do not rely solely on database-side checks.

## 4. FastAPI Pydantic Serialization
* **Rule**: Every field returned by the controller to the API router must be explicitly declared in the Pydantic response models (e.g., `QueryResponse`).
* **Reason**: FastAPI's default response validation silently strips undeclared dictionary keys from the serialized JSON payload, causing frontend data delivery failure.
