"""Download unchanged JASSO PDFs for personal local study and build audited page references."""
import concurrent.futures,hashlib,json,re,subprocess,urllib.parse,unicodedata
from html.parser import HTMLParser
from pathlib import Path
import pymupdf as fitz
ROOT=Path(__file__).resolve().parents[1];PUB=ROOT/'public';OUT=PUB/'assets/expanded';OUT.mkdir(exist_ok=True)
YEARS=['2019_1','2018_2','2018_1','2017_2','2017_1','2016_2','2016_1','2015_2']
class Links(HTMLParser):
 def __init__(self):super().__init__();self.links=[];self.href=None;self.label=''
 def handle_starttag(self,t,a):
  if t=='a':self.href=dict(a).get('href');self.label=''
 def handle_data(self,d):
  if self.href:self.label+=d
 def handle_endtag(self,t):
  if t=='a' and self.href:self.links.append((self.href,self.label.strip()));self.href=None

def get(url):return subprocess.check_output(['curl','-fsSL','--retry','2','--max-time','90',url])
def fetch(year):
 source=f'https://www.jasso.go.jp/ryugaku/eju/examinee/pastpaper_sample/pastpaper_{year}.html';parser=Links();parser.feed(get(source).decode())
 assets=[]
 for href,label in parser.links:
  if '.pdf' not in href:continue
  kind='science' if label.startswith('理科（日本語版）') else 'math' if label.startswith('数学（日本語版）') else 'answers' if label=='正解' else None
  if not kind:continue
  path=OUT/f'{year}-{kind}.pdf';url=urllib.parse.urljoin(source,href)
  if not path.exists():path.write_bytes(get(url))
  raw=path.read_bytes();assert raw.startswith(b'%PDF')
  doc=fitz.open(path);(OUT/f'{year}-{kind}-text.json').write_text(json.dumps([p.get_text() for p in doc],ensure_ascii=False,indent=2))
  assets.append(dict(id=f'{year}-{kind}',path='/assets/expanded/'+path.name,url=url,source=source,bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest(),pages=len(doc),license='© JASSO。未改动PDF，仅本机个人学习。'))
 return assets
if __name__=='__main__':
 with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:assets=sum(list(pool.map(fetch,YEARS)),[])
 (OUT/'manifest.json').write_text(json.dumps(assets,ensure_ascii=False,indent=2));print(json.dumps([dict(id=a['id'],pages=a['pages'],bytes=a['bytes']) for a in assets]))

