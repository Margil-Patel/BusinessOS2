import asyncio
from openai import AsyncOpenAI

async def test():
    client = AsyncOpenAI(base_url="http://localhost:11434/v1", api_key="ollama")
    
    system = """You are an expert SQL query generator.
Your task is to generate a single, precise SQL query based on the user's question and the schema context provided.

RULES (non-negotiable):
1. Only use tables and columns that are explicitly listed in the schema context.
2. Never invent table or column names.
3. Always use the exact schema-qualified table names as provided in the schema context.
4. Use exact column names as given.
5. For status/enum filters, use the exact values from the sample values list.
6. Use LIMIT 500 unless the query is an aggregation.
7. Write read-only SELECT queries only.
8. Return ONLY the SQL query — no explanation, no markdown fences, no commentary.
9. If you cannot generate a safe, accurate query, respond with: ERROR: <reason>
10. Prefer 'ILIKE' over '=' for string comparisons.
11. When the user uses pronouns like "that", "those", or "them", refer to the entities AND the filters used in the previous turn.

DIALECT: PostgreSQL
"""

    schema_context = """
Table: agri_management.farmers
Columns:
  - farmer_id (INTEGER, PRIMARY KEY)
  - farmer_name (VARCHAR)
  - village (VARCHAR)
  - land_size_acres (NUMERIC)
  - crop_type (VARCHAR)
"""

    # Scenario 1: With previous query note and full chat history
    history = [
        {"role": "user", "content": "list farmers who grows cotten"},
        {"role": "assistant", "content": "SELECT farmer_name FROM agri_management.farmers WHERE crop_type ILIKE 'Cotton' LIMIT 500;"}
    ]
    
    last_sql = "SELECT farmer_name FROM agri_management.farmers WHERE crop_type ILIKE 'Cotton' LIMIT 500;"
    
    user_prompt = f"""QUESTION: show all farmers
INTENT: select farmers
PREVIOUS QUERY (from earlier turn):
```sql
{last_sql}
```
Note: If the current question uses words like 'that', 'those', or 'them', reuse the WHERE filters from this previous query.

SCHEMA CONTEXT:
{schema_context}

Generate the SQL query now. Return ONLY the SQL, nothing else."""

    messages = [
        {"role": "system", "content": system},
        *history,
        {"role": "user", "content": user_prompt}
    ]

    print("--- Scenario 1 (With History & Previous Query Note) ---")
    resp = await client.chat.completions.create(
        model="qwen2.5:7b",
        messages=messages,
        temperature=0.0
    )
    print("Response:", repr(resp.choices[0].message.content))

    # Scenario 2: Without history and without previous query (clean standalone)
    user_prompt_clean = f"""QUESTION: show all farmers
INTENT: select farmers

SCHEMA CONTEXT:
{schema_context}

Generate the SQL query now. Return ONLY the SQL, nothing else."""

    messages_clean = [
        {"role": "system", "content": system},
        {"role": "user", "content": user_prompt_clean}
    ]

    print("\n--- Scenario 2 (Clean Standalone) ---")
    resp_clean = await client.chat.completions.create(
        model="qwen2.5:7b",
        messages=messages_clean,
        temperature=0.0
    )
    print("Response:", repr(resp_clean.choices[0].message.content))

asyncio.run(test())
