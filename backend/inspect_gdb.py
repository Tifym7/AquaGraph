"""Inspect key EU-Hydro GDB layers - schema and a few sample records."""
import pyogrio

GDB_PATH = "/home/dlese/work/hackaton/dataset/EUHydro/EU-Hydro.gdb"

LAYERS_TO_INSPECT = ["River_Net_l", "Nodes", "RiverBasins"]

for layer_name in LAYERS_TO_INSPECT:
    print(f"\n{'='*60}")
    print(f"LAYER: {layer_name}")
    print(f"{'='*60}")

    # Read just the metadata / first few rows
    info = pyogrio.read_info(GDB_PATH, layer=layer_name)
    print(f"Feature count: {info['features']}")
    print(f"CRS: {info['crs']}")
    print(f"Geometry type: {info['geometry_type']}")
    print(f"Fields: {info['fields']}")
    print(f"Dtypes: {info['dtypes']}")

    # Read first 3 records (no geometry to keep it fast)
    df = pyogrio.read_dataframe(GDB_PATH, layer=layer_name, read_geometry=False, max_features=5)
    print(f"\nSample records:")
    print(df.to_string())