# Exact page maps were checked against page OCR, full original images for ambiguous headers,
# and all six Course 2 start-page contact sheets. These differ between sittings.
CHEM_PAGES={
'2015_2':[26,26,27,27,28,29,30,30,31,31,32,33,33,34,34,35,35,36,36,37],
'2016_1':[26,26,27,27,27,28,28,29,29,30,31,32,33,33,34,34,35,35,36,37],
'2016_2':[26,26,26,27,27,28,29,30,31,32,32,33,33,34,34,35,36,36,37,38],
'2017_1':[26,26,27,27,28,28,29,29,30,31,32,33,33,34,35,35,36,37,38,39],
'2017_2':[26,27,27,28,28,29,29,30,30,31,31,32,33,34,34,35,35,36,36,37],
'2018_1':[26,27,27,28,28,29,29,30,31,32,33,33,34,35,36,37,38,39,40,40],
'2018_2':[26,27,27,28,28,29,30,31,32,33,34,35,36,37,38,39,40,40,41,42],
'2019_1':[26,27,27,28,28,29,29,30,30,31,32,32,33,34,35,36,36,37,38,39]}
CHEM_NAMES={
'2015_2':['电子总数','原子结构与周期律','同位素丰度','纯净物与混合物','炼铁计量','相图与三相点','胶体性质','溶解热','溶液酸碱性','电解产物与电量','气体制取与收集','离子沉淀与颜色','氧化还原判断','卤素置换','铝的电解冶炼','官能团与反应','有机产率计算','醇与酚的性质','高分子中的化学键','DNA与RNA组成'],
'2016_1':['电子总数','分子形状与极性','元素原子量计算','晶体中的粒子数','浓度换算','酸碱质子理论','气体状态方程','凝固点降低','键能与反应热','电解产物','沉淀计量图像','元素鉴别实验','酸性氧化物','钙及其化合物','金属离子分离','有机名称与结构','结构异构体计数','不饱和脂肪酸加氢','芳香有机反应链','高分子聚合方式'],
'2016_2':['原子与离子的粒子数','等电子粒子','元素周期律','混合物分离操作','物质的量与分子数','滴定曲线与指示剂','氧化数变化','反应能量图与催化剂','电解与电极反应','气体溶解度','气体制备与性质','卤素性质','碳族元素','铝与铁的性质','氧化物反应','烷烃与烯烃性质','羧酸及其盐','有机反应计量','高分子与单体','氨基酸性质'],
'2017_1':['共用与孤电子对','周期律与离子','氧化物组成','理想气体比较','燃烧方程式','溶解度与质量分数','气体反应与分压','电离平衡','滴定曲线','铅蓄电池','二氧化硫制取与收集','热分解计量','卤素性质','金属与离子性质','离子沉淀分离','取代物异构体','苯的性质','有机反应产物','烯烃加成与不对称碳','高分子与官能团'],
'2017_2':['电子排布与离子','化学键','极性分子','混合气体平均摩尔质量','烃燃烧与剩余气体','晶体结构','溶液pH比较','铅蓄电池的质量变化','生成热与反应热','气体化学平衡','金属的溶解与钝化','酸性氧化物与酸','氧化还原反应','纯度与反应计量','阴离子检验','燃烧分析求分子式','醇的结构异构体','有机物鉴别','缩聚与高分子','蛋白质性质'],
'2018_1':['原子组成','电子总数','原子与离子','晶体性质','气体反应体积','气体密度与摩尔质量','中和热','串联电解池','反应速率与催化剂','弱酸电离平衡','碱金属性质','气体反应计量','氧化数','铁离子性质','金属离子分离','羟基有机物性质','甲苯性质','立体异构体','燃烧分析求分子式','糖类性质'],
'2018_2':['电子排布与同族元素','周期律','氧化物组成式','气体中的原子数','氧化数','酸碱质子理论','凝固点降低','可逆反应与反应热','电解计量','晶胞与密度','氧化剂与还原剂','气体除杂干燥与收集','晶体与同素异形体','金属活动性','离子分离流程','有机反应链','有机物鉴别','有机结构异构体','酯与高分子结构','淀粉与纤维素'],
'2019_1':['电子排布与离子','周期律与物质性质','化学键与电子对','反应计量与原子量','方程式配平','燃烧热计算','气体平衡','溶解度与结晶','酸碱判断','燃料电池','碱土金属性质','磷及其化合物','离子沉淀与过量试剂','无机试剂鉴别','金属性质','乙醇与乙酸','乙醇性质','有机物制备','芳香化合物性质','高分子元素组成']}
MATH_SPECS={
'2019_1':[('I-1','mixed','二次函数与图像','math-quadratic'),('I-2','mixed','非均匀骰子的概率','math-probability'),('II-1','mixed','球与四面体的空间向量','math-vector'),('II-2','trig','复数辐角与三角形','math-complex-angle'),('III','trig','三倍角与几何最值','trig-range'),('IV','integral','对数积分与数列极限','math-area-chain')],
'2018_2':[('I-1','mixed','二次函数区间最值','math-quadratic'),('I-2','mixed','骰子与函数条件的概率','math-probability'),('II-1','mixed','递推数列与无穷级数','math-sequence'),('II-2','mixed','圆的切线与参数','math-geometry'),('III','mixed','导数与含参数最值','math-derivative'),('IV','integral','对数函数切线与面积','math-area-chain')],
'2018_1':[('I-1','mixed','二次函数与不等式','math-quadratic'),('I-2','mixed','卡片染色的计数','math-probability'),('II-1','mixed','平行六面体与向量','math-vector'),('II-2','mixed','不等式与平面区域','math-region'),('III','trig','三角式换元与最值','trig-range'),('IV','integral','分部积分递推与极限','integral-parts')],
'2017_2':[('I-1','mixed','二次函数与条件最值','math-quadratic'),('I-2','mixed','随机移动的概率','math-probability'),('II-1','mixed','递推数列','math-sequence'),('II-2','mixed','直线与内切圆','math-geometry'),('III','mixed','对数不等式与导数','math-derivative'),('IV','integral','曲线围成的面积与换元','math-area-chain')],
'2017_1':[('I-1','mixed','二次函数平移','math-quadratic'),('I-2','mixed','不同颜色卡片的概率','math-probability'),('II-1','mixed','重心与向量','math-vector'),('II-2','trig','复数极形式与面积','math-complex-angle'),('III','mixed','指数对数函数导数与最值','math-derivative'),('IV','integral','三角函数切线与积分面积','math-area-chain')],
'2016_2':[('I-1','mixed','二次函数','math-quadratic'),('I-2','mixed','卡片抽取的概率','math-probability'),('II','mixed','数列对数变换与极限','math-sequence'),('III','trig','复数辐角与轨迹','math-complex-angle'),('IV-1','mixed','对数换元与最值','math-derivative'),('IV-2','integral','旋转体体积与变化率','integral-volume')],
'2016_1':[('I-1','mixed','二次函数顶点与参数','math-quadratic'),('I-2','mixed','格点三角形计数','math-probability'),('II-1','mixed','向量内积与数列','math-vector'),('II-2','mixed','复数平面中的圆与直线','math-complex-geometry'),('III','mixed','代数条件与取值范围','math-range'),('IV','integral','三角曲线面积与最值','math-area-chain')],
'2015_2':[('I-1','mixed','二次函数区间最值','math-quadratic'),('I-2','mixed','骰子事件与集合','math-probability'),('II-1','mixed','空间向量内积与垂直','math-vector'),('II-2','trig','复数方程与极形式','math-complex-angle'),('III','mixed','三次函数的切线','math-derivative'),('IV','integral','参数方程的速度与路程','math-path-integral')]}

