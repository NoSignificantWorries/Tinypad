import http.server
import socketserver
import threading
import webbrowser
import time
import socket

PORT = 9054

Handler = http.server.SimpleHTTPRequestHandler

def run_server():
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Serving at port {PORT}")
        httpd.serve_forever()

def wait_for_server(port, timeout=5):
    start_time = time.time()
    while time.time() - start_time < timeout:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            result = sock.connect_ex(('localhost', port))
            if result == 0:
                return True
        time.sleep(0.1)
    return False

if __name__ == "__main__":
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()

    if wait_for_server(PORT):
        url = f"http://localhost:{PORT}"
        print(f"Opening browser at {url}")
        webbrowser.open(url)
    else:
        print("Server did not start in time.")

    server_thread.join()
