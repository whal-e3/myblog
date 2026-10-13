"""Offline unit/integration tests. Synthetic provider fixtures; no live API key or network to TOPIS."""
from __future__ import annotations
import importlib.util
import json
import sys
import tempfile
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from server.feed import FeedClient, FeedError, DailyBudget, parse_payload, observation_time, normalize_rows, KST, iso
spec=importlib.util.spec_from_file_location('local_server',ROOT/'server.py');webserver=importlib.util.module_from_spec(spec);spec.loader.exec_module(webserver)

def row(**changes):
 r={'subwayId':'1002','trainNo':'fixture-2001','statnId':'1002000213','statnNm':'강남','recptnDt':'2026-10-13 14:00:00','updnLine':'0','trainSttus':'1','statnTnm':'성수','directAt':'0','lstcarAt':'0'};r.update(changes);return r

def payload(rows=None,total=None):
 rows=[row()] if rows is None else rows
 return json.dumps({'errorMessage':{'code':'INFO-000','total':len(rows) if total is None else total},'realtimePositionList':rows},ensure_ascii=False).encode()

class AdapterTests(unittest.TestCase):
 def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.clients=[]
 def tearDown(self):
  for c in self.clients:c.pool.shutdown(wait=True)
  self.tmp.cleanup()
 def client(self,transport=lambda u:payload(),**env):
  c=FeedClient(self.root,{'SEOUL_SUBWAY_API_KEY':'NOT-A-REAL-KEY-FIXTURE','SEOUL_LIVE_LINES':'2','SEOUL_DAILY_LIMIT':'100',**env},transport);self.clients.append(c);return c
 def test_success_and_zero_direction(self):
  rows,total=parse_payload(payload([row(updnLine=0,trainSttus=0)]));self.assertEqual(total,1)
  trains,skipped=normalize_rows(rows,'2',datetime.now(timezone.utc));self.assertEqual(skipped,0);self.assertEqual(trains[0]['direction'],'0');self.assertEqual(trains[0]['status'],'0');self.assertEqual(trains[0]['observedAt'],'2026-10-13T05:00:00Z')
 def test_time_only_kst_midnight(self):
  now=datetime(2026,10,14,0,0,20,tzinfo=KST)
  self.assertEqual(iso(observation_time(row(recptnDt='23:59:50'),now)),'2026-10-13T14:59:50Z')
  self.assertEqual(iso(observation_time(row(recptnDt='00:00:10',lastRecptnDt='20261014'),now)),'2026-10-13T15:00:10Z')
 def test_unknown_date_never_now(self):
  self.assertIsNone(observation_time(row(recptnDt='broken'),datetime.now(KST)))
  self.assertIsNone(observation_time(row(recptnDt=None),datetime.now(KST)))
 def test_wrong_line_and_deduplicate(self):
  rows=[row(),row(recptnDt='2026-10-13 13:59:00'),row(subwayId='1001')]
  ts,n=normalize_rows(rows,'2',datetime.now(KST));self.assertEqual(len(ts),1);self.assertEqual(n,1);self.assertTrue(ts[0]['observedAt'].endswith('05:00:00Z'))
 def test_provider_errors_redacted(self):
  for body in [b'{"errorMessage":{"code":"INFO-100","message":"secret-key-url"}}',b'<RESULT><CODE>INFO-100</CODE><MESSAGE>secret-key-url</MESSAGE></RESULT>']:
   with self.assertRaises(FeedError) as ctx:parse_payload(body)
   self.assertEqual(ctx.exception.code,'INFO-100');self.assertNotIn('secret-key-url',str(ctx.exception))
 def test_empty_and_invalid(self):
  self.assertEqual(parse_payload(b'{"code":"INFO-200"}'),([],0))
  for raw in [b'[]',b'<html>invalid</html>',b'{}',b'{"errorMessage":{"code":"INFO-000"},"realtimePositionList":[]}']:
   with self.assertRaises(FeedError):parse_payload(raw)
 def test_missing_key_no_upstream(self):
  def trap(url):raise AssertionError('Must not fetch without a key')
  for key in ['', 'sample','PASTE_YOUR_KEY_HERE']:
   c=self.client(trap,SEOUL_SUBWAY_API_KEY=key);self.assertFalse(c.positions(['2'])['configured']);self.assertEqual(c.budget.snapshot()['used'],0)
 def test_shared_cache_and_key_private(self):
  calls=[]
  def transport(url):calls.append(url);time.sleep(.02);return payload()
  c=self.client(transport)
  with ThreadPoolExecutor(max_workers=8) as p:results=list(p.map(lambda _:c.positions(['2']),range(8)))
  self.assertEqual(len(calls),1);self.assertNotIn(c.key,json.dumps(results));self.assertEqual(c.budget.snapshot()['used'],1)
  self.assertIn('/json/realtimePosition/0/1000/',calls[0])
 def test_defaults_match_line_two_budget(self):
  c=FeedClient(self.root,{'SEOUL_SUBWAY_API_KEY':'fixture'},lambda _:payload());self.clients.append(c)
  self.assertEqual(c.enabled,['2']);self.assertEqual(c.poll_seconds,120)
  self.assertEqual(c.budget.limit,900);self.assertEqual(c.scheme,'http')
 def test_all_reported_pages_are_fetched(self):
  records=[row(trainNo=f'fixture-{n:04d}') for n in range(3501)]
  calls=[]
  def paged(url):
   start=int(url.split('/realtimePosition/')[1].split('/')[0])
   calls.append(start)
   return payload(records[start:start+1000],total=len(records))
  c=self.client(paged)
  result=c.line('2')
  self.assertEqual(result['state'],'ok')
  self.assertEqual(result['rawCount'],3501)
  self.assertEqual(len(result['trains']),3501)
  self.assertEqual(calls,[0,1000,2000,3000])
  self.assertEqual(c.budget.snapshot()['used'],4)
  self.assertFalse(result['truncated'])
 def test_inclusive_end_pages_do_not_skip_last_record(self):
  records=[row(trainNo=f'fixture-{n:04d}') for n in range(2002)]
  calls=[]
  def inclusive(url):
   part=url.split('/realtimePosition/')[1].split('/')
   start,end=int(part[0]),int(part[1])
   calls.append((start,end))
   return payload(records[start:end+1],total=len(records))
  c=self.client(inclusive)
  result=c.line('2')
  self.assertEqual(result['state'],'ok')
  self.assertEqual(result['rawCount'],2002)
  self.assertEqual(len(result['trains']),2002)
  self.assertEqual(calls,[(0,1000),(1001,2001)])
 def test_short_and_repeated_pages_are_incomplete(self):
  scenarios=[lambda _:payload([row()],total=1500),
             lambda _:payload([row(trainNo=f'fixture-{n:04d}') for n in range(1000)],total=2500)]
  for transport in scenarios:
   with self.subTest(transport=transport):
    c=self.client(transport)
    result=c.line('2')
    self.assertEqual(result['state'],'error')
    self.assertEqual(result['code'],'INCOMPLETE_SNAPSHOT')
    self.assertEqual(result['trains'],[])
 def test_quota_mid_pagination_does_not_publish_partial_snapshot(self):
  calls=[]
  def page(url):
   calls.append(url)
   return payload([row(trainNo=f'fixture-{n:04d}') for n in range(1000)],total=1500)
  c=self.client(page,SEOUL_DAILY_LIMIT='1')
  result=c.line('2')
  self.assertEqual(result['state'],'error')
  self.assertEqual(result['code'],'LOCAL_QUOTA_LIMIT')
  self.assertEqual(result['trains'],[])
  self.assertEqual(len(calls),1)
  self.assertEqual(c.budget.snapshot()['used'],1)
 def test_failed_later_page_keeps_last_complete_observations(self):
  c=self.client()
  first=c.line('2')
  c.cache['2']['nextAttempt']=0
  def fail_second_page(url):
   if '/1000/2000/' in url:raise TimeoutError()
   return payload([row(trainNo=f'fixture-{n:04d}') for n in range(1000)],total=1500)
  c.transport=fail_second_page
  failed=c.line('2')
  self.assertEqual(failed['state'],'error')
  self.assertEqual(failed['code'],'NETWORK_ERROR')
  self.assertEqual(failed['trains'],first['trains'])
  self.assertEqual(failed['fetchedAt'],first['fetchedAt'])
 def test_failure_retains_observation_not_new_timestamp(self):
  c=self.client();first=c.line('2');c.cache['2']['nextAttempt']=0
  def bad(url):raise TimeoutError()
  c.transport=bad;second=c.line('2');self.assertEqual(second['state'],'error');self.assertEqual(second['trains'],first['trains']);self.assertEqual(second['fetchedAt'],first['fetchedAt'])
 def test_auth_error_latched(self):
  calls=[]
  def bad(url):calls.append(url);return b'{"code":"INFO-100"}'
  c=self.client(bad);c.line('2');c.cache['2']['nextAttempt']=0;c.line('2');self.assertEqual(len(calls),1)
 def test_budget_persisted_and_enforced(self):
  c=self.client(SEOUL_DAILY_LIMIT='1');c.line('2');c.cache['2']['nextAttempt']=0
  self.assertEqual(c.line('2')['code'],'LOCAL_QUOTA_LIMIT')
  self.assertEqual(DailyBudget(self.root/'.runtime/api-usage.json',1).snapshot()['used'],1)
 def test_budget_resets_on_new_kst_day(self):
  ledger=self.root/'.runtime/api-usage.json';ledger.parent.mkdir(parents=True)
  yesterday=(datetime.now(KST)-timedelta(days=1)).strftime('%Y-%m-%d')
  ledger.write_text(json.dumps({'day':yesterday,'used':900}),encoding='utf-8')
  budget=DailyBudget(ledger,900)
  self.assertEqual(budget.snapshot()['dateKST'],datetime.now(KST).strftime('%Y-%m-%d'))
  self.assertEqual(budget.snapshot()['remaining'],900)
  budget.reserve()
  self.assertEqual(DailyBudget(ledger,900).snapshot()['used'],1)
 def test_invalid_scheme_rejected(self):
  with self.assertRaises(ValueError):self.client(SEOUL_API_SCHEME='file')
 def test_disabled_line_no_upstream(self):
  c=self.client(lambda _:(_ for _ in ()).throw(AssertionError('No upstream')))
  self.assertEqual(c.line('1')['state'],'disabled')

class LocalHTTPTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.tmp=tempfile.TemporaryDirectory();cls.feed=FeedClient(Path(cls.tmp.name),env={})
  cls.server=webserver.create_server(ROOT,cls.feed,0);cls.url=f'http://127.0.0.1:{cls.server.server_port}'
  cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
 @classmethod
 def tearDownClass(cls):cls.server.shutdown();cls.server.server_close();cls.thread.join();cls.feed.pool.shutdown();cls.tmp.cleanup()
 def test_local_status(self):
  with urlopen(self.url+'/api/live/status') as r:
   self.assertFalse(json.load(r)['configured']);self.assertEqual(r.headers['Cache-Control'],'no-store');self.assertIn("connect-src 'self'",r.headers['Content-Security-Policy'])
 def test_static_assets(self):
  for route in ['/','/src/live.js','/src/trains.js','/src/app.js','/src/styles.css','/data/network.js']:
   with urlopen(self.url+route) as r:self.assertEqual(r.status,200)
 def test_secret_files_not_served(self):
  for route in ['/.env','/.env.example','/.runtime/api-usage.json','/server.py','/server/feed.py','/%2e%2e/.env']:
   with self.assertRaises(HTTPError) as ctx:urlopen(self.url+route)
   self.assertEqual(ctx.exception.code,404)
 def test_cross_site_and_rebinding_blocked(self):
  for headers in [{'Host':'evil.invalid'},{'Origin':'https://evil.invalid'},{'Sec-Fetch-Site':'cross-site'}]:
   with self.assertRaises(HTTPError) as ctx:urlopen(Request(self.url+'/api/live/positions',headers=headers))
   self.assertEqual(ctx.exception.code,403)
 def test_unknown_route(self):
  with self.assertRaises(HTTPError) as ctx:urlopen(self.url+'/api/live/positions?lines=bad')
  self.assertEqual(ctx.exception.code,400)
if __name__=='__main__':unittest.main(verbosity=2)