def read_page(year,kind,page):
 p=OUT/f'{year}-{kind}-{page}-ocr.json'
 if p.exists():return unicodedata.normalize('NFKC','\n'.join(x['text'] for x in json.loads(p.read_text())))
 return unicodedata.normalize('NFKC',json.loads((OUT/f'{year}-{kind}-text.json').read_text())[page-1])
def image_path(year,kind,page):
 p=OUT/f'{year}-{kind}-{page}.jpg'
 if not p.exists():fitz.open(OUT/f'{year}-{kind}.pdf')[page-1].get_pixmap(matrix=fitz.Matrix(1.75,1.75)).save(p,jpg_quality=88)
 return '/assets/expanded/'+p.name

def physics_class(text,n):
 if n==19:return 'mixed','原子与量子现象','physics-atomic'
 if 10<=n<=12:
  if re.search('ドップラー|音源|観測者|うなり',text):return 'wave','声波、多普勒与拍','wave-doppler'
  if re.search('スリット|明線|暗線|干渉|スクリーン',text):return 'wave','波的干涉','wave-interference'
  if re.search('屈折|プリズム|ガラス|水面|全反射',text):return 'wave','折射与全反射','wave-optics'
  if re.search('気柱|開管|閉管',text):return 'wave','气柱共振','wave-pipe'
  if re.search('弦の|弦を',text):return 'wave','弦上的驻波','wave-string'
  if re.search('定在|定常',text):return 'wave','驻波与波节','wave-standing'
  return 'wave','波形、振动与传播方向','wave-direction'
 if n>=13:
  if re.search('磁場|磁束|磁力|コイル|ローレンツ',text):
   if re.search('粒子|電子|等速円運動',text):return 'magnetic','带电粒子在磁场中的运动','magnetic-orbit'
   if re.search('導体棒|レール',text):return 'magnetic','磁场中的导体棒','magnetic-rod'
   if re.search('磁束|誘導|時間|移動',text):return 'magnetic','磁通量变化与感应','magnetic-lenz'
   return 'magnetic','电流的磁场与磁力','magnetic-field'
  if re.search('コンデンサー|電気容量|極板',text):return 'electric','电容器的状态与连接','capacitor-condition'
  if re.search('抵抗|電池|回路',text):return 'electric','电路、电流与功率','resistor-combination'
  return 'electric','电荷、电场与电势','electric-superposition'
 if 7<=n<=9:
  if re.search('比熱|融解|熱容量|金属|温度計|ヒーター',text) and n==7:return 'mixed','热量守恒','heat-balance'
  if re.search('p.?V|内部エネルギー|仕事|定積|定圧',text):return 'mixed','气体过程与热力学','thermo-pv'
  return 'mixed','理想气体与分子运动','physics-ideal-gas'
 if re.search('衝突|はね返り',text):return 'mixed','碰撞与动量','collision'
 if re.search('力積|運動量',text):return 'mixed','冲量与动量','impulse'
 if re.search('人工衛星|万有引力|地球',text):return 'mixed','万有引力与卫星','physics-gravity'
 if re.search('単振動|ばね振り子',text):return 'mixed','弹簧与简谐运动','physics-oscillation'
 if re.search('円運動|円筒|張力',text):return 'mixed','圆周运动与受力','physics-circular'
 if re.search('等加速度|加速度|投げ|水平距離',text):return 'mixed','运动学与抛体','physics-motion'
 return 'mixed','受力、能量与平衡','physics-force-energy'

