"""
model/relationships/graph.py
─────────────────────────────
NetworkX FK relationship graph and join-path finder.
Populated from FK constraints discovered during schema introspection.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

import networkx as nx

logger = logging.getLogger(__name__)


@dataclass
class Relationship:
    from_table: str
    from_column: str
    to_table: str
    to_column: str
    cardinality: str = "N:1"  # N:1, 1:N, M:N

    def to_dict(self) -> dict[str, Any]:
        return {
            "from": f"{self.from_table}.{self.from_column}",
            "to": f"{self.to_table}.{self.to_column}",
            "join": f"{self.from_table}.{self.from_column} = {self.to_table}.{self.to_column}",
            "cardinality": self.cardinality,
        }


@dataclass
class JoinPath:
    tables: list[str]
    joins: list[str]  # e.g. ["orders.customer_id = customers.id"]
    hop_count: int = field(init=False)

    def __post_init__(self) -> None:
        self.hop_count = len(self.tables) - 1

    def to_dict(self) -> dict[str, Any]:
        return {
            "tables": self.tables,
            "joins": self.joins,
            "hop_count": self.hop_count,
        }


class RelationshipGraph:
    """
    Directed graph where nodes = tables, edges = FK relationships.
    Supports join-path discovery between arbitrary table pairs.
    """

    def __init__(self) -> None:
        self._graph: nx.DiGraph = nx.DiGraph()
        self._relationships: list[Relationship] = []

    def add_relationship(self, rel: Relationship) -> None:
        self._relationships.append(rel)
        # Add edge in both directions for undirected path-finding
        self._graph.add_edge(
            rel.from_table,
            rel.to_table,
            from_col=rel.from_column,
            to_col=rel.to_column,
            join=f"{rel.from_table}.{rel.from_column} = {rel.to_table}.{rel.to_column}",
        )
        self._graph.add_edge(
            rel.to_table,
            rel.from_table,
            from_col=rel.to_column,
            to_col=rel.from_column,
            join=f"{rel.to_table}.{rel.to_column} = {rel.from_table}.{rel.from_column}",
        )

    def get_paths(self, table_names: list[str]) -> dict[str, Any]:
        """
        Find join paths between all pairs of the requested tables.
        Returns a dict with 'relationships' (direct FKs) and 'join_paths'.
        """
        # Direct relationships involving the requested tables
        direct = [
            r.to_dict()
            for r in self._relationships
            if r.from_table in table_names or r.to_table in table_names
        ]

        # Shortest join paths between all pairs
        join_paths: list[dict[str, Any]] = []
        tables = [t for t in table_names if t in self._graph.nodes]
        for i, src in enumerate(tables):
            for dst in tables[i + 1:]:
                if src == dst:
                    continue
                path = self._find_shortest_path(src, dst)
                if path:
                    join_paths.append(path.to_dict())

        return {
            "relationships": direct,
            "join_paths": join_paths,
            "total_tables_in_graph": self._graph.number_of_nodes(),
        }

    def _find_shortest_path(self, src: str, dst: str) -> JoinPath | None:
        try:
            node_path: list[str] = nx.shortest_path(self._graph, src, dst)
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return None

        joins: list[str] = []
        for i in range(len(node_path) - 1):
            edge_data = self._graph.get_edge_data(node_path[i], node_path[i + 1], {})
            joins.append(edge_data.get("join", f"{node_path[i]} → {node_path[i+1]}"))

        return JoinPath(tables=node_path, joins=joins)

    def load_from_registry(self, tables: list[Any]) -> None:
        """Populate the graph from TableMeta objects (called by ModelFacade after sync)."""
        self._graph.clear()
        self._relationships.clear()
        for table in tables:
            self._graph.add_node(table.qualified_name)
            for col in table.columns:
                if col.is_foreign_key and col.foreign_table:
                    # Look up qualified name for the foreign table
                    foreign_qname = col.foreign_table
                    self.add_relationship(
                        Relationship(
                            from_table=table.qualified_name,
                            from_column=col.name,
                            to_table=foreign_qname,
                            to_column=col.foreign_column or "id",
                        )
                    )
        logger.info(
            "RelationshipGraph loaded: %d nodes, %d edges",
            self._graph.number_of_nodes(),
            self._graph.number_of_edges() // 2,
        )

    def all_relationships(self) -> list[Relationship]:
        return self._relationships
