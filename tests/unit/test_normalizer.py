import pytest
from controller.query_normalizer import QueryNormalizer

@pytest.fixture
def normalizer():
    return QueryNormalizer()

@pytest.mark.asyncio
class TestQueryNormalizer:
    # 1. Simple retrieval
    async def test_simple_retrieval(self, normalizer):
        cio = await normalizer.normalize("List all employees")
        assert cio["intent"] == "retrieve"
        assert "employees" in [s.lower() for s in cio["subject"]]

    # 2. Multi-table phrasing
    async def test_multi_table_phrasing(self, normalizer):
        cio = await normalizer.normalize("Show customer invoices")
        assert cio["intent"] == "retrieve"
        subjects = [s.lower() for s in cio["subject"]]
        assert "customers" in subjects or "invoices" in subjects or "customer invoices" in subjects

    # 3. Count
    async def test_count(self, normalizer):
        cio = await normalizer.normalize("How many orders are pending?")
        assert cio["intent"] == "count"
        assert cio["aggregation"] == "COUNT"

    # 4. Average
    async def test_average(self, normalizer):
        cio = await normalizer.normalize("What is the average salary of employees?")
        assert cio["intent"] in ("average", "retrieve")
        assert cio["aggregation"] == "AVG"

    # 5. Sum
    async def test_sum(self, normalizer):
        cio = await normalizer.normalize("Find the total revenue from last month")
        assert cio["intent"] in ("sum", "retrieve")
        assert cio["aggregation"] == "SUM"

    # 6. Maximum
    async def test_maximum(self, normalizer):
        cio = await normalizer.normalize("Show the maximum price of products")
        assert cio["intent"] in ("maximum", "retrieve")
        assert cio["aggregation"] == "MAX"

    # 7. Minimum
    async def test_minimum(self, normalizer):
        cio = await normalizer.normalize("What is the minimum age of students?")
        assert cio["intent"] in ("minimum", "retrieve")
        assert cio["aggregation"] == "MIN"

    # 8. Distinct
    async def test_distinct(self, normalizer):
        cio = await normalizer.normalize("Show distinct categories of products")
        assert cio["aggregation"] == "DISTINCT"

    # 9. Group By
    async def test_group_by(self, normalizer):
        cio = await normalizer.normalize("Show sales per category")
        assert "category" in [g.lower() for g in cio["group_by"]]

    # 10. Order By
    async def test_order_by(self, normalizer):
        cio = await normalizer.normalize("Sort employees by salary")
        assert len(cio["order_by"]) > 0
        assert "salary" in cio["order_by"][0]["field"].lower()

    # 11. Top N
    async def test_top_n(self, normalizer):
        cio = await normalizer.normalize("Top 5 products by revenue")
        assert cio["limit"] == 5
        assert len(cio["order_by"]) > 0
        assert cio["order_by"][0]["direction"] == "DESC"

    # 12. Bottom N
    async def test_bottom_n(self, normalizer):
        cio = await normalizer.normalize("Bottom 3 suppliers by rating")
        assert cio["limit"] == 3
        assert len(cio["order_by"]) > 0
        assert cio["order_by"][0]["direction"] == "ASC"

    # 13. Time filters
    async def test_time_filters(self, normalizer):
        cio = await normalizer.normalize("Find transactions from last week")
        assert cio["time_filter"] is not None
        assert "last week" in cio["time_filter"].lower()

    # 14. Nested filters
    async def test_nested_filters(self, normalizer):
        cio = await normalizer.normalize("Find products where price is between 10 and 50 and category is electronics")
        assert len(cio["filters"]) >= 2

    # 15. Multiple entities
    async def test_multiple_entities(self, normalizer):
        cio = await normalizer.normalize("Show details for EMP102 and EMP103")
        assert "EMP102" in cio["entities"]
        assert "EMP103" in cio["entities"]

    # 16. Multiple conditions
    async def test_multiple_conditions(self, normalizer):
        cio = await normalizer.normalize("List customers from Mumbai and status active")
        assert len(cio["filters"]) >= 2 or any("mumbai" in str(f).lower() for f in cio["filters"])

    # 17. Comparison queries
    async def test_comparison_queries(self, normalizer):
        cio = await normalizer.normalize("Show products with price greater than 100")
        assert any(f.get("operator") in (">", "greater than") for f in cio["filters"])

    # 18. Conversational queries
    async def test_conversational_queries(self, normalizer):
        cio = await normalizer.normalize("Please show me the details of record MC10")
        assert "please" in [t.lower() for t in cio["ignored_terms"]]
        assert "MC10" in cio["entities"]

    # 19. Ambiguous queries
    async def test_ambiguous_queries(self, normalizer):
        cio = await normalizer.normalize("Something about MC10")
        assert "MC10" in cio["entities"]

    # 20. Greetings
    async def test_greetings(self, normalizer):
        cio = await normalizer.normalize("Hello there, how are you?")
        assert cio["intent"] in ("greeting", "conversation")

    # 21. Metadata questions
    async def test_metadata_questions(self, normalizer):
        cio = await normalizer.normalize("What tables are in the database?")
        assert cio["intent"] == "metadata_question"

    # 22. Unsupported queries
    async def test_unsupported_queries(self, normalizer):
        cio = await normalizer.normalize("Explain the theory of relativity")
        assert cio["intent"] in ("conversation", "unknown")