"""One-off (re-runnable) repair of the committed river_graph.json.

Breaks every cycle in the `flows_into` relation using the shared
`enforce_acyclic` rule, then rebuilds `tributaries` as the exact inverse so
the two relations are consistent. Writes a .bak the first time. Idempotent:
running it on an already-clean graph changes nothing.

    python fix_river_graph_cycles.py
"""

import json
import os

from river_graph_acyclic import enforce_acyclic, invert_to_tributaries

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
GRAPH_PATH = os.path.join(DATA_DIR, "river_graph.json")
RIVERS_PATH = os.path.join(DATA_DIR, "rivers_romania.json")


def _count_cycles(flows_into):
    nxt = {k: v for k, v in flows_into.items() if v is not None}
    state = {}
    cycles = 0
    for start in list(nxt):
        if state.get(start, 0) != 0:
            continue
        path, idx, cur = [], {}, start
        while cur is not None and state.get(cur, 0) == 0 and cur in nxt:
            state[cur] = 1
            idx[cur] = len(path)
            path.append(cur)
            cur = nxt.get(cur)
        if cur is not None and state.get(cur, 0) == 1:
            cycles += 1
        for n in path:
            state[n] = 2
    return cycles


def main():
    with open(GRAPH_PATH) as f:
        graph = json.load(f)
    rivers = json.load(open(RIVERS_PATH))

    name_of = {r["id"]: r["name"] for r in rivers}
    strahler_of = {r["id"]: r.get("strahler", 1) for r in rivers}
    length_of = {r["id"]: r.get("length_m", 0) for r in rivers}

    flows_into = {
        rid: (node.get("flows_into") or {}).get("id")
        for rid, node in graph.items()
    }

    before = _count_cycles(flows_into)

    # Higher key = more downstream = the river whose out-edge we drop.
    def priority(rid):
        return (strahler_of.get(rid, 1), length_of.get(rid, 0), rid)

    fixed, broken = enforce_acyclic(flows_into, priority)
    after = _count_cycles(fixed)
    tribs = invert_to_tributaries(fixed)

    new_graph = {}
    for rid in graph:
        dst = fixed.get(rid)
        new_graph[rid] = {
            "tributaries": sorted(
                ({"id": t, "name": name_of.get(t, "Unknown")}
                 for t in tribs.get(rid, set()) if t in name_of),
                key=lambda x: x["name"],
            ),
            "flows_into": {"id": dst, "name": name_of.get(dst, "Unknown")}
            if dst is not None and dst in name_of else None,
        }

    bak = GRAPH_PATH + ".bak"
    if not os.path.exists(bak):
        os.rename(GRAPH_PATH, bak)
        print(f"backed up original → {bak}")
    with open(GRAPH_PATH, "w") as f:
        json.dump(new_graph, f, indent=2)

    print(f"cycles: {before} → {after}")
    print(f"edges dropped (basin outlets): {len(broken)}")
    for outlet, cyc in sorted(broken)[:15]:
        chain = " → ".join(f"{c}({name_of.get(c, '?')[:18]})" for c in cyc)
        print(f"  broke out-edge of {outlet}({name_of.get(outlet, '?')[:18]})  in cycle: {chain}")
    if len(broken) > 15:
        print(f"  … and {len(broken) - 15} more")
    print(f"→ wrote {GRAPH_PATH}")


if __name__ == "__main__":
    main()
