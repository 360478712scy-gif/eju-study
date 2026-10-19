import pymupdf as fitz, json,re
from pathlib import Path
R=Path(__file__).resolve().parents[1];P=R/'public';O=P/'assets/pages';O.mkdir(exist_ok=True)
docs={};bank=[]
def doc(name):
 if name not in docs:docs[name]=fitz.open(P/'assets/papers'/f'{name}.pdf')
 return docs[name]
def img(name,n):
 p=O/f'{name}-{n}.png'
 if not p.exists():doc(name)[n-1].get_pixmap(matrix=fitz.Matrix(1.7,1.7)).save(p)
 return '/assets/pages/'+p.name
sources=json.loads((P/'assets/manifest.json').read_text());sm={x['id']:x for x in sources}
def common(year,kind,page):
 return {'official':True,'source':f'JASSO {year[:4]}年第{year[-1]}回 · PDF第{page}页','sourceUrl':sm[year+'-'+kind]['source'],'pdf':sm[year+'-'+kind]['path'],'page':page}
phys={
'2021_1':[2,4,2,3,6,2,2,1,1,3,6,4,6,3,5,4,3,2,3],
'2020_2':[4,2,5,4,3,4,3,6,3,3,5,5,6,2,2,4,4,1,1]}
pnames21=['接触物体受力','变力冲量','斜面与滑轮','碰撞与动量','弹簧能量','水平圆周运动','冰水热量','等压变化做功','p-V图与吸热','波形与相位','弦的频率与张力','平行界面折射','点电荷场强叠加','电容连接后的能量','电路功率比','长直导线磁场','磁场中的导体棒','移动线圈感应电流','核反应守恒']
pnames20=['斜面摩擦','平抛运动','冲量图像','碰撞与摩擦功','摆与圆周运动','卫星运动','热量守恒','气体热平衡','p-V图热力学','空间图与时间图','弦振动与张力','折射与全反射','带电小球平衡','电势叠加','电容电路电势','电阻电路','带电粒子轨迹','变化磁场与感应','德布罗意波长']
focusTips={10:'先看横轴：空间图读波长，时间图读周期。再判断传播方向和目标点达到波峰所需的相位变化。',11:'固定弦基频 f=v/(2L)，弦波速 v=√(F/μ)。分别列出变化前后频率，再利用相等条件。',12:'平行界面连续应用 n₁sinθ₁=n₂sinθ₂；有时中间介质可以消去。不要把角度相对平面来量。',13:'先画受力或场强矢量图，再利用对称性；距离平方和方向都要保留。',14:'先辨认是否接电源。电荷总量、电势或能量并不总是同时守恒；电路中电阻可耗散能量。',15:'识别串并联和各节点电势；理想电源固定的是端电压，不能随意假设各支路电流相同。',16:'长直导线磁场 B∝I/r；叠加前用右手定则标出方向。电路题则先化简等效电阻。',17:'分别考虑磁力与运动/平衡条件。带电粒子用 r=mv/(|q|B)，导体棒用 F=BIl，再检查几何。',18:'法拉第定律决定大小，楞次定律决定方向。分清磁通量增加、减小，以及题目指定的观察方向。',19:'核反应守恒质量数和电荷数；物质波题用 λ=h/p 与 K=p²/(2m)。'}
for year,answers in phys.items():
 for n,ans in enumerate(answers,1):
  page=n+3;topic='wave' if 10<=n<=12 else ('electric' if 13<=n<=(15 if year=='2021_1' else 16) else 'magnetic' if 16<=n<=18 else 'mixed')
  text=doc(year+'-science')[page-1].get_text();match=re.search(r'次の\s*1\s*∼\s*(\d)',text);count=int(match[1]) if match else max(6,ans)
  title=(pnames21 if year=='2021_1' else pnames20)[n-1]
  tip=focusTips.get(n,'先圈出研究对象、已知条件和所求量，独立画图列式。按原题选项排除量纲或极限不成立的表达式。')
  bank.append(dict(common(year,'science',page),id=f'o-{year}-p{n}',subject='physics',topic=topic,title=f'{year[:4]}-{year[-1]} 物理 · 解答栏{n} · {title}',prompt=f'只完成本页物理题（解答栏 {n}）。先独立演算，再选原题中的选项编号。',images=[img(year+'-science',page)],options=[f'原题选项 {i}' for i in range(1,count+1)],answer=ans-1,minutes=3,explanation=f'官方答案：选项 {ans}。\n解题切入提示（非官方详解）：{tip}',answerSource=f'{year}-answers / 第1页 / 物理解答栏{n}'))
