import argparse
import json
from . import server
from .chunk_boundary_test import run

def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd")
    ps = sub.add_parser("serve")
    ps.add_argument("--host", default="0.0.0.0")
    ps.add_argument("--port", type=int, default=5200)
    pr = sub.add_parser("run")
    pr.add_argument("--config", default="local-test/config.json")
    a = p.parse_args()
    if a.cmd == "serve":
        server.app.run(host=a.host, port=a.port)
    elif a.cmd == "run":
        res = run(a.config)
        print(json.dumps(res, ensure_ascii=False))
    else:
        p.print_help()

if __name__ == "__main__":
    main()
