"""Deterministic cycle-breaking for the river connectivity graph.

`flows_into` is a *functional* relation - each river has at most one
downstream river - so the only way it can contain a cycle is bad source
data (EU-Hydro splits one physical channel into a "named" reach and adjacent
"Tributary (RL…)" reaches; segments cross back and forth, so the river-level
lift records X→Y *and* Y→X). In a functional graph every node belongs to at
most one such cycle.

`enforce_acyclic` finds those cycles and, for each, drops the single edge
leaving the basin **outlet** - the most-downstream river in the cycle, chosen
by (Strahler order, then length, then id for determinism). Water flows from
low-order tributaries toward the high-order main stem, so the outlet is the
one that must NOT flow back into its own upstream.

Used by both `extract_rivers.py` (so regenerated data is acyclic at the
source) and `fix_river_graph_cycles.py` (so the already-committed
`river_graph.json` is repaired in place).
"""

from collections import defaultdict


def enforce_acyclic(flows_into, priority):
    """Return a new {river_id: downstream_id} dict with all cycles removed.

    flows_into : mapping river_id -> downstream river_id (values may be None)
    priority   : callable(river_id) -> orderable key; the cycle member with
                 the MAX key is treated as the basin outlet and has its
                 outgoing edge removed.
    """
    nxt = {k: v for k, v in flows_into.items() if v is not None}
    state = {}  # 0/unset = unvisited, 1 = on current path, 2 = settled
    broken = []

    for start in list(nxt.keys()):
        if state.get(start, 0) != 0:
            continue
        path = []
        index = {}
        cur = start
        while cur is not None and state.get(cur, 0) == 0 and cur in nxt:
            state[cur] = 1
            index[cur] = len(path)
            path.append(cur)
            cur = nxt.get(cur)
        if cur is not None and state.get(cur, 0) == 1:
            cycle = path[index[cur]:]
            outlet = max(cycle, key=priority)
            nxt.pop(outlet, None)
            broken.append((outlet, cycle))
        for n in path:
            state[n] = 2

    return nxt, broken


def invert_to_tributaries(flows_into):
    """Exact inverse of an acyclic functional flows_into map.

    Rebuilding tributaries from the corrected flows_into (rather than keeping
    the independently-accumulated set) guarantees the two relations stay
    consistent and the tributary graph is itself a forest (no cycles).
    """
    tribs = defaultdict(set)
    for src, dst in flows_into.items():
        if dst is not None:
            tribs[dst].add(src)
    return tribs
