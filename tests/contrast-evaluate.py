# -*- coding: utf-8 -*-
from pathlib import Path
from PIL import Image
import json,re,math
N=Path(__file__).resolve().parent.parent
data=json.loads((N/'evidence/contrast-capture.json').read_text());rows=[]
def lum(c):
    v=[x/255 for x in c];v=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in v]
    return .2126*v[0]+.7152*v[1]+.0722*v[2]
def ratio(a,b):
    x,y=sorted([lum(a),lum(b)]);return (y+.05)/(x+.05)
for case in data:
    im=Image.open(N/case['file']).convert('RGB')
    for n in case['nodes']:
        nums=[float(x) for x in re.findall(r'[\d.]+',n['color'])];alpha=(nums[3] if len(nums)>3 else 1)*n['opacity'];colors=set()
        for r in n['rects']:
            box=(max(0,math.floor(r['x'])),max(0,math.floor(r['y'])),min(im.width,math.ceil(r['x']+r['width'])),min(im.height,math.ceil(r['y']+r['height'])))
            if box[2]>box[0] and box[3]>box[1]:colors.update(rgb for count,rgb in im.crop(box).getcolors(im.width*im.height))
        worst=min((ratio([alpha*f+(1-alpha)*b for f,b in zip(nums[:3],rgb)],rgb),rgb) for rgb in colors)
        threshold=3 if n['fontSize']>=24 or(n['fontSize']>=18.666666666666668 and n['fontWeight']>=700) else 4.5
        rows.append({'width':case['width'],'theme':case['theme'],'state':case['state'],'text':n['text'],'class':n['class'],'fg':n['color'],'bg':'#'+''.join(f'{v:02x}' for v in worst[1]),'ratio':worst[0],'required':threshold,'passes':worst[0]>=threshold})
result={'method':'Computed intended foreground including alpha; every background pixel within captured text Range rectangles of main card; diagnostic foreground/SVG hidden without changing layout, settled DPR1; not full WCAG certification or all transition frames. Raw axe incompletes retained.','cases':len(data),'nodes':len(rows),'minimum':min(r['ratio'] for r in rows),'failed':[r for r in rows if not r['passes']],'nodesDetailed':rows}
(N/'evidence/contrast-manual.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps({k:v for k,v in result.items() if k!='nodesDetailed'},ensure_ascii=False));assert not result['failed']
