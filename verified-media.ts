import type { Plugin } from 'vite';
import { createReadStream, statSync } from 'node:fs';
import { resolve } from 'node:path';
/** Exact, loopback-preview media endpoint; never serves arbitrary paths. */
export function verifiedMedia(root: string): Plugin {
  return { name: 'studyflow-verified-media', configureServer(server) {
    server.middlewares.use((req,res,next)=>{
      if(req.url?.split('?')[0]!=='/media/StudyFlow-3.0-timer.mp4')return next();
      if(req.method!=='GET'&&req.method!=='HEAD'){res.statusCode=405;res.setHeader('Allow','GET, HEAD');res.end();return;}
      const file=resolve(root,'public/media/StudyFlow-3.0-timer.mp4');let size:number;
      try{size=statSync(file).size}catch{res.statusCode=404;res.end();return;}
      res.setHeader('Accept-Ranges','bytes');res.setHeader('Content-Type','video/mp4');res.setHeader('Cache-Control','no-store');
      let start=0,end=size-1;const range=req.headers.range;
      const invalid=()=>{res.statusCode=416;res.setHeader('Content-Range',`bytes */${size}`);res.setHeader('Content-Length','0');res.end();};
      if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m||(!m[1]&&!m[2])){invalid();return;}
        if(!m[1]){const suffix=Number(m[2]);if(!Number.isSafeInteger(suffix)||suffix<=0){invalid();return;}start=Math.max(0,size-suffix);}
        else{start=Number(m[1]);end=m[2]?Number(m[2]):size-1;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=size){invalid();return;}end=Math.min(end,size-1);}
        res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${size}`);
      }
      res.setHeader('Content-Length',String(end-start+1));if(req.method==='HEAD'){res.end();return;}
      const stream=createReadStream(file,{start,end});stream.on('error',()=>{if(!res.headersSent)res.statusCode=500;res.destroy();});stream.pipe(res);res.on('close',()=>stream.destroy());
    });
  }};
}
