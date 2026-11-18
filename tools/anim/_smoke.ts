import { captureGif } from './gif';

const html = `<!doctype html><html><head><style>html,body{margin:0;background:#0b0e11}#c{display:block}</style></head><body>
<canvas id="c" width="320" height="320"></canvas>
<script>
const c = document.getElementById('c'); const g = c.getContext('2d');
window.__previewSetFrame = ({t}) => {
  g.fillStyle = '#0b0e11'; g.fillRect(0,0,320,320);
  g.strokeStyle = 'rgba(53,224,208,.25)'; g.lineWidth=1;
  for(let i=0;i<=8;i++){g.beginPath();g.moveTo(i*40,0);g.lineTo(i*40,320);g.stroke();g.beginPath();g.moveTo(0,i*40);g.lineTo(320,i*40);g.stroke();}
  const x = 80 + Math.sin(t*Math.PI*2)*60;
  g.fillStyle = '#4aa8ff'; g.fillRect(x,140,50,80);
  g.fillStyle = '#e6efec'; g.fillRect(x+10,60,30,60);
  g.fillStyle = '#ffb454'; g.fillRect(x+12,250,10,45); g.fillRect(x+32,250,10,45);
};
</script></body></html>`;

await captureGif({out:'previews/anim/_pipeline-test.gif', html, width:320, height:320, frames:30, fps:30, selector:'#c', background:'#0b0e11'});