def chem_class(title,n):
 if re.search('分离|除杂|制取与收集|制备与性质|鉴别|检验',title):
  skill='purify-ion' if re.search('离子|元素|无机',title) else 'purify-gas' if '气体' in title or '二氧化硫' in title else 'purify-organic' if '有机' in title else 'purify-solid'
  return 'purify',skill
 if n>=16:
  skill='organic-isomer' if '异构' in title else 'organic-polymer' if re.search('高分子|DNA|糖类|蛋白质|淀粉|氨基酸',title) else 'organic-nomenclature' if '名称' in title else 'organic-stoichiometry' if re.search('计量|产率|分子式|加氢',title) else 'organic-reactions'
  return 'organic',skill
 if re.search('电子|原子|周期|粒子数|同位素',title):return 'mixed','chem-atomic'
 if re.search('化学键|形状|极性|晶体|晶胞',title):return 'mixed','chem-bond'
 if re.search('电解|电池',title):return 'mixed','chem-electrochemistry'
 if re.search('酸碱|pH|酸性|滴定',title):return 'mixed','chem-acid-base'
 if '平衡' in title:return 'mixed','chem-equilibrium'
 if re.search('氧化|还原|活动性',title):return 'mixed','chem-redox'
 if re.search('反应热|键能|热量|燃烧热|中和热|溶解热|能量图',title):return 'mixed','chem-thermochemistry'
 if re.search('溶解度|凝固|结晶',title):return 'mixed','chem-solution'
 if re.search('计量|组成式|配平|浓度|物质的量|摩尔|气体|纯度',title):return 'mixed','stoichiometry'
 return 'mixed','chem-inorganic-properties'

