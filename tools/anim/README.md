# 动画 GIF 预览管线

所有动作都要交付**循环 GIF**，不是只有静帧。

## 输出规格

| 类型 | 尺寸 | FPS | 时长 | 备注 |
|---|---|---|---|---|
| 角色 | 640×640 | 30 | 2–3s | 3/4 视角 + 网格地板，循环 |
| 第一人称武器 | 960×540 | 30 | 2–3s | 含手臂，hip/ADS 两个视角按需 |
| 载具 | 960×540 | 30 | 2–3s | 炮塔/轮/履带/摧毁 |

每个 GIF 旁边输出同名 `.json`：帧数、FPS、尺寸、循环、生成时间。

## 动作列表（必须全）

### 角色
idle、walk、run、sprint、crouch_idle、crouch_walk、prone_idle、crawl、aim、fire、reload、jump、land、vault、death、vehicle_sit、vehicle_drive。

### 第一人称武器
idle、walk_bob、ads、fire、reload、reload_empty、bolt/pump、grenade_throw。

### 载具
turret_traverse、turret_elevate、wheels、tracks、destruction。

## 预览页协议

预览页暴露：

```ts
window.__previewSetFrame = ({ frame, t, fps }) => {
  // 设置动作时间轴；确定性、无随机
};
```

页面必须可确定性重放（不要用 Date.now() 驱动动画）。GIF 工具会在每帧调用一次，然后截 canvas/元素。

## 用法

```ts
import { captureGif } from './tools/anim/gif';

await captureGif({
  out: 'previews/anim/character/walk.gif',
  url: 'http://localhost:5173/preview/anim?action=walk',
  width: 640,
  height: 640,
  frames: 60,
  fps: 30,
  selector: '#preview-canvas',
  waitForFunction: 'window.__previewReady === true',
});
```

或直接传 `html` 字符串，不依赖 dev server。

## 规则

- 所有子代理/预览脚本用这个工具，不各写一套 ffmpeg。
- 风格、灯光、背景用共享预览场景，不能一个动作一个色调。
- 动作要先在预览里确认，再进游戏。
- 文件输出到 `previews/anim/<category>/<action>.gif`。
- 同目录保留 `.json` 元数据，便于回归。