chem={'2021_1':[3,5,4,6,3,1,2,2,3,3,1,5,5,1,5,4,2,4,4,2],'2020_2':[1,6,5,3,2,5,3,6,5,8,4,6,3,1,4,2,2,6,4,4]}
cpages={'2021_1':[26,26,27,27,28,29,30,31,32,33,33,34,34,35,35,36,37,38,39,39],'2020_2':[26,26,27,27,28,29,30,31,32,32,33,33,34,34,35,35,36,37,38,39]}
ctitles21=['物质的构成粒子','电子与键合','分子平面结构','物质的量计算','反应量与图像','气体与饱和蒸气','盐与水溶液酸碱','氧化还原滴定','电解计算','化学平衡','反应条件','无机反应判断','元素及化合物','二氧化硫性质','无机化合物性质','异构体与不对称碳','乙烯的反应','有机反应产物','不饱和烃加氢','高分子分类']
ctitles20=['电子配置','物质与化学键','碳酸盐分解','化学计量','晶格与密度','燃烧与反应热','平衡条件','酸碱与离子浓度','氧化剂判断','氧化还原与电化学','第2族元素','元素与化合物','气体的还原性','无机性质','银与铅离子的区分','多官能团与异构体','有机物制备','有机混合物分离','高分子的组成','蛋白质结构']
for year,answers in chem.items():
 for n,ans in enumerate(answers,1):
  page=cpages[year][n-1];topic='organic' if n>=16 else 'mixed'
  if year=='2020_2' and n in [15,18]:topic='purify'
  text=doc(year+'-science')[page-1].get_text();nums=[v for k,v in {'ձ':1,'ղ':2,'ճ':3,'մ':4,'յ':5,'ն':6,'շ':7,'ո':8}.items() if k in text];count=max([ans,4]+nums)
  tip={'organic':'先把日文名称对应到结构和官能团，再逐项验证反应产物、反应条件及元素组成。不要只凭名称熟悉感选择。','purify':'追踪每一步后物质在哪一层/哪一相。酸使胺成盐进入水层；碱使羧酸成盐进入水层，中性物质留在有机层。离子鉴别要逐项核对现象。','mixed':'先辨认题目要求选正确还是错误，圈出物质的量、浓度和反应条件，再逐项排除。'}[topic]
  bank.append(dict(common(year,'science',page),id=f'o-{year}-c{n}',subject='chemistry',topic=topic,title=f'{year[:4]}-{year[-1]} 化学 · 问{n} · {(ctitles21 if year=="2021_1" else ctitles20)[n-1]}',prompt=f'只做原页中的「问{n}」（解答栏 {n}），同页其他题另行安排。按原题选项编号作答。',images=[img(year+'-science',page)],options=[f'原题选项 {i}' for i in range(1,count+1)],answer=ans-1,minutes=2,explanation=f'官方答案：选项 {ans}。\n适应题型提示（非完整详解）：{tip}',answerSource=f'{year}-answers / 第1页 / 化学问{n}'))
