from pathlib import Path
import json,hashlib,tarfile
from PIL import Image,ImageDraw,ImageFont
N=Path(__file__).resolve().parent.parent;root=N.parents[1]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
old=json.loads((N/'evidence/baseline-2.3.json').read_text());new=json.loads((N/'evidence/captures.json').read_text());comparison=[]
for row in new:
    before=next(x for x in old if x['width']==row['width'] and x['theme']==row['theme']);diff=[]
    for selector,x in row['baselineGeometry'].items():
        y=before['geometry'].get(selector)
        if x and y:
            delta={k:round(x[k]-y[k],4)for k in ['x','y','width','height']if abs(x[k]-y[k])>.1}
            styles={k:[y[k],x[k]]for k in ['fontSize','lineHeight','color','background','columns']if x[k]!=y[k]}
            if delta or styles:diff.append({'selector':selector,'geometry':delta,'styles':styles})
    comparison.append({'width':row['width'],'theme':row['theme'],'differences':diff,'note':'Diagnostic React baseline hides new timer/stat additions, not normal delivered UI.'})
assert len(comparison)==4 and not any(x['differences']for x in comparison)
(N/'evidence/visual-geometry-comparison.json').write_text(json.dumps(comparison,ensure_ascii=False,indent=2))
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',20);images=[]
for width,theme,height in [(1440,'light',900),(390,'dark',844)]:
    a=Image.open(N/f'evidence/baseline-2.3-{width}-{theme}.png').convert('RGB').crop((0,0,width,height));b=Image.open(N/f'evidence/3.0-{width}-{theme}-idle.png').convert('RGB');assert b.size==(width,height)
    canvas=Image.new('RGB',(width*2,height+40),'#eeeef4');canvas.paste(a,(0,40));canvas.paste(b,(width,40));d=ImageDraw.Draw(canvas);d.text((12,9),'2.3 approved prototype',font=font,fill='#242031');d.text((width+12,9),'3.0 Phase 2 - real timer enabled',font=font,fill='#242031')
    assert canvas.crop((0,40,width,height+40)).tobytes()==a.tobytes() and canvas.crop((width,40,width*2,height+40)).tobytes()==b.tobytes()
    file=f'evidence/comparison-{width}-{theme}.png';canvas.save(N/file);images.append({'file':file,'originalPixelsPreserved':True,'resize':False,'beforeViewportCrop':[0,0,width,height]})
(N/'evidence/comparison-provenance.json').write_text(json.dumps(images,indent=2))
p=json.loads((N/'checkpoints/protection.json').read_text());changed=[k for k,h in p['protected'].items() if not(root/k).is_file() or sha(root/k)!=h]
archive=N/p['archive'];assert sha(archive)==p['archiveSha256']
with tarfile.open(archive)as t:members=t.getmembers();names=[m.name for m in members];assert len(members)==p['archiveMembers']
css={p.name:sha(p)==sha(N/'reference-2.3'/p.name)for p in(N/'src/ui').glob('*.css')if p.name!='phase2.css'}
result={'protectedCount':len(p['protected']),'changedProtected':changed,'checkpointArchiveShaMatches':True,'checkpointArchiveMembers':len(members),'baselineCssMatches':css,'restorePolicy':p['restorePolicy'],'notVerified':'No personal browser profiles/storage were read; protected files are source/release/evidence files, not a claim to inspect all user data.'}
assert not changed and all(css.values());(N/'evidence/protection-final.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps({'geometryCases':len(comparison),'protection':result},ensure_ascii=False))
