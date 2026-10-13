"""Theme asset and strict localhost serving checks; no external API calls."""
from pathlib import Path
import importlib.util, json, sys, threading, unittest, urllib.request, urllib.error
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
spec=importlib.util.spec_from_file_location('theme_asset_server',ROOT/'server.py')
server=importlib.util.module_from_spec(spec);spec.loader.exec_module(server)
class OfflineFeed:
    enabled=[]
    def status(self): return {'configured':False}
    def positions(self, lines): raise AssertionError('No position request expected')
class ThemeAssets(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv=server.create_server(ROOT,OfflineFeed(),0)
        cls.thread=threading.Thread(target=cls.srv.serve_forever,daemon=True);cls.thread.start()
        cls.url=f'http://127.0.0.1:{cls.srv.server_port}'
    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown();cls.srv.server_close();cls.thread.join(2)
    def test_theme_script_is_served_without_loosening_script_csp(self):
        with urllib.request.urlopen(self.url+'/src/theme.js') as response:
            self.assertEqual(response.status,200)
            self.assertIn('text/javascript',response.headers['Content-Type'])
            script_csp=response.headers['Content-Security-Policy'].split('script-src ')[1].split(';')[0]
            self.assertEqual(script_csp,"'self'")
            self.assertIn(b'window.SeoulTheme',response.read())
    def test_theme_before_styles(self):
        with urllib.request.urlopen(self.url) as response:
            html=response.read().decode()
            self.assertLess(html.index('src/theme.js'),html.index('src/styles.css'))
    def test_dist_contains_theme_without_external_theme_request(self):
        html=(ROOT/'dist/seoul-subway-3d-live.html').read_text()
        self.assertNotIn('<script src="src/theme.js">',html)
        self.assertLess(html.index('seoul-subsurface-theme'),html.index('<style>'))
    def test_config_stays_private(self):
        with self.assertRaises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(self.url+'/.env')
        self.assertEqual(error.exception.code,404)
if __name__=='__main__': unittest.main()
