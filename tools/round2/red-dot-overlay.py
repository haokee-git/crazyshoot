"""Measured screenshot comparison, never generated/redrawn game imagery.
Run: uv run --with matplotlib --with pillow python tools/round2/red-dot-overlay.py
"""
from pathlib import Path
from PIL import Image
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import json

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/red-dot-overlay-2026-11-07'
fig,axes=plt.subplots(1,2,figsize=(12,6))
for ax,file,box,title in zip(axes,['pubg-review.png','before.png'],[(710,430,890,575),(560,295,720,430)],['PUBG (actual gameplay)','Current game - before']):
    a=Image.open(OUT/file)
    ax.imshow(a);ax.set_xlim(box[0],box[2]);ax.set_ylim(box[3],box[1])
    ax.set_xticks(range((box[0]//10)*10,box[2]+1,10));ax.set_yticks(range((box[1]//10)*10,box[3]+1,10))
    ax.tick_params(labelsize=7);ax.grid(alpha=.3);ax.set_title(title)
fig.tight_layout();fig.savefig(OUT/'measurement-grid.png',dpi=160);plt.close(fig)

result=json.loads((OUT/'local-validation.json').read_text())
ref=result['reference'];center=np.array(ref['center']);width=ref['width']
ref_outer=(np.array(ref['outer'])-center)/width
ref_inner=(np.array(ref['inner'])-center)/width
game=result['rows'][0]
after=np.array(game['outer']);after_width=np.ptp(after[:,0]);game_center=np.array([640,360])
after_outline=(after-game_center)/after_width
old_shape=np.array([[-.72,1],[.72,1],[.86,.88],[1,.40],[1,.02],[.89,-.54],[.70,-1],[-.70,-1],[-.89,-.54],[-1,.02],[-1,.40],[-.86,.88]])
old_scale=(720/(2*np.tan(np.deg2rad(55/2))))*.82/.25
before=old_shape*np.array([.0282,-.0227])*old_scale+game_center
before_width=np.ptp(before[:,0]);before_outline=(before-game_center)/before_width

def show(ax,file,c,w,alpha=1):
    a=np.asarray(Image.open(OUT/file).convert('RGB'))
    ax.imshow(a,extent=[-c[0]/w,(a.shape[1]-c[0])/w,(a.shape[0]-c[1])/w,-c[1]/w],alpha=alpha,interpolation='nearest')
def line(ax,pts,color,label):
    pts=np.concatenate([pts,pts[:1]])
    ax.plot(pts[:,0],pts[:,1],color=color,lw=1.3,label=label)
def setup(ax,title):
    ax.set_xlim(-.60,.60);ax.set_ylim(.53,-.53);ax.set_aspect('equal');ax.set_title(title,fontsize=11);ax.set_xticks([]);ax.set_yticks([])

fig,ax=plt.subplots(2,3,figsize=(14,8.5))
show(ax[0,0],'pubg-review.png',center,width);setup(ax[0,0],'PUBG gameplay reference')
show(ax[0,1],'before.png',game_center,before_width);setup(ax[0,1],'Before: frame too tall / angular sides')
show(ax[0,2],'local-ads.png',game_center,after_width);setup(ax[0,2],'After: traced shoulders and lower side bulge')
for panel,file,w,outline,title in [(ax[1,0],'before.png',before_width,before_outline,'50% image stack - BEFORE'),(ax[1,1],'local-ads.png',after_width,after_outline,'50% image stack - AFTER')]:
    show(panel,'pubg-review.png',center,width);show(panel,file,game_center,w,.5)
    line(panel,ref_outer,'#27e5df','Reference');line(panel,outline,'#ff4ba5','Game')
    setup(panel,title);panel.legend(loc='lower center',fontsize=8)
line(ax[1,2],ref_outer,'#169faa','Reference trace')
line(ax[1,2],before_outline,'#e98525','Before projection')
line(ax[1,2],after_outline,'#bc2c84','After projection')
setup(ax[1,2],'Width-normalized contours (not a pixel-perfect claim)');ax[1,2].legend(loc='lower center',fontsize=8)
ratios={'reference':float(np.ptp(ref_outer[:,1])),'before':float(np.ptp(before_outline[:,1])),'after':float(np.ptp(after_outline[:,1]))}
fig.suptitle('Center aligned + ONE uniform scale by frame width; no vertical stretching\nFrame height/width: PUBG %.3f | before %.3f | after %.3f'%tuple(ratios.values()),fontsize=13)
fig.tight_layout(rect=[0,0,1,.93]);fig.savefig(OUT/'overlay-comparison.png',dpi=160);plt.close(fig)
(OUT/'measurements.json').write_text(json.dumps({'ratios':ratios,'referenceCenter':ref['center'],'referenceWidth':width,'referenceUncertaintyPixels':2,'notes':'Reference manually digitized from actual screenshot. Game outlines projected from rendered geometry. Approximate optical-center registration; no independent x/y scaling. Bottom seam partly hidden by emitter. After matching the trace is intentional, not independent evidence of photorealism.'},indent=2)+'\n')
