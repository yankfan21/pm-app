import subprocess,sys,glob,os
import numpy as np
S=sys.argv.pop(1).rstrip('/')+'/vid/'
DEST=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','..','src','assets','tour')+'/'
FPS=25
for name in sys.argv[1:]:
    src=glob.glob(S+name+'/*.webm')[0]
    raw=subprocess.run(['ffmpeg','-loglevel','error','-i',src,'-vf',f'fps={FPS},scale=16:12','-f','rawvideo','-pix_fmt','rgb24','-'],capture_output=True).stdout
    fr=np.frombuffer(raw,dtype=np.uint8).reshape(-1,12,16,3).astype(int)
    mag=[(f[...,0].mean()>200 and f[...,1].mean()<70 and f[...,2].mean()>200) for f in fr]
    runs=[];i=0
    while i<len(mag):
        if mag[i]:
            j=i
            while j<len(mag) and mag[j]:j+=1
            runs.append((i,j));i=j
        else:i+=1
    if len(runs)<2: print(name,'markers found:',runs,'of',len(fr)); continue
    start=runs[0][1]/FPS+0.25; end=runs[-1][0]/FPS-0.05
    print(name,'cut',round(start,2),'->',round(end,2),'dur',round(end-start,2))
    mp4=DEST+name+'.mp4'; webm=DEST+name+'.webm'
    subprocess.run(['ffmpeg','-y','-loglevel','error','-i',src,'-ss',str(start),'-to',str(end),'-an','-c:v','libx264','-pix_fmt','yuv420p','-crf','24','-preset','slow','-movflags','+faststart',mp4],check=True)
    subprocess.run(['ffmpeg','-y','-loglevel','error','-i',src,'-ss',str(start),'-to',str(end),'-an','-c:v','libvpx-vp9','-b:v','0','-crf','36','-row-mt','1',webm],check=True)
    print(' sizes',os.path.getsize(mp4)//1024,'KB mp4',os.path.getsize(webm)//1024,'KB webm')
