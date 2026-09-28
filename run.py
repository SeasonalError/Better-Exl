import argparse, threading, webbrowser
from better_exl.app import create_app

if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Better Exl local physics workspace")
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--data-dir")
    p.add_argument("--no-browser", action="store_true")
    a = p.parse_args()
    url = f"http://127.0.0.1:{a.port}"
    print(
        f"\nBetter Exl: {url}\nKeep this terminal open. Experiments save automatically.\n"
    )
    if not a.no_browser:
        threading.Timer(1.5, lambda: webbrowser.open(url)).start()
    create_app(a.data_dir).run(
        host="127.0.0.1", port=a.port, debug=False, threaded=True
    )
