import asyncio
from openai import AsyncOpenAI
from config.settings import get_settings

async def test():
    settings = get_settings()
    client = AsyncOpenAI(
        base_url=settings.ollama_base_url,
        api_key="ollama",
    )
    
    prompt = """You are a senior database analyst. Analyze the user's natural language query before database schema matching.
Analyze the query according to these steps:

Step 1 - Understand Intent: Determine the user's intention (e.g., retrieve records, filter records, aggregate data, compare values, sort results, count rows, find maximum/minimum, metadata question, greeting/non-database conversation). Do not inspect schemas yet.
Step 2 - Identify Important Information: Extract only meaningful entities or values (e.g., business identifiers, names, codes) and identify conversational filler terms to ignore.
Step 3 - Classify Words: Classify tokens into:
  - Action words: (e.g. show, find, list, retrieve - never search these in schema)
  - Conversational filler: (e.g. details, record, information, about - ignore completely, never search in schema)
  - Business entities: (e.g. specific IDs, names, categories, values to search in table data)
  - Possible schema terms: (e.g. terms representing tables, columns, or relationships like 'village', 'price')
Step 4 - Reason Before Schema Lookup: Reason about what information is actually required and what terms are candidates for schema search.

You MUST respond in this exact format (ensure the labels match exactly):

Intent Detected: <intent description>
Ignored Conversational Terms: <comma-separated list or none>
Business Entities: <comma-separated list or none>
Candidate Schema Terms: <comma-separated list or none>
Reason for Schema Lookup: <brief explanation of what to search for and where to search>

QUERY: Show details of MC10
"""
    response = await client.chat.completions.create(
        model=settings.ollama_model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.0,
    )
    print("Ollama Response:")
    print(response.choices[0].message.content)

asyncio.run(test())
