#!/usr/bin/env python3
"""Rebuild the display dataset from the bundled upstream snapshots.
Optional developer step: requires Shapely 2.x. Not needed to run the website.
Geographic rail/water source: OSM contributors, ODbL; see LICENSE-DATA.md.
"""
import json, math, collections, shutil
from pathlib import Path
from shapely.geometry import Polygon, MultiPolygon, box
from shapely.ops import triangulate, unary_union
ROOT=Path(__file__).resolve().parent.parent
raw=json.loads((ROOT/'data'/'upstream-network.json').read_text(encoding='utf-8'))
topo=json.loads((ROOT/'data'/'upstream-basemap.topo.json').read_text(encoding='utf-8'))
# Equirectangular local projection: consistent geographic placement, in km.
LAT0,LON0=37.53,126.98
SCALE_X=111.32*math.cos(math.radians(LAT0))
def project(lon,lat):return [round((lon-LON0)*SCALE_X,4),round((LAT0-lat)*111.32,4)]
styles={
'1':('Line 1','1','#3876D9','Metro'), '2':('Line 2','2','#35BD70','Metro'),
'3':('Line 3','3','#F78A44','Metro'), '4':('Line 4','4','#3AB7DF','Metro'),
'5':('Line 5','5','#A77BCE','Metro'), '6':('Line 6','6','#C48B65','Metro'),
'7':('Line 7','7','#A4B65D','Metro'), '8':('Line 8','8','#E95C93','Metro'),
'9':('Line 9','9','#C2B798','Metro'), 'GTX-A':('GTX-A','A','#C66DAF','Regional'),
'I2':('Incheon 2','I2','#F6AE69','Metropolitan'), 'Silim':('Sillim','SL','#83A6E8','Light rail'),
'U':('Uijeongbu','U','#FFAB5B','Light rail'), 'W':('Ui–Sinseol','UI','#C7D676','Light rail'),
'경강':('Gyeonggang','GG','#638BE1','Regional'), '경의·중앙':('Gyeongui–Jungang','GJ','#79CDB7','Regional'),
'경춘':('Gyeongchun','GC','#45B594','Regional'), '공항철도':('Airport Railroad','AR','#67B9DF','Regional'),
'김포 골드라인':('Gimpo Goldline','GP','#D5B15C','Light rail'), '서해':('Seohae','SH','#8AC564','Regional'),
'수인·분당':('Suin–Bundang','SB','#F0CA46','Regional'), '신분당':('Shinbundang','SD','#E66070','Regional'),
'용인':('Everline','EV','#75BF62','Light rail'), '인천1':('Incheon 1','I1','#8EAEDD','Metropolitan')}
order=['1','2','3','4','5','6','7','8','9','인천1','I2','공항철도','경의·중앙','경춘','수인·분당','신분당','경강','서해','김포 골드라인','용인','U','W','Silim','GTX-A']
# Search/display aliases. All source Korean names are preserved without alteration.
aliases={
'서울역':'Seoul Station','서울':'Seoul Station','시청':'City Hall','강남':'Gangnam','홍대입구':'Hongik Univ.','공덕':'Gongdeok','왕십리':'Wangsimni','신도림':'Sindorim','잠실':'Jamsil','사당':'Sadang','청량리':'Cheongnyangni','용산':'Yongsan','김포공항':'Gimpo Airport','인천공항1터미널':'Incheon Airport T1','인천공항2터미널':'Incheon Airport T2','디지털미디어시티':'Digital Media City','고속터미널':'Express Bus Terminal','종합운동장':'Sports Complex','국회의사당':'National Assembly','여의도':'Yeouido','여의나루':'Yeouinaru','이촌':'Ichon','동대문':'Dongdaemun','동대문역사문화공원':'Dongdaemun History & Culture Park','건대입구':'Konkuk Univ.','교대':'Seoul Nat’l Univ. of Education','서울대입구':'Seoul Nat’l Univ.','숙대입구':'Sookmyung Women’s Univ.','이대':'Ewha Womans Univ.','성신여대입구':'Sungshin Women’s Univ.','한성대입구':'Hansung Univ.','총신대입구 (이수)':'Chongshin Univ. (Isu)','총신대입구(이수)':'Chongshin Univ. (Isu)','이수':'Isu','총신대입구':'Chongshin Univ.','신촌':'Sinchon','을지로입구':'Euljiro 1-ga','을지로3가':'Euljiro 3-ga','을지로4가':'Euljiro 4-ga','종로3가':'Jongno 3-ga','종로5가':'Jongno 5-ga','광화문':'Gwanghwamun','경복궁':'Gyeongbokgung','안국':'Anguk','명동':'Myeong-dong','종각':'Jonggak','충무로':'Chungmuro','신사':'Sinsa','압구정':'Apgujeong','양재':'Yangjae','양재시민의숲':'Yangjae Citizen’s Forest','선릉':'Seolleung','선정릉':'Seonjeongneung','삼성':'Samseong','삼성중앙':'Samseong Jungang','봉은사':'Bongeunsa','역삼':'Yeoksam','수서':'Suseo','수원':'Suwon','판교':'Pangyo','정자':'Jeongja','미금':'Migeum','죽전':'Jukjeon','기흥':'Giheung','광교':'Gwanggyo','광교중앙':'Gwanggyo Jungang','동탄':'Dongtan','성남':'Seongnam','구성':'Guseong','대곡':'Daegok','연신내':'Yeonsinnae','운정중앙':'Unjeong Jungang','킨텍스':'KINTEX','부평':'Bupyeong','부평구청':'Bupyeong-gu Office','부천':'Bucheon','인천':'Incheon','인천시청':'Incheon City Hall','인천대입구':'Incheon Nat’l Univ.','서울숲':'Seoul Forest','청구':'Cheonggu','합정':'Hapjeong','망원':'Mangwon','당산':'Dangsan','노량진':'Noryangjin','영등포':'Yeongdeungpo','영등포구청':'Yeongdeungpo-gu Office','강남구청':'Gangnam-gu Office','가산디지털단지':'Gasan Digital Complex','구로디지털단지':'Guro Digital Complex','구로':'Guro','금정':'Geumjeong','오이도':'Oido','소사':'Sosa','초지':'Choji','원인재':'Woninjae','태릉입구':'Taereung','석계':'Seokgye','노원':'Nowon','창동':'Chang-dong','도봉산':'Dobongsan','동묘앞':'Dongmyo','신설동':'Sinseol-dong','신당':'Sindang','상봉':'Sangbong','망우':'Mangu','회기':'Hoegi','삼각지':'Samgakji','옥수':'Oksu','충정로':'Chungjeongno','불광':'Bulgwang','대림':'Daerim','까치산':'Kkachisan','마곡나루':'Magongnaru','보문':'Bomun','신내':'Sinnae','복정':'Bokjeong','가락시장':'Garak Market','오금':'Ogeum','올림픽공원':'Olympic Park','천호':'Cheonho','석촌':'Seokchon','강동구청':'Gangdong-gu Office','성수':'Seongsu','뚝섬':'Ttukseom','한양대':'Hanyang Univ.','서울지방병무청':'Seoul Regional Military Manpower Office','샛강':'Saetgang','대방':'Daebang','보라매':'Boramae','보라매공원':'Boramae Park','보라매병원':'Boramae Medical Center','당곡':'Danggok','신림':'Sillim','서원':'Seowon','서울대벤처타운':'Seoul Nat’l Univ. Venture Town','관악산':'Gwanaksan','북한산우이':'Bukhansan Ui','북한산보국문':'Bukhansan Bogungmun','4.19민주묘지':'April 19th National Cemetery','4·19민주묘지':'April 19th National Cemetery','덕성여대':'Duksung Women’s Univ.','솔밭공원':'Solbat Park','수유':'Suyu','미아':'Mia','미아사거리':'Miasageori','혜화':'Hyehwa','한남':'Hannam','서빙고':'Seobinggo','서강대':'Sogang Univ.','춘천':'Chuncheon','남춘천':'Namchuncheon','가평':'Gapyeong','청평':'Cheongpyeong','천안':'Cheonan','아산':'Asan','신창':'Sinchang','온양온천':'Onyang Oncheon','문산':'Munsan','임진강':'Imjingang','지평':'Jipyeong','용문':'Yongmun','여주':'Yeoju','이천':'Icheon','일산':'Ilsan','금촌':'Geumchon','운정':'Unjeong','양촌':'Yangchon','전대·에버랜드':'Jeondae–Everland','전대.에버랜드':'Jeondae–Everland','발곡':'Balgok','탑석':'Tapseok','계양':'Gyeyang','검암':'Geomam','검단오류':'Geomdan Oryu','송도달빛축제공원':'Songdo Moonlight Festival Park','검단호수공원':'Geomdan Lake Park','한강진':'Hangangjin','이태원':'Itaewon','녹사평':'Noksapyeong','효창공원앞':'Hyochang Park','녹번':'Nokbeon','매봉':'Maebong','도곡':'Dogok','대치':'Daechi','대청':'Daecheong','학여울':'Hangnyeoul','학동':'Hak-dong','논현':'Nonhyeon','신논현':'Sinnonhyeon','내방':'Naebang','뚝섬유원지':'Ttukseom Resort','자양':'Jayang','남한산성입구':'Namhansanseong','모란':'Moran','암사':'Amsa','별내':'Byeollae','별내별가람':'Byeollae Byeolgaram','진접':'Jinjeop','당고개':'Danggogae','불암산':'Buramsan','불암산역':'Buramsan','연천':'Yeoncheon','소요산':'Soyosan','동두천':'Dongducheon','의정부':'Uijeongbu','원시':'Wonsi','신천':'Sincheon','신현':'Sinhyeon','시흥시청':'Siheung City Hall','양천구청':'Yangcheon-gu Office','신정네거리':'Sinjeong Negeori','잠실새내':'Jamsil Saenae','서울대공원':'Seoul Grand Park','대공원':'Seoul Grand Park','경마공원':'Seoul Racecourse Park','정부과천청사':'Government Complex Gwacheon','경찰병원':'National Police Hospital','종로삼가':'Jongno 3-ga'}
lead=['g','kk','n','d','tt','r','m','b','pp','s','ss','','j','jj','ch','k','t','p','h']
vowels=['a','ae','ya','yae','eo','e','yeo','ye','o','wa','wae','oe','yo','u','wo','we','wi','yu','eu','ui','i']
ends=['','k','k','k','n','n','n','t','l','k','m','l','l','l','p','l','m','p','p','t','t','ng','t','t','k','t','p','t']
def romanize(t):
 out=''
 for c in t:
  k=ord(c)-44032
  if 0<=k<11172: out+=lead[k//588]+vowels[(k%588)//28]+ends[k%28]
  else:out+=c
 return out[:1].upper()+out[1:]
lineIndex={k:i for i,k in enumerate(order)}
mem=collections.defaultdict(set)
for s in raw['segments']:
 mem[s['a']].add(lineIndex[s['l']]);mem[s['b']].add(lineIndex[s['l']])
stations=[]
for s in raw['stations']:
 ko=s['n']; en=aliases.get(ko,romanize(ko))
 x,z=project(s['lon'],s['lat'])
 stations.append({'id':s['i'],'ko':ko,'en':en,'transliterated':ko not in aliases,'lat':s['lat'],'lon':s['lon'],'x':x,'z':z,'lines':sorted(mem[s['i']])})
lookup={s['id']:s for s in stations}
segments=[]
for k,s in enumerate(raw['segments']):
 a,b=lookup[s['a']],lookup[s['b']]
 points=[project(lon,lat) for lat,lon in s.get('g',[[a['lat'],a['lon']],[b['lat'],b['lon']]])]
 def dist(pt,st):return (pt[0]-st['x'])**2+(pt[1]-st['z'])**2
 if dist(points[-1],a)<dist(points[0],a): points.reverse()
 points[0]=[a['x'],a['z']];points[-1]=[b['x'],b['z']]
 # A single repeated point cannot form a tube; preserve the segment record.
 points=[p for i,p in enumerate(points) if i==0 or p!=points[i-1]]
 segments.append({'id':k,'line':lineIndex[s['l']],'a':s['a'],'b':s['b'],'points':points,'approximate':not bool(s.get('g'))})
lines=[]
for i,k in enumerate(order):
 name,badge,color,group=styles[k]
 original=next(l for l in raw['lines'] if l['id']==k)
 lines.append({'id':k,'name':name,'ko':original['name'],'badge':badge,'color':original['color'],'originalColor':original['color'],'group':group,'stations':sum(i in s['lines'] for s in stations),'segments':sum(s['line']==i for s in segments)})
# Decode TopoJSON delta-encoded arcs, transform, and project.
scale=topo['transform']['scale']; tr=topo['transform']['translate']; arcs=[]
for arc in topo['arcs']:
 x=y=0; pts=[]
 for dx,dy in arc:
  x+=dx;y+=dy;pts.append(project(x*scale[0]+tr[0],y*scale[1]+tr[1]))
 arcs.append(pts)
def ring(ids):
 r=[]
 for i in ids:
  pts=arcs[i] if i>=0 else list(reversed(arcs[~i]))
  r.extend(pts if not r else pts[1:])
 return r
clip=box(-62,-75,77,96)
def polys(geom):
 groups=[geom['arcs']] if geom['type']=='Polygon' else geom['arcs']
 for group in groups:
  try:
   p=Polygon(ring(group[0]),[ring(h) for h in group[1:]]).buffer(0).intersection(clip).simplify(.045,preserve_topology=True)
   for pp in (p.geoms if p.geom_type=='MultiPolygon' else [p]):
    if pp.geom_type=='Polygon' and pp.area>.004:yield pp
  except Exception: pass
water=[];waterOutlines=[]
for g in topo['objects']['water']['geometries']:
 for p in polys(g):
  waterOutlines.append([[round(x,3),round(y,3)] for x,y in p.exterior.coords])
  for t in triangulate(p):
   if p.covers(t):water.extend([[round(x,3),round(y,3)] for x,y in list(t.exterior.coords)[:3]])
bounds=[];cityPolys=[]
for g in topo['objects']['sigungu']['geometries']:
 for p in polys(g):
  bounds.append([[round(x,3),round(y,3)] for x,y in p.exterior.coords])
  if g.get('properties',{}).get('code','').startswith('11'):cityPolys.append(p)
seoul=[]
if cityPolys:
 city=unary_union(cityPolys)
 for p in (city.geoms if city.geom_type=='MultiPolygon' else [city]):seoul.append([[round(x,3),round(y,3)] for x,y in p.exterior.coords])
out={'meta':{'title':'Seoul Subsurface','snapshot':raw['generated'],'built':'2026-10-13','projection':{'type':'local equirectangular','lat0':LAT0,'lon0':LON0,'units':'km'},'source':'OpenStreetMap contributors / Wikidata; compiled by wantaekchoi/seoul-subway','upstreamCommit':'498fbc62e01479905e22c0577d60e8b875e86ace','license':'ODbL for rail and water geometry; CC0 for Wikidata; SGIS boundaries: KOGL Type 1 (2018)','limitations':'Snapshot, not live service. Vertical separation is illustrative, not measured depth. Rail shapes are a simplified community-mapped network, not an engineering survey; missing source geometry uses straight station-to-station connectors. English labels outside curated aliases are automatic transliterations.'},'lines':lines,'stations':stations,'segments':segments,'surface':{'waterTriangles':water,'waterOutlines':waterOutlines,'boundaries':bounds,'seoul':seoul}}
text=json.dumps(out,ensure_ascii=False,separators=(',',':'))
(ROOT/'data'/'network.json').write_text(text,encoding='utf-8')
(ROOT/'data'/'network.js').write_text('/* Rail/water data: © OpenStreetMap contributors, ODbL. Source: https://github.com/wantaekchoi/seoul-subway\nBoundary data: SGIS (Statistics Korea), 2018; KOGL Type 1. */\nwindow.SEOUL_DATA = '+text+';\n',encoding='utf-8')
print('Prepared',len(stations),'stations',len(lines),'lines',len(segments),'segments',len(water)//3,'water triangles',len(bounds),'boundaries; JSON bytes',len(text.encode()))
