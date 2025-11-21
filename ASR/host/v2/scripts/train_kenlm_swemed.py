import argparse
import os
import subprocess

def run(cmd):
    p = subprocess.Popen(cmd, shell=True)
    p.communicate()
    if p.returncode != 0:
        raise RuntimeError("Command failed")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--corpus', required=True)
    parser.add_argument('--order', type=int, default=5)
    parser.add_argument('--arpa_out', required=True)
    parser.add_argument('--binary_out', required=True)
    args = parser.parse_args()

    run(f"lmplz -o {args.order} < {args.corpus} > {args.arpa_out}")
    run(f"build_binary {args.arpa_out} {args.binary_out}")

if __name__ == '__main__':
    main()