import os
import sys
import http.server
import socketserver
import webbrowser

PORT = 8000

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

def run_server():
    os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    
    with socketserver.TCPServer(('', PORT), CustomHandler) as httpd:
        url = f'http://localhost:{PORT}/dist/index.html'
        print('====================================================')
        print(f'  Development Server Running at: http://localhost:{PORT}')
        print(f'  - SFDC/OEMS Manager: http://localhost:{PORT}/dist/index.html')
        print(f'  - Team Scheduler:    http://localhost:{PORT}/dist/team_schedule.html')
        print('  Press Ctrl+C to stop the server.')
        print('====================================================')
        
        try:
            webbrowser.open(url)
        except Exception:
            pass
            
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\nServer stopped.')

if __name__ == '__main__':
    run_server()
