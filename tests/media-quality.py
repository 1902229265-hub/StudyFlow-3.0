from pathlib import Path
import subprocess,re,json,hashlib,os
from PIL import Image,ImageDraw,ImageFont
R=Path(__file__).resolve().parent.parent
FF=Path('/Users/sunboming/.hermes/tools/ffmpeg-9.0.1-darwin-arm64/ffmpeg')
source=R/'recording/StudyFlow-3.0-timer-post-review.webm'
target=R/'public/media/StudyFlow-3.0-timer.mp4';target.parent.mkdir(parents=True,exist_ok=True)
env={**os.environ,'TMPDIR':str(R/'.tmp')}
def run(args,log):
    p=subprocess.run([str(FF),'-hide_banner',*map(str,args)],capture_output=True,text=True,env=env,timeout=90)
    (R/log).write_text(p.stdout+p.stderr);assert p.returncode==0,(log,p.stderr[-1000:]);return p.stderr
if not target.exists():
    run(['-n','-i',source,'-map','0:v:0','-an','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-fps_mode','passthrough','-enc_time_base','1/1000','-video_track_timescale','1000','-bf','0','-movflags','+faststart',target],'evidence/media-encode.log')
def decode(file,label):
    text=run(['-i',file,'-map','0:v:0','-vf','showinfo','-an','-f','null','-'],f'evidence/media-decode-{label}.log')
    frames=[{'n':int(n),'pts':int(pts),'seconds':float(t)}for n,pts,t in re.findall(r'\bn:\s*(\d+)\s+pts:\s*(-?\d+)\s+pts_time:([\d.e+-]+)',text)]
    dims=set(re.findall(r'\bs:(\d+x\d+)',text));duration=re.search(r'Duration:\s*(\d+):(\d+):([\d.]+)',text)
    duration=float(duration[1])*3600+float(duration[2])*60+float(duration[3])
    assert frames and dims=={'1440x900'}
    return {'file':str(file),'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'bytes':file.stat().st_size,'duration':duration,'dimensions':list(dims),'frames':frames}
a=decode(source,'native');b=decode(target,'mp4');assert len(a['frames'])==len(b['frames']);delta=max(abs(x['seconds']-y['seconds'])for x,y in zip(a['frames'],b['frames']));assert delta<=.001
last=a['frames'][-1]['seconds'];actions=json.loads((R/'evidence/recording.json').read_text())['actions'];times=[.7]+[x['elapsedMs']/1000+.35 for x in actions]+[last];indexes=sorted(set(min(range(len(b['frames'])),key=lambda i:abs(b['frames'][i]['seconds']-t))for t in times))
folder=R/'recording/verified-frames';folder.mkdir(exist_ok=True)
expr='+'.join(f'eq(n,{i})' for i in indexes)
run(['-n','-i',target,'-vf',f'select={expr.replace(",",chr(92)+",")}','-fps_mode','passthrough',folder/'frame-%02d.png'],'evidence/media-extract.log')
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',18)
canvas=Image.new('RGB',(1440,((len(indexes)+2)//3)*330),'#eeeeF4');d=ImageDraw.Draw(canvas)
for j,i in enumerate(indexes):
    im=Image.open(folder/f'frame-{j+1:02d}.png').convert('RGB');assert im.size==(1440,900);x=(j%3)*480;y=(j//3)*330;canvas.paste(im.resize((480,300),Image.Resampling.LANCZOS),(x,y+30));d.text((x+10,y+7),f'Frame {i} | PTS {b["frames"][i]["seconds"]:.3f}s',font=font,fill='#211d30')
canvas.save(R/'evidence/video-contact-sheet.png')
result={'native':a,'mp4':b,'sameFrameCount':True,'maxPtsDeltaSeconds':delta,'conversion':'H264 yuv420p -fps_mode passthrough -enc_time_base 1/1000 -video_track_timescale 1000 -bf 0; no trim, speed change, resize or interpolation','selectedFrameIndices':indexes,'contactSheetScale':'1/3; labels outside the original frame regions','captureRateNotice':'Encoded frame timing is not webpage render fps; native recorder may hold static frames.'}
(R/'evidence/media-quality.json').write_text(json.dumps(result,indent=2));print(json.dumps({'frames':len(a['frames']),'duration':a['duration'],'maxPtsDeltaSeconds':delta,'file':str(target),'contactFrames':len(indexes)}))