for year in ['2021_1','2020_2']:
 spec=[('I-1',[18],'mixed','二次函数与条件转写'),('I-2',[20],'mixed','概率／计数的引导链'),('II-1',[22] if year=='2021_1' else [22,23],'mixed','空间向量' if year=='2021_1' else '数列与部分和'),('II-2',[24],'trig','复数极形式与角度'),('III',[26],'mixed','换元与最值' if year=='2021_1' else '切线与曲线'),('IV',[28] if year=='2021_1' else [28,29],'integral','三角函数与面积')]
 for label,pages,topic,title in spec:
  tip='先用30秒扫一遍空格，标记每一组空格需要的中间量。严格利用题目提供的变量和已有结论，最后核对符号、分母和字母栏位。'
  if label=='IV':tip+=' 三角平方先降幂；面积先确定交点与上下关系。2020题先把三倍角展开以判断正负，再积分。'
  bank.append(dict(common(year,'math',pages[0]),id=f'o-{year}-m{label}',subject='math',topic=topic,topics=[topic,'trig'] if label=='IV' else [topic],title=f'{year[:4]}-{year[-1]} 数学 Course 2 · {label} · {title}',prompt=f'完成 Course 2 的 {label} 题组。按原题 A、B…填空顺序记录答案；不要重新设计一套与引导无关的解法。',images=[img(year+'-math',p) for p in pages],selfGrade=True,minutes=12,explanation='训练提示：'+tip+'\n下面是官方答案表，请只核对右侧 Course 2 中本题对应行。',answerImages=[img(year+'-answers',2)]))
la=[1,3,1,2,2,4,4,1,2,2,4,4,2,4,3]
scriptpages={13:[1,2],14:[2],15:[2,3],16:[3],17:[3,4],18:[4],19:[5],20:[5,6],21:[6],22:[6,7],23:[7],24:[7,8],25:[8],26:[8,9],27:[9]}
lnames=['研究テーマの相談','看板の調査','寄付と社会','宇宙開発の意義','ニワトリの家畜化','消費者と広告','美術作品の解釈','実験レポート','図書館サービス','地域と山の利用','発表の準備','会社選び','論文の書き方','美しさの評価','工場の改善']
for n,ans in enumerate(la,13):
 bank.append(dict(common('2018_1','japanese',28),id=f'o-2018_1-l{n}',subject='japanese',topic='listening',title=f'2018-1 日语听解 · {n}番 · {lnames[n-13]}',prompt=f'听解第 {n} 题。题目与选项均在音频中，首听先不看原文。',options=[f'音频中的选项 {i}' for i in range(1,5)],answer=ans-1,audio=f'/assets/listening/official-{n}.wav',minutes=4,explanation=f'官方答案：选项 {ans}。复盘时只看脚本的第 {n} 题，圈出最终结论、转折与条件；再遮住文本复听。',transcriptImages=[img('2018_1-script-11',p) for p in scriptpages[n]],answerSource=f'2018_1-answers / 第1页 / 聴解{n}番'))
for number,pages,ans,title in [(2,[10],2,'告示与目的'),(5,[12],4,'指示词与顺序'),(10,[14],4,'文章主旨'),(11,[16,17],2,'段落理由'),(12,[16,17],4,'具体例的含义')]:
 bank.append(dict(common('2018_1','japanese',pages[0]),id=f'o-2018_1-r{number}',subject='japanese',topic='reading',title=f'2018-1 日语读解 · 解答栏{number} · {title}',prompt=f'只完成解答栏 {number} 对应的读解问题。依据原文选择，不用常识补充作者未说的结论。',images=[img('2018_1-japanese',p) for p in pages],options=[f'原题选项 {i}' for i in range(1,5)],answer=ans-1,minutes=4,explanation=f'官方答案：选项 {ans}。请在原文中标出支持这个选项的句子，再给其他选项分别找出范围扩大、因果颠倒或无依据之处。',answerSource=f'2018_1-answers / 第1页 / 読解解答栏{number}'))
(P/'official.json').write_text(json.dumps(bank,ensure_ascii=False,indent=2))
print('Official learning items:',len(bank));print('Rendered pages:',len(list(O.glob('*.png'))))