def build():
 sources={a['id']:a for a in json.loads((OUT/'manifest.json').read_text())};bank=[];quality=[];quarantine=[]
 for year in YEARS:
  def common(kind,pages,sub,label,topic,title,skill,minutes):
   answerpage=(2 if sub=='math' else 1) if year in ['2019_1','2018_2'] else (4 if sub=='math' else 2)
   src=sources[year+'-'+kind];ans=sources[year+'-answers'];scope=('右侧 Course 2 的 '+label) if sub=='math' else ('物理列，解答栏 '+label) if sub=='physics' else ('化学列，问 '+label)
   return dict(id=f'o-{year}-'+({'physics':'p','chemistry':'c','math':'m'}[sub])+label,official=True,subject=sub,topic=topic,topics=[topic],skill=skill,title=f'{year[:4]}-{year[-1]} '+{'physics':'物理','chemistry':'化学','math':'数学 Course 2'}[sub]+f' · {label} · {title}',prompt=(f'只完成 {label} 题组，按原题空格顺序记录答案。' if sub=='math' else f'只完成本页的'+('物理解答栏 ' if sub=='physics' else '化学问 ')+label+'，写下原题选项编号与关键依据。'),images=[image_path(year,kind,p) for p in pages],selfGrade=True,minutes=minutes,source=f'JASSO {year[:4]}年第{year[-1]}回 · PDF第'+','.join(map(str,pages))+'页',sourceUrl=src['source'],pdf=src['path'],page=pages[0],pages=pages,answerImages=[image_path(year,'answers',answerpage)],answerSource=f'JASSO 官方正解表 PDF第{answerpage}页，{scope}',answerPdf=ans['path'],answerPage=answerpage,answerScope=scope,explanation=f'请核对下方官方正解表：{scope}。先提交自己的作答，再展开答案。错题写出是哪条条件或哪一步运算导致偏差；这里不提供未经核实的整题详解。',sourceVerification='原PDF与官方答案页关联；题号和跨页位置已核对；不以OCR替代题干',examStyle=True,answerFormat='official-self-check')
  physraw=json.loads((OUT/f'{year}-science-text.json').read_text())
  for n,page in enumerate(range(4,23),1):
   t=read_page(year,'science',page)
   if (not re.search('問|間',t) or len(t)<120) and (year,page) not in [('2018_1',6),('2018_1',8),('2018_1',20),('2017_2',7)]:quarantine.append(dict(year=year,subject='physics',number=n,page=page,reason='题号或正文未能可靠核对'));continue
   topic,title,skill=physics_class(t,n)
   manual={('2018_1',3):('mixed','连续弹性碰撞','collision'),('2018_1',5):('mixed','摆的碰撞与能量','collision'),('2018_1',17):('magnetic','平行电流之间的磁力','magnetic-field'),('2017_2',4):('mixed','分裂过程的动量与能量','impulse'),('2018_2',16):('magnetic','平行电流间的磁力叠加','magnetic-field'),('2017_2',11):('wave','反射声波与多普勒效应','wave-doppler'),('2017_2',18):('magnetic','平行电流间的作用力','magnetic-field'),('2017_1',17):('magnetic','通电线圈的力矩','magnetic-torque'),('2017_1',18):('magnetic','磁铁通过线圈的感应方向','magnetic-lenz'),('2016_2',18):('magnetic','平行电流的作用力图像','magnetic-field'),('2016_1',18):('magnetic','离子加速与磁场偏转','magnetic-orbit'),('2015_2',7):('mixed','比热与热量计算','heat-balance'),('2015_2',11):('wave','双声源干涉','wave-interference'),('2015_2',17):('magnetic','通电折线导体的磁力','magnetic-force')}
   topic,title,skill=manual.get((year,n),(topic,title,skill))
   if n<=6:
    mechanics={
     '2019_1':['torque','motion','friction','collision','oscillation','gravity'],
     '2018_2':['torque','motion','friction','impulse','circular','oscillation'],
     '2018_1':['force','force','collision','impulse','collision','oscillation'],
     '2017_2':['force','energy','collision','impulse','oscillation','gravity'],
     '2017_1':['force','friction','collision','circular','energy','gravity'],
     '2016_2':['force','motion','motion','impulse','collision','circular'],
     '2016_1':['force','friction','energy','impulse','oscillation','circular'],
     '2015_2':['torque','motion','motion','oscillation','collision','circular']}
    code=mechanics[year][n-1]
    title={'torque':'力矩与平衡','motion':'运动学与抛体','friction':'摩擦与运动条件','collision':'碰撞与动量能量','oscillation':'弹簧与简谐运动','gravity':'万有引力与卫星','impulse':'冲量与动量','circular':'圆周运动与力','force':'受力与运动方程','energy':'功与机械能'}[code]
    skill=code if code in ['collision','impulse'] else 'physics-'+code
   bank.append(common('science',[page],'physics',str(n),topic,title,skill,2.5))
   quality.append(dict(id=bank[-1]['id'],pages=[page],verification='逐页题号标记、连续解答栏与科目边界',evidence=t[:250]))
  for n,page in enumerate(CHEM_PAGES[year],1):
   title=CHEM_NAMES[year][n-1];topic,skill=chem_class(title,n);t=read_page(year,'science',page)
   assert len(t)>100,(year,page)
   bank.append(common('science',[page],'chemistry',str(n),topic,title,skill,2))
   quality.append(dict(id=bank[-1]['id'],pages=[page],verification='逐页题号OCR+缺漏题号原图核验+20题单调顺序',evidence=t[:200]))
  for k,(label,topic,title,skill) in enumerate(MATH_SPECS[year]):
   page=18+k*2;pages=[page];tail=read_page(year,'math',page+1)
   if not ('memo' in tail[:200] or '計算欄' in tail[:200]):pages.append(page+1)
   bank.append(common('math',pages,'math',label,topic,title,skill,12 if len(pages)>1 else 10))
   if topic=='integral' and ('三角' in title or year in ['2015_2','2017_2']):bank[-1]['topics'].append('trig')
   quality.append(dict(id=bank[-1]['id'],pages=pages,verification='8套Course2起始页原图核验；续页逐页OCR检查；2016-2采用I-1/I-2/II/III/IV-1/IV-2真实编号',evidence=read_page(year,'math',page)[:180]))
 for q in bank:
  # Chapter routing is verified, but a whole official item often spans several operations.
  # A shared coarse label must not silently certify an unreviewed transfer pair.
  q.update(transferSkill='requires-pair-review',transferSkillVerified=False,transferEvidence='已核对题号、原页和题型；具体跨题迁移关系尚未逐对核验')
  assert all((PUB/x.lstrip('/')).exists() for x in q['images']+q['answerImages'])
 assert len({q['id'] for q in bank})==len(bank)
 (PUB/'official-expanded.json').write_text(json.dumps(bank,ensure_ascii=False,indent=2))
 (OUT/'quality-review.json').write_text(json.dumps(dict(sessions=YEARS,items=len(bank),counts={s:len([q for q in bank if q['subject']==s])for s in ['physics','chemistry','math']},status='原页关联与分类已核对；全部采用官方答案表自评，未伪造机器解析答案',limitations=['旧题不等于2026考纲全部覆盖','OCR仅用于核对和分类，题目与答案始终展示原页','未提供逐题人工完整详解','章节与题型分类不作为未经核验的同细考点迁移证明'],sources=list(sources.values()),itemsReviewed=quality,quarantined=quarantine),ensure_ascii=False,indent=2))
 print('Added official questions:',len(bank),'quarantined:',len(quarantine))
 print('Counts:',{s:len([q for q in bank if q['subject']==s])for s in ['physics','chemistry','math']})
if __name__=='__main__':build()
