import pymupdf as fitz
from PIL import Image,ImageDraw
from pathlib import Path
root=Path(__file__).resolve().parents[1]
for name,pages in [('2018_1-answers',[1]),('2018_1-script-11',list(range(1,10))),('2018_1-japanese',list(range(5,18))),('2021_1-science',[15,16,17,18,19,20,21,22,23,38,39,40]),('2020_2-science',[35,36,37,38]),('2021_1-math',[28])]:
 d=fitz.open(root/'public/assets/papers'/f'{name}.pdf');thumbs=[]
 for n in pages:
  pg=d[n-1];pix=pg.get_pixmap(matrix=fitz.Matrix(1.5,1.5));img=Image.frombytes('RGB',[pix.width,pix.height],pix.samples)
  out=root/'data/previews';out.mkdir(exist_ok=True)
  img.save(out/f'{name}-{n}.png');img.thumbnail((280,400));thumbs.append((n,img))
 sheet=Image.new('RGB',(280*min(4,len(thumbs)),430*((len(thumbs)+3)//4)),'#ddd');draw=ImageDraw.Draw(sheet)
 for i,(n,img) in enumerate(thumbs):x=(i%4)*280;y=(i//4)*430;sheet.paste(img,(x,y+22));draw.text((x+8,y+5),str(n),fill='black')
 sheet.save(root/'data'/f'{name}-contact.png')
