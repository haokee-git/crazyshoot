import type {NavLink} from '../types';
import {TUNNEL_EXIT_PLAN, tunnelAt, tunnelExitGeom, tunnelNavLinks} from '../../game/world/pharaoh-tunnel';
import {pharaohHeight} from '../pharaoh-height';

/**
 * 法老图的显式导航连接（只影响 Bot 图，不改变碰撞/支撑/渲染）。
 *
 * 3 m 导航栅格无法表达：狮身人面像 1.5 m 错位窄门、A–B 墓道石墩 1.6 m 净宽、
 * 金字塔 0.5 m 级高考古阶梯的栅格错位。连接点都落在真实可站立面上，
 * 两帧内即可跨过；碰撞、载具物理、子弹仍使用同一份体素数据。
 */
export const PHARAOH_NAV_LINKS:NavLink[]=[
  // 金字塔：南主门 / 西考古门 / 东墓道门
  {label:'pyr-south-door',ax:190.0,az:536.0,ay:4,bx:190.0,bz:552.0,by:5},
  {label:'pyr-west-door',ax:118.0,az:607.0,ay:4,bx:130.0,bz:607.0,by:5},
  {label:'pyr-east-door',ax:250.0,az:600.0,ay:5,bx:262.0,bz:600.0,by:4.5},
  // 金字塔：内部大梯 +20、登顶梯、顶台
  {label:'pyr-inner-stair-a',ax:172.0,az:578.0,ay:5,bx:160.0,bz:578.0,by:11},
  {label:'pyr-inner-stair-b',ax:160.0,az:578.0,ay:11,bx:160.0,bz:578.0,by:20},
  {label:'pyr-upper-west',ax:160.0,az:590.0,ay:20,bx:160.0,bz:610.0,by:20},
  {label:'pyr-summit-a',ax:160.0,az:610.0,ay:20,bx:170.0,bz:610.0,by:30},
  {label:'pyr-summit-b',ax:170.0,az:610.0,ay:30,bx:180.0,bz:610.0,by:42},
  {label:'pyr-summit-top',ax:180.0,az:610.0,ay:42,bx:190.0,bz:610.0,by:52},
  // 金字塔：西南考古阶梯（0.5 m 级高，栅格错位逐段桥接）
  {label:'pyr-sw-1',ax:122.0,az:542.0,ay:4,bx:130.0,bz:550.0,by:8},
  {label:'pyr-sw-2',ax:130.0,az:550.0,ay:8,bx:140.0,bz:560.0,by:13},
  {label:'pyr-sw-3',ax:140.0,az:560.0,ay:13,bx:150.0,bz:570.0,by:18},
  {label:'pyr-sw-4',ax:150.0,az:570.0,ay:18,bx:160.0,bz:580.0,by:23},
  {label:'pyr-sw-5',ax:160.0,az:580.0,ay:23,bx:170.0,bz:590.0,by:33},
  {label:'pyr-sw-6',ax:170.0,az:590.0,ay:33,bx:180.0,bz:600.0,by:43},
  {label:'pyr-sw-top',ax:180.0,az:600.0,ay:43,bx:186.0,bz:606.0,by:52},
  // 金字塔：北施工栈道两段 + 门楼 + 上层北廊
  {label:'pyr-north-a1',ax:220.0,az:687.0,ay:4,bx:210.0,bz:687.0,by:8},
  {label:'pyr-north-a2',ax:210.0,az:687.0,ay:8,bx:200.0,bz:687.0,by:12},
  {label:'pyr-north-a3',ax:200.0,az:687.0,ay:12,bx:190.0,bz:687.0,by:16},
  {label:'pyr-north-a4',ax:190.0,az:687.0,ay:16,bx:180.0,bz:687.0,by:20},
  {label:'pyr-north-turn',ax:180.0,az:687.0,ay:20,bx:174.0,bz:677.0,by:20},
  {label:'pyr-north-b1',ax:174.0,az:677.0,ay:20,bx:190.0,bz:677.0,by:20},
  {label:'pyr-north-door',ax:190.0,az:677.0,ay:20,bx:200.0,bz:667.0,by:20},
  {label:'pyr-north-gallery-1',ax:200.0,az:667.0,ay:20,bx:190.0,bz:650.0,by:20},
  {label:'pyr-north-gallery-2',ax:190.0,az:650.0,ay:20,bx:190.0,bz:630.0,by:20},
  // 狮身人面像：西后侧墓道 → 后厅 → 内殿环路
  {label:'pyr-loop-west',ax:163.0,az:618.0,ay:5,bx:163.0,bz:627.0,by:5},
  {label:'pyr-loop-east',ax:211.0,az:618.0,ay:5,bx:211.0,bz:627.0,by:5},
  // 狮身人面像：西后墓道 → 门厅 → 内殿环路（与 sphinx builder 的 2 m 石门对齐）
  {label:'sph-west-tunnel',ax:378,az:640,ay:4,bx:390,bz:640,by:4},
  {label:'sph-west-gate',ax:399,az:640,ay:5,bx:402,bz:640,by:4},
  {label:'sph-hall-west',ax:434,az:640,ay:4,bx:442,bz:640,by:4},
  {label:'sph-north-ramp',ax:459,az:606,ay:4,bx:459,bz:614,by:6},
  {label:'sph-north-steps',ax:459,az:616,ay:6,bx:459,bz:621,by:4},
  {label:'sph-south-gate',ax:457,az:666,ay:4,bx:457,bz:658,by:4},
  {label:'sph-east-court',ax:526,az:640,ay:4,bx:517,bz:640,by:4},
  {label:'sph-east-gate',ax:513,az:642,ay:4,bx:507,bz:642,by:4},
  {label:'sph-head-stair-a',ax:510,az:631,ay:4,bx:496,bz:631,by:20},
  {label:'sph-head-stair-b',ax:494,az:632,ay:20,bx:511,bz:633,by:36},
  {label:'sph-head-corridor',ax:513,az:634,ay:36,bx:518,bz:642,by:36},
  // A–B 墓道两个中途出口：中心 → 井底 → 井口（与 tunnel builder 同源几何）
  ...tunnelExitGeom((x, z) => pharaohHeight(x, z)).flatMap((exit, index) => {
    const plan = TUNNEL_EXIT_PLAN[index];
    const centre = tunnelAt(plan.entryS);
    // 3 m 栅格把井底/井口的台阶拆成孤岛：从隧道中心直接桥到井口（真实碰撞仍是石阶）。
    return [
      {label:`${exit.name}-mouth`, ax:centre.x, az:centre.z, ay:exit.entryFloor, bx:exit.mouth[0], bz:exit.mouth[1], by:exit.top},
    ];
  }),
  // A–B 墓道石墩/石门（动态计算，避免手抄坐标）
  ...tunnelNavLinks(),
];