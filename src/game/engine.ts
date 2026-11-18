import {opticFov} from './weapons/optics';
import {WeaponRecoil} from './weapons/recoil';
import {neutralMuzzleOffset} from '../content/weapons/presentation';
import {vehicleBlocks,vehicleSupport} from './vehicles/collision';
import {LocalNavigation} from './ai/local-navigation';
import {BattleDanger} from './ai/battle-danger';
import {findBridgeWaterCrossing,type WaterCrossing} from './ai/water-crossing';
import {vehicleWorld} from './ai/vehicle-navigation';
import {VehiclePilot} from './ai/vehicle-pilot';
import {teamLoadoutPlan,pickBotLoadout,chooseRespawnRole,loadoutSelection,type BotRole,type BotLoadout} from './ai/bot-loadout';
import {botReactionMs,botScanIntervalMs,botScanWindowMs,botSightRange,botShotDirection,botAimPlan,botTargetUtility} from './ai/aim';
import {textureResolution} from '../content/materials/battlefield';
import {RenderPipeline,nativeRenderSize,rayBlocked} from './render-pipeline';
import {lightingPreset,type LightingQuality} from './rendering/lighting-presets';
import {CinematicShadows} from './rendering/cinematic-shadows';
import {CinematicLighting} from './rendering/cinematic-lighting';
import * as THREE from 'three';
import { getSettings, saveSettings } from './core/settings';
import { Input } from './core/input';
import type { Arena, ArenaTarget } from './world/arena';
import { buildVoxelArena } from './world/voxel-arena';
import type { TerrainData } from './world/terrain-field';
import { buildMapArena } from './world/map-arena';
import {getVehicle, VEHICLE_WEAPON_NAMES} from '../content/vehicles/catalog';
import { buildVehicleModel, type VehicleModelId } from '../content/vehicles/models';
import { getMap } from '../maps';
import { PlayerController } from './player/controller';
import { SWIM_DEPTH } from './player/swimming';
import { NetworkInput } from './player/network-input';
import { WeaponViewmodel, MUZZLE_FLASH_TEXTURE } from './weapons/viewmodel';
import type { LoadoutSelection, WeaponCatalogEntry } from '../content/weapons/catalog';
import { AMR_WEAPON, FIRE_MODES, type FireMode, DEFAULT_LOADOUT, getWeapon } from '../content/weapons/catalog';
import type { NetworkSession } from '../network/session';
import { createBlockyCharacter, type CharacterRig } from './characters/rig';
import { applyCharacterAction, alignCharacterAim, applyStanceTransition, STANCE_TRANSITION_SECONDS, type CharacterAction, type StancePose } from './characters/animations';
import { GameAudio } from './audio';
import { disposeObject } from './core/resources';
import { SimulationClock,RenderScheduler,unsimulatedGapMs } from './core/simulation-clock';
import {predictionOffsetDecay,smoothRemotePosition} from './core/prediction-history';
import {MAX_MOVEMENT_COMMANDS,replayMovementFromAuthority,capturePredictedMovement,matchesPredictedMovement,simulateMovementCommand,type MovementCommand,type PredictedMovement} from './core/movement-prediction';
import {liveNetworkInterval} from './core/network-timing';
import {decideArmoredObjective,type ArmoredDecision,type ArmoredObjective,type ObjectiveSituation} from './ai/vehicle-objective';
import {decideInfantry,positionUtility,preferredCombatRange,type TacticalDecision} from './ai/tactical-brain';
import {TacticalMemory} from './ai/tactical-memory';
import {convoyFollowing} from './ai/vehicle-traffic';
import { DEFAULT_MATCH_SECONDS } from './core/match-time';
import { Tactical } from './combat/tactical';
import { ImpactSystem, impactSurface, loadBulletHoleTexture } from './combat/impacts';
import { blastDamage,IMPACT_STREAK_SECONDS,AMMO, ProjectilePool, type ProjectileDef, type Projectile } from './combat/projectiles';
import { infantryDamage, infantryHitZone, type HitZone } from './combat/hit-zones';
import { advanceAxis, angleDelta, enclosedVehicle, pedestrianImpactDamage, vehicleHealth, vehicleSize } from './vehicles/controller';
import { advanceVehiclePose, findFreeVehiclePose, vehicleContact, vehiclePoseBlocked, vehicleDeck, maxVehicleGrade, HULL_SUPPORT_POINTS, type MotionWorld } from './vehicles/motion';
import { blastVehicleDamage, fallDamageFromExit, isArmoredVehicle, vehicleDirectDamage, vehicleExplosionDamage } from './vehicles/damage';
import { jitterDirection, recoverSpread, spreadProfile } from './combat/spread';
import { VehicleDamageFx, FlameJet } from './vehicles/damage-fx';
import { VehicleSpawnManager, SPAWN_DEFAULTS, type PadState, type SpawnAction, type VehiclePadSpec, type VehicleSync } from './vehicles/spawn-manager';
import { FLAME_TUNING, FLAME_WEAPON, RPG_WEAPON, ROCKET_AMMO } from '../content/weapons/special';
import { flameCoversSphere, flameFacesShooter, flameHeadHeight } from './combat/flame';
import { rayBoxDistance,boxesOverlapXZ } from './world/queries';
import { ContactShadows } from './world/contact-shadows';
import {SunShadows,setSunShadowModel} from './world/sun-shadows';
import { Navigation, type Waypoint } from './world/navigation';
import type { LoadProgress } from './core/loading';
import { localFeedLines, type FeedEvent } from './ui/event-feed';
import { admitGuestShot } from './combat/shot-admission';
import { capturePointAllows } from './world/capture-rules';
import { FerrySystem, isDocked, type FerryConfig } from './mechanisms/river-ferry';
import { buildFerryVisual, type FerryVisual } from './mechanisms/ferry-visual';


interface FerryRuntime {cfg:FerryConfig;visual:FerryVisual;targetX:number;targetZ:number;targetYaw:number;}

interface Body {
  rig:CharacterRig;origin:THREE.Vector3;yaw:number;start:number;
  drift:THREE.Vector3;fallSpeed:number;ammo:boolean;
  magazine?:THREE.Mesh;
  ammoTakenAt?:number;
}
function makeDroppedMagazine(){
  const shape=new THREE.Shape();
  shape.moveTo(-.075,.15);
  shape.lineTo(.07,.15);
  shape.lineTo(.075,-.012);
  shape.lineTo(.113,-.127);
  shape.lineTo(-.027,-.172);
  shape.lineTo(-.065,-.048);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape,{depth:.065,bevelEnabled:false}).center();
}

interface VehicleWeapon {
  id:string;
  mount:THREE.Object3D;
  muzzle:THREE.Object3D;
  ammo:number;
  nextFire:number;
  yaw:number;
  pitch:number;
  aimYaw:number;
  aimPitch:number;
  /** 当前连射散布（半角，弧度），由主机在开火/回落时维护。 */
  spread:number;
  lastFire:number;
}
interface VehicleState {
  id:string;kind:string;team:NetTeam|'neutral';model:THREE.Group;
  x:number;z:number;yaw:number;steering?:number;speed:number;
  turretYaw:number;turretPitch:number;yawVelocity:number;pitchVelocity:number;
  aimYaw:number;aimPitch:number;
  health:number;maxHealth:number;ammo:number;shell:'ap'|'he';nextFire:number;
  seats:(string|null)[];weapons:VehicleWeapon[];destroyed:boolean;
  /** Consecutive milliseconds of demanded motion with no movement (winch-out). */
  stallSince?:number;winchYaw?:number;winchCount?:number;winchAt?:number;winchExhausted?:boolean;
}
interface StowedPrimary {weaponId:LoadoutSelection['weaponId'];ammo:number;reserve:number;}
/** 运行时据点：地图定义 + 占领状态 + 圆圈/光柱；floorY 由室内据点地图提供。 */
interface CapState {
  id:string;x:number;z:number;r:number;
  owner:'neutral'|'blue'|'orange';progress:number;
  ring:THREE.Mesh;beam:THREE.Mesh;footprintOutline?:THREE.LineSegments;
  floorY?:number;verticalTolerance?:number;footprint?:{x0:number;z0:number;x1:number;z1:number};
}
const isCannon=(id:string)=>id==='vehicle_cannon_120'||id==='vehicle_autocannon_30';
const directionFor=(yaw:number,pitch:number)=>new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
const MAX_HOST_INPUT_QUEUE = MAX_MOVEMENT_COMMANDS; // Retain delayed commands while the rate-limited host catches up.
const MAX_PREDICTED_INPUTS = MAX_MOVEMENT_COMMANDS; // Retain three seconds for high-latency links and short stalls.
const GUEST_INPUT_TIMEOUT_MS = 500; // hold the last keys through jitter/bursty delivery; 180 ms stuttered on relay/low-end guests.
const RESPAWN_PROTECTION_MS = 5000;

export type GamePhase = 'prep' | 'live';

export interface HudState {
  phase: GamePhase;
  canStart:boolean;
  multiplayer:boolean;
  ads:boolean;adsBlend?:number;renderSize?:string;
  caliber:string;
  vehicle: null|{seat:number;seats:{label:string;occupied:boolean}[];cannon:boolean;weapon:string;name:string;health:number;maxHealth:number;speed:number;yaw:number;turretYaw:number;pitch:number;ammo:number;shell:string;reload:number;actual:{x:number;y:number;visible:boolean};blocked:boolean};
  overlayOpen: boolean;
  prepSeconds: number;
  armed: boolean;
  ammo: number;
  reserve: number;
  reloading: boolean;
  health: number;
  protectionSeconds: number;
  hurtFlash: number;
  /** 火焰烧脸致盲强度 0..1（重度遮挡，仅正面头部被锥形火焰覆盖时）。 */
  burnBlind: number;
  paused: boolean;
  pointerLocked: boolean;
  score: number;
  hitmarker: boolean;
  banner: boolean;
  weaponName: string;
  message: string;
  team: 'blue' | 'orange';
  blueScore: number;
  orangeScore: number;
  killFeed: { text: string; kind: 'kill' | 'vehicle' }[];
  /** 动态据点：3 点图只有 A/B/C，法老 5 点图是 A–E；HUD 直接按数组渲染。 */
  captures: { id: string; owner: 'neutral' | 'blue' | 'orange'; progress: number }[];
  /** 车位状态（可用/刷新中/被占用）；host 权威，客机从 snap 同步。x/z 供小地图标注。 */
  vehiclePads?: { id: string; team: 'blue' | 'orange' | 'neutral'; state: 'ready' | 'respawning' | 'occupied'; seconds?: number; x?: number; z?: number }[];
  scoreMax: number;
  mapName: string;
  driving: boolean;
  vehiclePrompt: string;
  aimedAmmo?:'available'|'taken';
  ammoPickup?:number;
  dead: boolean;
  respawnSeconds: number;
  respawnChoice: string;
  respawnOptions: { id: string; label: string; x: number; z: number }[];
  matchSeconds: number;
  winner: '' | 'blue' | 'orange'|'draw';
  inWater: boolean;
  underwater: boolean;
  scope: number;
  fireMode?:FireMode;
  fireModeNotice?:FireMode;
  mapOpen?:boolean;
  events: { id: number; kind: 'kill' | 'capture' | 'death' | 'vehicle' | 'assist'; text: string; points: number }[];
  minimap: {
    x: number; z: number; yaw: number;
    others: { x: number; z: number; team: 'blue' | 'orange'; spotted: boolean; dead: boolean }[];
    caps: { id: string; x: number; z: number; owner: 'neutral' | 'blue' | 'orange'; progress: number }[];
    vehicles: { id: string; kind: string; team: 'blue' | 'orange' | 'neutral'; x: number; z: number }[];
    crates: { id: string; weaponId: string; x: number; z: number }[];
    plan?: number[][];
    palette?: [number, number, number][];
    colors?: Uint8Array;
    ortho?: HTMLCanvasElement;
    worldSize: number;
    minX:number; minZ:number;
  };
}

export interface EngineCallbacks {
  onHud: (state: HudState) => void;
  onError?: (message: string) => void;
  onLoading?:(p:LoadProgress)=>void;
}


type NetTeam = 'blue' | 'orange';

interface RemoteAvatar {
  id: string;
  name: string;
  team: NetTeam;
  rig: CharacterRig;
  target: THREE.Vector3;
  yaw: number;
  pitch: number;
  moving: boolean;
  sprinting: boolean;
  crouching: boolean;
  prone?:boolean;
  lean:number;
  swimming: boolean;
  climbing:boolean;mantleTime:number;grounded:boolean;airTime:number;
  renderedYaw?:number;
  renderedPitch?:number;
  spawnSerial?:number;
  teleportSerial?:number;
  velocity:THREE.Vector3;
  sampleTime:number;
  action: CharacterAction;

  blendT: number;
  blendFrom: Record<string, { rx: number; ry: number; rz: number; px: number; py: number; pz: number }> | null;
  time: number;
  seen: boolean;
  health: number;
  dead: boolean;
  protectedUntil: number;
  combatAction?:CharacterAction;weaponId:string;vehicleId:string|null;vehicleSeat:number;
  /** 姿态过渡：当前姿态、过渡起点、0..1 进度（约 1.1s 完成）。 */
  stance?:'stand'|'crouch'|'prone';stanceFrom?:'stand'|'crouch'|'prone';stanceT?:number;
}

interface HostedGuest {
  id: string;
  name: string;
  team: NetTeam;
  controller: PlayerController;
  input: NetworkInput;
  yaw: number;
  pitch: number;
  lastInput: number;
  spawn: THREE.Vector3;
  health: number;
  lastDamageAt: number;
  dead: boolean;
  respawnAt: number;
  protectedUntil: number;
  bot: boolean;
  nextBotFire: number;
  botStrafe: 'KeyA' | 'KeyD';
  botStrafeUntil: number;
  vehicleId: string | null;
  vehicleSeat:number;
  vehThrottle: number;
  vehSteer: number;
  vehicleOrder?:{id:string;seat:number;until:number;approach?:THREE.Vector3;planned?:boolean};
  vehicleRetryAt?:number;
  vehicleBoardedAt?:number;
  driveStall?:number;trafficFollowing?:string;trafficWaitSince?:number;trafficAvoidUntil?:number;trafficRetryAt?:number;vehicleBraking?:boolean;combatHeldSince?:number;
  vehicleDecision?:ArmoredDecision;nextVehicleDecisionAt?:number;vehicleParking?:{id:string;x:number;z:number;r:number;until:number};
  driveProbe?:{x:number;z:number;yaw:number;at:number};
  driveProgress?:{goal:string;distance:number;at:number};
  reverseUntil?:number;
  driveTurn?:number;
  /** Route-following brain for the hull this bot drives (created on first order). */
  pilot?:VehiclePilot;
  /** Capture points this crew could not reach by vehicle; skip them for a while. */
  vehicleGoalsBlocked?:{id:string;until:number}[];
  respawnChoice: string;
  overlayOpen:boolean;
  selection:LoadoutSelection;
  stowedPrimary?:StowedPrimary;
  ammo:number;reserve:number;reloadEnd:number;nextFire:number;spawnSerial:number;
  tactical?:TacticalDecision;tacticalPoint?:{x:number;y:number;z:number;until:number};tacticalCovered?:boolean;
  nextTargetScan?:number;targetAcquiredAt?:number;aimObservedAt?:number;aimVelocity?:{x:number;y:number;z:number};friendlyFireBlockedUntil?:number;lastObservedArmored?:boolean;
  targetId:string|null;lastSeen:number;nextThink:number;objective:string;objectiveUntil:number;
  /** 正面头被火焰烧到的失明截止时刻（host 判定，bot 与联机访客共用）。 */
  burnUntil?:number;
  lastKnown:THREE.Vector3;lastShotAt:number;path:{x:number;z:number}[];nextPath:number;
  aimSample:THREE.Vector3;nextAimSample:number;burstShots:number;routeWaypoint?:Waypoint;
  detour?:{goal:string;path:Waypoint[];until:number};nextDetourAt?:number;
  waterEntry?:{x:number;z:number;until:number};waterDiveUntil?:number;waterRetreatAt?:number;
  waterCross?:WaterCrossing&{goal:string;until:number;entered:boolean;committed:boolean};waterCrossRetryAt?:number;
  blockedObjective?:{id:string;until:number};
  dangerDetour?:{id:number;goal:string;x:number;z:number;until:number};
  dangerAvoided?:{id:number;until:number};dangerCheckAt?:number;
  dangerRejected?:{id:number;x:number;z:number;until:number};dangerProgress?:{distance:number;at:number};
  throwables:number[];nextThrow:number;lastShotSeq:number;lastShotClientAt:number;
  botRole?:BotRole;botFlank?:number;nextDodge?:number;nextSmoke?:number;nextFrag?:number;
  /** 当前姿态意图与下一次允许切换姿态的时刻（防止 AI 反复趴下/站起）。 */
  stanceIntent?:'stand'|'crouch'|'prone';nextStanceAt?:number;nextCoverCheck?:number;
  huntUntil?:number;huntTarget?:THREE.Vector3;holdUntil?:number;nextHoldAt?:number;
  /** 反狙扫描状态：扫描窗口截止、下次扫描时刻、观察的威胁胸口点；engagementShots = 本次交战的第几发。 */
  scanUntil?:number;nextScanAt?:number;scanPoint?:THREE.Vector3;engagementShots?:number;
  inputSeq:number;lastQueuedSeq:number;pendingInputs:InputCommand[];
  inputCredit?:number;inputCreditAt?:number;
}

type InputCommand = MovementCommand;
/**
 * One entry of the local event feed. `text` is the global fallback wording;
 * kill/death entries also carry actor/target ids + names so every client can
 * render the *local* wording without the host's personal feed leaking over.
 */
type GameEvent = FeedEvent;

interface CombatHit {kind:'world'|'vehicle'|'player'|'target';id?:string;distance:number;point:THREE.Vector3;zone?:HitZone;target?:ArenaTarget;normal?:THREE.Vector3;material?:number;}

interface WorldFx {
  obj: THREE.Object3D;
  age: number;
  life: number;
  startScale: number;
  endScale: number;
  startOpacity: number;
  endOpacity: number;
  vel: THREE.Vector3;
  sprite: boolean;
}

function makeSmokeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 64, 64);
  for (let i = 0; i < 9; i++) {
    const x = 20 + Math.random() * 24;
    const y = 20 + Math.random() * 24;
    const r = 9 + Math.random() * 12;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(228,230,224,${0.45 + Math.random() * 0.25})`);
    grad.addColorStop(1, 'rgba(205,208,200,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  return t;
}
const SMOKE_TEX = makeSmokeTexture();
/** 所有车毁残骸共用的一种近黑材质，跨局还原时恢复各 mesh 的 userData.om。 */
const WRECK_MATERIAL = new THREE.MeshLambertMaterial({ color: 0x0c0c0e });

export class GameEngine {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly presentation=new RenderPipeline();
  private adsIntent=false;private lastLocalShotAt=-Infinity;
  private localNavigation!:LocalNavigation;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly arena: Arena;
  private readonly controller: PlayerController;
  private readonly viewmodel: WeaponViewmodel;
  private vehicles:VehicleState[]=[];
  /** 车位定义（arena.vehicles 派生，id 稳定）；新一局按它恢复初始载具。 */
  private vehiclePadDefs:VehiclePadSpec[]=[];
  private initialVehicleIds=new Set<string>();
  /** 自动刷新管理器：host 独占；客机只收 vehSpawn/vehReset/snap。 */
  private vehicleSpawnManager?:VehicleSpawnManager;
  private netPadStates:PadState[]=[];
  private nextVehicleSpawnCheck=0;
  /** 车位状态不用每帧全量下发：变化时或每 2 s 一次（客机倒计时允许 1 s 级误差）。 */
  private lastPadSignature='';
  private nextPadSyncAt=0;
  /** Shared motion adapter (drivable deck + hull clearance) for physics and AI. */
  private vehicleMotionWorld?:MotionWorld;
  /** Global planning budget: AI routes are expensive, so plans are staggered. */
  private nextVehiclePlanAt=0;
  private nextBotCrewAssignmentAt=0;
  private drivingId:string|null=null;
  private vehicleSeat=0;
  private vehicleViewYaw=0;
  private vehicleViewPitch=0;
  private pendingSeatChange=false;
  private seatedPlayer?:CharacterRig;
  private mapOpen=false;
  private stance:'stand'|'crouch'|'prone'='stand';
  private crouchDown=false;
  private proneDown=false;
  /** Prone only: movement and aiming/firing are mutually exclusive, first come first served. */
  private standUpGuard=false;
  private ignoreCrouchUntilRelease=false;
  private ignoreProneUntilRelease=false;
  private readonly recentDamage=new Map<string,Map<string,{at:number;amount:number}>>();
  /** Enemy positions that recently dealt damage, used for bot counter-play. */
  private readonly threats=new Map<string,{x:number;y:number;z:number;at:number;weight:number;longRange:boolean}>();
  private readonly battleDanger=new BattleDanger();
  private readonly tacticalMemory=new TacticalMemory();
  private nextThreatPrune=0;
  /** 绕行射线缓存：同一时刻窗口内按 (威胁, 网格点) 复用视线结果，并限流射线数量。 */
  private readonly botLosCache=new Map<string,boolean>();
  private botLosAt=0;private botLosBudget=0;
  private readonly lastVehicleImpact=new Map<string,number>();
  /** 载具撞坎/撞墙的伤害冷却：高速过坎不能每帧叠伤直接爆车。 */
  private readonly lastVehicleCrash=new Map<string,number>();
  private vehicleNextFire = 0;
  private chasePos = new THREE.Vector3();
  private chaseLook = new THREE.Vector3();
  private chaseYaw = 0;
  private chaseRoll = 0;
  private vehicleFov = 72;
  private ads = false;
  private lastRight = false;
  private readonly weaponRecoil = new WeaponRecoil();
  private recoilPitch = 0;
  private recoilYaw = 0;
  private readonly input: Input;
  private readonly clock = new THREE.Clock();
  private readonly audio = new GameAudio();
  private readonly raycaster = new THREE.Raycaster();
  private readonly occlusionRay = new THREE.Raycaster();
  private readonly callbacks: EngineCallbacks;
  private readonly host: HTMLElement;
  private readonly resizeHandler: () => void;
  private readonly keyHandler: (e: KeyboardEvent) => void;
  private readonly blurHandler: () => void;
  private readonly visibilityHandler: () => void;
  private readonly lockHandler: () => void;
  private readonly lite: boolean;
  private readonly nameplateLayer: HTMLDivElement;
  private readonly nameplates = new Map<string, HTMLDivElement>();
  private fogDensity=.002;
  private sunShadows?:SunShadows;
  private cinematicShadows?:CinematicShadows;
  private cinematicLighting?:CinematicLighting;
  private effectiveLighting:LightingQuality='medium';
  private lightingStatusText='';
  private sunOccluded=false;
  private nextSunOcclusionCheck=0;
  private readonly sunDirection=new THREE.Vector3(0,1,0);
  private readonly sunRadiance=new THREE.Color(1,1,1);
  private nextWeaponLightSample=0;
  private weaponShade=0;
  private weaponShadeTarget=0;
  private raf = 0;
  private readonly simulation=new SimulationClock();
  private readonly renderSchedule=new RenderScheduler();
  private navigation?:Navigation;
  private shadows?:ContactShadows;
  private projectileMesh?:THREE.InstancedMesh;private projectileTransform=new THREE.Object3D();
  private readonly impacts: ImpactSystem;
  /** Pending world impacts for the next `impactFx` broadcast (7 numbers per hit). */
  private readonly impactQueue:number[]=[];
  private tactical?:Tactical;private throwableCounts=[1,1];private nextThrow=0;private nextSupply=0;
  private activated=false;private hostSuspended=false;private matchDeadline=0;
  private readonly projectiles=new ProjectilePool();
  private lastFrame=performance.now();private simulationNow=performance.now();private lastRender=0;private lastNames=0;
  private lastRemoteFrame = 0;
  private lastLeft=false;
  private burstRemaining=0;
  private fireModeIndex=0;
  private fireModeNoticeUntil=0;
  private triggerNeedsRelease=false;
  private get fireMode(){return this.weapon.fireModes[this.fireModeIndex];}
  private worldReady=false;private localLoaded=false;private readyPeers=new Set<string>();private readyResolve:()=>void=()=>{};
  private contextLost=false;private frameFailed=false;private lastReadyAt=0;
  private matchId:string;
  private shotSequence=0;private pendingShots:number[]=[];
  private inputSequence=0;private pendingInputs:InputCommand[]=[];
  private snapSequence=0;private lastSnapSequence=-1;private localSpawnSerial=0;
  private lastSelfTeleportSerial: number | undefined;
  private frameLimit=getSettings().frameLimit||Infinity;
  private rngState=1106;
  private random=()=>{let x=this.rngState;x^=x<<13;x^=x>>>17;x^=x<<5;this.rngState=x>>>0;return this.rngState/4294967296;};


  phase: GamePhase = 'prep';
  overlayOpen = false;
  prepSeconds: number;
  private prepDeadline = 0;
  armed = false;
  ammo = 30;
  reserve = 120;
  reloading = false;
  health = 100;
  private protectedUntil = 0;
  private lastDamageAt=-Infinity;
  hurtFlash = 0;
  /** 本地玩家被火焰烧脸的失明截止时刻（仿真时钟毫秒）。 */
  private burnBlindUntil = 0;
  /** 本轮致盲的起始时刻：续期只推结束时间，不重置淡入，避免火幕按 tick 闪烁。 */
  private burnBlindStart = 0;
  /** 火焰判定的复用点，避免每 tick 分配向量。 */
  private readonly flamePoint = new THREE.Vector3();
  paused = false;
  stuckTime = 0;
  score = 0;
  selection: LoadoutSelection = DEFAULT_LOADOUT;
  private weapon: WeaponCatalogEntry = getWeapon(DEFAULT_LOADOUT.weaponId)!;
  private stowedPrimary?:StowedPrimary;
  private readonly lootCrates:{id:string;weaponId:string;model:THREE.Mesh}[]=[];
  private damageFx!:VehicleDamageFx;
  private flameJet!:FlameJet;
  private nextFlameAt=0;
  private reloadEnd = 0;
  private nextFireAt = 0;
  private readonly fx: WorldFx[] = [];
  private readonly fxPool:WorldFx[]=[];
  private readonly labelSprites: THREE.Sprite[] = [];
  private hitmarkerUntil = 0;
  private bannerUntil = 0;
  private hudDirty = true;
  private lastHudAt = 0;
  private disposed = false;
  private lastPointerLock = false;

  private readonly net?: NetworkSession;
  private readonly isHost: boolean;
  readonly ready: Promise<void>;
  private readonly localNetId: string;
  private readonly remotes = new Map<string, RemoteAvatar>();
  private readonly bodies=new Map<string,Body>();
  private readonly magazineGeometry=makeDroppedMagazine();
  private readonly magazineMaterial=new THREE.MeshStandardMaterial({
    color:0xf9ce71,emissive:0x61401b,emissiveIntensity:.65,roughness:.65,
  });
  private nextAmmoPickup=0;
  private ammoPickup=0;
  private ammoPickupUntil=0;
  private readonly hosted = new Map<string, HostedGuest>();
  /** 大房（>=32/侧）共享的团队目标；不再每 Bot 全图选点/BFS。 */
  private readonly hordeObjectives = new Map<string,{id:string;until:number}>();
  private nextNetAt = 0;
  private readonly selfSnap = new THREE.Vector3();
  /**
   * Visual-only correction for guest self-prediction: after an authoritative
   * snapshot rebases the controller we keep the camera on the pre-snap pose by
   * accumulating the jump here, then decay it. Physics still uses the corrected
   * pose, so collisions/prediction stay authoritative while the screen does not
   * visibly rubber-band.
   */
  private readonly predictionOffset = new THREE.Vector3();
  private readonly reconciliationCameraPosition=new THREE.Vector3();
  private readonly reconciliationCameraRotation=new THREE.Euler();
  private lastReconciledInputSeq = -1;
  /** State after each input, compared only with the authority at that same input. */
  private readonly predictedAtSeq: PredictedMovement[] = [];
  private guestCount = 0;
  private readonly localName: string;
  private readonly scores = { blue: 0, orange: 0 };
  private killFeed: { text: string; team: NetTeam; at: number; kind: 'kill' | 'vehicle' }[] = [];
  private events: GameEvent[] = [];
  /** Per-client feed, delivered explicitly so a bot-kill burst cannot evict the
   * player's own kill/death from the next snapshot. */
  private personalEvents: GameEvent[] = [];
  private nextEventId = 1;
  private matchRemaining = DEFAULT_MATCH_SECONDS;
  private winner: '' | 'blue' | 'orange'|'draw' = '';
  private readonly caps: CapState[] = [];
  private readonly ferries: FerryRuntime[] = [];
  private ferrySystem?: FerrySystem;
  private dead = false;
  private respawnAt = 0;
  private respawnChoice = 'base';
  private blueSlots = 0;
  private orangeSlots = 0;
  private readonly localSpawn: THREE.Vector3;
  private myTeam: 'blue' | 'orange' = 'blue';
  private readonly teamSize: number;
  private readonly botsEnabled: boolean;
  /** 房间分配的固定阵营（peerId → blue/orange）；缺省的玩家沿用自动平衡。 */
  private readonly teamAssignments: Record<string, 'blue' | 'orange'>;
  /** 本局时长（秒）；main 按地图/房间设置通过 opts.matchSeconds 传入，arena.matchSeconds 兜底。 */
  private matchDurationSeconds = DEFAULT_MATCH_SECONDS;
  private selfSnapSeen = false;

  constructor(host: HTMLElement, callbacks: EngineCallbacks, opts: { net?: NetworkSession; bots?: boolean;name?:string;matchId?:string;terrain?:TerrainData;teamSize?:number;teams?:Record<string,'blue'|'orange'>;aiFill?:boolean;matchSeconds?:number } = {}) {
    this.host = host;
    this.callbacks = callbacks;
    this.net = opts.net;
    this.isHost = !opts.net || opts.net.role === 'host';
    this.localNetId = opts.net?.peerId || 'solo';
    this.localName = opts.net?.name || opts.name || 'PLAYER';
    this.matchId=opts.matchId??'solo';
    const params = new URLSearchParams(location.search);
    this.rngState=Number(params.get('seed'))||1106;
    this.teamSize = THREE.MathUtils.clamp(Math.floor(Number(opts.teamSize ?? params.get('size') ?? 8)), 4, 100);
    const urlBots = params.get('bots');
    // 房间的 AI 补位开关优先于 URL/旧 opts；缺省保持旧行为。
    this.botsEnabled = opts.aiFill !== undefined ? !!opts.aiFill : (urlBots === '0' ? false : urlBots === '1' ? true : (opts.bots ?? true));
    this.teamAssignments = { ...(opts.teams ?? {}) };
    const assignedTeam = this.teamAssignments[this.localNetId];
    this.myTeam = assignedTeam === 'blue' || assignedTeam === 'orange' ? assignedTeam : (this.random() < 0.5 ? 'blue' : 'orange');
    this.prepSeconds = Math.max(2, Number(params.get('prep') || 20));
    this.prepDeadline = 0;
    this.lite = params.get('lite') === '1';

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.presentation.setSamples(this.renderer,getSettings().msaa);
    this.applyRenderScale();
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.domElement.className = 'game-canvas';
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {e.preventDefault();this.contextLost=true;this.input?.release();this.callbacks.onError?.('图形设备连接中断。请重试本局或返回大厅。');});
    this.renderer.domElement.addEventListener('webglcontextrestored', () => {this.contextLost=false;this.frameFailed=true;this.callbacks.onError?.('图形设备已恢复，请重试以重新加载场景。');});
    this.nameplateLayer = document.createElement('div');
    this.nameplateLayer.className = 'nameplate-layer';
    host.appendChild(this.nameplateLayer);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#080c0f');
    this.scene.fog = new THREE.FogExp2('#0c1214', 0.008);
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.15, 700);
    this.scene.add(this.camera);
    const textureRes=textureResolution(params.get('res')??localStorage.getItem('crazyshoot.textureRes')); 
    const skyOverride = params.get('sky') || undefined;
    const mapId = params.get('map');
    const mapDef = mapId ? getMap(mapId) : undefined;
    this.arena = mapDef ? buildMapArena(mapDef, skyOverride ?? 'noon',textureRes,opts.terrain) : buildVoxelArena(textureRes, skyOverride, this.renderer);
    // 时长优先级：房间 start 消息（main 按地图/自定义传）> arena 映射 > 10 分钟兜底。
    this.renderer.toneMappingExposure = Number((this.arena as {exposure?:number}).exposure) || 1.24;
    this.matchDurationSeconds = Math.max(30, Number(opts.matchSeconds) || Number((this.arena as {matchSeconds?:number}).matchSeconds) || DEFAULT_MATCH_SECONDS);
    this.matchRemaining = this.matchDurationSeconds;
    // 千米级地图的视距由 arena 提供；旧三图没有该字段时保持 700。
    const viewDistance=this.arena.viewDistance;
    this.camera.far=Number.isFinite(viewDistance)?viewDistance!:700;
    this.camera.updateProjectionMatrix();

    this.scene.add(this.arena.scene);
    this.initFerries();
    this.impacts = new ImpactSystem(this.scene, { decal: loadBulletHoleTexture(), smoke: SMOKE_TEX });
    this.damageFx = new VehicleDamageFx(this.scene);
    this.flameJet = new FlameJet(this.scene);
    for(const crate of mapDef?.specialCrates??[]){
      const tint=crate.weaponId==='amr'?0x624d24:crate.weaponId==='rocket'?0x3d4632:0x54302a;
      const glow=crate.weaponId==='amr'?0xc68620:crate.weaponId==='rocket'?0x86d45c:0xff7a3d;
      const y=this.arena.navigationHeight?.(crate.x,crate.y)??0;
      const model=new THREE.Mesh(new THREE.BoxGeometry(1.35,.36,.53),new THREE.MeshLambertMaterial({color:tint,emissive:glow,emissiveIntensity:.38}));
      model.name=`loot-${crate.weaponId}`;
      model.position.set(crate.x,y+.18,crate.y);
      this.scene.add(model);
      this.lootCrates.push({id:crate.id,weaponId:crate.weaponId,model});
    }
    const sun=this.arena.scene.getObjectByName('battlefield-sun') as THREE.DirectionalLight|undefined;
    if(sun)this.sunDirection.copy(sun.position).normalize();
    if(sun&&!this.lite)this.sunShadows=new SunShadows(this.renderer,sun);
    this.arena.scene.traverse((o) => { if (o.userData?.labelLine) this.labelSprites.push(o as THREE.Sprite); });
    for (const v of this.arena.vehicles ?? []) {
      const spot=this.vehicleSpawn(v.kind,v.x,v.z,v.angle);
      this.buildVehicleState({id:v.id,kind:v.kind,team:v.team,x:spot.x,y:spot.y,z:spot.z,yaw:v.angle});
    }
    // 车位绑定：map-arena 给 arena.vehicles 的 id 就是稳定车位 id（`${vehicleId}-${i}`）。
    const arenaVehicles=this.arena.vehicles??[];
    const vehicleIds=new Set(arenaVehicles.map(v=>v.id));
    const arenaPads=this.arena.vehiclePads;
    // Lead 在 map-arena 里同时给了 vehiclePads/vehicles；只有 id 完全对得上才用它，
    // 否则退回 vehicles，保证「车位 id == 初始载具 id」这一绑定不被破坏。
    const padSource=arenaPads&&arenaPads.length===arenaVehicles.length&&arenaPads.every(p=>vehicleIds.has(p.id))
      ?arenaPads
      :arenaVehicles.map(v=>({id:v.id,kind:v.kind,team:v.team,x:v.x,z:v.z,angle:v.angle}));
    this.vehiclePadDefs=padSource.map(p=>({id:p.id,kind:p.kind,team:p.team,x:p.x,z:p.z,angle:p.angle}));
    this.initialVehicleIds=vehicleIds;
    if(this.isHost&&this.vehiclePadDefs.length&&(this.arena as {dynamicVehicleRespawn?:boolean}).dynamicVehicleRespawn){
      // 刷新管理器只做纯逻辑；净空检测由本引擎在 update 时提供。
      this.vehicleSpawnManager=new VehicleSpawnManager({
        pads:this.vehiclePadDefs,
        initial:this.vehiclePadDefs.map(p=>({id:p.id,kind:p.kind,team:p.team,padId:p.id,x:p.x,z:p.z})),
        destroyedDelayMs:(kind:string)=>(this.arena as {vehicleRespawnDelays?:Record<string,number>}).vehicleRespawnDelays?.[kind]??SPAWN_DEFAULTS.destroyedDelayMs,
      });
    }
    this.arena.playerBlocked=(x,z,r,feet,height=1.8,ignoreId)=>{
      if(this.arena.blockedAt?.(x,z,r,feet,height))return true;
      if(this.ferryRailBlocked(x,z,r,feet,height))return true;
      for(const v of this.vehicles){if(v.destroyed||Math.hypot(x-v.x,z-v.z)>6||feet+height<v.model.position.y||feet>v.model.position.y+4)continue;if(vehicleBlocks(v.model,x,z,r,feet,height))return true;}
      const overlaps=(id:string,p:THREE.Vector3,bodyHeight:number,dead:boolean,riding:boolean)=>id!==ignoreId&&!dead&&!riding&&feet<p.y+bodyHeight-.02&&feet+height>p.y+.02&&(x-p.x)**2+(z-p.z)**2<(r+.36)**2;
      if(this.controller&&overlaps(this.localNetId,this.controller.position,this.controller.bodyHeight,this.dead,!!this.drivingId))return true;
      if(this.isHost){for(const h of this.hosted.values())if(overlaps(h.id,h.controller.position,h.controller.bodyHeight,h.dead,!!h.vehicleId))return true;}
      else for(const a of this.remotes.values())if(overlaps(a.id,a.target,a.prone?.74:a.crouching?1.25:1.8,a.dead,!!a.vehicleId))return true;
      return false;
    };
    this.arena.platformAt=(x,z,maxY)=>{
      let best:{id:string;y:number;x:number;z:number;yaw:number;carry?:boolean;manualCarry?:boolean}|null=null;
      for(const v of this.vehicles){if(v.destroyed||Math.hypot(x-v.x,z-v.z)>6)continue;const top=vehicleSupport(v.model,x,z,maxY);if(Number.isFinite(top)&&(!best||top>best.y))best={id:v.id,y:top,x:v.x,z:v.z,yaw:v.yaw};}
      // The deck is a moving support over exactly the rendered footprint.
      for(const f of this.ferries){
        const p=f.visual.group.position;
        if(Math.abs(x-p.x)>f.cfg.deckLength/2||Math.abs(z-p.z)>f.cfg.deckWidth/2)continue;
        const y=f.cfg.deckY;
        if(y<=maxY+.01&&(!best||y>best.y))best={id:`ferry-${f.cfg.id}`,y,x:p.x,z:f.cfg.z,yaw:f.visual.group.rotation.y,manualCarry:true};
      }
      return best;
    };
    this.scene.background = this.arena.scene.background;
    this.scene.fog = this.arena.scene.fog;
    if(this.scene.fog instanceof THREE.FogExp2)this.fogDensity=this.scene.fog.density;
    this.applyLightingSettings();
    const rawSpawn = this.isHost ? this.teamSpawn(this.myTeam) : this.arena.spawn.clone();
    const safe = this.safeSpot(rawSpawn.x, rawSpawn.z);
    this.localSpawn = new THREE.Vector3(safe.x, this.arena.heightAt?.(safe.x,safe.z)??0, safe.z);
    const capDefs=(this.arena.capturePoints ?? [
      { id: 'A', x: -18, z: 20, r: 4.5 },
      { id: 'B', x: 0, z: 14, r: 4.5 },
      { id: 'C', x: 14, z: 14, r: 4.5 },
    ]).map(c=>({...c,floorY:c.floorY,verticalTolerance:c.verticalTolerance}));
    for (const cap of capDefs) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(cap.r-.1,cap.r+.1,64),
        new THREE.MeshBasicMaterial({ color: 0x8a9a96, transparent: true, opacity: 0.85 }),
      );
      const terrainY=this.arena.navigationHeight?.(cap.x,cap.z)??this.arena.heightAt?.(cap.x,cap.z)??0;
      const centerY=cap.floorY??terrainY;
      if(cap.floorY===undefined){
        // 旧图：圆环贴合坡面/桥面（脚下地面）。
        const vertices=ring.geometry.getAttribute('position');
        for(let i=0;i<vertices.count;i++){const x=cap.x+vertices.getX(i),z=cap.z-vertices.getY(i),h=this.arena.navigationHeight?.(x,z)??this.arena.heightAt?.(x,z)??0;vertices.setZ(i,h-centerY);}
        vertices.needsUpdate=true;ring.geometry.computeBoundingSphere();
      }
      // 室内据点（A/B）：圆环是平放在 floorY 上的固定平面，不跟随金字塔顶/上层廊道地形。
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(cap.x, centerY+0.08, cap.z);
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.16, 4, 8, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x8a9a96, transparent: true, opacity: 0.28, side: THREE.DoubleSide }),
      );
      beam.position.set(cap.x,ring.position.y+2,cap.z);
      this.scene.add(ring, beam);
      const footprint = (cap as {footprint?:{x0:number;z0:number;x1:number;z1:number}}).footprint;
      let footprintOutline: THREE.LineSegments | undefined;
      if (footprint) {
        const y = (cap.floorY ?? centerY) + 0.09;
        const pts = [
          new THREE.Vector3(footprint.x0, y, footprint.z0), new THREE.Vector3(footprint.x1, y, footprint.z0),
          new THREE.Vector3(footprint.x1, y, footprint.z0), new THREE.Vector3(footprint.x1, y, footprint.z1),
          new THREE.Vector3(footprint.x1, y, footprint.z1), new THREE.Vector3(footprint.x0, y, footprint.z1),
          new THREE.Vector3(footprint.x0, y, footprint.z1), new THREE.Vector3(footprint.x0, y, footprint.z0),
        ];
        footprintOutline = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xd8e24a, transparent: true, opacity: 0.9 }));
        footprintOutline.name = `cap-footprint-${cap.id}`;
        this.scene.add(footprintOutline);
      }
      this.caps.push({ id: cap.id, x: cap.x, z: cap.z, r: cap.r, owner: 'neutral', progress: 0, ring, beam, floorY:cap.floorY, verticalTolerance:cap.verticalTolerance, footprint, footprintOutline });
    }

    this.controller = new PlayerController(this.camera,this.localNetId);
    this.controller.teleport(this.localSpawn, this.spawnYawFor(this.myTeam));
    if (this.net && this.isHost) {
      for (const peer of this.net.peers) {
        if (peer.id === this.net.peerId) continue;
        this.addPlayer(peer.id, peer.name, this.assignedTeam(peer.id) ?? this.nextGuestTeam());
      }
      // AI 在 startLive 统一补位（先把真人随机分队）
    }
    this.viewmodel = new WeaponViewmodel(this.camera);
    this.viewmodel.setEquipped(false);
    this.equipWeapon(this.weapon);

    this.input = new Input(this.renderer.domElement);
    this.resizeHandler = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.applyRenderScale();
    };
    window.addEventListener('resize', this.resizeHandler);

    this.keyHandler = (e: KeyboardEvent) => {
      if(e.repeat)return;
      if(e.code==='Escape'||e.code==='KeyP'){
        if(this.mapOpen){this.mapOpen=false;this.input.lock();this.hudDirty=true;}
        else if(e.code==='Escape'&&this.overlayOpen&&!this.paused){e.preventDefault();this.closeOverlay();}
        else if(!this.paused){this.pauseLocal();}
        return;
      }
      if(this.paused||(!this.input.pointerLocked&&(e.target as HTMLElement)?.closest('input,textarea,select,button')))return;
      this.audio.unlock();
      if(e.code==='KeyG'||e.code==='KeyH'){if(this.input.pointerLocked&&!this.paused)this.throwItem(e.code==='KeyG'?0:1);return;}
      if(e.code==='BracketLeft'||e.code==='BracketRight'){this.viewmodel.adjustZoom(e.code==='BracketRight'?1:-1);return;}
      if(this.drivingId&&/^Digit[1-9]$/.test(e.code)){this.selectVehicleSeat(Number(e.code.slice(-1))-1);return;}
      if (e.code === 'KeyM') {
        e.preventDefault();
        if(!this.overlayOpen&&!this.winner){
          this.mapOpen=!this.mapOpen;
          if(this.mapOpen){this.input.release();document.exitPointerLock?.();}
          else this.input.lock();
          this.hudDirty=true;
        }
        return;
      }
      if(e.code==='KeyN'){this.audio.toggle();return;}
      if(this.mapOpen)return;
      if (e.code === 'KeyX') {
        if (this.overlayOpen) {
          e.preventDefault();
          this.closeOverlay();
        }
      } else if (e.code === 'Tab') {
        e.preventDefault();
        if (this.overlayOpen) this.closeOverlay();
        else if (this.phase === 'prep' || this.dead) this.openOverlay();
      } else if (e.code === 'KeyB') {
        e.preventDefault();
        // B is the single mode key: shell type on a vehicle cannon, fire mode on foot.
        const v=this.drivingId?this.vehicles.find(v=>v.id===this.drivingId):undefined;
        if(v){if(isCannon(v.weapons[this.vehicleSeat-1]?.id)){v.shell=v.shell==='ap'?'he':'ap';this.hudDirty=true;}}
        else this.switchFireMode();
      } else if (e.code === 'KeyE') {
        e.preventDefault();
        // Interaction wins over lean-right for this press only.
        if(this.interact())this.input.keys.delete('KeyE');
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        this.startReload();
      }
    };
    window.addEventListener('keydown', this.keyHandler);
    this.blurHandler = () => { this.input.release(); if(!this.overlayOpen&&!this.dead&&!this.winner)this.paused=true; this.hudDirty = true; };
    this.visibilityHandler = () => {
      if (document.hidden) { this.input.release(); if(!this.overlayOpen&&!this.dead&&!this.winner)this.paused=true; }
      this.hudDirty = true;
    };
    this.lockHandler = () => {
      if (this.input.pointerLocked) this.paused = false;
      else {
        this.input.clear();
        if(!this.overlayOpen&&!this.dead&&!this.winner&&!this.mapOpen)this.paused=true;
      }
      this.hudDirty = true;
    };
    window.addEventListener('blur', this.blurHandler);
    document.addEventListener('visibilitychange', this.visibilityHandler);
    document.addEventListener('pointerlockchange', this.lockHandler);
    document.addEventListener('webkitpointerlockchange', this.lockHandler);

    this.ammo = this.weapon.magazine;
    this.reserve = this.weapon.reserve;
    this.ready=this.initialize();
  }

  private async initialize(){
    this.callbacks.onLoading?.({percent:75,stage:'地图、碰撞与必要资源',completed:0,total:1});
    await (this.arena.ready??Promise.resolve());
    if(this.disposed)return;
    if(this.isHost){this.navigation=new Navigation(this.arena);this.localNavigation=new LocalNavigation(this.arena);for(const c of this.caps)this.navigation.reachable(this.localSpawn.x,this.localSpawn.z,c.x,c.z);if(this.botsEnabled)this.fillBots();}
    this.callbacks.onLoading?.({percent:85,stage:'角色、武器与图形预热',completed:0,total:1});
    this.controller.update(0,this.input,this.arena,false,false);
    this.scene.updateMatrixWorld(true);
    if(!this.lite){await this.renderer.compileAsync(this.scene,this.camera);await this.renderer.compileAsync(this.viewmodel.scene,this.viewmodel.camera);this.renderFrame(performance.now());}
    if(this.disposed)return;
    this.shadows=new ContactShadows(this.scene);this.shadows.mesh.visible=lightingPreset(this.effectiveLighting).contactShadows;
    this.tactical=new Tactical(this.scene);
    this.cinematicShadows?.registerModel(this.scene);
    if(this.effectiveLighting==='ultra')this.activateCinematic();
    this.projectileMesh=new THREE.InstancedMesh(new THREE.BoxGeometry(.036,.036,1),new THREE.MeshBasicMaterial({color:0xe7c5a0,transparent:true,opacity:.68,depthWrite:false}),512);this.projectileMesh.frustumCulled=false;this.projectileMesh.count=0;this.scene.add(this.projectileMesh);
    this.localLoaded=true;
    const barrier=new Promise<void>(resolve=>{this.readyResolve=resolve;});
    this.tryReady();this.lastFrame=performance.now();this.clock.start();this.loop();
    await barrier;
  }

  private tryReady(){
    if(!this.localLoaded||this.worldReady||!this.isHost)return;
    const waiting=[...this.hosted.values()].filter(h=>!h.bot&&!this.readyPeers.has(h.id));
    if(waiting.length){this.callbacks.onLoading?.({percent:99,stage:`等待玩家加载：${waiting.map(h=>h.name).join('、')}`,completed:this.readyPeers.size,total:this.hosted.size});return;}
    this.beginPrep(this.prepSeconds);
  }
  private tacticalOrtho?: HTMLCanvasElement;
  private auditCamera?: {x:number;y:number;z:number;yaw:number;pitch:number};
  private readonly simCostSamples:number[]=[];
  /** 正交实景缩略图的收敛调色板：保留水/路/草/屋顶/沙/石的区分，去掉材质变体造成的混色噪点。 */
  private static readonly TACTICAL_COLORS = [
    [30,88,98],[48,112,118],[52,56,58],[82,85,86],
    [68,96,54],[92,116,64],[184,158,108],[204,181,136],
    [178,170,152],[210,201,182],[146,111,82],[158,99,78],
    [92,108,122],[108,112,112],[202,196,184],[40,42,43],
    [125,108,86],[166,146,116],
  ] as const;

  /** 用真实静态世界做一次俯视正交、按方块材料平涂的缩略图。 */
  private buildTacticalOrtho(){
    if(this.tacticalOrtho)return;
    const size=this.arena.worldSize??300;
    const res=size>=800?2048:1024;
    const rt=new THREE.WebGLRenderTarget(res,res,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,format:THREE.RGBAFormat,type:THREE.UnsignedByteType});
    const cam=new THREE.OrthographicCamera(-size/2,size/2,size/2,-size/2,.1,size*3);
    cam.position.set(size/2,size+200,size/2);cam.up.set(0,0,-1);cam.lookAt(size/2,0,size/2);
    const scene=this.arena.scene,prev=this.renderer.getRenderTarget(),bg=scene.background,fog=scene.fog;
    const shadow=this.renderer.shadowMap.enabled;
    // 160 色材料表：按方块 id 平涂，不采样贴图/光照，避免正交图上出现一堆材质噪点。
    const hex=(h:number)=>new THREE.Vector3(((h>>16)&255)/255,((h>>8)&255)/255,(h&255)/255);
    const pal=Array.from({length:160},()=>hex(this.arena.mapId==='garden'?0x6f8b4b:this.arena.mapId==='docks'?0x8c8d86:this.arena.mapId==='airfield'?0x8b8763:0xb99a63));
    const set=(ids:number[],h:number)=>{const c=hex(h);for(const id of ids)if(id>=0&&id<160)pal[id]=c;};
    set([16,64,65,66,98],0x246c78);set([4,15,47,48,49,52,79,100,119,120],0x3b4044);
    set([1,9,19,20,21,39,40,95,96,116,118],this.arena.mapId==='airfield'?0x777446:0x5f7f43);
    set([3,27,28,58,59,60,80,81,82,106,107,108,109],0xc8c0ad);
    set([12,26,72,73,74,75,76,77,78,102,103,104,105,117],this.arena.mapId==='docks'?0xb6b0a4:0xc4a46a);
    set([18,31,32,84,88,89,112,113],0xd8d0bd);
    set([6,33,34,87,92,110,111],0x9a7652);set([13,44,45,46],0x9e654f);
    set([2,17,25,61,62,63,7,37],0xa8885f);
    set([5,29,30,35,36,51,53,54,55,99,101,121],0x9a9a90);
    set([10,14,41,42,43,55,67,83,90,91,93,94],0x7a8282);
    if(this.arena.mapId==='miao_village'){
      set([122,123,124,125,126,150,151],0x7a4a2d);       // timber / wicker / ceramic
      set([127,128,129],0x6b6d68);                        // roof tile
      set([130,131,132,133,134,148,149],0x8d908a);        // stone / paving / plaster
      set([135],0x2f6666);                                // river jade
      set([136,137],0x7d6648);                            // earth / mud
      set([138,139,140,141,142,143,144,145,146],0x55743f);// vegetation / rice / bamboo / maple
      set([147],0x8f7b4d);                                // thatch
      set([152],0x283c57);set([153],0x7a2e34);            // indigo / madder
    }
    const flat=new THREE.ShaderMaterial({toneMapped:false,depthTest:true,depthWrite:true,
      uniforms:{palette:{value:pal}},
      vertexShader:`attribute float voxelBlock; varying float vB; void main(){vB=voxelBlock;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`uniform vec3 palette[160];varying float vB;void main(){int i=int(vB+0.5);if(i<0)i=0;if(i>159)i=159;gl_FragColor=vec4(palette[i],1.0);}`});
    const swapped:{mesh:THREE.Mesh;material:THREE.Material|THREE.Material[]}[]=[];
    scene.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh&&(m.geometry as THREE.BufferGeometry)?.attributes?.voxelBlock){swapped.push({mesh:m,material:m.material});m.material=flat;}});
    scene.background=null;scene.fog=null;this.renderer.shadowMap.enabled=false;
    try{
      this.renderer.setRenderTarget(rt);this.renderer.clear();this.renderer.render(scene,cam);
      const px=new Uint8Array(res*res*4);this.renderer.readRenderTargetPixels(rt,0,0,res,res,px);
      const cv=document.createElement('canvas');cv.width=cv.height=res;const ctx=cv.getContext('2d')!;const img=ctx.createImageData(res,res);
      for(let y=0;y<res;y++){const src=(res-1-y)*res*4,dst=y*res*4;for(let i=0;i<res*4;i+=4){img.data[dst+i]=px[src+i];img.data[dst+i+1]=px[src+i+1];img.data[dst+i+2]=px[src+i+2];img.data[dst+i+3]=255;}}
      ctx.putImageData(img,0,0);this.tacticalOrtho=cv;
    }catch{/* fallback 到材料底图 */}
    for(const s of swapped)s.mesh.material=s.material;
    this.renderer.shadowMap.enabled=shadow;this.renderer.setRenderTarget(prev);scene.background=bg;scene.fog=fog;rt.dispose();flat.dispose();
  }
  private beginPrep(seconds:number){if(this.worldReady)return;this.worldReady=true;this.buildTacticalOrtho();this.prepSeconds=seconds;this.simulationNow=performance.now();this.prepDeadline=this.simulationNow+seconds*1000;this.readyResolve();this.hudDirty=true;}


  activate(){this.activated=true;this.clock.start();}
  pauseAfterFullscreenExit(){if(this.input.pointerLocked)this.pauseLocal();}
  pauseLocal(){this.mapOpen=false;this.input.release();this.paused=true;this.hudDirty=true;this.presentation.requestMotionReset();}
  resumeLocal(){
    this.presentation.requestMotionReset();
    this.input.clear();
    if(this.dead||this.winner||this.overlayOpen)this.paused=false;
    else {
      if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
      this.input.lock();
    }
    this.hudDirty=true;
  }
  applyGraphics(){
    this.presentation.setSamples(this.renderer,getSettings().msaa);
    this.applyRenderScale();
    this.applyLightingSettings();
  }

  private applyLightingSettings(){
    const settings=getSettings();
    // 五张正式图统一去掉太阳/接触阴影：远景更干净，也避免阴影影响 M 图辨识。
    const wanted=settings.lightingQuality;
    const ultraActive=this.presentation.setCinematic(this.renderer,wanted==='ultra'&&!this.lite);
    const effective:LightingQuality=wanted==='ultra'?(ultraActive?'ultra':'high'):wanted;
    this.effectiveLighting=effective;
    this.lightingStatusText=wanted==='ultra'&&!ultraActive?'当前设备不支持 HDR，极致已回退到高':'';
    const preset=lightingPreset(effective);
    if(preset.cinematic){
      this.sunShadows?.setQuality('off');
      this.activateCinematic();
    }else{
      this.deactivateCinematic();
      this.sunShadows?.setQuality(preset.sunShadows);
    }
    this.presentation.setGlow(this.renderer,preset.glow);
    const voxels=this.arena.scene.getObjectByName('minecraft-voxel-world');
    voxels?.userData.setAmbientOcclusion?.(preset.ambientOcclusion,preset.ambientOcclusionScale);
    this.nextWeaponLightSample=0;
    if(this.scene.fog instanceof THREE.FogExp2)this.scene.fog.density=this.fogDensity*preset.fogScale;
    const contacts=this.arena.scene.getObjectByName('battlefield-contact-shadows');
    if(contacts)contacts.visible=preset.contactShadows;
    if(this.shadows)this.shadows.mesh.visible=preset.contactShadows;
  }

  private activateCinematic(){
    if(!this.cinematicShadows){
      const sun=this.arena.scene.getObjectByName('battlefield-sun') as THREE.DirectionalLight|undefined;
      if(sun){
        this.sunRadiance.copy(sun.color).multiplyScalar(sun.intensity);
        this.cinematicShadows=new CinematicShadows(this.renderer,this.scene,this.camera,sun,this.sunDirection);
        this.cinematicShadows.registerMaterial(this.magazineMaterial);
        this.cinematicShadows.registerMaterial(WRECK_MATERIAL);
      }
    }
    if(!this.viewmodel)return;
    if(!this.cinematicLighting)this.cinematicLighting=new CinematicLighting(this.renderer,this.scene,this.viewmodel.scene);
    this.cinematicLighting.enable();
    this.presentation.requestMotionReset();
  }

  private deactivateCinematic(){
    this.cinematicShadows?.dispose();
    this.cinematicShadows=undefined;
    this.cinematicLighting?.disable();
    this.presentation.requestMotionReset();
  }

  private registerShadowModel(root:THREE.Object3D){
    setSunShadowModel(root);
    this.cinematicShadows?.registerModel(root);
  }

  get lightingStatus(){return this.lightingStatusText;}
  lightingDebug(){
    return {quality:getSettings().lightingQuality,effective:this.effectiveLighting,status:this.lightingStatusText,csm:!!this.cinematicShadows,...this.presentation.lightingDebugState()};
  }

  async setTextureResolution(res:32|64|128){await this.arena.setTextureResolution?.(res);this.cinematicShadows?.registerModel(this.arena.scene);this.presentation.cinematicPipeline?.refreshWaterTextures(this.scene);}
  reloadBindings(){this.input.reloadBindings();}

  setLoadout(selection: LoadoutSelection) {
    if(this.phase==='live'&&!this.dead)return;
    const weapon=getWeapon(selection.weaponId);
    if(!weapon||weapon.id==='amr')return;
    this.selection = selection;
    if(this.net&&!this.isHost)this.net.send({t:'loadout',matchId:this.matchId,selection});
    this.equipWeapon(weapon);
    if (this.phase === 'prep') {
      this.ammo = this.weapon.magazine;
      this.reserve = this.weapon.reserve;
    }
    this.hudDirty = true;
  }

  private equipWeapon(weapon:WeaponCatalogEntry){
    this.weaponRecoil.reset();this.recoilPitch=0;this.recoilYaw=0;
    if(weapon.id!==this.weapon.id){
      this.fireModeIndex=0;this.fireModeNoticeUntil=0;this.burstRemaining=0;
    }
    this.weapon=weapon;
    this.viewmodel.setWeapon(weapon.id,this.selection.opticId);
  }

  setRespawnPoint(id: string) {
    if (!this.dead) return;
    if (!this.availableRespawns(this.myTeam).some((p) => p.id === id)) return;
    this.respawnChoice = id;
    if (this.net && !this.isHost) this.net.send({ t: 'respawn',matchId:this.matchId, id });
    this.hudDirty = true;
  }

  respawnNow() {
    if (!this.dead || this.overlayOpen || this.simulationNow < this.respawnAt) return;
    if (this.net && !this.isHost) {
      this.net.send({ t: 'respawnNow',matchId:this.matchId });
      return;
    }
    this.respawnLocal();
  }

  private availableRespawns(team: 'blue' | 'orange') {
    const list: { id: string; label: string; x: number; z: number }[] = [];
    const base = this.arena.teamSpawns?.[team];
    const rawX = base ? base.x : this.arena.spawn.x + (team === 'blue' ? -3.2 : 3.2);
    const rawZ = base ? base.z : this.arena.spawn.z;
    const spot = this.safeSpot(rawX, rawZ);
    list.push({ id: 'base', label: '大本营', x: spot.x, z: spot.z });
    for (const c of this.caps) {
      if (c.owner === team&&Math.abs(c.progress)>.99&&!this.enemyNear(team,c.x,c.z,c.r)) list.push({ id: c.id, label: `${c.id} 点`, x: c.x, z: c.z });
    }
    return list;
  }

  private enemyNear(team:NetTeam,x:number,z:number,radius:number){if(!this.dead&&this.myTeam!==team&&Math.hypot(this.controller.position.x-x,this.controller.position.z-z)<radius)return true;for(const h of this.hosted.values())if(!h.dead&&h.team!==team&&Math.hypot(h.controller.position.x-x,h.controller.position.z-z)<radius)return true;return false;}
  private deploymentSpot(team:NetTeam,x:number,z:number){let best=this.safeSpot(x,z),score=-Infinity;for(let i=0;i<24;i++){const a=i*Math.PI*2/12,r=Math.floor(i/12)*4,px=x+Math.cos(a)*r,pz=z+Math.sin(a)*r,h=this.arena.navigationHeight?.(px,pz)??this.arena.heightAt?.(px,pz)??0;if(!this.insideArenaBounds(px,pz)||this.arena.playerBlocked?.(px,pz,.45,h)||this.arena.waterAt?.(px,pz))continue;let value=-Math.hypot(px-x,pz-z)*.1;for(const e of [{team:this.myTeam,controller:this.controller,dead:this.dead},...this.hosted.values()]){if(e.dead||e.team===team)continue;const d=e.controller.position.distanceTo(new THREE.Vector3(px,h,pz));value+=Math.min(30,d)*.1;if(d<12)value-=100;if(d<100&&!this.arena.lineBlocked?.(new THREE.Vector3(px,h+1.5,pz),e.controller.position.clone().add(new THREE.Vector3(0,1.5,0))))value-=20;}if(value>score){score=value;best={x:px,z:pz};}}return best;}

  private resolveRespawnChoice(team: 'blue' | 'orange') {
    const options = this.availableRespawns(team);
    if (options.some((p) => p.id === this.respawnChoice)) return this.respawnChoice;
    let best = options[0];
    let bestD = Infinity;
    for (const p of options) {
      const d = Math.hypot(p.x - this.controller.position.x, p.z - this.controller.position.z);
      if (d < bestD) { bestD = d; best = p; }
    }
    this.respawnChoice = best.id;
    return best.id;
  }

  private respawnLocal() {
    const id = this.resolveRespawnChoice(this.myTeam);
    const p = this.availableRespawns(this.myTeam).find((o) => o.id === id) ?? this.availableRespawns(this.myTeam)[0];
    this.dead = false;
    this.throwableCounts=[1,1];this.localSpawnSerial++;
    this.ads=false;this.input.clear();this.nextFireAt=0;
    this.paused = false;
    this.health = 100;
    this.protectedUntil = this.simulationNow + RESPAWN_PROTECTION_MS;
    this.burnBlindUntil = 0;
    this.burnBlindStart = 0;
    this.weaponRecoil.reset();this.recoilPitch = 0; this.recoilYaw = 0;
    this.overlayOpen = false;
    this.ammo = this.weapon.magazine;
    this.reserve = this.weapon.reserve;
    this.armed = true;
    this.reloading = false;
    const jitter=this.deploymentSpot(this.myTeam,p.x,p.z);
    this.controller.teleport(new THREE.Vector3(jitter.x,this.arena.navigationHeight?.(jitter.x,jitter.z)??this.arena.heightAt?.(jitter.x,jitter.z)??0,jitter.z), p.id === 'base' ? this.spawnYawFor(this.myTeam) : Math.atan2(-((this.arena.worldSize ?? 64) / 2 - p.x), -((this.arena.worldSize ?? 64) / 2 - p.z)));
    this.viewmodel.setEquipped(true);
    this.hudDirty = true;
  }

  forceStart() {
    if (this.phase !== 'prep'||!this.worldReady||!this.isHost) return;
    this.prepSeconds = 0;
    this.prepDeadline = 0;
    this.overlayOpen = false;
    this.startLive();
  }

  closeOverlay() {
    if (!this.overlayOpen) return;
    this.overlayOpen = false;
    this.net?.send({t:'loadoutOpen',matchId:this.matchId,open:false});
    this.hudDirty = true;
  }

  openOverlay() {
    if (this.overlayOpen) return;
    if (this.phase !== 'prep' && !this.dead) return;
    this.overlayOpen = true;
    this.net?.send({t:'loadoutOpen',matchId:this.matchId,open:true});
    this.input.release();
    this.hudDirty = true;
  }

  private fillBots() {
    let blue = (this.myTeam === 'blue' ? 1 : 0) + [...this.hosted.values()].filter((h) => h.team === 'blue').length;
    let orange = (this.myTeam === 'orange' ? 1 : 0) + [...this.hosted.values()].filter((h) => h.team === 'orange').length;
    let bi = 1;
    let oi = 1;
    while (blue < this.teamSize) { while(this.hosted.has(`bot-blue-${bi}`))bi++;this.addPlayer(`bot-blue-${bi}`, `BOT-BLUE-${bi}`, 'blue', true); blue++; bi++; }
    while (orange < this.teamSize) { while(this.hosted.has(`bot-orange-${oi}`))oi++;this.addPlayer(`bot-orange-${oi}`, `BOT-ORANGE-${oi}`, 'orange', true); orange++; oi++; }
    this.assignTeamLoadouts('blue');
    this.assignTeamLoadouts('orange');
  }

  /** Give every bot on a team a role-appropriate weapon instead of one shared rifle. */
  private assignTeamLoadouts(team:'blue'|'orange'){
    const bots=[...this.hosted.values()].filter(h=>h.bot&&h.team===team);
    if(!bots.length)return;
    const plan=teamLoadoutPlan(bots.length,()=>this.random());
    bots.forEach((h,index)=>this.applyBotLoadout(h,plan[index]));
  }

  private applyBotLoadout(h:HostedGuest,loadout:BotLoadout){
    h.botRole=loadout.role;
    const hash=[...h.id].reduce((a,c)=>a+c.charCodeAt(0),0);
    h.botFlank=(loadout.role==='rifle'||loadout.role==='smg')&&hash%3===0?(hash%2?1:-1):undefined;
    h.selection=loadoutSelection(loadout);
    const weapon=getWeapon(loadout.weaponId);
    h.ammo=weapon?.magazine??30;h.reserve=weapon?.reserve??120;h.reloadEnd=0;
  }

  /** Respawn re-equips bots toward whatever the team is missing right now. */
  private botRespawnLoadout(h:HostedGuest,now:number){
    const teammates=[...this.hosted.values()].filter(o=>o.bot&&o.team===h.team&&o!==h&&!o.dead).map(o=>o.botRole??'rifle');
    let longPressure=false,dominatingLongRange=false;
    for(const [id,threat] of this.threats){
      if(!this.threatIsFoe(h,id))continue;
      const age=now-threat.at;
      if(threat.weight>=2&&age<25000)longPressure=true;
      if(threat.longRange&&threat.weight>=4&&age<30000)dominatingLongRange=true;
    }
    const role=chooseRespawnRole(h.botRole??'rifle',teammates,this.teamSize,longPressure,()=>this.random(),dominatingLongRange);
    this.applyBotLoadout(h,pickBotLoadout(role,()=>this.random()));
  }

  private observeBotTarget(h:HostedGuest,id:string,point:THREE.Vector3,now:number){
    if(h.targetId!==id||now-h.lastSeen>300){
      h.nextBotFire=Math.max(h.nextBotFire,now+botReactionMs(h.botRole??'rifle',()=>this.random()));
      h.nextAimSample=0;h.targetAcquiredAt=now;h.aimVelocity=undefined;
      h.burstShots=0;
      h.engagementShots=0;
    }
    h.targetId=id;
    h.lastSeen=now;
    h.lastKnown.copy(point);
    // Track recent observations, leaving time for the target to change speed or direction.
    const riding=id===this.localNetId?this.drivingId:this.hosted.get(id)?.vehicleId;
    const armored=!!riding&&enclosedVehicle(this.vehicles.find(v=>v.id===riding)?.kind??'jeep');
    h.lastObservedArmored=armored;
    const vehicle=armored?this.vehicles.find(v=>v.id===riding):undefined;
    this.tacticalMemory.observe(h.team,vehicle?'vehicle:'+vehicle.id:id,vehicle?{x:vehicle.x,y:vehicle.model.position.y+vehicleSize(vehicle.kind).h*.5,z:vehicle.z}:point,armored,now);
    if(now>=h.nextAimSample){
      const elapsed=(now-(h.aimObservedAt??now))/1000;
      if(elapsed>.05&&elapsed<.8){
        const old=h.aimVelocity??{x:0,y:0,z:0};
        h.aimVelocity={x:old.x*.35+THREE.MathUtils.clamp((point.x-h.aimSample.x)/elapsed,-12,12)*.65,y:old.y*.35+THREE.MathUtils.clamp((point.y-h.aimSample.y)/elapsed,-8,8)*.65,z:old.z*.35+THREE.MathUtils.clamp((point.z-h.aimSample.z)/elapsed,-12,12)*.65};
      }
      h.aimSample.copy(point);h.aimObservedAt=now;
      h.nextAimSample=now+215;
    }
  }

  private botObjective(h:HostedGuest,hash:number,now:number){
    if(!this.navigation)return;
    // 100v100：每队共享一个目标，最多每 8 s 重新评估一次；不再给每个 Bot
    // 跑 7 个据点的 routeSteps + 队友统计 + 流场。
    if(this.teamSize>=32){
      // 每队拆 3 个进攻组，避免 100 人挤同一条流场/同一个据点。
      const group=hash%3, key=h.team+':'+group;
      const cached=this.hordeObjectives.get(key);
      const cachedCap=cached?this.caps.find(c=>c.id===cached.id):undefined;
      if(cached&&cachedCap&&now<cached.until){if(h.objective!==cachedCap.id){h.objective=cachedCap.id;this.localNavigation.forget(h.id);}return cachedCap;}
      const base=this.arena.teamSpawns?.[h.team];
      const assignments=[];
      for(let i=0;i<3;i++){const order=this.hordeObjectives.get(h.team+':'+i);if(order)assignments.push({id:h.team+':'+i,team:h.team,objective:order.id,active:true});}
      const situations=new Map<string,ObjectiveSituation>();
      for(const cap of this.caps){
        let enemies=0,armor=0;
        for(const contact of this.tacticalMemory.contacts(h.team))if(now-contact.at<7000&&Math.hypot(contact.x-cap.x,contact.z-cap.z)<36){const certainty=1-(now-contact.at)/7000;enemies+=certainty;if(contact.armor)armor+=certainty;}
        situations.set(cap.id,{enemies,armor,support:0,danger:this.battleDanger.penalty(h.team,cap.x,cap.z,now),blocked:false});
      }
      const chosen=decideArmoredObjective(h.team,{x:base?.x??h.controller.position.x,z:base?.z??h.controller.position.z},this.caps,assignments,key,this.arena.teamSpawns?.[h.team==='blue'?'orange':'blue'],{kind:'infantry',now,ownBase:base,situations,assignmentWeight:42});
      const best=this.caps.find(c=>c.id===chosen?.objective.id)??this.caps[0];
      this.hordeObjectives.set(key,{id:best.id,until:now+9000+hash%2000});
      if(h.objective!==best.id){h.objective=best.id;this.localNavigation.forget(h.id);}
      return best;
    }
    const current=this.caps.find(c=>c.id===h.objective);
    if(current&&now<h.objectiveUntil)return current;
    const pos=h.controller.position;
    let best:typeof current,bestScore=Infinity;
    for(let i=0;i<this.caps.length;i++){
      const cap=this.caps[i];
      const steps=this.navigation.routeSteps(pos.x,pos.z,cap.x,cap.z,pos.y,
        this.arena.navigationHeight?.(cap.x,cap.z)??0);
      let teammates=0;
      for(const ally of this.hosted.values()){
        if(ally!==h&&ally.bot&&!ally.dead&&!ally.vehicleId&&ally.team===h.team&&ally.objective===cap.id)teammates++;
      }
      if(!Number.isFinite(steps))continue;
      const entry=this.navigation.next(pos.x,pos.z,cap.x,cap.z,pos.y);
      const pressure=entry?this.botRoutePenalty(h,entry,now):0;
      const blocked=h.blockedObjective?.id===cap.id&&now<h.blockedObjective.until;
      let observed=0;for(const contact of this.tacticalMemory.contacts(h.team))if(now-contact.at<7000&&Math.hypot(contact.x-cap.x,contact.z-cap.z)<32)observed+=(1-(now-contact.at)/7000)*(contact.armor?1.5:1);
      const friendly=cap.owner===h.team,defender=(h.botRole==='lmg'||h.botRole==='sniper'||h.botRole==='marksman');
      const securedCost=friendly?(teammates<2?14:32)-(defender?8:0):0;
      const response=friendly?Math.min(60,observed*18):Math.min(24,observed*6);
      const outmatched=friendly?0:Math.max(0,observed-teammates-1)*10;
      const score=steps*.65+teammates*18+pressure*2+securedCost-response+outmatched+(blocked?36:0)+((i+hash)%this.caps.length)*2;
      if(score<bestScore){best=cap;bestScore=score;}
    }
    // A coarse navigation cell can be missing at a narrow spawn exit. Keep a
    // real objective so local collision-aware recovery can leave that cell.
    if(!best)best=[...this.caps].sort((a,b)=>Math.hypot(a.x-pos.x,a.z-pos.z)+(a.owner===h.team?40:0)-Math.hypot(b.x-pos.x,b.z-pos.z)-(b.owner===h.team?40:0))[0];
    if(h.objective!==best?.id)this.localNavigation.forget(h.id);
    h.objective=best?.id??'';
    h.objectiveUntil=now+9000+hash%5*900;
    return best;
  }

  /** threats 表按开枪者 id 记全局（敌我都有），取威胁时必须按当前 bot 的队伍过滤。 */
  private threatIsFoe(h:HostedGuest,id:string){
    const team=id===this.localNetId?this.myTeam:this.hosted.get(id)?.team;
    return !!team&&team!==h.team;
  }

  private botRoutePenalty(h:HostedGuest,waypoint:Waypoint,now:number){
    const near=(x:number,y:number,z:number,radius:number)=>
      Math.abs((waypoint.y??y)-y)<2&&Math.hypot(waypoint.x-x,waypoint.z-z)<radius;
    let penalty=this.battleDanger.penalty(h.team,waypoint.x,waypoint.z,now);
    for(const ally of this.hosted.values()){
      if(ally===h||ally.dead||ally.vehicleId||ally.team!==h.team)continue;
      const p=ally.controller.position,route=ally.routeWaypoint;
      if(near(p.x,p.y,p.z,3.2))penalty+=2;
      if(route&&near(route.x,route.y??p.y,route.z,2.2))penalty+=2.5;
    }
    for(const body of this.bodies.values()){
      const age=now-body.start,p=body.origin;
      if(body.rig.team===h.team&&age<9000&&near(p.x,p.y,p.z,8))penalty+=5*(1-age/9000);
    }
    // 金字塔上层/北栈道对非 A 目标是死路：Bot 不应为了抄近路爬台坎/栈道再卡在扶手。
    if(h.objective!=='A'&&(waypoint.y??0)>14&&waypoint.x>255&&waypoint.x<405&&waypoint.z>610&&waypoint.z<775)penalty+=45;
    // 被狙的火线/暴露点要绕开：威胁眼位到候选点胸口有视线就加分（有威胁时才做射线）。
    if(this.threats.size){
      const sight=Math.min(botSightRange(h.botRole??'rifle'),this.weaponAmmo(getWeapon(h.selection.weaponId)!).maxRange);
      if(now-this.botLosAt>700){this.botLosAt=now;this.botLosCache.clear();this.botLosBudget=48;}
      const pointEye=new THREE.Vector3(waypoint.x,(waypoint.y??h.controller.position.y)+1.2,waypoint.z);
      const pointKey=`${waypoint.x.toFixed(1)}|${pointEye.y.toFixed(1)}|${waypoint.z.toFixed(1)}`;
      for(const [id,threat] of this.threats){
        if(!this.threatIsFoe(h,id))continue;
        if(threat.weight<2||now-threat.at>=25000)continue;
        if(Math.hypot(threat.x-pointEye.x,threat.z-pointEye.z)>sight)continue;
        const key=`${id}|${pointKey}`;
        let exposed=this.botLosCache.get(key);
        if(exposed===undefined){
          if(this.botLosBudget<=0)continue;
          this.botLosBudget--;
          exposed=!this.sightBlocked(new THREE.Vector3(threat.x,threat.y+1.5,threat.z),pointEye);
          this.botLosCache.set(key,exposed);
        }
        if(exposed)penalty+=threat.longRange?6:4;
      }
    }
    return penalty;
  }

  private moveBotAcrossWater(h:HostedGuest,x:number,z:number,keys:string[]){
    const pos=h.controller.position,dx=x-pos.x,dz=z-pos.z;
    h.yaw=Math.atan2(-dx,-dz);
    h.pitch=0;
    h.input.setKeys(keys);
    h.input.worldMove={x:dx,z:dz};
    h.routeWaypoint=undefined;
  }

  private botWaterMovement(h:HostedGuest,now:number){
    if(h.vehicleId)return false;
    const pos=h.controller.position,water=this.arena.waterAt?.(pos.x,pos.z,pos.y);
    const wet=water&&pos.y<water.surface-.015;
    const deep=!!wet&&water.surface-water.bottom>=SWIM_DEPTH;
    if(h.waterCross?.committed&&now<h.waterCross.until&&!wet){
      const cross=h.waterCross;
      // A swimmer can momentarily rise above the surface on the near bank.
      // That is not completion; keep the crossing until the far bank is reached.
      if(!cross.entered||cross.direction*(pos.z-150)<=5){
        this.moveBotAcrossWater(h,cross.x,cross.entered?cross.farZ:cross.entryZ,['KeyW','ShiftLeft']);
        return true;
      }
    }
    if(h.waterEntry&&now<h.waterEntry.until&&!deep){
      this.moveBotAcrossWater(h,h.waterEntry.x,h.waterEntry.z,['KeyW','ShiftLeft']);
      return true;
    }
    if(!wet&&water&&h.waterCross?.entered&&now<h.waterCross.until){
      const cross=h.waterCross,exit=cross.direction*(pos.z-150)>5?this.arena.waterExitAt?.(pos.x,pos.z):null;
      this.moveBotAcrossWater(h,exit?.x??cross.x,exit?.z??cross.farZ,['KeyW','ShiftLeft','Space']);
      return true;
    }
    if(wet){
      const cross=h.waterCross;
      if(cross&&now<cross.until){
        cross.entered=true;
        // Swim toward the opposite bank first; the generic exit field always
        // points to the nearest bank and would turn us straight back.
        const pastMiddle=cross.direction*(pos.z-150)>5;
        const exit=pastMiddle?this.arena.waterExitAt?.(pos.x,pos.z):null;
        const dive=deep&&!pastMiddle&&now<(h.waterDiveUntil??0);
        this.moveBotAcrossWater(h,exit?.x??cross.x,exit?.z??cross.farZ,['KeyW','ShiftLeft',dive?'AltLeft':'Space']);
        return true;
      }
      if(deep&&h.waterEntry&&now<h.waterEntry.until)h.waterDiveUntil=now+700;
      h.waterEntry=undefined;
      h.detour=undefined;
      h.targetId=null;
      const exit=this.arena.waterExitAt?.(pos.x,pos.z);
      if(exit){
        const dive=deep&&now<(h.waterDiveUntil??0);
        this.moveBotAcrossWater(h,exit.x,exit.z,['KeyW','ShiftLeft',dive?'AltLeft':'Space']);
      }else h.input.setKeys(['Space']);
      return true;
    }
    h.waterEntry=undefined;
    if(h.waterCross?.entered){h.waterCross=undefined;h.waterCrossRetryAt=now+12000;}
    return false;
  }

  private seekBotWaterCover(h:HostedGuest,enemy:PlayerController,now:number){
    if(!this.arena.waterExitAt||h.health>40||now-h.lastDamageAt>1000||now<(h.waterRetreatAt??0))return false;
    const pos=h.controller.position,eye=enemy.position.clone().add(new THREE.Vector3(0,enemy.eye,0));
    const away=Math.atan2(pos.z-enemy.position.z,pos.x-enemy.position.x);
    let entry:{x:number;z:number;until:number}|undefined;
    for(const offset of [0,.65,-.65,1.3,-1.3]){
      const angle=away+offset,x=pos.x+Math.cos(angle)*2.7,z=pos.z+Math.sin(angle)*2.7;
      const y=this.arena.navigationHeight?.(x,z)??0;
      const approach=pos.clone().set(x,Math.max(y,pos.y)+.8,z);
      if(this.arena.lineBlocked?.(pos.clone().add(new THREE.Vector3(0,.8,0)),approach))continue;
      const water=this.arena.waterAt?.(x,z,y);
      if(!water){
        if(Math.abs(y-pos.y)<=1.05&&!this.arena.playerBlocked?.(x,z,.38,y,1.8,h.id)&&
          this.arena.lineBlocked?.(eye,approach))return false;
        continue;
      }
      if(!entry&&water.surface-water.bottom>=SWIM_DEPTH&&this.arena.waterExitAt(x,z)&&
        this.arena.lineBlocked?.(eye,approach.setY(water.surface-.55)))entry={x,z,until:now+1100};
    }
    if(!entry)return false;
    h.waterEntry=entry;
    h.waterRetreatAt=now+6000;
    this.localNavigation.forget(h.id);
    return this.botWaterMovement(h,now);
  }

  private updateBotAI(h:HostedGuest,now:number){
    if(!h.bot||h.dead||this.phase!=='live'||this.winner)return;
    if(now>=this.nextThreatPrune){this.nextThreatPrune=now+5000;for(const [id,threat] of this.threats)if(now-threat.at>30000)this.threats.delete(id);}
    if(h.controller.mantle)return;
    if(h.controller.climbing){h.input.setKeys(['KeyW']);return;}
    if(now<h.nextThink)return;
    const hash=[...h.id].reduce((a,c)=>a+c.charCodeAt(0),0);
    const horde=this.teamSize>=32;
    const inCombat=now-h.lastDamageAt<2500||(!!h.targetId&&now-h.lastSeen<2500);
    // 大房 LOD：非战斗 1–1.5 Hz，交火 5–6 Hz；小房保留原 8 Hz。
    const thinkMs=horde&&!h.vehicleId?(inCombat?170+hash%50:900+hash%500):125+(hash%5)*17,dt=thinkMs/1000;
    h.nextThink=now+thinkMs;
    if(this.botWaterMovement(h,now))return;
    if(this.updateBotVehicleOrder(h,now)){h.routeWaypoint=undefined;return;}
    if(h.ammo<=0&&!h.reloadEnd&&h.reserve>0)h.reloadEnd=now+getWeapon(h.selection.weaponId)!.reload*1000;
    const pos=h.controller.position,eye=pos.clone().add(new THREE.Vector3(0,h.controller.bodyHeight*.85,0));
    // 正脸被火焰烧到：真正的视野压制——清目标、丢掉记忆，后退并侧移脱离火线，恢复前不重新索敌。
    if(now<(h.burnUntil??0)){
      h.targetId=null;h.lastSeen=0;h.huntUntil=undefined;h.huntTarget=undefined;h.controller.aiming=false;h.controller.sprintAllowed=true;
      h.input.setKeys(hash%3?['KeyS','KeyA']:['KeyS','KeyD']);
      return;
    }
    const candidates=[{id:this.localNetId,team:this.myTeam,dead:this.dead,controller:this.controller},...this.hosted.values()];
    const botRole=h.botRole??'rifle';
    // 侦察距离按角色分档，并与本枪射程取小（别在步枪 130m 外“看见”人）。
    const sightRange=Math.min(botSightRange(botRole),this.weaponAmmo(getWeapon(h.selection.weaponId)!).maxRange);
    const aimAt=(e:typeof candidates[number])=>e.controller.position.clone().add(new THREE.Vector3(0,e.controller.bodyHeight*.57,0));
    const hostile=(e:typeof candidates[number])=>!e.dead&&e.team!==h.team&&!this.isSpawnProtected(e.id,now);
    const visible=(e:typeof candidates[number])=>{
      const d=e.controller.position.clone().sub(pos),distance=d.length(),yaw=Math.atan2(-d.x,-d.z);
      return distance<sightRange&&(e.id===h.targetId||distance<12||Math.abs(angleDelta(yaw,h.yaw))<1.3)&&(!this.sightBlocked(eye,aimAt(e))||!this.sightBlocked(eye,e.controller.position.clone().add(new THREE.Vector3(0,e.controller.bodyHeight*.9,0))));
    };
    let enemy=candidates.find(e=>e.id===h.targetId&&hostile(e)),canSee=!!enemy&&visible(enemy);
    if(!enemy||!canSee&&now-h.lastSeen>1350||now>=(h.nextTargetScan??0)){
      h.nextTargetScan=now+650+hash%250;
      const utility=(e:typeof candidates[number])=>{
        const other=e.id===this.localNetId?undefined:this.hosted.get(e.id);
        const armored=this.protectedByHull(e.id);
        return botTargetUtility(e.controller.position.distanceTo(pos),preferredCombatRange(botRole),now-h.lastDamageAt<1400&&now-(this.threats.get(e.id)?.at??-Infinity)<1500,now-(this.threats.get(e.id)?.at??-Infinity)<1500,armored,['amr','rpg'].includes(h.selection.weaponId),e.id===h.targetId);
      };
      let best=canSee&&enemy?utility(enemy):-Infinity,selected=canSee?enemy:undefined;
      // Rank cheaply first; bound the added perception work while retaining the
      // full search when no target is available (the existing acquisition path).
      const ranked=candidates.filter(e=>hostile(e)&&e.controller.position.distanceToSquared(pos)<sightRange*sightRange).sort((a,b)=>utility(b)-utility(a));
      let probes=0;
      for(const e of ranked){
        if(e.id===selected?.id)continue;
        const value=utility(e);if(selected&&value<best+12)continue;
        if(canSee&&++probes>4)break;
        if(visible(e)){best=value;selected=e;}
      }
      if(selected){enemy=selected;canSee=true;}else if(!enemy||now-h.lastSeen>1350){enemy=undefined;canSee=false;}
    }
    if(canSee&&enemy){
      const point=aimAt(enemy);
      if(this.sightBlocked(eye,point))point.y=enemy.controller.position.y+enemy.controller.bodyHeight*.9;
      this.observeBotTarget(h,enemy.id,point,now);
    }
    else if(!enemy)h.targetId=null;
    if(canSee&&enemy&&this.seekBotWaterCover(h,enemy.controller,now))return;

    // 扫描：没有可见目标时朝威胁方向转头观察（被打了就立刻回看枪口，不等 nextScanAt）。
    let scanning=false;
    if(!canSee){
      const hurt=now-h.lastDamageAt<1200;
      const threat=this.botScanTarget(h,now,sightRange,hurt);
      if(threat&&(hurt?now>=(h.scanUntil??0):now>=(h.nextScanAt??0)))this.beginBotScan(h,threat,now);
      if(h.scanPoint&&now<(h.scanUntil??0)){
        scanning=true;
        const d=h.scanPoint.clone().sub(eye),desiredYaw=Math.atan2(-d.x,-d.z),desiredPitch=Math.atan2(d.y,Math.max(.5,Math.hypot(d.x,d.z)));
        // 只转头，不动腿：移动指令走 h.input.worldMove，与 yaw 解耦。
        h.yaw+=THREE.MathUtils.clamp(angleDelta(desiredYaw,h.yaw),-dt*4,dt*4);
        h.pitch=THREE.MathUtils.damp(h.pitch,desiredPitch,8,dt);
      }
    }

    const objective=this.botObjective(h,hash,now);
    let waypoint:Waypoint|null=null;
    if(objective&&this.navigation&&!canSee&&this.arena.mapId==='broken_bridge'){
      if(h.waterCross&&(h.waterCross.goal!==objective.id||now>=h.waterCross.until))h.waterCross=undefined;
      if(!h.waterCross&&now>=(h.waterCrossRetryAt??0)&&Math.abs(pos.z-150)<60){
        let bridgeLosses=0;
        for(const body of this.bodies.values())if(body.rig.team===h.team&&now-body.start<15000&&Math.abs(body.origin.x-130)<18&&Math.abs(body.origin.z-150)<25)bridgeLosses++;
        h.waterCrossRetryAt=now+15000;
        if(hash%3===0||(bridgeLosses>=2&&hash%3===2)){
          const cross=findBridgeWaterCrossing(this.arena,pos,objective,hash);
          if(cross&&Number.isFinite(this.navigation.routeSteps(pos.x,pos.z,cross.x,cross.nearZ,pos.y,this.arena.navigationHeight?.(cross.x,cross.nearZ)??0)))
            h.waterCross={...cross,goal:objective.id,until:now+35000,entered:false,committed:false};
        }
      }
      const cross=h.waterCross;
      if(cross&&!cross.entered&&Math.hypot(pos.x-cross.x,pos.z-cross.nearZ)<2.5){
        cross.committed=true;h.waterDiveUntil=now+6000;
        this.moveBotAcrossWater(h,cross.x,cross.entryZ,['KeyW','ShiftLeft']);
        return;
      }
    }
    if(objective&&this.navigation&&!h.waterCross&&(!canSee||!enemy||Math.hypot(enemy.controller.position.x-pos.x,enemy.controller.position.z-pos.z)>25)){
      const active=h.dangerDetour;
      if(active&&h.dangerProgress&&now-h.dangerProgress.at>=4500){
        if(h.dangerProgress.distance-Math.hypot(pos.x-active.x,pos.z-active.z)<3.5){
          h.dangerRejected={id:active.id,x:active.x,z:active.z,until:now+20000};
          h.dangerDetour=undefined;h.detour=undefined;h.dangerCheckAt=0;this.localNavigation.forget(h.id);
        }
        h.dangerProgress={distance:Math.hypot(pos.x-active.x,pos.z-active.z),at:now};
      }
      if(h.dangerDetour===active&&active&&(active.goal!==objective.id||now>=active.until||Math.hypot(pos.x-active.x,pos.z-active.z)<3.5)){
        if(active.goal===objective.id&&now<active.until)h.dangerAvoided={id:active.id,until:now+18000};
        h.dangerDetour=undefined;h.detour=undefined;
      }
      if(!h.dangerDetour&&now>=(h.dangerCheckAt??0)){
        h.dangerCheckAt=now+2200+hash%5*100;
        const ignore=h.dangerAvoided&&now<h.dangerAvoided.until?h.dangerAvoided.id:undefined;
        const options=this.battleDanger.bypasses(h.team,pos,objective,now,ignore);
        let best:{id:number;x:number;z:number}|undefined,bestCost=Infinity;
        for(const [index,option] of options.entries()){
          const rejected=h.dangerRejected;
          if(rejected&&now<rejected.until&&rejected.id===option.id&&Math.hypot(option.x-rejected.x,option.z-rejected.z)<1)continue;
          const y=this.arena.navigationHeight?.(option.x,option.z)??this.arena.heightAt?.(option.x,option.z)??0;
          if(!this.insideArenaBounds(option.x,option.z)||this.arena.blockedAt?.(option.x,option.z,.4,y)||this.arena.waterAt?.(option.x,option.z,y))continue;
          const steps=this.navigation.routeSteps(pos.x,pos.z,option.x,option.z,pos.y,y);
          const cost=steps+Math.hypot(option.x-objective.x,option.z-objective.z)*.12+this.battleDanger.penalty(h.team,option.x,option.z,now)+(index===hash%2?0:2);
          if(cost<bestCost){bestCost=cost;best=option;}
        }
        if(best&&Number.isFinite(bestCost)){h.dangerDetour={...best,goal:objective.id,until:now+18000};h.dangerProgress={distance:Math.hypot(pos.x-best.x,pos.z-best.z),at:now};h.detour=undefined;}
      }
    }
    if(objective&&this.navigation&&this.teamSize>=32){
      // 大房只走共享目标场，不做 flank/hunt/hold/detour/route penalty。
      const target=h.waterCross&&!h.waterCross.entered?{x:h.waterCross.x,z:h.waterCross.nearZ}:h.dangerDetour??objective;
      waypoint=this.navigation.next(pos.x,pos.z,target.x,target.z,pos.y);
    }else if(objective&&this.navigation){
      const penalty=(point:Waypoint)=>this.botRoutePenalty(h,point,now);
      // Snipers hold the approach, marksmen hang back a little, flankers swing wide.
      let goal:{x:number;z:number}=h.waterCross&&!h.waterCross.entered?{x:h.waterCross.x,z:h.waterCross.nearZ}:h.dangerDetour??objective;
      const capDistance=Math.hypot(pos.x-objective.x,pos.z-objective.z);
      if(!h.waterCross&&!h.dangerDetour&&!canSee&&botRole==='sniper'&&capDistance<52){
        const out=52+hash%9;
        goal={x:objective.x+(pos.x-objective.x)/Math.max(1,capDistance)*out,z:objective.z+(pos.z-objective.z)/Math.max(1,capDistance)*out};
      }else if(!h.waterCross&&!h.dangerDetour&&!canSee&&botRole==='marksman'&&capDistance<36){
        const out=36+hash%7;
        goal={x:objective.x+(pos.x-objective.x)/Math.max(1,capDistance)*out,z:objective.z+(pos.z-objective.z)/Math.max(1,capDistance)*out};
      }else if(!h.waterCross&&!h.dangerDetour&&!canSee&&h.botFlank&&capDistance>26){
        const dx=(objective.x-pos.x)/capDistance,dz=(objective.z-pos.z)/capDistance;
        const fx=objective.x-dz*h.botFlank*19,fz=objective.z+dx*h.botFlank*19;
        if(this.navigation.routeSteps(pos.x,pos.z,fx,fz,pos.y,this.arena.navigationHeight?.(fx,fz)??0)<520)goal={x:fx,z:fz};
      }
      // A teammate dying to the same shooter pulls a hunter onto that angle.
      const hunt=this.botHuntTarget(h,now,hash);
      if(hunt&&!h.waterCross&&!h.dangerDetour&&!canSee&&botRole!=='sniper')goal={x:hunt.x,z:hunt.z};
      // Overwatch sets up: arrive, go still and scan through the optic for a few seconds.
      if((botRole==='sniper'||botRole==='marksman')&&!canSee&&Math.hypot(pos.x-goal.x,pos.z-goal.z)<9&&now>=(h.nextHoldAt??0)){
        h.holdUntil=now+3200;h.nextHoldAt=now+10000+hash%5*900;
      }
      waypoint=this.navigation.next(pos.x,pos.z,goal.x,goal.z,pos.y,undefined,penalty);
      if(!waypoint&&!canSee)waypoint={x:goal.x,z:goal.z,y:pos.y};
      if(h.detour&&(h.detour.goal!==objective.id||now>=h.detour.until))h.detour=undefined;
      if(h.detour){
        const path=h.detour.path;
        while(path.length&&Math.hypot(pos.x-path[0].x,pos.z-path[0].z)<1.15&&Math.abs(pos.y-(path[0].y??pos.y))<.9)path.shift();
        if(!path.length)h.detour=undefined;
      }
      const arrival=h.waterCross||h.dangerDetour?1:hunt?14:objective.r*.95;
      if(Math.hypot(pos.x-goal.x,pos.z-goal.z)<arrival){
        const angle=hash*2.39996,radius=hunt?3:objective.r*.55;
        waypoint={x:goal.x+Math.cos(angle)*radius,z:goal.z+Math.sin(angle)*radius,y:pos.y};
      }else if(!canSee){
        if(!h.detour&&waypoint&&now>=(h.nextDetourAt??0)&&penalty(waypoint)>=4){
          h.nextDetourAt=now+2800+hash%7*120;
          const path=this.navigation.detour(pos.x,pos.z,goal.x,goal.z,pos.y,penalty);
          if(path.length)h.detour={goal:objective.id,path,until:now+6500};
        }
        waypoint=h.detour?.path[0]??waypoint;
      }
    }
    if(enemy){
      const weapon=getWeapon(h.selection.weaponId)!;
      const ammo=this.weaponAmmo(weapon);
      const sampleDistance=h.aimSample.distanceTo(eye),observedVelocity=h.aimVelocity??{x:0,y:0,z:0};
      const firePlan=botAimPlan({role:botRole,distance:sampleDistance,targetSpeed:Math.hypot(observedVelocity.x,observedVelocity.z),moving:h.controller.velocity.length(),underFire:now-h.lastDamageAt<1200,ammoRatio:h.ammo/weapon.magazine,rpm:weapon.rpm,visibleMs:now-(h.targetAcquiredAt??now),targetArmored:h.lastObservedArmored&&!['amr','rpg'].includes(weapon.id)});
      const aimPoint=h.aimSample.clone();
      const lead=Math.min(.35,sampleDistance/Math.max(1,ammo.muzzleVelocity)+Math.max(0,now-(h.aimObservedAt??now))/1000)*firePlan.lead;
      aimPoint.x+=observedVelocity.x*lead;aimPoint.y+=observedVelocity.y*lead;aimPoint.z+=observedVelocity.z*lead;
      const precise=botShotDirection(eye,aimPoint,ammo,true,0,()=>this.random());
      const delta=aimPoint.clone().sub(eye);
      const desiredYaw=Math.atan2(-precise.x,-precise.z),desiredPitch=Math.atan2(precise.y,Math.hypot(precise.x,precise.z));
      h.yaw+=THREE.MathUtils.clamp(angleDelta(desiredYaw,h.yaw),-dt*2.5,dt*2.5);
      h.pitch+=THREE.MathUtils.clamp(desiredPitch-h.pitch,-dt*1.75,dt*1.75);
      if(canSee&&!h.reloadEnd&&h.ammo>0&&firePlan.fire&&Math.abs(angleDelta(desiredYaw,h.yaw))<.07&&Math.abs(desiredPitch-h.pitch)<.065&&now>=h.nextBotFire){
        const target=enemy.controller;
        const shots=h.engagementShots??0;
        const first=shots===0;
        let dir:THREE.Vector3;
        let muzzle=this.infantryMuzzle(eye,h.yaw,h.pitch,weapon,h.selection.opticId,true);
        if(first){
          // 首发绝对精准：零散布 + 下坠补偿，并把 yaw/pitch 钉到这条射线上，让模型/枪口同步。
          const shot=botShotDirection(muzzle,aimPoint,ammo,true,0,()=>this.random());
          dir=new THREE.Vector3(shot.x,shot.y,shot.z);
          h.yaw=Math.atan2(-dir.x,-dir.z);h.pitch=Math.atan2(dir.y,Math.hypot(dir.x,dir.z));
          muzzle=this.infantryMuzzle(eye,h.yaw,h.pitch,weapon,h.selection.opticId,true);
          const exact=botShotDirection(muzzle,aimPoint,ammo,true,0,()=>this.random());
          dir.set(exact.x,exact.y,exact.z);
          h.engagementShots=1;
        }else{
          const spread=firePlan.spread+Math.min(.006,shots*.001)+(target.grounded?0:.01);
          const yaw=h.yaw+(this.random()-this.random())*spread;
          const pitch=h.pitch+(this.random()-this.random())*spread;
          dir=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(pitch,yaw,0,'YXZ'));
          h.engagementShots=shots+1;
        }
        const pause=++h.burstShots>=firePlan.burst;
        if(pause)h.burstShots=0;
        h.nextBotFire=now+(pause?Math.max(firePlan.interval,firePlan.pause)+this.random()*90:firePlan.interval+this.random()*35);
        const obstruction=this.traceCombat(muzzle,dir,Math.min(ammo.maxRange,delta.length()+1),h.id);
        const friendly=obstruction?.kind==='player'?(obstruction.id===this.localNetId?this.myTeam:this.hosted.get(obstruction.id??'')?.team)===h.team:obstruction?.kind==='vehicle'?this.vehicles.find(v=>v.id===obstruction.id)?.team===h.team:false;
        if(friendly){h.friendlyFireBlockedUntil=now+1100;}
        else if(!this.arena.lineBlocked?.(eye,muzzle)){h.lastShotAt=now;h.ammo--;this.launch(h.id,muzzle,dir,ammo);}
      }
      const distance=h.lastKnown.distanceTo(pos);
      if(!canSee&&distance<20&&now-h.lastSeen<1000){
        let pursuers=0;
        for(const ally of this.hosted.values()){
          if(ally.id<h.id&&ally.team===h.team&&ally.targetId===enemy.id&&!ally.dead&&!ally.vehicleId&&
            ally.controller.position.distanceToSquared(pos)<20**2)pursuers++;
        }
        if(pursuers<2)waypoint={x:h.lastKnown.x,z:h.lastKnown.z,y:pos.y};
      }
    }
    // 被打了又没有目标可打：横向挪一步脱离火线，别一边挨打一边直线冲锋。
    if(!canSee&&scanning&&now-h.lastDamageAt<1500){
      const side=hash%2?1:-1;
      waypoint={x:pos.x+Math.cos(h.yaw)*side*3.4,z:pos.z-Math.sin(h.yaw)*side*3.4,y:pos.y};
      h.detour=undefined;h.holdUntil=0;
    }
    waypoint=this.botCombatDecision(h,enemy,canSee,objective,waypoint,now,hash);
    waypoint=this.localNavigation.jumpWaypoint(h.id,now)??waypoint;
    if(!canSee&&now<(h.holdUntil??0)&&h.tactical?.action!=='withdraw'&&h.tactical?.action!=='reposition')waypoint=null;
    h.routeWaypoint=waypoint??undefined;
    if(!waypoint){const keys:string[]=[];this.botTactics(h,now,enemy,canSee,keys);h.input.setKeys(keys);return;}
    // 只有路线本身规划了「翻越」才允许爬：路线被掩体挡住时绕行，而不是见墙就爬，
    // 否则 bot 会在花坛/矮墙/台地上反复跳上去再下来，看起来像原地转圈。
    const plannedMantle=waypoint.action==='mantle'||(waypoint.y!==undefined&&waypoint.y-pos.y>1.1&&waypoint.y-pos.y<3.1&&Math.hypot(waypoint.x-pos.x,waypoint.z-pos.z)<6);
    const move=this.localNavigation.steer(h.id,pos.x,pos.z,pos.y,waypoint,now,(dx,dz)=>{
      if(!plannedMantle)return false;
      const mantle=h.controller.grounded&&h.controller.findMantle(this.arena,dx,dz);
      if(!mantle)return false;
      const [x,y,z]=mantle.to,water=this.arena.waterAt?.(x,z,y);
      return !water||y>=water.surface-.015;
    });
    if(move.stalled>2.2&&!canSee&&h.objective&&!h.dangerDetour){
      h.blockedObjective={id:h.objective,until:now+6500};
      h.objectiveUntil=now;
      h.detour=undefined;
    }
    const {dx,dz}=move;
    if(!enemy&&!scanning&&Math.hypot(dx,dz)>.1){const angle=Math.atan2(-dx,-dz);h.yaw+=THREE.MathUtils.clamp(angleDelta(angle,h.yaw),-dt*4,dt*4);h.pitch=THREE.MathUtils.damp(h.pitch,0,8,dt);}
    const forward=-Math.sin(h.yaw)*dx-Math.cos(h.yaw)*dz,right=Math.cos(h.yaw)*dx-Math.sin(h.yaw)*dz,keys:string[]=[];
    if(Math.abs(forward)>.25)keys.push(forward>0?'KeyW':'KeyS');if(Math.abs(right)>.25)keys.push(right>0?'KeyD':'KeyA');if(!enemy&&!scanning&&hash%3&&move.stalled<.4)keys.push('ShiftLeft');
    if((move.mantle||move.jump)&&h.controller.grounded&&!h.controller.jumpDown)keys.push('Space');
    this.botTactics(h,now,enemy,canSee,keys);
    h.input.setKeys(keys);h.input.worldMove=keys.some(k=>['KeyW','KeyS','KeyA','KeyD'].includes(k))?{x:dx,z:dz}:null;
  }

  private botCombatDecision(h:HostedGuest,enemy:{controller:PlayerController}|undefined,visible:boolean,objective:CapState|undefined,route:Waypoint|null,now:number,seed:number):Waypoint|null{
    const pos=h.controller.position,age=h.targetId?now-h.lastSeen:Infinity;
    let allies=0,enemies=0;
    for(const ally of this.hosted.values())if(ally.id!==h.id&&!ally.dead&&ally.team===h.team&&ally.controller.position.distanceToSquared(pos)<24*24)allies++;
    for(const contact of this.tacticalMemory.contacts(h.team))if(now-contact.at<4000&&Math.hypot(contact.x-pos.x,contact.z-pos.z)<45)enemies+=1-(now-contact.at)/4000;
    const danger=this.battleDanger.penalty(h.team,pos.x,pos.z,now),role=h.botRole??'rifle',weapon=getWeapon(h.selection.weaponId)!;
    const capDistance=objective?Math.hypot(pos.x-objective.x,pos.z-objective.z):Infinity;
    const opportunity=objective&&objective.owner!==h.team&&capDistance<objective.r+16&&h.health>45&&h.ammo>weapon.magazine*.25&&allies>=enemies-.5;
    const urgency=objective?(objective.owner!==h.team?1+(opportunity?.9:0):0):0;
    const supplyBase=this.arena.teamSpawns?.[h.team],atSupply=!!supplyBase&&Math.hypot(pos.x-supplyBase.x,pos.z-supplyBase.z)<14;
    const decision=decideInfantry({role,health:h.health,ammoRatio:h.ammo/weapon.magazine,reloading:!!h.reloadEnd,visible,contactAge:age,distance:age<6000?h.lastKnown.distanceTo(pos):Infinity,targetArmored:age<4000&&!!h.lastObservedArmored,underFire:now-h.lastDamageAt<1300,allies,enemies,objectiveUrgency:urgency,danger,moving:h.controller.velocity.length(),hasCover:!!h.tacticalCovered,blockedShot:now<(h.friendlyFireBlockedUntil??0),depleted:h.ammo===0&&h.reserve===0,resupplying:atSupply&&h.tactical?.action==='withdraw'&&h.health<65},now,seed,h.tactical);
    const changed=h.tactical?.action!==decision.action;h.tactical=decision;
    h.controller.aiming=visible&&(decision.action==='overwatch'||role==='sniper'||role==='marksman');
    h.controller.sprintAllowed=decision.action==='advance'||decision.action==='assault'||decision.action==='withdraw';
    if(decision.action==='advance'||(decision.action==='assault'&&!visible))return route;
    if(age>6000&&!visible){
      if((h.health<40||h.ammo===0)&&this.arena.teamSpawns?.[h.team]){
        const base=this.arena.teamSpawns[h.team];if(Math.hypot(pos.x-base.x,pos.z-base.z)<9)return null;return this.navigation?.next(pos.x,pos.z,base.x,base.z,pos.y)??{x:base.x,z:base.z,y:pos.y};
      }
      return route;
    }
    if(!changed&&h.tacticalPoint&&now<h.tacticalPoint.until)return h.tacticalPoint;
    const target=h.lastKnown,dx=target.x-pos.x,dz=target.z-pos.z,length=Math.max(1,Math.hypot(dx,dz)),fx=dx/length,fz=dz/length;
    const desired=preferredCombatRange(role),offsets=[[0,0],[-5,1],[5,1],[-4,-5],[4,-5],[0,-6],[0,5]];
    let best:Waypoint|null=null,bestScore=-Infinity,currentCover=false;
    for(const [side,forward] of offsets){
      const x=pos.x+fx*forward-fz*side,z=pos.z+fz*forward+fx*side;
      const y=this.arena.supportAt?.(x,z,pos.y+1.05)??this.arena.heightAt?.(x,z)??pos.y;
      if(!Number.isFinite(y)||Math.abs(y-pos.y)>1.1||!this.insideArenaBounds(x,z)||this.arena.playerBlocked?.(x,z,.38,y,h.controller.bodyHeight,h.id)||this.arena.waterAt?.(x,z,y))continue;
      const chest=new THREE.Vector3(x,y+1.1,z),head=new THREE.Vector3(x,y+1.6,z);
      const cover=(this.sightBlocked(target,chest)?1:0)+(this.sightBlocked(target,head)?1:0);
      if(side===0&&forward===0)currentCover=cover>0;
      const progress=decision.action==='flank'||decision.action==='reposition'?Math.abs(side)*1.6+forward*.3:forward;
      const score=positionUtility(decision.action,{x,y,z,cover,distance:Math.hypot(x-target.x,z-target.z),travel:Math.hypot(side,forward),progress,danger:this.battleDanger.penalty(h.team,x,z,now)},desired)+(side!==0&&Math.sign(side)===(seed%2?1:-1)?1.5:0);
      if(score>bestScore){bestScore=score;best={x,y,z};}
    }
    h.tacticalCovered=currentCover;
    if(!best)return route;
    h.tacticalPoint={x:best.x,y:best.y??pos.y,z:best.z,until:now+1150+seed%350};
    return h.tacticalPoint;
  }

  /** 挑一个值得转头观察的威胁：挨打时优先最新/最重的那一枪，否则优先远处长枪。 */
  private botScanTarget(h:HostedGuest,now:number,sight:number,hurt:boolean){
    const pos=h.controller.position;
    let best:{x:number;y:number;z:number;at:number;weight:number;longRange:boolean}|null=null,bestScore=-Infinity;
    for(const [id,threat] of this.threats){
      if(!this.threatIsFoe(h,id))continue;
      const age=now-threat.at;
      if(age>30000||threat.weight<1)continue;
      if(Math.hypot(threat.x-pos.x,threat.y-pos.y,threat.z-pos.z)>sight*1.15)continue;
      const distance=Math.hypot(pos.x-threat.x,pos.z-threat.z);
      const score=hurt?threat.weight*14-age*.08+(threat.longRange?6:0)
        :(threat.longRange?60:0)+threat.weight*8-age*.02-distance*.05;
      if(score>bestScore){bestScore=score;best=threat;}
    }
    return best;
  }

  /** 开一个扫描窗口：朝威胁胸口方向转头观察，移动不受影响。 */
  private beginBotScan(h:HostedGuest,threat:{x:number;y:number;z:number},now:number){
    const role=h.botRole??'rifle';
    h.scanPoint=new THREE.Vector3(threat.x,threat.y+1.2,threat.z);
    h.scanUntil=now+botScanWindowMs(role,()=>this.random());
    h.nextScanAt=now+botScanIntervalMs(role,()=>this.random());
  }

  /** Nearest recent killer position that deserves a counter-push. */
  private botHuntTarget(h:HostedGuest,now:number,hash:number){
    if(!this.threats.size||hash%3!==0)return null;
    const pos=h.controller.position;
    let best:{x:number;y:number;z:number}|null=null,bestScore=Infinity;
    for(const [id,threat] of this.threats){
      if(!this.threatIsFoe(h,id))continue;
      const age=now-threat.at;
      if(age>25000)continue;
      const distance=Math.hypot(pos.x-threat.x,pos.z-threat.z);
      if(distance>75)continue;
      const score=distance*.6-age*.012-threat.weight*9;
      if(score<bestScore){bestScore=score;best={x:threat.x,y:threat.y,z:threat.z};}
    }
    return best;
  }

  /** Stance, dodging and grenades layered on top of the movement keys. */
  private botTactics(h:HostedGuest,now:number,enemy:{controller:PlayerController}|undefined,canSee:boolean,keys:string[]){
    // 大房非战斗 Bot 不做姿态/烟雾/手雷/跳闪这些高级决策；交火仍保留基本姿态与瞄准。
    if(this.teamSize>=32&&!canSee&&now-h.lastDamageAt>2500)return;
    const role=h.botRole??'rifle',pos=h.controller.position;
    const distance=canSee&&enemy?enemy.controller.position.distanceTo(pos):Infinity;
    const settled=!keys.includes('KeyW')&&!keys.includes('KeyS');
    this.botUpdateStance(h,now,enemy,canSee,distance,settled,keys);
    // Under fire a hop can break a sniper's line.
    if(now-h.lastDamageAt<900&&!h.controller.prone&&h.controller.grounded&&now>=(h.nextDodge??0)){
      h.nextDodge=now+1500+this.random()*1100;
      if((!h.tactical||h.tactical.action==='assault'||h.tactical.action==='reposition')&&this.random()<.5)keys.push('Space');
    }
    if((!canSee||h.tactical?.action==='withdraw')&&h.targetId&&now-h.lastSeen<6000){
      if(now>=(h.nextSmoke??0))this.botSmoke(h,now);
      if(now>=(h.nextFrag??0))this.botFrag(h,now);
    }
  }

  /**
   * 姿态决策：低姿态不是免费的（控制器里有 ~1.2s 的身位/视高过渡），并且有锁定期，
   * 避免 AI 靠瞬间趴下/站起反复躲子弹。掩体姿态优先：站着被打头、蹲/趴能整个藏住时，
   * 选择低姿态并停止横向暴露移动。
   */
  private botUpdateStance(h:HostedGuest,now:number,enemy:{controller:PlayerController}|undefined,canSee:boolean,distance:number,settled:boolean,keys:string[]){
    const role=h.botRole??'rifle';
    const cover=this.botCoverStance(h,enemy,canSee,now);
    if(now>=(h.nextStanceAt??0)||(h.tactical?.action==='withdraw'&&h.health<28)){
      let next:'stand'|'crouch'|'prone'='stand';
      if(cover)next=cover;
      else if(h.tactical?.action==='withdraw'||h.tactical?.action==='flank'||h.tactical?.action==='assault')next='stand';
      else if(settled&&h.controller.grounded&&(role==='sniper'||role==='marksman')&&(!canSee||distance>45)&&now-h.lastDamageAt>=1500)next='prone';
      else if(canSee&&distance>18&&(role==='lmg'||role==='rifle'||role==='marksman'))next='crouch';
      if(next!==(h.stanceIntent??'stand')){
        h.stanceIntent=next;
        h.nextStanceAt=now+(next==='prone'?2400:next==='crouch'?1700:1400);
      }
    }
    const intent=h.stanceIntent??'stand';
    if(intent==='prone')keys.push('KeyZ');
    else if(intent==='crouch')keys.push('ControlLeft');
    if(cover&&intent!=='stand'){
      // 已经缩进掩体：低姿态下不要横拉出去，保持隐蔽。
      for(let i=keys.length-1;i>=0;i--)if(keys[i]==='KeyW'||keys[i]==='KeyS'||keys[i]==='KeyA'||keys[i]==='KeyD')keys.splice(i,1);
    }
  }

  /** 站着会暴露、但蹲/趴能完全被掩体挡住时，返回应该用的低姿态。 */
  private botCoverStance(h:HostedGuest,enemy:{controller:PlayerController}|undefined,canSee:boolean,now:number):'crouch'|'prone'|null{
    if(now<(h.nextCoverCheck??0))return null;h.nextCoverCheck=now+400;
    let from:THREE.Vector3|null=null;
    if(canSee&&enemy)from=enemy.controller.position.clone().add(new THREE.Vector3(0,enemy.controller.bodyHeight*.8,0));
    else{
      let bestScore=-Infinity;
      for(const [id,t] of this.threats){
        if(!this.threatIsFoe(h,id))continue;
        const age=now-t.at;if(age>4000)continue;
        const score=t.weight*10-age*.01-Math.hypot(t.x-h.controller.position.x,t.z-h.controller.position.z)*.05;
        if(score>bestScore){bestScore=score;from=new THREE.Vector3(t.x,t.y+1.45,t.z);}
      }
    }
    if(!from)return null;
    const pos=h.controller.position;
    const at=(height:number)=>pos.clone().add(new THREE.Vector3(0,height,0));
    // 站着时眼睛/头会被看到（1.5m 掩体挡得住胸口却挡不住站姿头部），
    // 而蹲/趴的整条视高线都被挡住时，才判定应该缩进掩体。
    const exposedStanding=!this.sightBlocked(from,at(1.62))||!this.sightBlocked(from,at(1.45));
    if(!exposedStanding)return null;
    const crouchHidden=this.sightBlocked(from,at(1.15))&&this.sightBlocked(from,at(1.4));
    const proneHidden=this.sightBlocked(from,at(.55))&&this.sightBlocked(from,at(.95));
    if(crouchHidden)return 'crouch';
    if(proneHidden)return 'prone';
    return null;
  }

  private botSmoke(h:HostedGuest,now:number){
    const slot=h.selection.throwables.indexOf('smoke');
    if(slot<0||!h.throwables[slot])return;
    const pos=h.controller.position,d=h.lastKnown.clone().sub(pos),distance=Math.hypot(d.x,d.z);
    if(distance<18||distance>75)return;
    for(const ally of this.hosted.values())if(ally!==h&&ally.team===h.team&&!ally.dead&&ally.controller.position.distanceTo(h.lastKnown)<8)return;
    h.nextSmoke=now+14000+this.random()*8000;
    h.yaw=Math.atan2(-d.x,-d.z);h.pitch=Math.atan2(d.y,Math.max(1,distance))+.12;
    h.controller.yaw=h.yaw;h.controller.pitch=h.pitch;
    this.throwItem(slot,h.id);
  }

  private botFrag(h:HostedGuest,now:number){
    const slot=h.selection.throwables.indexOf('frag');
    if(slot<0||!h.throwables[slot])return;
    const pos=h.controller.position,d=h.lastKnown.clone().sub(pos),distance=Math.hypot(d.x,d.z);
    if(distance<9||distance>30)return;
    // Never grenade a spot where a teammate is standing.
    for(const ally of this.hosted.values())if(ally!==h&&ally.team===h.team&&!ally.dead&&ally.controller.position.distanceTo(h.lastKnown)<7)return;
    h.nextFrag=now+9000+this.random()*7000;
    h.yaw=Math.atan2(-d.x,-d.z);h.pitch=Math.atan2(d.y,Math.max(1,distance))+.08;
    h.controller.yaw=h.yaw;h.controller.pitch=h.pitch;
    this.throwItem(slot,h.id);
  }

  private assignArmoredCrews(now:number){
    const priority=['mbt','light_tank','ifv','apc','jeep','motorcycle'];
    for(const team of ['blue','orange'] as const){
      const all=[...this.hosted.values()].filter(h=>h.bot&&h.team===team&&!h.dead);
      const crews=all.filter(h=>!h.vehicleId&&!h.vehicleOrder&&now>=(h.vehicleRetryAt??0)&&h.botRole!=='sniper'&&h.botRole!=='marksman');
      // Leave infantry to capture and fight. Fill drivers across different hulls
      // before adding gunners; reconsider after casualties and vehicle respawns.
      let budget=Math.max(0,Math.ceil(all.length*.55)-all.filter(h=>h.vehicleId||h.vehicleOrder).length);
      const vehicles=this.vehicles.filter(v=>v.team===team&&!v.destroyed&&priority.includes(v.kind))
        .sort((a,b)=>priority.indexOf(a.kind)-priority.indexOf(b.kind));
      for(const seat of [0,1])for(const v of vehicles){
        if(budget<=0)break;
        if(seat>=v.seats.length||v.seats[seat]||this.botSeatReserved(v.id,seat))continue;
        if(seat===1&&!v.seats[0]&&!this.botSeatReserved(v.id,0))continue;
        const transport=v.kind==='motorcycle'||v.kind==='jeep';
        if(transport&&((this.arena.worldSize??64)<200||seat!==0))continue;
        let best=-1,bestCost=Infinity;
        for(let i=0;i<crews.length;i++){
          const h=crews[i],pos=h.controller.position,dist=Math.hypot(pos.x-v.x,pos.z-v.z);
          if(dist>85)continue;
          // A fast vehicle is useful for a long trip, not a short local capture.
          if(transport&&!this.caps.some(c=>c.owner!==team&&Math.hypot(c.x-pos.x,c.z-pos.z)>90&&Math.hypot(c.x-v.x,c.z-v.z)>70))continue;
          if(dist<bestCost){best=i;bestCost=dist;}
        }
        if(best<0)continue;
        const [bot]=crews.splice(best,1);
        bot.vehicleOrder={id:v.id,seat,until:now+Math.min(30000,9000+bestCost*600)};
        budget--;
      }
    }
  }

  private botSeatReserved(id:string,seat:number,except?:string){
    for(const bot of this.hosted.values()){
      if(!bot.dead&&bot.id!==except&&bot.vehicleOrder?.id===id&&bot.vehicleOrder.seat===seat&&bot.vehicleOrder.until>this.simulationNow)return true;
    }
    return false;
  }

  private updateBotVehicleOrder(h:HostedGuest,now:number){
    if(h.vehicleId){
      const v=this.vehicles.find(v=>v.id===h.vehicleId&&!v.destroyed);
      if(!v)return false;
      h.input.clear();
      if(h.vehicleSeat===0)this.driveBotVehicle(h,v,now);
      else this.aimBotVehicle(h,v,now);
      return true;
    }
    const pos=h.controller.position;
    if(!h.vehicleOrder&&now>=(h.vehicleRetryAt??0)){
      h.vehicleRetryAt=now+2300;
      // Nearby infantry can take a free gun seat on a friendly player's or bot's ride.
      let distance=11,ride:VehicleState|undefined;
      for(const v of this.vehicles){
        const driver=v.seats[0];
        const team=driver===this.localNetId?this.myTeam:this.hosted.get(driver??'')?.team;
        if(!driver||team!==h.team||v.destroyed||v.seats[1]!==null||Math.abs(v.speed)>2||this.botSeatReserved(v.id,1,h.id))continue;
        const d=Math.hypot(pos.x-v.x,pos.z-v.z);
        if(d<distance){distance=d;ride=v;}
      }
      if(ride)h.vehicleOrder={id:ride.id,seat:1,until:now+4400};
    }
    const order=h.vehicleOrder;
    if(!order)return false;
    const v=this.vehicles.find(v=>v.id===order.id&&!v.destroyed);
    if(!v||now>order.until||v.seats[order.seat]){
      h.vehicleOrder=undefined;
      h.vehicleRetryAt=now+8000;
      return false;
    }
    if(Math.abs(v.speed)<3&&this.canBoard(v,h.team,pos)){
      v.seats[order.seat]=h.id;h.vehicleId=v.id;h.vehicleSeat=order.seat;h.vehicleBoardedAt=now;
      h.vehThrottle=0;h.vehSteer=0;h.driveStall=0;h.trafficFollowing=undefined;h.trafficWaitSince=undefined;h.trafficAvoidUntil=0;h.trafficRetryAt=0;h.tactical=undefined;h.tacticalPoint=undefined;h.vehicleDecision=undefined;h.vehicleParking=undefined;h.nextVehicleDecisionAt=0;h.reverseUntil=0;h.driveTurn=0;h.driveProbe=undefined;h.driveProgress=undefined;h.path=[];h.nextPath=0;h.objective='';h.pilot=undefined;h.vehicleGoalsBlocked=undefined;
      h.vehicleOrder=undefined;h.input.clear();h.reloadEnd=0;h.targetId=null;h.burnUntil=0;
      this.localNavigation.forget(h.id);
      return true;
    }
    if(!order.planned&&Math.abs(v.speed)<.3){
      order.approach=this.vehicleBoardingPoint(h,v);
      order.planned=true;
    }
    const approach=order.approach&&Math.hypot(order.approach.x-v.x,order.approach.z-v.z)<6.6?order.approach:v.model.position;
    const distance=Math.hypot(pos.x-approach.x,pos.z-approach.z);
    const target=distance>3&&Math.abs(v.speed)<.3
      ? this.navigation?.next(pos.x,pos.z,approach.x,approach.z,pos.y,approach.y)??approach
      : approach;
    const move=this.localNavigation.steer(h.id,pos.x,pos.z,pos.y,target,now,
      (dx,dz)=>h.controller.grounded&&!!h.controller.findMantle(this.arena,dx,dz));
    if(Math.hypot(move.dx,move.dz)>.1)h.yaw=Math.atan2(-move.dx,-move.dz);
    const keys=['ShiftLeft'];
    if((move.jump||move.mantle)&&!h.controller.jumpDown)keys.push('Space');
    h.input.setKeys(keys);
    h.input.worldMove={x:move.dx,z:move.dz};
    return true;
  }

  private vehicleBoardingPoint(h:HostedGuest,v:VehicleState){
    const pos=h.controller.position,ground=v.model.position.y;
    let best=Infinity,approach:THREE.Vector3|undefined;
    for(let i=0;i<8;i++){
      const angle=i*Math.PI/4,x=v.x+Math.sin(angle)*5.6,z=v.z+Math.cos(angle)*5.6;
      const y=this.arena.supportAt?.(x,z,ground+1.4)??this.arena.heightAt?.(x,z)??ground;
      if(!Number.isFinite(y)||this.arena.blockedAt?.(x,z,.4,y))continue;
      const point=new THREE.Vector3(x,y,z);
      if(!this.canBoard(v,h.team,point))continue;
      const steps=this.navigation?.routeSteps(pos.x,pos.z,x,z,pos.y,y)??pos.distanceTo(point)/3;
      const cost=steps+pos.distanceTo(point)*.015+Math.abs(ground-y)*.4;
      if(cost<best){best=cost;approach=point;}
    }
    return approach;
  }

  private driveBotVehicle(h:HostedGuest,v:VehicleState,now:number){
    const wasBraking=h.vehicleBraking;h.vehicleBraking=false;
    const gunner=v.seats[1];
    if(!gunner&&now-(h.vehicleBoardedAt??now)<5000&&this.botSeatReserved(v.id,1)&&Math.abs(v.speed)<.8){
      h.vehThrottle=0;h.vehSteer=0;return;
    }
    const objective=this.vehicleObjective(h,v,now);
    if(!objective){h.vehThrottle=0;h.vehSteer=0;return;}
    const distance=Math.hypot(objective.x-v.x,objective.z-v.z);
    // A driver can repeatedly replan without ever escaping the same obstacle;
    // watch actual motion across replans and goals, not just individual plans.
    const previous=h.driveProbe;
    if(previous&&distance>objective.r*1.1){
      const stationary=Math.hypot(v.x-previous.x,v.z-previous.z)<.03&&Math.abs(angleDelta(v.yaw,previous.yaw))<.015&&Math.abs(v.speed)<.6;
      h.driveStall=stationary?(h.driveStall??0)+Math.min(500,Math.max(0,now-previous.at)):0;
    }else h.driveStall=0;
    h.driveProbe={x:v.x,z:v.z,yaw:v.yaw,at:now};
    const pilot=h.pilot??=new VehiclePilot(v.kind,this.motionWorld,this.arena);
    pilot.vehicleId=v.id;pilot.planningTeam=h.team;
    const main=v.weapons[0],shooter=this.hosted.get(gunner??'');
    // At an actual close firing opportunity a tank fights instead of repeatedly
    // ramming an enemy hull and eventually abandoning a healthy vehicle.
    if(main&&isCannon(main.id)&&v.ammo>0&&shooter?.targetId&&now-shooter.lastSeen<550&&now>=(shooter.friendlyFireBlockedUntil??0)&&Math.hypot(shooter.lastKnown.x-v.x,shooter.lastKnown.z-v.z)<30&&h.vehicleDecision?.action!=='resupply'&&(!wasBraking||now-(h.combatHeldSince??now)<2200||main.lastFire>0&&now-main.lastFire<6000||v.nextFire>now)){
      if(!wasBraking)h.combatHeldSince=now;
      if(!wasBraking)pilot.invalidate();h.vehicleBraking=true;h.driveStall=0;
      h.vehThrottle=Math.abs(v.speed)>.5?-Math.sign(v.speed)*.35:0;h.vehSteer=0;pilot.debugMode='combat-hold';return;
    }
    const goal={id:objective.id,x:objective.x,z:objective.z,radius:objective.r};
    if(distance<objective.r*.65){
      h.vehThrottle=Math.abs(v.speed)>.5?-Math.sign(v.speed)*.35:0;h.vehSteer=0;
      pilot.invalidate();
      return;
    }
    // A friendly hull ahead is traffic, not a terrain wedge. Follow its lane
    // at a safe gap while it captures/turns, instead of repeatedly reversing,
    // blacklisting the bridge and abandoning a still-usable tank on the ramp.
    let following:ReturnType<typeof convoyFollowing>,leaderId='';
    for(const other of this.vehicles){
      if(other===v||other.destroyed||other.team!==h.team||Math.abs(other.model.position.y-v.model.position.y)>3.5)continue;
      const driver=this.hosted.get(other.seats[0]??'');
      if(!driver?.bot||driver.dead)continue;
      const candidate=convoyFollowing(v,other,vehicleSize(v.kind),vehicleSize(other.kind));
      if(candidate&&(!following||candidate.along<following.along)){following=candidate;leaderId=other.id;}
    }
    if(following){
      if(h.trafficFollowing!==leaderId&&now>=(h.trafficAvoidUntil??0)){pilot.invalidate();h.trafficWaitSince=now;}
      const leader=this.vehicles.find(v=>v.id===leaderId);
      const waiting=!!leader&&Math.abs(leader.speed)<.4&&now-(h.trafficWaitSince??now)>2400&&now>=(h.trafficRetryAt??0);
      if(waiting&&now>=(h.trafficAvoidUntil??0)){h.trafficAvoidUntil=now+8000;h.trafficRetryAt=now+10000;pilot.invalidate();}
      if(now>=(h.trafficAvoidUntil??0)){h.trafficFollowing=leaderId;h.driveStall=0;h.vehThrottle=following.throttle;h.vehSteer=following.steer;return;}
      h.trafficFollowing=undefined;
    }
    if(h.trafficFollowing){h.trafficFollowing=undefined;pilot.invalidate();}
    if((h.driveStall??0)>6500){this.disembarkBotCrew(v,now,'no-progress');return;}
    // Plans are the expensive part of the AI: budget them globally, one every
    // ~180 ms, so a squad of tanks cannot stall the simulation on the same frame.
    if(pilot.needsPlan&&now>=this.nextVehiclePlanAt){
      this.nextVehiclePlanAt=now+180;
      const avoiding=now<(h.trafficAvoidUntil??0);
      pilot.plan(v,goal,now,avoiding);
      if(avoiding&&!pilot.reachesGoal){h.trafficAvoidUntil=0;h.trafficWaitSince=now;pilot.invalidate();h.vehThrottle=0;h.vehSteer=0;return;}
      // A reachable route is a precondition, not a hope: if this capture point
      // cannot be driven to, take another one instead of ramming the riverbank.
      const alternative=!pilot.reachesGoal&&this.caps.some(c=>c.id!==objective.id&&!this.vehicleGoalBlocked(h,c.id,now));
      if(alternative){
        (h.vehicleGoalsBlocked??=[]).push({id:objective.id,until:now+90000});
        h.objective='';h.objectiveUntil=0;h.pilot=undefined;h.nextVehicleDecisionAt=0;h.vehicleDecision=undefined;
        h.vehThrottle=0;h.vehSteer=0;
        return;
      }
    }
    if(pilot.needsPlan){h.vehThrottle=0;h.vehSteer=0;return;}
    const command=pilot.tick(v,goal,now);
    h.vehThrottle=command.throttle;h.vehSteer=command.steer;
    // Repeated winch-outs mean the route keeps pinching this hull: stop trying.
    if(v.winchExhausted){v.winchExhausted=false;v.winchCount=0;
      this.abandonVehicleGoal(h,v,now,objective.id,'recoveries');return;}
    if(command.giveUp)this.abandonVehicleGoal(h,v,now,objective.id,pilot.giveUpReason);
  }

  private vehicleGoalBlocked(h:HostedGuest,id:string,now:number){
    return !!h.vehicleGoalsBlocked?.some(b=>b.id===id&&now<b.until);
  }

  private vehicleObjective(h:HostedGuest,v:VehicleState,now:number){
    const previous=h.vehicleDecision;
    const old=previous?.objective;
    const current=this.caps.find(c=>c.id===old?.id)??old;
    const captured=previous?.action==='capture'&&current?.owner===h.team;
    if(current&&now<(h.nextVehicleDecisionAt??0)&&!captured)return this.vehicleApproach(h,v,current,now);
    h.nextVehicleDecisionAt=now+950;
    const ownBase=this.arena.teamSpawns?.[h.team],enemyBase=this.arena.teamSpawns?.[h.team==='blue'?'orange':'blue'];
    const candidates:ArmoredObjective[]=[...this.caps];
    if(ownBase)candidates.push({id:'base-'+h.team,x:ownBase.x,z:ownBase.z,r:9,owner:h.team,base:true});
    const situations=new Map<string,ObjectiveSituation>();
    for(const c of candidates){
      let enemies=0,armor=0,support=0;
      for(const contact of this.tacticalMemory.contacts(h.team)){
        const age=now-contact.at;if(age<0||age>8500||Math.hypot(contact.x-c.x,contact.z-c.z)>38)continue;
        const certainty=1-age/8500;enemies+=certainty;if(contact.armor)armor+=certainty;
      }
      for(const ally of this.hosted.values())if(ally.id!==h.id&&ally.vehicleId!==v.id&&!ally.dead&&ally.team===h.team&&Math.hypot(ally.controller.position.x-c.x,ally.controller.position.z-c.z)<30)support++;
      situations.set(c.id,{enemies,armor,support,danger:this.battleDanger.penalty(h.team,c.x,c.z,now),blocked:this.vehicleGoalBlocked(h,c.id,now)});
    }
    const assignments=[];
    for(const ally of this.hosted.values())if(ally.bot&&ally.vehicleId&&ally.vehicleSeat===0&&!['motorcycle','jeep'].includes(this.vehicles.find(v=>v.id===ally.vehicleId)?.kind??''))assignments.push({id:ally.id,team:ally.team,objective:ally.objective,active:!ally.dead});
    const gun=v.weapons[0],ammo=gun?(isCannon(gun.id)?v.ammo/(gun.id==='vehicle_autocannon_30'?250:30):gun.ammo/240):1;
    const decision=decideArmoredObjective(h.team,v,candidates,assignments,h.id,enemyBase,{kind:v.kind,health:v.health/v.maxHealth,ammo:Math.min(1,ammo),now,previous,ownBase,situations});
    if(!decision)return;
    if(decision.objective.id!==h.objective)h.pilot?.invalidate();
    h.vehicleDecision=decision;h.objective=decision.objective.id;h.objectiveUntil=decision.until;
    return this.vehicleApproach(h,v,decision.objective,now);
  }

  private vehicleApproach(h:HostedGuest,v:VehicleState,objective:ArmoredObjective,now:number){
    const r=objective.r??10,base={...objective,r};
    if(objective.base||Math.hypot(v.x-objective.x,v.z-objective.z)>r+20)return base;
    const cached=h.vehicleParking;
    if(cached?.id===objective.id&&now<cached.until)return {...base,x:cached.x,z:cached.z,r:cached.r};
    const enemyBase=this.arena.teamSpawns?.[h.team==='blue'?'orange':'blue'];
    const axis=enemyBase?Math.atan2(enemyBase.x-objective.x,enemyBase.z-objective.z):v.yaw;
    const hull=vehicleSize(v.kind),world=this.motionWorld,radius=Math.min(4,r*.4);
    let best:{x:number;z:number}|undefined,bestScore=-Infinity;
    for(let i=0;i<8;i++){
      const angle=axis+i*Math.PI/4,x=objective.x+Math.sin(angle)*radius,z=objective.z+Math.cos(angle)*radius;
      if(vehiclePoseBlocked(world,hull,{x,z,yaw:v.yaw},{from:v,ignoreId:v.id}))continue;
      const lateral=Math.abs((x-objective.x)*Math.cos(axis)-(z-objective.z)*Math.sin(axis));
      let score=lateral*2-Math.hypot(v.x-x,v.z-z)*.2;
      // Preserve a route for other friendly hulls and a clear angle for their guns.
      for(const other of this.vehicles){
        if(other===v||other.destroyed||other.team!==h.team||!other.seats[0])continue;
        const dx=x-other.x,dz=z-other.z,along=dx*Math.sin(other.yaw)+dz*Math.cos(other.yaw),side=Math.abs(dx*Math.cos(other.yaw)-dz*Math.sin(other.yaw));
        if(along>0&&along<22&&side<(hull.w+vehicleSize(other.kind).w)*.5+.5)score-=24;
      }
      if(score>bestScore){bestScore=score;best={x,z};}
    }
    if(!best)return base;
    if(!cached||cached.id!==objective.id||Math.hypot(cached.x-best.x,cached.z-best.z)>1)h.pilot?.invalidate();
    h.vehicleParking={id:objective.id,...best,r:Math.min(2.2,r*.45),until:now+4000};
    return {...base,...best,r:h.vehicleParking.r};
  }

  /**
   * The hull cannot reach this objective. Blacklist it and try another capture
   * point first; only the crew walking is better than ramming terrain forever.
   */
  private abandonVehicleGoal(h:HostedGuest,v:VehicleState,now:number,goalId:string,reason:string){
    const blocked=(h.vehicleGoalsBlocked??=[]).filter(b=>now<b.until);
    blocked.push({id:goalId,until:now+60000});
    h.vehicleGoalsBlocked=blocked;
    const alternatives=this.caps.filter(c=>!blocked.some(b=>b.id===c.id&&now<b.until));
    h.pilot=undefined;h.vehThrottle=0;h.vehSteer=0;h.vehicleDecision=undefined;h.nextVehicleDecisionAt=0;
    if(alternatives.length){h.objective='';h.objectiveUntil=0;return;}
    h.objective='';h.objectiveUntil=0;
    this.disembarkBotCrew(v,now,reason);
  }

  private disembarkBotCrew(v:VehicleState,now:number,reason:string){
    for(const [seat,id] of v.seats.entries()){
      const bot=id?this.hosted.get(id):undefined;
      if(!bot)continue;
      const exitSpeed=Math.abs(v.speed);
      this.unseat(v,seat,bot.id);
      this.placeAfterExit(bot.controller,v);
      this.applyExitDamage(bot.controller,exitSpeed,false,bot);
      bot.vehicleId=null;bot.vehicleOrder=undefined;bot.vehicleRetryAt=now+18000;
      bot.vehThrottle=0;bot.vehSteer=0;bot.pilot=undefined;bot.vehicleGoalsBlocked=undefined;bot.driveStall=0;bot.driveProbe=undefined;bot.trafficFollowing=undefined;bot.trafficWaitSince=undefined;bot.trafficAvoidUntil=0;bot.trafficRetryAt=0;
      if(reason==='no-progress'||reason==='recoveries')bot.vehicleRetryAt=now+30000;
    }
  }

  private aimBotVehicle(h:HostedGuest,v:VehicleState,now:number){
    const weapon=v.weapons[h.vehicleSeat-1];
    if(!weapon)return;
    if(!v.seats[0]&&!this.botSeatReserved(v.id,0)&&this.moveSeat(v,h.id,h.vehicleSeat,0)){
      h.vehicleSeat=0;h.vehThrottle=0;h.vehSteer=0;h.vehicleBoardedAt=now;return;
    }
    const cannon=isCannon(weapon.id),origin=weapon.muzzle.getWorldPosition(new THREE.Vector3());
    const candidates=[{id:this.localNetId,team:this.myTeam,dead:this.dead,controller:this.controller,vehicleId:this.drivingId},...this.hosted.values()];
    let best=-Infinity,target:typeof candidates[number]|undefined,targetDistance=0;
    const point=new THREE.Vector3();
    for(const enemy of candidates){
      if(enemy.dead||enemy.team===h.team||this.isSpawnProtected(enemy.id,now))continue;
      const occupied=this.vehicles.find(v=>v.id===enemy.vehicleId&&!v.destroyed);
      const p=occupied&&enclosedVehicle(occupied.kind)?occupied.model.position.clone().add(new THREE.Vector3(0,vehicleSize(occupied.kind).h*.48,0)):
        enemy.controller.position.clone().add(new THREE.Vector3(0,enemy.controller.bodyHeight*.56,0));
      const distance=origin.distanceTo(p);
      if(distance>(cannon?210:145))continue;
      const armored=!!occupied&&enclosedVehicle(occupied.kind);
      const score=botTargetUtility(distance,cannon?95:45,false,now-(this.threats.get(enemy.id)?.at??-Infinity)<1500,armored,cannon,h.targetId===enemy.id)+(cannon&&armored?35:0);
      if(score<=best||this.sightBlocked(origin,p))continue;
      best=score;target=enemy;targetDistance=distance;point.copy(p);
    }
    if(!target){h.targetId=null;return;}
    this.observeBotTarget(h,target.id,point,now);
    point.copy(h.aimSample);
    if(cannon)v.shell=this.protectedByHull(target.id)?'ap':'he';
    if(!cannon&&this.protectedByHull(target.id))return;
    const projectile=cannon?(weapon.id==='vehicle_autocannon_30'?(v.shell==='ap'?AMMO.ac30_ap:AMMO.ac30_he):AMMO[v.shell]):AMMO.vehicle_mg,flight=targetDistance/projectile.muzzleVelocity;
    const velocity=h.aimVelocity,lead=Math.min(.4,flight+Math.max(0,now-(h.aimObservedAt??now))/1000)*.7;
    if(velocity){point.x+=velocity.x*lead;point.y+=velocity.y*lead;point.z+=velocity.z*lead;}
    point.y+=4.905*projectile.gravityScale*flight**2;
    const desired=point.sub(origin).normalize();
    const aimYaw=weapon.aimYaw+THREE.MathUtils.clamp(angleDelta(Math.atan2(desired.x,desired.z),weapon.aimYaw),-.34,.34);
    const aimPitch=weapon.aimPitch+THREE.MathUtils.clamp(Math.asin(desired.y)-weapon.aimPitch,-.21,.21);
    this.setVehicleAim(v,h.vehicleSeat,aimYaw,aimPitch);
    if(now<h.nextBotFire||weapon.muzzle.getWorldDirection(new THREE.Vector3()).dot(desired)<Math.cos(cannon?.045:.035))return;
    const hit=this.traceCombat(origin,desired,Math.max(2,targetDistance-1),h.id);
    if(hit?.kind==='player'&&(hit.id===this.localNetId?this.myTeam:this.hosted.get(hit.id??'')?.team)===h.team){h.friendlyFireBlockedUntil=now+650;return;}
    if(hit?.kind==='vehicle'&&this.vehicles.find(v=>v.id===hit.id)?.team===h.team){h.friendlyFireBlockedUntil=now+650;return;}
    h.friendlyFireBlockedUntil=0;this.fireVehicleFor(h.id);
    h.nextBotFire=now+(cannon?420:295);
  }

  private spawnYawFor(team: 'blue' | 'orange'): number {
    return this.arena.teamSpawns?.[team].yaw ?? this.arena.spawnYaw;
  }

  private teamSpawn(team: 'blue' | 'orange'): THREE.Vector3 {
    const slot = team === 'blue' ? this.blueSlots++ : this.orangeSlots++;
    const col = slot % 2;
    const row = Math.floor(slot / 2);
    if (this.arena.teamSpawns) {
      const s = this.arena.teamSpawns[team];
      return new THREE.Vector3(s.x + (col - 0.5) * 1.4, 0, s.z + row * 1.4);
    }
    const p = this.arena.spawn.clone();
    p.x += (team === 'blue' ? -3.2 : 3.2) + col * 1.2;
    p.z += row * 1.4;
    return p;
  }

  /** Spawn/deploy positions must stay inside the map fence, not just off colliders. */
  private insideArenaBounds(x:number,z:number,margin=4):boolean{
    const b=this.arena.bounds;
    return x>=b.minX+margin&&x<=b.maxX-margin&&z>=b.minZ+margin&&z<=b.maxZ-margin;
  }

  private safeSpotRadius(x: number, z: number, radius: number, maxR = 20): { x: number; z: number } {
    const b=this.arena.bounds;
    // Large teams can push teamSpawn's row offset far past the fence; clamp the
    // origin first so the spiral searches inwards instead of walking further out.
    x=THREE.MathUtils.clamp(x,b.minX+4,b.maxX-4);z=THREE.MathUtils.clamp(z,b.minZ+4,b.maxZ-4);
    const blocked = (px: number, pz: number) => !this.insideArenaBounds(px,pz) || (this.arena.blockedAt
      ? this.arena.blockedAt(px, pz, radius, this.arena.navigationHeight?.(px,pz)??this.arena.heightAt?.(px,pz)??0)
      : this.arena.blocked(px, pz, radius)) || !!this.arena.waterAt?.(px, pz);
    if (!blocked(x, z)) return { x, z };
    for (let r = 0.8; r <= maxR; r += 0.6) {
      const steps = Math.max(16, Math.round(r * 9));
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2 + r * 1.13;
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        if (!blocked(px, pz)) return { x: px, z: pz };
      }
    }
    const cx=(b.minX+b.maxX)/2, cz=(b.minZ+b.maxZ)/2;
    return { x: cx, z: cz };
  }

  private safeSpot(x: number, z: number): { x: number; z: number } {
    return this.safeSpotRadius(x, z, 0.5);
  }

  private makeSpawn(index: number): THREE.Vector3 {
    const p = this.arena.spawn.clone();
    const col = index % 4;
    const row = Math.floor(index / 4);
    p.x += (col - 1.5) * 1.6;
    p.z += row * 1.8;
    return p;
  }

  private assignedTeam(id:string): NetTeam|undefined {
    const team=this.teamAssignments[id];
    return team==='blue'||team==='orange'?team:undefined;
  }

  private nextGuestTeam(): NetTeam {
    let blue = this.myTeam === 'blue' ? 1 : 0;
    let orange = this.myTeam === 'orange' ? 1 : 0;
    for (const h of this.hosted.values()) { if (h.bot) continue; if (h.team === 'blue') blue++; else orange++; }
    this.guestCount++;
    if (blue < orange) return 'blue';
    if (orange < blue) return 'orange';
    return this.random() < 0.5 ? 'blue' : 'orange';
  }

  private addPlayer(id: string, name: string, team: NetTeam = 'orange', bot = false) {
    if (this.remotes.has(id)) return;
    const spawn = this.teamSpawn(team);
    const safe = this.safeSpot(spawn.x, spawn.z);
    // 100v100 时所有 Bot 不能挤在同一个出生点：按黄金角铺开到基地半径 8–46 m。
    if (bot) {
      const n = this.hosted.size, a = n * 2.39996, radius = 8 + (n % 10) * 4.2;
      const cand = this.safeSpot(safe.x + Math.cos(a) * radius, safe.z + Math.sin(a) * radius);
      if (!this.arena.playerBlocked?.(cand.x, cand.z, .45, this.arena.heightAt?.(cand.x, cand.z) ?? 0)) {
        safe.x = cand.x; safe.z = cand.z;
      }
    }
    spawn.set(safe.x,this.arena.heightAt?.(safe.x,safe.z)??0,safe.z);
    const rig = createBlockyCharacter(team, { weapon: true,batched:true });
    this.registerShadowModel(rig.root);
    rig.root.position.copy(spawn);
    rig.root.visible = this.isHost;
    this.scene.add(rig.root);
    const remote: RemoteAvatar = {
      id,
      name,
      team,
      rig,
      target: spawn.clone(),
      velocity: new THREE.Vector3(),
      sampleTime: this.simulationNow,
      yaw: 0,
      pitch: 0,
      moving: false,
      sprinting: false,
      crouching: false,
      lean:0,
      swimming: false,climbing:false,mantleTime:-1,grounded:true,airTime:0,
      action: 'idle',
      blendT: 0,
      blendFrom: null,
      time: this.random() * 2,
      seen: this.isHost,
      health: 100,
      dead: false,weaponId:'m16',vehicleId:null,vehicleSeat:0,
      protectedUntil: 0,
    };
    this.remotes.set(id, remote);
    if (this.isHost) {
      const controller = new PlayerController(new THREE.PerspectiveCamera(),id);
      controller.teleport(spawn, this.spawnYawFor(team));
      this.hosted.set(id, { id, name, team, controller, input: new NetworkInput(), yaw: controller.yaw, pitch: controller.pitch, lastInput: 0, spawn, health: 100, lastDamageAt:-Infinity, dead: false, respawnAt: 0, protectedUntil: 0, bot, nextBotFire: 0, botStrafe: 'KeyA', botStrafeUntil: 0, vehicleId: null,vehicleSeat:0, vehThrottle: 0, vehSteer: 0, respawnChoice: 'base',overlayOpen:false,selection:{...DEFAULT_LOADOUT},ammo:30,reserve:120,reloadEnd:0,nextFire:0,spawnSerial:0,targetId:null,lastSeen:0,nextThink:0,objective:'',objectiveUntil:0,lastKnown:new THREE.Vector3(),lastShotAt:-Infinity,aimSample:new THREE.Vector3(),nextAimSample:0,burstShots:0,path:[],nextPath:0,throwables:[1,1],nextThrow:0,lastShotSeq:0,lastShotClientAt:0,inputSeq:0,lastQueuedSeq:0,pendingInputs:[] });
    }
  }

  private bodyYaw(controller:PlayerController){const ladder=controller.climbing?this.arena.ladders?.find(l=>l.id===controller.ladderId):undefined;return ladder?Math.atan2(ladder.normalX,ladder.normalZ):controller.yaw;}

  private stateFor(id: string, controller: PlayerController, team: NetTeam, host = false) {
    const local = id === this.localNetId;
    const h = this.hosted.get(id);
    const protectionMs = (local ? this.protectedUntil : h?.protectedUntil ?? 0) - this.simulationNow;
    return {
      id,
      name:local?this.localName:h?.name,
      team,
      host,
      health: local ? this.health : (h?.health ?? 100),
      dead: local ? this.dead : (h?.dead ?? false),
      protectionMs: protectionMs > 0 ? Math.min(RESPAWN_PROTECTION_MS, Math.ceil(protectionMs)) : undefined,
      p: [controller.position.x, controller.position.y, controller.position.z],
      yaw: this.bodyYaw(controller),
      pitch: controller.pitch,
      moving: controller.moving,
      sprinting: controller.sprinting,
      crouching: controller.crouched,
      prone:controller.prone,
      lean:controller.lean,
      swimming: controller.swimming,
      // Only remote humans need the full state for self-reconciliation. Proxies
      // consume traversal progress; broadcasting every bot's private dynamics
      // multiplies snapshot size and starves movement in three-person AI rooms.
      motion:local||h?.bot?{mantle:controller.mantle?{elapsed:controller.mantle.elapsed}:null}:controller.motionSnapshot,climbing:controller.climbing,ladderId:controller.ladderId,
      respawnSeconds:Math.max(0,((local?this.respawnAt:h?.respawnAt??0)-this.simulationNow)/1000),
      overlayOpen:local?this.overlayOpen:h?.overlayOpen??false,
      spawnSerial:local?this.localSpawnSerial:h?.spawnSerial??0,
      teleportSerial:controller.teleportSerial,
      ammo:local?this.ammo:h?.ammo??30,reserve:local?this.reserve:h?.reserve??120,
      selection:local?(this.isSpecialWeaponId(this.weapon.id)?{...this.selection,weaponId:this.weapon.id}:this.selection):h?.selection??DEFAULT_LOADOUT,
      combatAction:local?(this.reloading?'reload':this.simulationNow-this.lastLocalShotAt<160?'fire':this.ads?'aim':undefined):(h?.reloadEnd?'reload':h&&this.simulationNow-h.lastShotAt<160?'fire':h&&(h.targetId||!h.controller.sprintAllowed)?'aim':undefined),
      ackShot:h?.lastShotSeq??0,ackInput:h?.inputSeq??0,velocity:controller.velocity.toArray(),grounded:controller.grounded,jumpHeld:controller.jumpDown,
      vehicleId:local?this.drivingId:h?.vehicleId??null,
      vehicleSeat:local?this.vehicleSeat:h?.vehicleSeat??0,

    };
  }

  private startLive() {
    if (this.phase !== 'prep') return;
    if(!this.worldReady)return;
    this.phase = 'live';
    this.overlayOpen = false;
    this.prepDeadline = 0;
    this.prepSeconds = 0;
    if (this.isHost && this.botsEnabled) {
      try { this.fillBots(); } catch (err) { console.error('fillBots failed', err); }
    }
    this.ads = false;
    this.clearBodies();this.recentDamage.clear();this.battleDanger.clear();this.tacticalMemory.clear();
    for(const crate of this.lootCrates)crate.model.visible=true;
    this.resetVehicles();
    this.resetFerries();
    for (const el of this.nameplates.values()) el.remove();
    this.nameplates.clear();
    this.armed = true;
    this.health = 100;
    this.dead = false;
    this.respawnAt = 0;
    this.protectedUntil = 0;
    this.matchRemaining = this.matchDurationSeconds;this.matchDeadline=performance.now()+this.matchRemaining*1000;
    this.winner = '';
    this.scores.blue = 0;
    this.scores.orange = 0;
    for (const cap of this.caps) { cap.owner = 'neutral'; cap.progress = 0; this.setCapColor(cap); }
    for (const h of this.hosted.values()) {
      const w=getWeapon(h.selection.weaponId)!;h.ammo=w.magazine;h.reserve=w.reserve;h.reloadEnd=0;h.health = 100;
      h.dead = false;h.overlayOpen=false;h.pendingInputs=[];h.input.clear();h.inputSeq=h.lastQueuedSeq;
      h.respawnAt = 0;
      h.protectedUntil = 0;
    }
    const liveSpot = this.safeSpot(this.localSpawn.x, this.localSpawn.z);
    this.localSpawn.set(liveSpot.x,this.arena.navigationHeight?.(liveSpot.x,liveSpot.z)??this.arena.heightAt?.(liveSpot.x,liveSpot.z)??0,liveSpot.z);
    this.controller.teleport(this.localSpawn, this.spawnYawFor(this.myTeam));
    for (const h of this.hosted.values()) {
      const spot = this.safeSpot(h.spawn.x, h.spawn.z);
      h.spawn.set(spot.x,this.arena.navigationHeight?.(spot.x,spot.z)??this.arena.heightAt?.(spot.x,spot.z)??0,spot.z);
      h.controller.teleport(h.spawn, this.spawnYawFor(h.team));
      h.yaw = h.controller.yaw;
      h.pitch = h.controller.pitch;
    }
    this.assignArmoredCrews(this.simulationNow);
    this.viewmodel.setEquipped(true);
    this.ammo = this.weapon.magazine;
    this.reserve = this.weapon.reserve;
    this.reloading = false;
    this.bannerUntil = this.simulationNow + 2400;
    this.pendingInputs = [];
    this.input.clear();
    this.hudDirty = true;
  }

  private switchFireMode(){
    const modes=this.weapon.fireModes;
    if(modes.length<2||this.phase!=='live'||!this.armed||this.dead||this.drivingId||
       this.overlayOpen||!this.input.pointerLocked||this.winner)return;
    this.fireModeIndex=(this.fireModeIndex+1)%modes.length;
    this.fireModeNoticeUntil=this.simulationNow+1250;
    this.burstRemaining=0;
    this.triggerNeedsRelease=this.input.mouse.left;
    this.input.clearFirePress();
    this.hudDirty=true;
  }

  private startReload() {
    if(this.controller.mantle||this.controller.climbing)return;
    if (this.drivingId) return;
    if (this.phase !== 'live'||this.dead||this.controller.climbing||this.winner||this.paused||this.overlayOpen||this.reloading)return;
    if (this.ammo >= this.weapon.magazine || this.reserve <= 0) return;
    this.reloading = true;
    this.burstRemaining=0;
    if(this.net&&!this.isHost)this.net.send({t:'reload',matchId:this.matchId});
    this.audio.reload();
    this.reloadEnd = this.simulationNow + this.weapon.reload * 1000;
    this.viewmodel.reload(this.weapon.reload);
    this.hudDirty = true;
  }

  private finishReload() {
    const need = this.weapon.magazine - this.ammo;
    const take = Math.min(need, this.reserve);
    this.ammo += take;
    this.reserve -= take;
    this.reloading = false;
    this.hudDirty = true;
  }

  private takeFx(map:THREE.Texture,origin:THREE.Vector3,size:number,life:number,color=0xaaaaa0,flash=false){
    if(this.fx.length>=getSettings().particles)return null;
    let f=this.fxPool.find(f=>!f.obj.visible);
    if(!f){const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map,transparent:true,depthWrite:false}));this.scene.add(sprite);f={obj:sprite,age:0,life,startScale:size,endScale:size*3,startOpacity:.5,endOpacity:0,vel:new THREE.Vector3(),sprite:true};this.fxPool.push(f);}
    const sprite=f.obj as THREE.Sprite;sprite.visible=true;sprite.position.copy(origin);sprite.scale.set(size,size,1);sprite.material.map=map;sprite.material.color.setHex(color);sprite.material.blending=flash?THREE.AdditiveBlending:THREE.NormalBlending;sprite.material.opacity=flash?.95:.5;sprite.material.rotation=Math.random()*Math.PI*2;
    Object.assign(f,{age:0,life,startScale:size,endScale:size*(flash?1.4:3),startOpacity:flash?.95:.5,endOpacity:0});f.vel.set(0,.35,0);this.fx.push(f);return f;
  }
  private bloodBurst(pos:THREE.Vector3){for(let i=0;i<3;i++){const f=this.takeFx(SMOKE_TEX,pos,.12,.24,0x981d16);if(f)f.vel.set((Math.random()-.5)*1.2,Math.random()*.7,(Math.random()-.5)*1.2);}}
  private spawnShotFx(origin:THREE.Vector3,dir:THREE.Vector3,scale=1,withFlash=true){
    if(withFlash){const f=this.takeFx(MUZZLE_FLASH_TEXTURE,origin,.24*scale,.045,0xffffff,true);f?.vel.set(0,0,0);}
    const puff=this.takeFx(SMOKE_TEX,origin,.16*scale,.5,0x9aa096);if(puff)puff.vel.copy(dir).multiplyScalar(.6).y+=.35;
  }
  private projectileMuzzleFx(origin:THREE.Vector3,dir:THREE.Vector3,def:ProjectileDef){
    if(def.armor==='bullet'){this.spawnShotFx(origin,dir,def.id==='vehicle_mg'?1.4:1);return;}
    this.takeFx(MUZZLE_FLASH_TEXTURE,origin,2.1,.14,0xffbf73,true)?.vel.copy(dir).multiplyScalar(4);
    for(let i=0;i<4;i++){
      const puff=this.takeFx(SMOKE_TEX,origin.clone().addScaledVector(dir,i*.24),.6+i*.18,.95+i*.15,0x8f8171);
      if(puff)puff.vel.copy(dir).multiplyScalar(1.6+i*.5).y+=.5;
    }
  }
  private shellImpactFx(point:THREE.Vector3,he:boolean){
    const scale=he?1:.78;
    const center=point.clone().add(new THREE.Vector3(0,.45,0));
    this.takeFx(MUZZLE_FLASH_TEXTURE,center,7.2*scale,.26,0xffac4c,true);
    this.takeFx(MUZZLE_FLASH_TEXTURE,center,4.8*scale,.16,0xffe0a6,true);
    for(let i=0;i<10;i++){
      const angle=i*Math.PI/5;
      this.takeFx(SMOKE_TEX,center,3.0*scale,1.45+i*.07,0x827161)?.vel.set(Math.cos(angle)*5.8*scale,.9+i%3*.62,Math.sin(angle)*5.8*scale);
    }
  }
  private trimFx(){for(const f of this.fx)f.obj.visible=false;this.fx.length=0;}

  private updateSkyLabels() {
    if (!this.labelSprites.length) return;
    const v = new THREE.Vector3();
    for (const spr of this.labelSprites) {
      spr.getWorldPosition(v);
      const p = v.project(this.camera);
      const on = p.z < 1 && Math.abs(p.x) < 0.87 && p.y > -0.88 && p.y < 0.94;
      spr.visible = on;
      const line = spr.userData.labelLine as THREE.Object3D | undefined;
      if (line) line.visible = on;
    }
  }

  private updateFx(dt: number) {
    this.impacts.update(dt, this.camera);
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.age += dt;
      const t = f.age / f.life;
      if (t >= 1) {
        f.obj.visible=false;
        this.fx.splice(i, 1);
        continue;
      }
      f.obj.position.addScaledVector(f.vel, dt);
      if (f.sprite) {
        const s = f.startScale + (f.endScale - f.startScale) * t;
        (f.obj as THREE.Sprite).scale.set(s, s, 1);
      }
      const mat = (f.obj as THREE.Mesh).material;
      if (mat && !Array.isArray(mat)) (mat as THREE.Material).opacity = f.startOpacity + (f.endOpacity - f.startOpacity) * t;
    }
  }

  private traceCombat(origin:THREE.Vector3,dir:THREE.Vector3,max:number,shooterId:string):CombatHit|null {
    const surface=this.arena.raySurface?.(origin,dir,max)??null;
    let distance=surface?surface.distance:this.arena.rayDistance?.(origin,dir,max)??Infinity;
    if(!this.arena.rayDistance&&!surface){for(let d=0;d<max;d+=.25){if(origin.y+dir.y*d<(this.arena.heightAt?.(origin.x+dir.x*d,origin.z+dir.z*d)??0)){distance=d;break;}}}
    let hit:CombatHit|null=Number.isFinite(distance)?{kind:'world',distance,point:origin.clone().addScaledVector(dir,distance),normal:surface?.normal,material:surface?.material}:null;
    const vehicle=this.hosted.get(shooterId)?.vehicleId??(shooterId===this.localNetId?this.drivingId:null);
    for(const v of this.vehicles){if(v.destroyed||v.id===vehicle)continue;const size=vehicleSize(v.kind);const d=rayBoxDistance(origin,dir,{x:v.x,z:v.z,w:size.w,d:size.d,rot:v.yaw,bottom:v.model.position.y,top:v.model.position.y+size.h},Math.min(max,distance));if(d<distance&&d<=max){distance=d;hit={kind:'vehicle',id:v.id,distance:d,point:origin.clone().addScaledVector(dir,d)};}}
    const test=(id:string,controller:Pick<PlayerController,'position'|'bodyHeight'|'yaw'>,dead:boolean,vehicleId:string|null)=>{
      if(dead||id===shooterId)return;
      const occupied=this.vehicles.find(v=>v.id===vehicleId);if(occupied&&enclosedVehicle(occupied.kind))return;
      const pos=controller.position,height=controller.bodyHeight;
      const d=rayBoxDistance(origin,dir,{x:pos.x,z:pos.z,w:.65,d:.65,rot:0,bottom:pos.y,top:pos.y+height},Math.min(max,distance));
      if(d<distance&&d<=max){
        distance=d;
        const point=origin.clone().addScaledVector(dir,d);
        hit={kind:'player',id,distance:d,point,zone:infantryHitZone(origin,dir,d,pos,height,controller.yaw)};
      }
    };
    test(this.localNetId,this.controller,this.dead,this.drivingId);for(const h of this.hosted.values())test(h.id,h.controller,h.dead,h.vehicleId);
    if(!this.isHost)for(const r of this.remotes.values())test(r.id,{position:r.target,bodyHeight:r.prone?.74:r.crouching?1.25:1.8,yaw:r.yaw},r.dead,r.vehicleId);
    for(const target of this.arena.targets){if(target.hit)continue;target.mesh.updateMatrixWorld();const b=new THREE.Box3().setFromObject(target.mesh),size=b.getSize(new THREE.Vector3()),center=b.getCenter(new THREE.Vector3());const d=rayBoxDistance(origin,dir,{x:center.x,z:center.z,w:size.x,d:size.z,rot:0,bottom:b.min.y,top:b.max.y},Math.min(max,distance));if(d<distance){distance=d;hit={kind:'target',distance:d,point:origin.clone().addScaledVector(dir,d),target};}}
    return hit;
  }

  private isSpawnProtected(id:string, now:number) {
    return now < (id === this.localNetId ? this.protectedUntil : this.hosted.get(id)?.protectedUntil ?? 0);
  }

  private applyCombatHit(hit:CombatHit|null,shooterId:string,def:ProjectileDef,now:number,allowFriendly=false){
    if(!this.isHost||!hit)return;
    const shooterTeam=shooterId===this.localNetId?this.myTeam:this.hosted.get(shooterId)?.team;
    const falloff=1-(1-def.minDamageScale)*THREE.MathUtils.clamp((hit.distance-def.falloffStart)/Math.max(1,def.maxRange-def.falloffStart),0,1);
    let amount=def.damage*falloff,killed=false,success=false;
    if(hit.kind==='target'&&hit.target){this.registerHit(hit.target,now);success=true;}
    if(hit.kind==='vehicle'){
      const v=this.vehicles.find(v=>v.id===hit.id);
      if(v&&!v.destroyed&&v.team!==shooterTeam){
        const size=vehicleSize(v.kind),dx=hit.point.x-v.x,dz=hit.point.z-v.z,front=dx*Math.sin(v.yaw)+dz*Math.cos(v.yaw);
        amount=vehicleDirectDamage(def,amount,v.kind,{front,halfDepth:size.d});
        v.health=Math.max(0,v.health-amount);success=amount>0;
        if(v.health<=0){this.destroyVehicle(v,shooterId);killed=true;}
      }
    }
    if(hit.kind==='player'&&hit.id){const h=this.hosted.get(hit.id),local=hit.id===this.localNetId,team=local?this.myTeam:h?.team;
      if(this.isSpawnProtected(hit.id,now))return;
      if((allowFriendly||team!==shooterTeam)&&(local||h)&&!(local?this.dead:h?.dead)){
        amount=infantryDamage(amount,def,hit.zone);
        if(amount<=0)return;
        if(shooterTeam&&shooterTeam!==team){
          let history=this.recentDamage.get(hit.id);
          if(!history){history=new Map();this.recentDamage.set(hit.id,history);}
          const previous=history.get(shooterId);
          history.set(shooterId,{at:now,amount:Math.min(amount,local?this.health:h!.health)+(previous&&now-previous.at<10000?previous.amount:0)});
          const shooterController=shooterId===this.localNetId?this.controller:this.hosted.get(shooterId)?.controller;
          if(shooterController){
            const seen=this.threats.get(shooterId),carry=seen&&now-seen.at<20000?seen.weight:0;
            const shooterWeapon=shooterId===this.localNetId?this.weapon:getWeapon(this.hosted.get(shooterId)?.selection.weaponId??'m16');
            const longRange=!!shooterWeapon&&(shooterWeapon.className==='sniper'||shooterWeapon.className==='dmr');
            this.threats.set(shooterId,{x:shooterController.position.x,y:shooterController.position.y,z:shooterController.position.z,at:now,weight:Math.min(8,carry+1),longRange});
          }
        }
        success=true;this.bloodBurst(hit.point);
        if(local){this.lastDamageAt=now;this.health=Math.max(0,this.health-amount);this.hurtFlash=1;this.audio.hurt();if(!this.health){this.die(hit.id);killed=true;}}
        else if(h){h.lastDamageAt=now;if(h.bot)h.nextThink=Math.min(h.nextThink,now+80);h.health=Math.max(0,h.health-amount);if(!h.health){this.die(hit.id);killed=true;}}
        if(killed){
          if(team!==shooterTeam)this.addKill(shooterId,hit.id,now);
          this.recentDamage.delete(hit.id);
        }
      }
    }
    if(success){if(shooterId===this.localNetId){this.hitmarkerUntil=now+(killed?360:160);this.audio.hit();}else this.net?.send({t:'hitAck',matchId:this.matchId,peerId:shooterId,killed});this.hudDirty=true;}
  }

  private destroyVehicle(v:(typeof this.vehicles)[number],shooter:string){
    if(v.destroyed)return;
    const occupied=this.drivingId===v.id||[...this.hosted.values()].some(h=>h.vehicleId===v.id);
    const height=vehicleSize(v.kind).h;
    v.destroyed=true;v.speed=0;v.health=0;
    const blastAt=v.model.position.clone().add(new THREE.Vector3(0,height*.5,0));
    this.damageFx?.explosion(blastAt,1.25);
    this.audio.cannon();
    for(const id of v.seats.slice()){
      if(!id)continue;
      const local=id===this.localNetId,h=this.hosted.get(id),controller=local?this.controller:h?.controller;
      if(!controller)continue;
      if((local?this.drivingId:h?.vehicleId)===v.id){
        this.placeAfterExit(controller,v);
        if(local)this.clearLocalVehicle();
        else if(h){h.vehicleId=null;h.vehThrottle=0;h.vehSteer=0;}
      }
      this.applyCombatHit({kind:'player',id,distance:0,point:controller.position.clone()},shooter,{...AMMO.he,damage:130},this.simulationNow,true);
    }
    v.seats.fill(null);
    this.vehicleBlast(blastAt,v,shooter);
    this.blackenWreck(v);
    const team=shooter===this.localNetId?this.myTeam:this.hosted.get(shooter)?.team;
    if(occupied&&team&&v.team!=='neutral'&&team!==v.team){this.scores[team]=Math.min(1000,this.scores[team]+15);}
    if(shooter){
      const shooterName=this.playerName(shooter),label=this.vehicleLabel(v.kind);
      this.killFeed.unshift({text:`${shooterName} 摧毁 ${label}`,team:team??'blue',at:performance.now(),kind:'vehicle'});
      this.killFeed=this.killFeed.slice(0,5);
      this.registerEvent({id:this.nextEventId++,kind:'vehicle',text:`${shooterName} 摧毁 ${label}`,points:15,at:this.simulationNow,actorId:shooter,targetLabel:label,team});
    }
    this.hudDirty=true;
  }

  /** 车毁爆炸的范围伤害：周围步兵 + 周围载具（非装甲吃满、装甲折减，可链式引爆）。 */
  private vehicleBlast(point:THREE.Vector3,v:(typeof this.vehicles)[number],shooter:string){
    const radius=7.5,peak=120;
    for(const e of [{id:this.localNetId,controller:this.controller,dead:this.dead},...this.hosted.values()]){
      if(e.dead||e.id===this.localNetId&&this.drivingId===v.id)continue;
      const p=e.controller.position.clone().add(new THREE.Vector3(0,1,0)),d=p.distanceTo(point);
      if(d>radius)continue;
      this.applyCombatHit({kind:'player',id:e.id,distance:0,point:p},shooter,{...AMMO.he,damage:vehicleExplosionDamage(d,radius,peak),splash:undefined},this.simulationNow,true);
    }
    for(const other of this.vehicles){
      if(other===v||other.destroyed)continue;
      const d=Math.hypot(other.x-point.x,other.z-point.z);
      if(d>radius)continue;
      const dmg=vehicleExplosionDamage(d,radius,peak)*(isArmoredVehicle(other.kind)?.35:1);
      if(dmg<1)continue;
      other.health=Math.max(0,other.health-dmg);
      if(other.health<=0)this.destroyVehicle(other,shooter);
    }
  }

  /** 打炸后的全黑残骸：保留原模型、所有材质换黑、贴地并轻微倾斜，跨局由 resetVehicles 还原。 */
  private blackenWreck(v:(typeof this.vehicles)[number]){
    const ground=this.arena.navigationHeight?.(v.x,v.z)??this.arena.heightAt?.(v.x,v.z)??v.model.position.y;
    v.model.position.y=ground;
    v.model.rotation.z+=(v.yaw*7%2>1?1:-1)*.028;
    v.model.traverse((o)=>{const mesh=o as THREE.Mesh;if(!mesh.isMesh)return;if(!mesh.userData.om)mesh.userData.om=mesh.material;mesh.material=WRECK_MATERIAL;});
    v.model.visible=true;
  }

  /** 中途下车摔落伤害：与车速挂钩（>=5 m/s 起），只扣血不改位置。host 权威，bot/guest 同一套。 */
  private applyExitDamage(controller:PlayerController,speed:number,local:boolean,h?:HostedGuest){
    const damage=fallDamageFromExit(speed);
    if(damage<1)return;
    const now=this.simulationNow;
    if(local){
      if(this.dead)return;
      this.lastDamageAt=now;this.health=Math.max(0,this.health-damage);this.hurtFlash=1;this.audio.hurt();
      if(!this.health)this.die(this.localNetId);
    }else if(h){
      if(h.dead)return;
      h.lastDamageAt=now;h.health=Math.max(0,h.health-damage);
      if(!h.health)this.die(h.id);
      else if(h.bot)h.nextThink=Math.min(h.nextThink,now+120);
    }
    this.hudDirty=true;
  }

  /* ------------------------------------------------------------------ *
   * Authoritative cable ferries
   * ------------------------------------------------------------------ */
  private initFerries(){
    const defs=this.arena.ferries;
    if(!defs?.length)return;
    this.ferrySystem=new FerrySystem(defs);
    for(const cfg of defs){
      const visual=buildFerryVisual(cfg);
      this.scene.add(visual.group);
      this.ferries.push({cfg,visual,targetX:visual.group.position.x,targetZ:cfg.z,targetYaw:visual.group.rotation.y});
    }
  }

  /**
   * Host: advance the 60 Hz state machine and copy it onto the deck platforms.
   * Guest: only smooth the visual toward the latest host snapshot (no prediction
   * of ferry phase or position — the host stays authoritative).
   */
  private updateFerries(dt:number){
    if(!this.ferrySystem)return;
    if(this.isHost)this.ferrySystem.tick(dt);
    const blend=1-Math.exp(-dt*14);
    for(const f of this.ferries){
      const p=f.visual.group.position;
      const oldX=p.x;
      const oldZ=p.z;
      if(this.isHost){
        const st=this.ferrySystem.state(f.cfg.id)!;
        p.x=st.x;p.z=st.z;f.visual.group.rotation.y=st.yaw;
      }else{
        p.x+=(f.targetX-p.x)*blend;
        p.z+=(f.targetZ-p.z)*blend;
        const angle=((f.targetYaw-f.visual.group.rotation.y+Math.PI*3)%(Math.PI*2))-Math.PI;
        f.visual.group.rotation.y+=angle*blend;
      }
      const dx=p.x-oldX,dz=p.z-oldZ;
      if(Math.abs(dx)+Math.abs(dz)<1e-5)continue;
      const platformId=`ferry-${f.cfg.id}`;
      if(!this.dead&&!this.drivingId)this.controller.carryManualPlatform(this.arena,platformId,dx,dz);
      if(this.isHost)for(const h of this.hosted.values()){
        if(!h.dead&&!h.vehicleId)h.controller.carryManualPlatform(this.arena,platformId,dx,dz);
      }
    }
  }

  private applyFerrySnapshots(raw:unknown[]){
    if(!this.ferrySystem)return;
    for(const item of raw){
      if(!item||typeof item!=='object')continue;
      const s=item as {id?:unknown;phase?:unknown;t?:unknown;x?:unknown;z?:unknown;yaw?:unknown};
      if(typeof s.id!=='string'||typeof s.phase!=='string'||!Number.isFinite(s.t)||!Number.isFinite(s.x))continue;
      const f=this.ferries.find(q=>q.cfg.id===s.id);if(!f)continue;
      f.targetX=Number(s.x);
      f.targetZ=Number.isFinite(s.z)?Number(s.z):f.cfg.z;
      f.targetYaw=Number.isFinite(s.yaw)?Number(s.yaw):f.targetYaw;
      this.ferrySystem.applySnapshot({id:s.id,phase:s.phase as never,t:Number(s.t),x:Number(s.x),z:f.targetZ,yaw:f.targetYaw});
      // Hard snap on a new round / first snapshot so the deck never drifts in from the old bank.
      if(!Number.isFinite(f.visual.group.position.x)||Math.abs(f.visual.group.position.x-f.targetX)>8){f.visual.group.position.x=f.targetX;f.visual.group.position.z=f.targetZ;}
    }
  }

  private resetFerries(){
    this.ferrySystem?.reset();
    for(const f of this.ferries){
      const st=this.ferrySystem?.state(f.cfg.id);
      if(!st)continue;
      f.targetX=st.x;f.targetZ=st.z;f.targetYaw=st.yaw;
      f.visual.group.position.x=st.x;f.visual.group.position.z=st.z;f.visual.group.rotation.y=st.yaw;
    }
  }

  /** Rails run along the two long sides. Both ends are flush boarding ramps. */
  private ferryRailBlocked(x:number,z:number,r:number,feet:number,height:number):boolean {
    for(const f of this.ferries){
      const p=f.visual.group.position;
      const deck=f.cfg.deckY;
      if(feet>=deck+1.04||feet+height<=deck)continue;
      if(Math.abs(x-p.x)>f.cfg.deckLength/2+r)continue;
      const railZ=f.cfg.deckWidth/2-0.08;
      if(Math.abs(Math.abs(z-p.z)-railZ)<r+0.06)return true;
    }
    return false;
  }

  private nearbyFerryDock(c:PlayerController){
    if(!this.ferrySystem||c.climbing||c.mantle)return null;
    const p=c.position;
    for(const f of this.ferries){
      const st=this.ferrySystem.state(f.cfg.id)!;
      if(Math.abs(p.y-f.cfg.deckY)>2.2)continue;
      const deck=f.visual.group.position;
      const aboard=Math.abs(p.y-f.cfg.deckY)<.12&&Math.abs(p.x-deck.x)<=f.cfg.deckLength/2&&Math.abs(p.z-deck.z)<=f.cfg.deckWidth/2;
      const west=Math.hypot(p.x-f.cfg.westX,p.z-f.cfg.z)<=6;
      const east=Math.hypot(p.x-f.cfg.eastX,p.z-f.cfg.z)<=6;
      if(aboard||west||east){
        const call=(west&&st.phase==='dockedEast')||(east&&st.phase==='dockedWest');
        return {id:f.cfg.id,phase:st.phase,aboard,call,canRequest:isDocked(st.phase)&&(aboard||call)};
      }
    }
    return null;
  }

  private ferryPrompt():string{
    if(this.drivingId||this.dead)return '';
    const ferry=this.nearbyFerryDock(this.controller);
    if(!ferry)return '';
    if(ferry.phase==='countdownWest'||ferry.phase==='countdownEast')return '渡船即将出发';
    if(ferry.phase==='movingEast'||ferry.phase==='movingWest')return '渡船行驶中';
    if(ferry.aboard)return ferry.phase==='dockedWest'?'E 驶向东岸':'E 驶向西岸';
    return ferry.call?'E 呼叫渡船':'登上渡船后按 E 出发';
  }

  private resetVehicles(){
    const now=this.simulationNow;
    const manager=this.vehicleSpawnManager;
    const dynamic=new Set<string>();
    if(manager)for(const action of manager.reset(now))dynamic.add(action.vehicleId);
    // 兜底：客机没有管理器，按初始车位 id 清掉所有非初始载具。
    for(const v of this.vehicles)if(!this.initialVehicleIds.has(v.id))dynamic.add(v.id);
    for(const id of dynamic)this.removeVehicle(id,'reset');
    // 初始车位载具缺失（被上限清掉/漏收）就补回来。
    for(const def of this.arena.vehicles??[]){
      if(this.vehicles.some(v=>v.id===def.id))continue;
      const spot=this.vehicleSpawn(def.kind,def.x,def.z,def.angle);
      this.buildVehicleState({id:def.id,kind:def.kind,team:def.team,x:spot.x,y:spot.y,z:spot.z,yaw:def.angle});
    }
    for(const v of this.vehicles){
      v.destroyed=false;v.health=v.maxHealth;v.speed=0;v.shell='ap';v.nextFire=0;
      v.ammo=v.weapons.some(w=>w.id==='vehicle_autocannon_30')?250:30;
      v.seats.fill(null);v.turretYaw=0;v.turretPitch=0;v.yawVelocity=0;v.pitchVelocity=0;v.aimPitch=0;
      for(const w of v.weapons){w.ammo=isCannon(w.id)?(w.id==='vehicle_autocannon_30'?250:30):240;w.nextFire=0;w.yaw=0;w.pitch=0;w.spread=0;w.lastFire=0;}
      v.model.traverse((o)=>{const mesh=o as THREE.Mesh;if(mesh.isMesh&&mesh.userData.om)mesh.material=mesh.userData.om;});
      const spawn=this.arena.vehicles?.find(a=>a.id===v.id);
      if(spawn){
        // Respawn at the pad, but through the clearance search: several authored pads
        // sit on hedges/wrecks, and parking the hull inside one strands the vehicle.
        const spot=this.vehicleSpawn(v.kind,spawn.x,spawn.z,spawn.angle);
        v.x=spot.x;v.z=spot.z;v.yaw=spawn.angle;v.aimYaw=spawn.angle;
        v.model.position.set(spot.x,spot.y,spot.z);v.model.rotation.set(0,spawn.angle,0);
      }
      v.model.visible=true;v.model.updateMatrixWorld(true);
    }
    this.nextVehicleSpawnCheck=0;
    this.lastPadSignature='';this.nextPadSyncAt=0;
    this.damageFx?.dispose();this.damageFx=new VehicleDamageFx(this.scene);
    this.flameJet?.dispose();this.flameJet=new FlameJet(this.scene);
    if(this.isHost&&this.net)this.net.send({t:'vehReset',matchId:this.matchId,vehicles:this.vehicles.map(v=>({id:v.id,kind:v.kind,team:v.team,x:v.x,y:v.model.position.y,z:v.z,yaw:v.yaw}))});
  }

  /** 客机收到 host 的 vehReset：按主机列表重建/复位载具，移除不在列表里的本地车。 */
  private applyNetVehicleReset(list:unknown[]){
    const keep=new Set<string>();
    for(const item of list){
      const raw=item as {id?:unknown;kind?:unknown;team?:unknown;x?:unknown;y?:unknown;z?:unknown;yaw?:unknown};
      if(!raw||typeof raw.id!=='string'||typeof raw.kind!=='string')continue;
      const x=Number(raw.x),z=Number(raw.z),y=Number(raw.y),yaw=Number(raw.yaw);
      if(![x,z].every(Number.isFinite))continue;
      keep.add(raw.id);
      const team=raw.team==='blue'||raw.team==='orange'||raw.team==='neutral'?raw.team:'neutral';
      let v=this.vehicles.find(v=>v.id===raw.id);
      if(!v){
        v=this.buildVehicleState({id:raw.id,kind:raw.kind,team,x,z,y:Number.isFinite(y)?y:(this.arena.navigationHeight?.(x,z)??this.arena.heightAt?.(x,z)??0),yaw:Number.isFinite(yaw)?yaw:0});
      }else{
        if(this.drivingId===v.id)this.clearLocalVehicle();
        v.destroyed=false;v.health=v.maxHealth;v.speed=0;v.shell='ap';v.nextFire=0;
        v.ammo=v.weapons.some(w=>w.id==='vehicle_autocannon_30')?250:30;
        v.seats.fill(null);v.turretYaw=0;v.turretPitch=0;v.yawVelocity=0;v.pitchVelocity=0;v.aimPitch=0;
        for(const w of v.weapons){w.ammo=isCannon(w.id)?(w.id==='vehicle_autocannon_30'?250:30):240;w.nextFire=0;w.yaw=0;w.pitch=0;w.spread=0;w.lastFire=0;}
        v.model.traverse((o)=>{const mesh=o as THREE.Mesh;if(mesh.isMesh&&mesh.userData.om)mesh.material=mesh.userData.om;});
        v.x=x;v.z=z;v.yaw=Number.isFinite(yaw)?yaw:0;v.aimYaw=v.yaw;
        v.model.position.set(x,Number.isFinite(y)?y:v.model.position.y,z);v.model.rotation.set(0,v.yaw,0);
        v.model.visible=true;v.model.updateMatrixWorld(true);
      }
    }
    for(const v of [...this.vehicles])if(!keep.has(v.id))this.removeVehicle(v.id,'reset');
    this.hudDirty=true;
  }

  /** 每帧给载具特效层喂状态：低血冒烟由 health 驱动，所有客户端各自表现。 */
  private updateVehicleFx(dt:number){
    this.damageFx?.update(dt,this.vehicles.map(v=>({id:v.id,x:v.x,y:v.model.position.y,z:v.z,yaw:v.yaw,kind:v.kind,health:v.health,maxHealth:v.maxHealth,destroyed:v.destroyed})));
    this.flameJet?.update(dt);
    this.updateVehicleVisibility();
    if(this.phase==='live'&&!this.dead&&!this.drivingId&&this.armed&&!this.paused&&!this.overlayOpen&&
       this.weapon.id==='flamethrower'&&this.input.mouse.left&&this.ammo>0){
      const origin=new THREE.Vector3();this.viewmodel.getMuzzleWorld(origin);
      this.flameJet?.emit(origin,this.aimDirection(true),dt);
    }
  }

  /**
   * 每帧按相机距离裁剪载具模型（纯表现：物理/AI/净空/快照仍用全部载具）。
   * `arena.vehicleCullDistance`（map-arena 按图给：法老 420、旧图缺省 360）为 0/Infinity 时不裁。
   * 本地驾驶/乘座的车辆强制可见；客机只影响本地渲染。SunShadows 只收可见模型，故无需改。
   */
  private updateVehicleVisibility(){
    const configured=(this.arena as {vehicleCullDistance?:number}).vehicleCullDistance;
    const cull=configured??360;
    const cut=Number.isFinite(cull)&&cull>0?cull*cull:Infinity;
    const camera=this.camera.position;
    for(const v of this.vehicles){
      if(this.drivingId===v.id){v.model.visible=true;continue;}
      const dx=v.x-camera.x,dy=v.model.position.y-camera.y,dz=v.z-camera.z;
      v.model.visible=dx*dx+dy*dy+dz*dz<=cut;
    }
  }
  private playerName(id:string){return id===this.localNetId?this.localName:this.hosted.get(id)?.name??'PLAYER';}

  private updateProjectileVisuals(){if(!this.projectileMesh)return;let count=0;for(const p of this.projectiles.items){if(!p.active&&!p.visibleFor)continue;const t=this.projectileTransform;t.position.copy(p.position);const direction=p.velocity.clone().add(new THREE.Vector3(0,-9.81*p.def.gravityScale*p.age,0)).normalize();t.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),direction);const heavy=p.def.armor!=='bullet';const length=Math.min(p.distance,heavy?1.3:p.def.id==='vehicle_mg'?3.8:3.0)*(p.active?1:p.visibleFor/IMPACT_STREAK_SECONDS);t.position.addScaledVector(direction,-length*.5);t.scale.set(heavy?6:1,heavy?6:1,length);t.updateMatrix();this.projectileMesh.setMatrixAt(count++,t.matrix);}this.projectileMesh.count=count;this.projectileMesh.visible=count>0;this.projectileMesh.instanceMatrix.needsUpdate=true;}

  private sightBlocked(a:THREE.Vector3,b:THREE.Vector3){return !!this.arena.lineBlocked?.(a,b)||!!this.tactical?.blocksSight(a,b);}
  private protectedByHull(id:string){const vehicle=id===this.localNetId?this.drivingId:this.hosted.get(id)?.vehicleId,v=this.vehicles.find(v=>v.id===vehicle);return !!v&&!v.destroyed&&enclosedVehicle(v.kind);}
  private explode(shooter:string,point:THREE.Vector3,radius:number,damage:number){
    for(const e of [{id:this.localNetId,controller:this.controller,dead:this.dead},...this.hosted.values()]){if(e.dead||this.protectedByHull(e.id))continue;const p=e.controller.position.clone().add(new THREE.Vector3(0,1,0)),d=p.distanceTo(point);if(d>radius||this.arena.lineBlocked?.(point.clone().add(new THREE.Vector3(0,.1,0)),p))continue;this.applyCombatHit({kind:'player',id:e.id,distance:0,point:p},shooter,{...AMMO.he,damage:damage*(1-d/radius),splash:undefined},this.simulationNow);}
    for(const v of this.vehicles){if(v.destroyed)continue;const d=Math.hypot(v.x-point.x,v.z-point.z);if(d>radius)continue;const dmg=blastVehicleDamage(AMMO.he,damage*1.2,v.kind,d,radius);if(dmg<1)continue;v.health=Math.max(0,v.health-dmg);if(v.health<=0)this.destroyVehicle(v,shooter);}
    this.audio.cannon();this.spawnShotFx(point,new THREE.Vector3(0,1,0),2,true);
  }
  private throwItem(slot:number,shooter=this.localNetId){
    const h=this.hosted.get(shooter),local=shooter===this.localNetId,selection=local?this.selection:h?.selection,counts=local?this.throwableCounts:h?.throwables,now=this.simulationNow;
    if(!selection||!counts||(local?this.drivingId:h?.vehicleId)||counts[slot]<=0||this.phase!=='live'||this.winner||!this.worldReady||(local?this.dead||this.overlayOpen||this.controller.climbing:this.hosted.get(shooter)?.dead||!!h?.controller.climbing)||now<(local?this.nextThrow:h?.nextThrow??0))return;
    const kind=selection.throwables[slot];if(kind!=='frag'&&kind!=='smoke')return;
    if(!this.isHost){this.net?.send({t:'throw',matchId:this.matchId,slot});counts[slot]--;this.nextThrow=now+700;return;}
    const controller=local?this.controller:h!.controller,origin=controller.position.clone().add(new THREE.Vector3(0,controller.eye,0)),dir=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(controller.pitch,controller.yaw,0,'YXZ'));
    if(this.tactical?.spawn(shooter,kind,origin,dir)){counts[slot]--;if(local)this.nextThrow=now+700;else h!.nextThrow=now+700;this.net?.send({t:'throwFx',matchId:this.matchId,shooter,kind,origin:origin.toArray(),dir:dir.toArray()});}
  }
  private updateSupply(now:number){
    if(!this.isHost||this.phase!=='live'||this.winner||now<this.nextSupply)return;
    this.nextSupply=now+1000;
    const local={id:this.localNetId,team:this.myTeam,controller:this.controller,dead:this.dead,health:this.health,lastDamageAt:this.lastDamageAt};
    for(const player of [local,...this.hosted.values()]){
      if(player.dead)continue;
      const base=this.arena.teamSpawns?.[player.team],p=player.controller.position;
      const nearSupply=!!base&&Math.hypot(p.x-base.x,p.z-base.z)<10||
        this.caps.some(c=>c.owner===player.team&&Math.abs(c.progress)>.99&&Math.hypot(p.x-c.x,p.z-c.z)<6);
      const resupplying=nearSupply&&player.controller.velocity.length()<=1;
      const recovery=now-player.lastDamageAt>=5000?10:resupplying?8:0;
      player.health=Math.min(100,player.health+recovery);
      if(resupplying){
        const h=this.hosted.get(player.id);
        if(h)h.reserve=Math.max(h.reserve,getWeapon(h.selection.weaponId)!.reserve);
        else this.reserve=Math.max(this.reserve,this.weapon.reserve);
      }
    }
    this.health=local.health;
    for(const v of this.vehicles){const b=v.team==='neutral'?undefined:this.arena.teamSpawns?.[v.team];if(!v.destroyed&&b&&Math.abs(v.speed)<.2&&Math.hypot(v.x-b.x,v.z-b.z)<14){v.health=Math.min(v.maxHealth,v.health+20);v.ammo=Math.min(v.weapons.some(w=>w.id==='vehicle_autocannon_30')?250:30,v.ammo+1);for(const w of v.weapons)if(!isCannon(w.id))w.ammo=Math.min(240,w.ammo+25);}}
  }

  private weaponAmmo(weapon:WeaponCatalogEntry):ProjectileDef {
    if(weapon.id==='rpg')return {...ROCKET_AMMO,damage:weapon.damage};
    const template=weapon.id==='amr'?AMMO.amr:weapon.className==='smg'?AMMO.smg:weapon.className==='sniper'||weapon.className==='dmr'?AMMO.sniper:weapon.className==='shotgun'?AMMO.pellet:AMMO.rifle;
    return {...template,damage:weapon.damage/(weapon.className==='shotgun'?8:1),lethalHit:weapon.lethalHit};
  }
  private launch(shooter:string,origin:THREE.Vector3,dir:THREE.Vector3,def:ProjectileDef){
    const projectile=this.projectiles.spawn(shooter,origin,dir,def);this.projectileMuzzleFx(origin,dir,def);
    this.net?.send({t:'shotFx',matchId:this.matchId,shooter,origin:origin.toArray(),dir:dir.toArray(),ammo:def.id,bulletId:def.armor==='bullet'?projectile?.id:undefined});
  }
  private updateProjectiles(dt:number,now:number){
    if(!this.isHost){
      this.projectiles.update(dt,(p,d,len)=>{
        const world=this.arena.rayDistance?.(p.position,d,len)??Infinity;
        const stop=p.effect?.stopDistance;
        return stop===undefined?world:Math.min(world,Math.max(0,stop-p.distance));
      },()=>{});
      return;
    }
    let impact:CombatHit|null=null;
    this.projectiles.update(dt,(p,dir,len)=>{impact=this.traceCombat(p.position,dir,len,p.shooter);return impact?.distance??Infinity;},p=>{
      const hit=impact as CombatHit|null;if(hit)hit.distance=p.distance;
      this.applyCombatHit(hit,p.shooter,p.def,now);
      if(p.def.armor==='bullet'&&hit){
        if(hit.kind==='world')this.registerImpact(hit,p.velocity,true,hit.material??5);
        else{
          this.registerImpact(hit,p.velocity,false,10);
          this.net?.send({t:'bulletImpact',matchId:this.matchId,id:p.id,point:p.position.toArray(),distance:p.distance});
        }
      }
      if(!p.def.splash)return;
      const he=p.def.armor==='he';
      this.shellImpactFx(p.position,he);
      this.net?.send({t:'shellImpact',matchId:this.matchId,point:p.position.toArray(),he});
      const blastOrigin=p.position.clone().addScaledVector(p.velocity.clone().add(new THREE.Vector3(0,-9.81*p.def.gravityScale*p.age,0)).normalize(),-.13);
      for(const h of [{id:this.localNetId,controller:this.controller,dead:this.dead},...this.hosted.values()]){
        if(h.dead||h.id===hit?.id||this.protectedByHull(h.id))continue;
        const center=h.controller.position.clone().add(new THREE.Vector3(0,h.controller.bodyHeight*.48,0));
        const distance=center.distanceTo(p.position);
        const damage=blastDamage(distance,p.def.splashInner??0,p.def.splash,p.def.splashDamage??p.def.damage);
        if(damage<.5)continue;
        let exposed=0;
        for(const fraction of [.2,.5,.85]){
          const sample=h.controller.position.clone().add(new THREE.Vector3(0,h.controller.bodyHeight*fraction,0));
          if(!this.arena.lineBlocked?.(blastOrigin,sample))exposed++;
        }
        const attenuation=exposed===3?1:exposed===2?.68:exposed===1?.38:.07;
        this.applyCombatHit({kind:'player',id:h.id,distance:0,point:center},p.shooter,{...p.def,damage:damage*attenuation},now);
      }
      for(const v of this.vehicles){
        if(v.destroyed||v.id===hit?.id)continue;
        const d=Math.hypot(v.x-p.position.x,v.z-p.position.z);
        if(d>(p.def.splash??0))continue;
        const dmg=blastVehicleDamage(p.def,p.def.splashDamage??p.def.damage,v.kind,d,p.def.splash??1);
        if(dmg<1)continue;
        v.health=Math.max(0,v.health-dmg);
        if(v.health<=0)this.destroyVehicle(v,p.shooter);
      }
    });
    this.flushImpacts();
  }
  /** Host-side: dust + decal + sound on a bullet hit, queued for the room broadcast. */
  private registerImpact(hit:CombatHit,dir:THREE.Vector3,decal:boolean,material:number){
    const normal=hit.normal&&hit.normal.lengthSq()>.25?hit.normal:dir.lengthSq()>.25?dir.clone().normalize().negate():new THREE.Vector3(0,1,0);
    this.impacts.spawn(hit.point,normal,material,decal);
    this.playImpactSound(material,hit.point);
    this.impactQueue.push(hit.point.x,hit.point.y,hit.point.z,normal.x,normal.y,normal.z,decal?material:-material);
  }
  private flushImpacts(){
    if(!this.impactQueue.length)return;
    const hits:number[][]=[];
    for(let i=0;i<this.impactQueue.length&&hits.length<16;i+=7)hits.push(this.impactQueue.slice(i,i+7));
    this.impactQueue.length=0;
    this.net?.send({t:'impactFx',matchId:this.matchId,hits});
  }
  private playImpactSound(material:number,point:THREE.Vector3){
    const gain=THREE.MathUtils.clamp(1-this.camera.position.distanceTo(point)/50,0,1);
    this.audio.impact(impactSurface(material),gain*gain);
  }
  private insideWorld(point:THREE.Vector3){
    const bounds=this.arena.bounds;
    return point.x>bounds.minX-8&&point.x<bounds.maxX+8&&point.z>bounds.minZ-8&&point.z<bounds.maxZ+8&&point.y>-40&&point.y<400;
  }

  private setCapColor(cap: { owner: 'neutral' | 'blue' | 'orange'; ring: THREE.Mesh; beam: THREE.Mesh }) {
    const color = cap.owner === 'blue' ? 0x4aa8ff : cap.owner === 'orange' ? 0xff7a3d : 0x8a9a96;
    (cap.ring.material as THREE.MeshBasicMaterial).color.setHex(color);
    (cap.beam.material as THREE.MeshBasicMaterial).color.setHex(color);
  }

  private updateCapture(dt:number,now:number){
    if(!this.isHost||this.phase!=='live'||this.winner)return;
    this.matchRemaining=Math.max(0,(this.matchDeadline-performance.now())/1000);
    // 地图自带得分倍率（法老 0.6 → 每点 0.72/s）；旧图缺省 1，行为不变。
    const rate=this.arena.scoreRate??1;
    const players=[{team:this.myTeam,pos:this.controller.position,dead:this.dead},...[...this.hosted.values()].map(h=>({team:h.team,pos:h.controller.position,dead:h.dead}))];
    // 默认按「脚下的地面」判定，而不是一个围绕圆心的绝对高度窗口：据点圆环可能铺在
    // 坡上，站在坡下只要水平在圈内、脚踩在圈内的地面上，就必须算占点。
    // 室内据点（capturePoint.floorY）则改为固定高度 + 垂直容差：金字塔顶/上层廊道/
    // 地下墓道与 A/B 的水平投影重合时不会误占。
    const standingIn=(cap:CapState,p:{pos:THREE.Vector3;dead:boolean})=>{
      if(p.dead)return false;
      const surface=this.arena.supportAt?.(p.pos.x,p.pos.z,p.pos.y+.6)??this.arena.navigationHeight?.(p.pos.x,p.pos.z)??p.pos.y;
      return capturePointAllows(cap,p.pos.x,p.pos.z,p.pos.y,surface);
    };
    for(const cap of this.caps){let blue=0,orange=0;for(const p of players){if(!standingIn(cap,p))continue;if(p.team==='blue')blue++;else orange++;}
      const pressure=blue&&!orange?1:orange&&!blue?-1:0;
      if(pressure){const before=cap.progress;cap.progress=THREE.MathUtils.clamp(cap.progress+pressure*dt/8,-1,1);
        if(cap.owner==='blue'&&cap.progress<.999||cap.owner==='orange'&&cap.progress>-.999){cap.owner='neutral';this.setCapColor(cap);}
        if(cap.progress>=1&&cap.owner!=='blue'){cap.owner='blue';this.setCapColor(cap);this.audio.capture();this.pushEvent('capture',`蓝队占领 ${cap.id}`,0);}
        if(cap.progress<=-1&&cap.owner!=='orange'){cap.owner='orange';this.setCapColor(cap);this.audio.capture();this.pushEvent('capture',`橙队占领 ${cap.id}`,0);}
      }
      if(!(blue&&orange)&&cap.owner!=='neutral')this.scores[cap.owner]=Math.min(1000,this.scores[cap.owner]+dt*1.2*rate);
    }
    if(this.scores.blue>=1000)this.winner='blue';else if(this.scores.orange>=1000)this.winner='orange';else if(this.matchRemaining<=0)this.winner=this.scores.blue===this.scores.orange?'draw':this.scores.blue>this.scores.orange?'blue':'orange';
    if(this.winner){this.input.release();this.ads=false;this.reloading=false;this.audio.win();}
  }

  private addKill(attackerId: string, targetId: string, now: number) {
    if (!this.isHost || attackerId === targetId) return;
    const attackerTeam = attackerId === this.localNetId ? this.myTeam : this.hosted.get(attackerId)?.team;
    if (!attackerTeam) return;
    const attackerName = attackerId === this.localNetId ? this.localName : (this.hosted.get(attackerId)?.name ?? 'PLAYER');
    const targetName = targetId === this.localNetId ? this.localName : (this.hosted.get(targetId)?.name ?? 'PLAYER');
    const targetTeam = targetId === this.localNetId ? this.myTeam : this.hosted.get(targetId)?.team;
    this.scores[attackerTeam] = Math.min(1000, this.scores[attackerTeam] + 5);
    for(const [id,damage] of this.recentDamage.get(targetId)??[]){
      if(id===attackerId||now-damage.at>10000||damage.amount<15)continue;
      if(id===this.localNetId)this.recordAssist(targetName);
      else if(!this.hosted.get(id)?.bot)this.net?.send({t:'assist',matchId:this.matchId,peerId:id,targetName});
    }
    this.registerEvent({
      id:this.nextEventId++,kind:'kill',text:`${attackerName} 击杀 ${targetName}`,points:5,at:now,
      actorId:attackerId,targetId,attackerName,targetName,team:attackerTeam,
    });
    this.killFeed.unshift({ text: `${attackerName} 击杀 ${targetName}`, team: attackerTeam, at: now, kind: 'kill' });
    this.killFeed = this.killFeed.slice(0, 5);
    this.hudDirty = true;
  }

  private respawnHosted(h: HostedGuest) {
    this.recentDamage.delete(h.id);h.vehicleOrder=undefined;
    const options = this.availableRespawns(h.team);
    const p = options.find((o) => o.id === h.respawnChoice) ?? options[0];
    const spot=this.deploymentSpot(h.team,p.x,p.z);
    h.dead = false;
    if(h.bot)this.botRespawnLoadout(h,this.simulationNow);
    h.throwables=[1,1];h.spawnSerial++;h.overlayOpen=false;h.input.clear();h.pendingInputs=[];h.reloadEnd=0;h.ammo=getWeapon(h.selection.weaponId)!.magazine;h.reserve=getWeapon(h.selection.weaponId)!.reserve;
    h.health = 100;
    h.protectedUntil = this.simulationNow + RESPAWN_PROTECTION_MS;
    h.vehicleId = null;
    h.targetId=null;h.routeWaypoint=undefined;h.detour=undefined;h.nextDetourAt=0;h.objectiveUntil=0;h.botStrafeUntil=0;
    h.stanceIntent='stand';h.nextStanceAt=0;
    h.waterEntry=undefined;h.waterCross=undefined;h.waterCrossRetryAt=0;h.waterDiveUntil=0;h.waterRetreatAt=0;h.blockedObjective=undefined;h.dangerDetour=undefined;h.dangerAvoided=undefined;h.dangerRejected=undefined;h.dangerProgress=undefined;h.dangerCheckAt=0;
    this.localNavigation?.forget(h.id);h.controller.teleport(new THREE.Vector3(spot.x,this.arena.navigationHeight?.(spot.x,spot.z)??this.arena.heightAt?.(spot.x,spot.z)??0,spot.z), this.spawnYawFor(h.team));
    h.yaw = h.controller.yaw;
    h.pitch = h.controller.pitch;
    const r = this.remotes.get(h.id);
    if (r) { r.dead = false; r.rig.root.position.copy(h.controller.position); r.health = 100; r.rig.root.visible = true; }
    this.hudDirty = true;
  }

  private updateRespawns(now: number) {
    if (!this.isHost||this.winner||this.phase!=='live') return;
    // 人类玩家（本地/客机）不再自动部署：respawnAt 只是“最短 5 秒等待”，
    // 倒计时结束后必须由玩家点击 HUD 的“部署”按钮才复活。机器人保持自动部署。
    for (const h of this.hosted.values()) {
      if (!h.bot || !h.dead || h.overlayOpen || now < h.respawnAt || this.winner) continue;
      this.respawnHosted(h);
    }
  }

  private registerHit(target: ArenaTarget, now: number) {
    this.audio.hit();
    this.score += 100;
    target.hit = true;
    target.respawnAt = now + 2600;
    (target.mesh.material as THREE.MeshLambertMaterial).color.setHex(0x35e0d0);
    this.hitmarkerUntil = now + 160;
    this.net?.send({
      t: 'target',matchId:this.matchId,
      index: this.arena.targets.indexOf(target),
      hit: true,
      score: this.score,
      respawnAt: target.respawnAt,
    });
    this.hudDirty = true;
  }

  private updateTargets(now: number) {
    for (const t of this.arena.targets) {
      if (t.hit && now >= t.respawnAt) {
        t.hit = false;
        (t.mesh.material as THREE.MeshLambertMaterial).color.setHex(0xff6a4d);
        this.net?.send({ t: 'targetReset',matchId:this.matchId, index: this.arena.targets.indexOf(t) });
      }
    }
  }

  private infantryMuzzle(eye:THREE.Vector3,yaw:number,pitch:number,weapon:WeaponCatalogEntry,optic:string,ads:boolean){
    return new THREE.Vector3().fromArray(neutralMuzzleOffset(weapon.id,optic,ads))
      .applyEuler(new THREE.Euler(pitch,yaw,0,'YXZ')).add(eye);
  }

  private aimDirection(withSpread = false) {
    const w = this.weapon;
    const motion=1+Math.min(1.8,Math.hypot(this.controller.velocity.x,this.controller.velocity.z)/5)+(this.controller.grounded?0:2);const spread = withSpread ? (100-w.stats.accuracy)/100*(this.ads?.0016:.012)*motion*(this.controller.prone?.37:this.controller.crouched?.65:1):0;
    const direction=new THREE.Vector3(0,0,-1);
    if(this.ads)direction.lerp(this.viewmodel.localAim(new THREE.Vector3()),THREE.MathUtils.smoothstep(this.viewmodel.adsAmount,.12,.78));
    if(spread){direction.x+=(this.random()-.5)*spread;direction.y+=(this.random()-.5)*spread;}
    return direction.normalize().applyQuaternion(this.camera.quaternion);
  }

  private applyRecoil() {
    const impulse=this.weaponRecoil.fire(this.weapon.id,this.ads,this.controller.crouched,()=>this.random(),this.controller.prone);
    this.viewmodel.applyRecoil(impulse);
  }

  private fire() {
    if(this.drivingId||this.phase!=='live'||this.overlayOpen||this.reloading||!this.armed||this.dead||this.controller.climbing||this.controller.mantle||this.viewmodel.blocked||this.paused||this.winner)return;
    const now=this.simulationNow;if(now<this.nextFireAt)return;
    if(this.weapon.id==='flamethrower'){this.fireFlame(now);return;}
    if(this.ammo<=0){this.startReload();return;}
    this.nextFireAt=now+60000/this.weapon.rpm;this.lastLocalShotAt=now;this.ammo--;this.audio.shot();this.viewmodel.fire();
    const origin=new THREE.Vector3();this.viewmodel.getMuzzleWorld(origin);
    const eye=this.camera.position.clone();
    const aim=this.aimDirection(true);
    const ammo=this.weaponAmmo(this.weapon);
    // The crosshair is the aim: trace from the eye along the crosshair ray, then fire
    // the muzzle toward that exact point so a shifted or leaned gun cannot miss it.
    const converge=(direction:THREE.Vector3)=>{
      const hit=this.traceCombat(eye,direction,ammo.maxRange,this.localNetId);
      const target=hit?hit.point:eye.clone().addScaledVector(direction,Math.min(ammo.maxRange,350));
      return target.sub(origin).normalize();
    };
    if(this.net&&!this.isHost){
      const seq=++this.shotSequence;this.pendingShots.push(seq);
      // `eye` lets the host trace from the pose the shooter actually saw (client
      // prediction + smoothing included). Without it a moving guest's shot starts
      // at the host's older copy of the player and misses by up to a metre.
      this.net.send({t:'shoot',matchId:this.matchId,seq,clientAt:performance.now(),yaw:Math.atan2(-aim.x,-aim.z),pitch:Math.asin(THREE.MathUtils.clamp(aim.y,-1,1)),eye:eye.toArray(),look:{seq:this.inputSequence,yaw:this.controller.yaw,pitch:this.controller.pitch,ads:this.adsIntent}});
      // Instant local crosshair feedback; the host's authoritative hitAck still
      // refreshes it (and plays the confirm sound) when the bullet actually lands.
      // Never flash on a teammate: the host ignores friendly damage, so there
      // would be no ack and the mark would be a lie.
      const predicted=this.traceCombat(eye,aim,ammo.maxRange,this.localNetId);
      const friendly=predicted?.kind==='player'
        ? (predicted.id===this.localNetId?this.myTeam:this.remotes.get(predicted.id!)?.team)===this.myTeam
        : predicted?.kind==='vehicle'
          ? this.vehicles.find(v=>v.id===predicted.id)?.team===this.myTeam
          : false;
      if(predicted&&predicted.kind!=='world'&&!friendly)this.hitmarkerUntil=Math.max(this.hitmarkerUntil,now+90);
    }
    else {const obstruction=this.arena.lineBlocked?.(eye,origin);if(!obstruction)for(let i=0;i<(this.weapon.className==='shotgun'?8:1);i++){const d=aim.clone();if(this.weapon.className==='shotgun')d.add(new THREE.Vector3((this.random()-.5)*.08,(this.random()-.5)*.08,(this.random()-.5)*.08)).normalize();this.launch(this.localNetId,origin,converge(d),ammo);}}
    this.applyRecoil();this.hudDirty=true;
    if(this.isHost&&this.isSpecialWeaponId(this.weapon.id)&&!this.ammo)this.restorePrimary();
  }

  /** 喷火器 tick：燃料 100 / 每秒 22 快速下降，只伤人（开放载具乘员可被直接烧到），不伤载具本体。 */
  private fireFlame(now:number){
    const tick=.1;
    if(this.ammo<FLAME_TUNING.minFuelToSpray){
      this.burstRemaining=0;
      // 燃料可能停在 0<fuel<1 的零头：这里也算打空，换回主武器，别永远卡着喷火器。
      if(this.isHost&&this.isSpecialWeaponId(this.weapon.id)){this.ammo=0;this.restorePrimary();}
      return;
    }
    const burn=Math.min(this.ammo,FLAME_TUNING.fuelPerSecond*tick);
    this.ammo-=burn;this.nextFireAt=now+100;this.lastLocalShotAt=now;this.hudDirty=true;
    const origin=new THREE.Vector3();this.viewmodel.getMuzzleWorld(origin);
    const dir=this.aimDirection(true);
    if(this.net&&!this.isHost)this.net.send({t:'flame',matchId:this.matchId,origin:origin.toArray(),dir:dir.toArray()});
    else this.flameDamage(this.localNetId,origin,dir);
    if(!this.ammo)this.restorePrimary();
  }

  /**
   * 锥形火焰判定：火焰是从喷口向外扩散的圆锥（不是一条射线），躯干球被锥面覆盖即掉血。
   * 只有在同一次覆盖里压到「正面头部球」才点燃面部 → 1.5 秒重度视野致盲；
   * 背对着被烧只掉血不失明。封闭载具内的人烧不到，敞篷载具乘员可以。
   */
  private flameDamage(shooterId:string,origin:THREE.Vector3,dir:THREE.Vector3){
    const tick=.1,range=FLAME_TUNING.range,now=this.simulationNow;
    const cone={origin,dir};
    const shooterTeam=shooterId===this.localNetId?this.myTeam:this.hosted.get(shooterId)?.team;
    for(const t of [{id:this.localNetId,controller:this.controller,dead:this.dead,vehicleId:this.drivingId},...this.hosted.values()]){
      if(t.dead||t.id===shooterId)continue;
      const team=t.id===this.localNetId?this.myTeam:this.hosted.get(t.id)?.team;
      if(shooterTeam&&team&&team===shooterTeam)continue;
      const carrier=t.vehicleId?this.vehicles.find(v=>v.id===t.vehicleId):undefined;
      if(carrier&&enclosedVehicle(carrier.kind))continue;
      const pos=t.controller.position;
      // 复用临时向量：火焰每 100 ms 判定一次，避免按目标数产生垃圾。
      this.flamePoint.set(pos.x,pos.y+(carrier?1.1:1),pos.z);
      if(!flameCoversSphere(cone,this.flamePoint,.3,range))continue;
      if(this.arena.lineBlocked?.(origin,this.flamePoint))continue;
      const falloff=1-(origin.distanceTo(this.flamePoint)/range)*.55;
      this.applyCombatHit({kind:'player',id:t.id,distance:0,point:this.flamePoint},shooterId,{...AMMO.rifle,damage:FLAME_TUNING.dps*tick*falloff,lethalHit:undefined,limbScale:1},now);
      if(this.isSpawnProtected(t.id,now))continue;
      this.flamePoint.set(pos.x,pos.y+flameHeadHeight(t.controller.bodyHeight),pos.z);
      if(flameCoversSphere(cone,this.flamePoint,FLAME_TUNING.headRadius,range)&&
         flameFacesShooter(t.controller.yaw,pos,origin)&&
         !this.arena.lineBlocked?.(origin,this.flamePoint))this.igniteFace(t.id,now);
    }
  }

  /** 面部被火焰烧到：本地直接盲；bot 置失明并丢目标；联机访客由 host 广播（客户端按自身时钟计 1.5 秒）。 */
  private igniteFace(id:string,now:number){
    const until=now+FLAME_TUNING.blindSeconds*1000;
    if(id===this.localNetId){
      if(this.burnBlindUntil<=now)this.burnBlindStart=now;
      this.burnBlindUntil=Math.max(this.burnBlindUntil,until);
      return;
    }
    const h=this.hosted.get(id);
    if(!h)return;
    const extended=(h.burnUntil??0)<until-120;
    h.burnUntil=Math.max(h.burnUntil??0,until);
    if(!extended)return;
    if(h.bot){h.targetId=null;h.lastSeen=0;h.nextThink=Math.min(h.nextThink,now+60);}
    else this.net?.send({t:'burn',matchId:this.matchId,target:id});
  }

  /** 致盲强度 0..1：120ms 拉满，尾段 420ms 淡出；持续被烧会不断续期保持满强度。 */
  private burnBlindIntensity(now:number){
    const left=this.burnBlindUntil-now;
    if(left<=0)return 0;
    const rampIn=Math.min(1,(now-this.burnBlindStart)/120);
    const rampOut=Math.min(1,left/420);
    return Math.max(0,Math.min(1,rampIn,rampOut));
  }

  receiveNet(data: unknown, fromPeerId?: string) {
    const msg = data as any;
    if (!msg || typeof msg !== 'object') return;
    if(msg.matchId!==this.matchId)return;
    if(this.isHost&&fromPeerId&&!this.net?.peers.some(p=>p.id===fromPeerId))return;
    if(!this.isHost&&fromPeerId&&this.net&&fromPeerId!==this.net.hostId)return;
    if(msg.t==='pickupLoot'&&this.isHost&&fromPeerId&&typeof msg.id==='string'){this.pickupLoot(msg.id,fromPeerId);return;}
    if(msg.t==='flame'&&this.isHost&&fromPeerId){
      const h=this.hosted.get(fromPeerId);
      if(!h||h.dead||h.vehicleId||h.overlayOpen||this.phase!=='live'||this.winner||h.selection.weaponId!=='flamethrower'||h.ammo<=0)return;
      if(!Array.isArray(msg.origin)||msg.origin.length!==3||!msg.origin.every(Number.isFinite)||!Array.isArray(msg.dir)||msg.dir.length!==3||!msg.dir.every(Number.isFinite))return;
      h.ammo=Math.max(0,h.ammo-FLAME_TUNING.fuelPerSecond*.1);
      this.flameDamage(h.id,new THREE.Vector3().fromArray(msg.origin),new THREE.Vector3().fromArray(msg.dir).normalize());
      this.net?.send({t:'flameFx',matchId:this.matchId,shooter:h.id,origin:msg.origin,dir:msg.dir});
      if(!h.ammo)this.restorePrimary(h);
      return;
    }
    if(msg.t==='flameFx'&&!this.isHost&&Array.isArray(msg.origin)&&Array.isArray(msg.dir)&&msg.shooter!==this.localNetId){
      this.flameJet?.emit(new THREE.Vector3().fromArray(msg.origin),new THREE.Vector3().fromArray(msg.dir).normalize(),.34);
      return;
    }
    if(msg.t==='burn'&&!this.isHost&&msg.target===this.localNetId){
      const now=this.simulationNow;
      if(this.burnBlindUntil<=now)this.burnBlindStart=now;
      this.burnBlindUntil=Math.max(this.burnBlindUntil,now+FLAME_TUNING.blindSeconds*1000);
      return;
    }
    if(msg.t==='throw'&&this.isHost&&fromPeerId&&(msg.slot===0||msg.slot===1)){this.throwItem(msg.slot,fromPeerId);return;}
    if(msg.t==='throwFx'&&!this.isHost&&(msg.kind==='frag'||msg.kind==='smoke')&&Array.isArray(msg.origin)&&Array.isArray(msg.dir)){this.tactical?.spawn(String(msg.shooter),msg.kind,new THREE.Vector3().fromArray(msg.origin),new THREE.Vector3().fromArray(msg.dir));return;}
    if(msg.t==='suicide'&&this.isHost&&fromPeerId){const h=this.hosted.get(fromPeerId);if(h&&!h.dead&&this.phase==='live'&&!this.winner){this.die(h.id);this.registerEvent({id:this.nextEventId++,kind:'death',text:`${h.name} 自杀了`,points:0,at:this.simulationNow,targetId:h.id,attackerName:h.name});}return;}
    if(msg.t==='lootAck'&&!this.isHost&&msg.peerId===this.localNetId&&Number.isSafeInteger(msg.rounds)&&msg.rounds>0){
      this.showAmmoPickup(msg.rounds);return;
    }
    if(msg.t==='ready'&&this.isHost&&fromPeerId){this.readyPeers.add(fromPeerId);this.tryReady();return;}
    if(msg.t==='hitAck'&&!this.isHost&&msg.peerId===this.localNetId){this.hitmarkerUntil=this.simulationNow+(msg.killed?360:160);this.audio.hit();this.hudDirty=true;return;}
    if(msg.t==='assist'&&!this.isHost&&msg.peerId===this.localNetId&&typeof msg.targetName==='string'){this.recordAssist(msg.targetName.slice(0,32));return;}
    if(msg.t==='personalEvent'&&!this.isHost&&msg.peerId===this.localNetId&&msg.event&&typeof msg.event==='object'){
      const raw=msg.event as any;
      if(Number.isSafeInteger(raw.id)&&typeof raw.text==='string'&&(raw.kind==='kill'||raw.kind==='death'||raw.kind==='vehicle'||raw.kind==='assist')){
        const clean=(value:unknown)=>typeof value==='string'?value.slice(0,48):undefined;
        this.addPersonalEvent({
          id:raw.id,kind:raw.kind,text:String(raw.text).slice(0,96),points:Number(raw.points)||0,at:this.simulationNow,
          actorId:clean(raw.actorId),targetId:clean(raw.targetId),attackerName:clean(raw.attackerName),
          targetName:clean(raw.targetName),targetLabel:clean(raw.targetLabel),
          team:raw.team==='blue'||raw.team==='orange'?raw.team:undefined,
        });
      }
      return;
    }
    if(msg.t==='shellImpact'&&!this.isHost&&Array.isArray(msg.point)&&msg.point.length===3&&msg.point.every(Number.isFinite)){
      this.shellImpactFx(new THREE.Vector3().fromArray(msg.point),!!msg.he);return;
    }
    if(msg.t==='shotFx'&&!this.isHost){
      if(!Array.isArray(msg.origin)||!Array.isArray(msg.dir)||![...msg.origin,...msg.dir].every(Number.isFinite))return;
      const o=new THREE.Vector3().fromArray(msg.origin),d=new THREE.Vector3().fromArray(msg.dir).normalize(),def=msg.ammo==='rocket'?ROCKET_AMMO:(AMMO[msg.ammo]??AMMO.rifle);
      const bulletId=def.armor==='bullet'&&Number.isSafeInteger(msg.bulletId)?msg.bulletId:undefined;
      this.projectiles.spawn(String(msg.shooter),o,d,def,bulletId);this.projectileMuzzleFx(o,d,def);
      if(msg.ammo==='ap'||msg.ammo==='he')this.audio.cannon();else if(msg.shooter!==this.localNetId||msg.ammo==='vehicle_mg')this.audio.shot();
      return;
    }
    if(msg.t==='bulletImpact'&&!this.isHost){
      if(!Number.isSafeInteger(msg.id)||!Number.isFinite(msg.distance)||msg.distance<0||
         !Array.isArray(msg.point)||msg.point.length!==3||!msg.point.every(Number.isFinite))return;
      const bullet=this.projectiles.items.find(p=>p.effect?.id===msg.id);
      if(!bullet?.effect)return;
      bullet.effect.stopDistance=msg.distance;
      if(bullet.distance>msg.distance){
        bullet.position.fromArray(msg.point);bullet.distance=msg.distance;
        bullet.active=false;bullet.visibleFor=IMPACT_STREAK_SECONDS;
      }
      return;
    }
    if(msg.t==='impactFx'&&!this.isHost){
      if(!Array.isArray(msg.hits))return;
      for(const entry of (msg.hits as unknown[]).slice(0,16)){
        if(!Array.isArray(entry)||entry.length!==7||!entry.every(value=>Number.isFinite(value)))continue;
        const point=new THREE.Vector3(entry[0],entry[1],entry[2]);
        if(!this.insideWorld(point))continue;
        const normal=new THREE.Vector3(entry[3],entry[4],entry[5]);
        if(normal.lengthSq()<.25)continue;
        normal.normalize();
        const signed=Math.round(entry[6]),material=Math.abs(signed)||5;
        this.impacts.spawn(point,normal,material,signed>0);
        this.playImpactSound(material,point);
      }
      return;
    }
    if(['loadout','loadoutOpen','reload'].includes(msg.t)&&this.isHost&&fromPeerId){const h=this.hosted.get(fromPeerId);if(!h)return;
      if(msg.t==='loadoutOpen'&&(h.dead||this.phase==='prep'))h.overlayOpen=!!msg.open;
      if(msg.t==='loadout'&&(h.dead||this.phase==='prep')&&msg.selection?.weaponId!=='amr'&&getWeapon(msg.selection?.weaponId)){h.selection={...msg.selection};if(this.phase==='prep'){const w=getWeapon(h.selection.weaponId)!;h.ammo=w.magazine;h.reserve=w.reserve;}}
      if(msg.t==='reload'&&!h.dead&&!h.vehicleId&&!h.controller.climbing&&!h.controller.mantle&&!h.reloadEnd&&h.reserve>0){const w=getWeapon(h.selection.weaponId)!;if(h.ammo<w.magazine)h.reloadEnd=this.simulationNow+w.reload*1000;}
      return;
    }
    if (msg.t === 'shoot' && this.isHost) {
      const h=fromPeerId?this.hosted.get(fromPeerId):undefined;
      if(!h||!Number.isSafeInteger(msg.seq)||msg.seq<=h.lastShotSeq)return;
      if(h.dead||h.overlayOpen||h.vehicleId||h.controller.climbing||h.controller.mantle||!this.worldReady||this.hostSuspended||this.phase!=='live'||this.winner)return;
      if(!Number.isFinite(msg.yaw)||!Number.isFinite(msg.pitch)||Math.abs(msg.pitch)>1.55||Math.abs(msg.yaw)>10000)return;
      const w=getWeapon(h.selection.weaponId)!;
      // Reload starts on the host one RTT after the client's local reload, so a
      // client firing right at its own reload end used to be rejected. Finish the
      // reload inside a 180 ms tolerance instead of swallowing that bullet.
      if(h.reloadEnd){
        if(this.simulationNow>=h.reloadEnd-180){
          const take=Math.min(w.magazine-h.ammo,h.reserve);h.ammo+=take;h.reserve-=take;h.reloadEnd=0;
        }else return;
      }
      if(h.ammo<=0)return;
      // Shots and unordered movement packets race: a 60 Hz automatic weapon can
      // deliver two reliable shots in the same host tick. Compare the client's
      // own timestamps, not the host simulation clock.
      const interval=60000/w.rpm;
      const admission=admitGuestShot({
        seq:msg.seq,lastAcceptedSeq:h.lastShotSeq,
        clientAt:Number.isFinite(msg.clientAt)&&msg.clientAt>0?Number(msg.clientAt):0,
        lastClientAt:h.lastShotClientAt,now:this.simulationNow,nextFire:h.nextFire,interval,
      });
      if(!admission.accept)return;
      h.lastShotSeq=msg.seq;
      h.lastShotClientAt=admission.lastClientAt;
      h.nextFire=admission.nextFire;
      h.lastShotAt=this.simulationNow;h.ammo--;
      const look=msg.look, ads=!!look?.ads;
      const yaw=msg.yaw,pitch=msg.pitch;
      const hostEye=h.controller.position.clone().add(new THREE.Vector3(0,h.controller.eye,0));
      let eye=hostEye;
      if(Array.isArray(msg.eye)&&msg.eye.length===3&&msg.eye.every((n:unknown)=>typeof n==='number'&&Number.isFinite(n))){
        const candidate=new THREE.Vector3().fromArray(msg.eye);
        // The guest sends the camera pose it actually aimed from (prediction +
        // smoothing). Accept it inside a tight envelope around the authoritative
        // body, and only when the host body can see that point (no wall shots).
        const dxz=Math.hypot(candidate.x-hostEye.x,candidate.z-hostEye.z);
        if(dxz<=2.2&&Math.abs(candidate.y-hostEye.y)<=2&&this.insideWorld(candidate)&&!this.arena.lineBlocked?.(hostEye,candidate))eye=candidate;
      }
      const aim=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(pitch,yaw,0,'YXZ'));
      const origin=this.infantryMuzzle(eye,yaw,pitch,w,h.selection.opticId,ads);
      const ammo=this.weaponAmmo(w);
      // Same crosshair-first rule for guests: converge the muzzle onto the aim ray hit.
      const converge=(direction:THREE.Vector3)=>{
        const traced=this.traceCombat(eye,direction,ammo.maxRange,h.id);
        const target=traced?traced.point:eye.clone().addScaledVector(direction,Math.min(ammo.maxRange,350));
        return target.sub(origin).normalize();
      };
      if(!this.arena.lineBlocked?.(eye,origin)){
        for(let i=0;i<(w.className==='shotgun'?8:1);i++){const d=aim.clone();if(w.className==='shotgun')d.add(new THREE.Vector3((this.random()-.5)*.08,(this.random()-.5)*.08,(this.random()-.5)*.08)).normalize();this.launch(h.id,origin,converge(d),ammo);}
      }
      if(this.isSpecialWeaponId(w.id)&&!h.ammo)this.restorePrimary(h);
      return;
    }
    if(msg.t==='veh'&&this.isHost&&fromPeerId){
      const h=this.hosted.get(fromPeerId);
      this.net?.send({t:'seatAck',matchId:this.matchId,peerId:fromPeerId});
      if(!h||h.dead||h.overlayOpen||this.phase!=='live'||this.winner)return;
      const current=this.vehicles.find(v=>v.id===h.vehicleId);
      if(msg.action==='enter'&&!current){
        const v=this.vehicles.find(v=>v.id===msg.id);
        if(v&&this.canBoard(v,h.team,h.controller.position)){
          h.vehicleId=v.id;h.vehicleSeat=v.seats.indexOf(null);v.seats[h.vehicleSeat]=h.id;
          h.vehThrottle=0;h.vehSteer=0;h.lastInput=this.simulationNow;
          h.pendingInputs=[];h.input.clear();h.reloadEnd=0;
        }
      }else if(msg.action==='seat'&&current){
        if(this.moveSeat(current,h.id,h.vehicleSeat,msg.seat)){h.vehicleSeat=msg.seat;h.vehThrottle=0;h.vehSteer=0;}
      }else if(msg.action==='exit'&&current){
        const exitSpeed=Math.abs(current.speed);
        this.unseat(current,h.vehicleSeat,h.id);
        this.placeAfterExit(h.controller,current);
        h.vehicleId=null;h.vehThrottle=0;h.vehSteer=0;
        this.applyExitDamage(h.controller,exitSpeed,false,h);
      }
      return;
    }
    if(msg.t==='seatAck'&&!this.isHost&&msg.peerId===this.localNetId){this.pendingSeatChange=false;return;}
    if(msg.t==='ferryCall'&&this.isHost&&fromPeerId){
      const h=this.hosted.get(fromPeerId);
      if(!h||h.dead||h.vehicleId)return;
      const dock=this.nearbyFerryDock(h.controller);
      if(dock?.canRequest&&dock.id===msg.id)this.ferrySystem?.requestById(dock.id);
      return;
    }
    if(msg.t==='vehInput'&&this.isHost&&fromPeerId){
      const h=this.hosted.get(fromPeerId);
      if(!h||h.dead||msg.id!==h.vehicleId||msg.seat!==h.vehicleSeat)return;
      const v=this.vehicles.find(v=>v.id===h.vehicleId);
      if(!v)return;
      h.vehThrottle=h.vehicleSeat===0?THREE.MathUtils.clamp(Number(msg.throttle)||0,-1,1):0;
      h.vehSteer=h.vehicleSeat===0?THREE.MathUtils.clamp(Number(msg.steer)||0,-1,1):0;
      this.setVehicleAim(v,h.vehicleSeat,msg.aimYaw,msg.aimPitch);
      if(isCannon(v.weapons[h.vehicleSeat-1]?.id)&&(msg.shell==='ap'||msg.shell==='he'))v.shell=msg.shell;
      h.lastInput=this.simulationNow;
      return;
    }
    if (msg.t === 'vehFire' && this.isHost && fromPeerId) {
      const h=this.hosted.get(fromPeerId);if(h?.vehicleId===msg.id&&h?.vehicleSeat===msg.seat)this.fireVehicleFor(fromPeerId);
      return;
    }
    if (msg.t === 'respawn' && this.isHost && fromPeerId) {
      const h = this.hosted.get(fromPeerId);
      if (h) h.respawnChoice = typeof msg.id === 'string' ? msg.id : 'base';
      return;
    }
    if (msg.t === 'respawnNow' && this.isHost && fromPeerId) {
      const h = this.hosted.get(fromPeerId);
      if (h && h.dead&&!h.overlayOpen&&!this.winner&&this.simulationNow >= h.respawnAt) this.respawnHosted(h);
      return;
    }
    if (msg.t === 'vehDenied' && !this.isHost) {
      if (msg.peerId === this.localNetId && this.drivingId === msg.id) {
        this.drivingId = null;
        this.clearLocalVehicle();
      }
      return;
    }
    // 客机只接收载具增删（vehSpawn/vehReset/snap），绝不自行生成刷新。
    if (msg.t === 'vehSpawn' && !this.isHost) {
      const raw=(msg.vehicle??{}) as {id?:unknown;kind?:unknown;team?:unknown;x?:unknown;y?:unknown;z?:unknown;yaw?:unknown};
      if(typeof raw.id!=='string'||typeof raw.kind!=='string')return;
      if(this.vehicles.some(v=>v.id===raw.id))return;
      const x=Number(raw.x),z=Number(raw.z),y=Number(raw.y),yaw=Number(raw.yaw);
      if(![x,z].every(Number.isFinite))return;
      const team=raw.team==='blue'||raw.team==='orange'||raw.team==='neutral'?raw.team:'neutral';
      this.buildVehicleState({id:raw.id,kind:raw.kind,team,x,z,y:Number.isFinite(y)?y:(this.arena.navigationHeight?.(x,z)??this.arena.heightAt?.(x,z)??0),yaw:Number.isFinite(yaw)?yaw:0});
      this.hudDirty=true;
      return;
    }
    if (msg.t === 'vehReset' && !this.isHost) {
      if(!Array.isArray(msg.vehicles))return;
      this.applyNetVehicleReset(msg.vehicles as unknown[]);
      return;
    }
    if (msg.t === 'target') {
      const t = this.arena.targets[Number(msg.index)];
      if (t) {
        t.hit = !!msg.hit;
        (t.mesh.material as THREE.MeshLambertMaterial).color.setHex(msg.hit ? 0x35e0d0 : 0xff6a4d);
        if (Number.isFinite(msg.respawnAt)) t.respawnAt = Number(msg.respawnAt);
      }
      if (Number.isFinite(msg.score)) this.score = Number(msg.score);
      this.hitmarkerUntil = this.simulationNow + 160;
      this.hudDirty = true;
      return;
    }
    if (msg.t === 'targetReset') {
      const t = this.arena.targets[Number(msg.index)];
      if (t) {
        t.hit = false;
        (t.mesh.material as THREE.MeshLambertMaterial).color.setHex(0xff6a4d);
      }
      return;
    }
    if(msg.t==='inputs'&&this.isHost&&fromPeerId){const h=this.hosted.get(fromPeerId);if(!h||!Array.isArray(msg.commands)||msg.commands.length>180)return;
      const previousSeq = h.lastQueuedSeq;
      const ignoreMovement = this.hostSuspended || h.dead || !!h.vehicleId;
      for(const c of msg.commands){if(!c||!Number.isSafeInteger(c.seq)||c.seq<=h.lastQueuedSeq||!Number.isFinite(c.yaw)||Math.abs(c.yaw)>10000||!Number.isFinite(c.pitch)||Math.abs(c.pitch)>1.35||!Array.isArray(c.keys))continue;
        h.lastQueuedSeq = c.seq;
        if(ignoreMovement){h.inputSeq=c.seq;continue;}
        h.pendingInputs.push({seq:c.seq,yaw:c.yaw,pitch:c.pitch,ads:!!c.ads,active:c.active!==false,aiming:typeof c.aiming==='boolean'?c.aiming:!!c.ads,epoch:Number.isSafeInteger(c.epoch)?c.epoch:undefined,keys:c.keys.filter((k:unknown)=>typeof k==='string'&&['KeyW','KeyS','KeyA','KeyD','Space','ControlLeft','ShiftLeft','ShiftRight','KeyZ','AltLeft','KeyQ','KeyE'].includes(k))});
      }
      if(ignoreMovement){h.pendingInputs=[];h.input.clear();return;}
      if(h.pendingInputs.length>MAX_HOST_INPUT_QUEUE){
        // A stalled browser can send many ticks at once. Keep controls current, including short jump taps.
        const dropped=h.pendingInputs.splice(0,h.pendingInputs.length-MAX_HOST_INPUT_QUEUE);
        // Ack the dropped range explicitly. Otherwise the guest keeps replaying
        // inputs the host silently discarded and its predicted pose drifts ahead,
        // which is exactly the old "snap forward, snap back" rubber-band.
        const lastDropped=dropped[dropped.length-1];
        if(lastDropped)h.inputSeq=Math.max(h.inputSeq,lastDropped.seq);
        if(!h.controller.jumpDown&&dropped.some(c=>c.keys.includes('Space'))&&!h.pendingInputs.some(c=>c.keys.includes('Space'))&&h.pendingInputs[0]){
          h.pendingInputs[0].keys.push('Space');
        }
      }
      if(h.lastQueuedSeq>previousSeq)h.lastInput=this.simulationNow;
      return;
    }
    if (msg.t === 'input' && this.isHost) {
      const id = fromPeerId || '';
      if (!id||!Number.isFinite(msg.yaw)||!Number.isFinite(msg.pitch)||Math.abs(msg.yaw)>10000||Math.abs(msg.pitch)>1.35) return;
      let h = this.hosted.get(id);
      if (!h) {
        this.addPlayer(id, 'GUEST', this.assignedTeam(id) ?? this.nextGuestTeam());
        h = this.hosted.get(id);
      }
      if (!h) return;
      if (Array.isArray(msg.keys)) h.input.setKeys(msg.keys.filter((k:unknown)=>typeof k==='string'&&['KeyW','KeyS','KeyA','KeyD','Space','ControlLeft','ShiftLeft','ShiftRight','KeyZ','AltLeft','KeyQ','KeyE'].includes(k)));
      h.yaw = Number(msg.yaw) || 0;
      h.pitch = THREE.MathUtils.clamp(Number(msg.pitch) || 0, -1.35, 1.35);
      h.lastInput = this.simulationNow;
      return;
    }
    if (msg.t === 'snap' && !this.isHost) {
      if(!Number.isInteger(msg.seq)||msg.seq<=this.lastSnapSequence)return;this.lastSnapSequence=msg.seq;
      if(msg.worldReady&&!this.worldReady&&this.localLoaded)this.beginPrep(Math.max(0,Number(msg.prepSeconds)||0));
      const enteringLive = msg.phase==='live'&&this.phase==='prep'&&this.worldReady;
      if(enteringLive)this.startLive();
      this.hostSuspended=!!msg.hostSuspended;
      if(msg.phase==='prep'&&this.worldReady)this.prepDeadline=this.simulationNow+Math.max(0,Number(msg.prepSeconds)||0)*1000;
      if(Array.isArray(msg.lootTaken))for(const crate of this.lootCrates)crate.model.visible=!msg.lootTaken.includes(crate.id);

      if (msg.scores && Number.isFinite(msg.scores.blue) && Number.isFinite(msg.scores.orange)) {
        this.scores.blue = msg.scores.blue;
        this.scores.orange = msg.scores.orange;
      }
      if (Array.isArray(msg.captures)) {
        for (const c of msg.captures) {
          const cap = this.caps.find((x) => x.id === c.id);
          if (cap) {
            cap.owner = c.owner;
            if (Number.isFinite(c.progress)) cap.progress = Number(c.progress);
            this.setCapColor(cap);
          }
        }
      }
      if(!this.isHost&&Array.isArray(msg.ferries))this.applyFerrySnapshots(msg.ferries);
      if(!this.isHost&&Array.isArray(msg.vehiclePads)){
        const pads:PadState[]=[];
        for(const raw of msg.vehiclePads as unknown[]){
          const p=raw as {id?:unknown;team?:unknown;state?:unknown;seconds?:unknown;x?:unknown;z?:unknown};
          if(!p||typeof p.id!=='string')continue;
          if(p.team!=='blue'&&p.team!=='orange'&&p.team!=='neutral')continue;
          if(p.state!=='ready'&&p.state!=='respawning'&&p.state!=='occupied')continue;
          pads.push({
            id:p.id,team:p.team,state:p.state,
            seconds:typeof p.seconds==='number'&&Number.isFinite(p.seconds)?p.seconds:undefined,
            x:typeof p.x==='number'&&Number.isFinite(p.x)?p.x:undefined,
            z:typeof p.z==='number'&&Number.isFinite(p.z)?p.z:undefined,
          });
        }
        this.netPadStates=pads;
      }
      if (Array.isArray(msg.events)) {
        const prev = new Map(this.events.map((e) => [e.id, e.at]));
        const assists=this.events.filter(e=>e.kind==='assist');
        const clean=(value:unknown)=>typeof value==='string'?value.slice(0,48):undefined;
        const events:GameEvent[] = msg.events
          .filter((e: any) => e && typeof e.text === 'string')
          .map((e: any) => {
            const id = Number(e.id) || 0;
            const kind=e.kind === 'kill' || e.kind === 'capture' || e.kind === 'vehicle' || e.kind === 'death' ? e.kind : 'death';
            return {
              id,kind,text:String(e.text).slice(0,96),points:Number(e.points)||0,at:prev.get(id)??this.simulationNow,
              actorId:clean(e.actorId),targetId:clean(e.targetId),attackerName:clean(e.attackerName),
              targetName:clean(e.targetName),targetLabel:clean(e.targetLabel),
              team:e.team==='blue'||e.team==='orange'?e.team:undefined,
            };
          });
        this.events=[...assists,...events].sort((a,b)=>b.at-a.at).slice(0,12);
      }
      if(Array.isArray(msg.bodies)){
        const seen=new Set<string>();
        for(const item of msg.bodies){
          if(typeof item.id!=='string'||!Array.isArray(item.p)||item.p.length!==3||!item.p.every(Number.isFinite)||!Number.isFinite(item.yaw))continue;
          seen.add(item.id);
          const takenAt=Number.isFinite(item.takenAge)?this.simulationNow-item.takenAge:undefined;
          const existing=this.bodies.get(item.id);
          if(existing){
            existing.ammo=!!item.ammo;
            existing.ammoTakenAt=takenAt;
            if(existing.magazine)existing.magazine.visible=existing.ammo;
            const position=new THREE.Vector3().fromArray(item.p);
            if(existing.origin.distanceToSquared(position)>.0001){
              existing.origin.copy(position);
              this.poseBody(existing,0,(this.simulationNow-existing.start)/1000);
            }
            continue;
          }
          this.createBody(item.id,item.team==='blue'?'blue':'orange',new THREE.Vector3().fromArray(item.p),item.yaw,!!item.ammo,
            new THREE.Vector3(),this.simulationNow-(Number(item.age)||0),!!item.dropsAmmo,takenAt);
        }
        for(const [id,body] of this.bodies)if(!seen.has(id)){
          this.removeBody(id,body);
        }
      }
      if (Array.isArray(msg.vehicles)) {
        const seenVehicles=new Set<string>();
        for (const v of msg.vehicles as { id: string; kind?:string; team?:'blue'|'orange'|'neutral'; x: number; z: number; yaw: number; y?:number;turretYaw?: number;turretPitch?:number;health?:number;ammo?:number;nextFireSeconds?:number;speed?:number;seats?:string[];weapons?:{ammo:number;yaw:number;pitch:number;reload:number}[];shell?:'ap'|'he';pitch?:number;roll?:number; destroyed?: boolean }[]) {
          if(!v||typeof v.id!=='string'||!Number.isFinite(Number(v.x))||!Number.isFinite(Number(v.z)))continue;
          seenVehicles.add(v.id);
          let local = this.vehicles.find((x) => x.id === v.id);
          if(!local){
            // 客机漏收 vehSpawn 时用 snap 里的 kind/team 补建（host 不会走这里）。
            if(this.isHost||typeof v.kind!=='string')continue;
            if(v.team!=='blue'&&v.team!=='orange'&&v.team!=='neutral')continue;
            local=this.buildVehicleState({id:v.id,kind:v.kind,team:v.team,x:Number(v.x),z:Number(v.z),
              y:Number.isFinite(v.y)?Number(v.y):(this.arena.navigationHeight?.(Number(v.x),Number(v.z))??this.arena.heightAt?.(Number(v.x),Number(v.z))??0),
              yaw:Number(v.yaw)||0});
          }
          local.x = Number(v.x); local.z = Number(v.z); local.yaw = Number(v.yaw);
          local.model.position.set(local.x,Number.isFinite(v.y)?v.y!:(this.arena.navigationHeight?.(local.x,local.z)??this.arena.heightAt?.(local.x,local.z)??0),local.z);
          local.model.rotation.order='YXZ';local.model.rotation.set(Number(v.pitch)||0,local.yaw,Number(v.roll)||0);
          if(Number.isFinite(v.health))local.health=v.health!;if(Number.isFinite(v.ammo))local.ammo=v.ammo!;if(Number.isFinite(v.speed))local.speed=v.speed!;if(v.shell==='ap'||v.shell==='he')local.shell=v.shell;local.nextFire=this.simulationNow+(v.nextFireSeconds??0)*1000;if(Array.isArray(v.seats)&&v.seats.length===local.seats.length)local.seats=v.seats;
          for(const [i,w] of local.weapons.entries()){
            const state=v.weapons?.[i];if(!state||isCannon(w.id))continue;
            w.ammo=state.ammo;w.yaw=state.yaw;w.pitch=state.pitch;w.nextFire=this.simulationNow+state.reload*1000;
            w.mount.rotation.set(-w.pitch,w.yaw,0,'YXZ');
          }
          if(Number.isFinite(v.turretPitch)){local.turretPitch=v.turretPitch!;if(local.model.userData.barrel)(local.model.userData.barrel as THREE.Object3D).rotation.x=-local.turretPitch;}
          
          if (v.destroyed && !local.destroyed) {
            local.destroyed = true;
            this.damageFx?.explosion(local.model.position.clone().add(new THREE.Vector3(0,vehicleSize(local.kind).h*.5,0)),1.25);
            this.blackenWreck(local);
            if (this.drivingId === local.id) {
              this.clearLocalVehicle();
            }
          }
          if (local.model.userData.turret && Number.isFinite(v.turretYaw)) {
            local.turretYaw = Number(v.turretYaw);
            (local.model.userData.turret as THREE.Object3D).rotation.y = local.turretYaw;
          }
        }
        // 客机以 snap 为权威：主机已经清掉的动态车不能留成幽灵车。
        if(!this.isHost){
          for(const local of [...this.vehicles])if(!seenVehicles.has(local.id))this.removeVehicle(local.id,'reset');
        }
      }
      if (Number.isFinite(msg.matchRemaining)) this.matchRemaining = Number(msg.matchRemaining);
      if (msg.winner === 'blue' || msg.winner === 'orange'||msg.winner==='draw' || msg.winner === '') {
        const ended=!this.winner&&!!msg.winner;this.winner=msg.winner;
        if(ended){this.input.release();this.paused=false;this.ads=false;}
      }
      if (Array.isArray(msg.killFeed)) {
        const prevFeed = new Map(this.killFeed.map((k) => [k.text, k.at]));
        this.killFeed = msg.killFeed.filter((k: any) => k && typeof k.text === 'string').map((k: any) => ({ text: k.text, team: k.team === 'orange' ? 'orange' : 'blue', at: prevFeed.get(k.text) ?? this.simulationNow }));
      }
      if(!Array.isArray(msg.states))return;
      const states = msg.states;
      const present = new Set<string>();
      for (const st of states) {
        if (!st || typeof st.id !== 'string') continue;
        present.add(st.id);
        if (st.id === this.localNetId) {
          if (st.team === 'blue' || st.team === 'orange') this.myTeam = st.team;
          if (Number.isFinite(st.health)) this.health = Math.ceil(st.health);
          this.protectedUntil = this.simulationNow + (Number.isFinite(st.protectionMs) ? st.protectionMs : 0);
          const weapon=getWeapon(st.selection?.weaponId);
          if(weapon&&weapon.id!==this.weapon.id&&(this.isSpecialWeaponId(weapon.id)||this.isSpecialWeaponId(this.weapon.id))){
            this.equipWeapon(weapon);
            this.pendingShots=[];
          }
          this.pendingShots=this.pendingShots.filter(seq=>seq>(st.ackShot??0));if(Number.isFinite(st.ammo))this.ammo=Math.max(0,st.ammo-this.pendingShots.length);if(Number.isFinite(st.reserve))this.reserve=st.reserve;
          const wasDead = this.dead;
          if(Number.isFinite(st.respawnSeconds))this.respawnAt=this.simulationNow+st.respawnSeconds*1000;
          const respawned=Number.isFinite(st.spawnSerial)&&st.spawnSerial!==this.localSpawnSerial;
          if(respawned){this.localSpawnSerial=st.spawnSerial;this.pendingShots=[];this.overlayOpen=false;this.ads=false;this.reloading=false;this.reloadEnd=0;this.paused=false;this.input.clear();this.ammo=Number(st.ammo)||0;this.reserve=Number(st.reserve)||0;this.armed=true;}
          if(typeof st.vehicleId==='string'){
            const v=this.vehicles.find(v=>v.id===st.vehicleId),seat=st.vehicleSeat??0;
            if(v&&(this.drivingId!==v.id||this.vehicleSeat!==seat))this.boardLocal(v,seat);
          }else if(st.vehicleId===null&&this.drivingId)this.clearLocalVehicle();
          this.dead = !!st.dead;
          if (this.dead && !wasDead) {
            this.clearLocalVehicle();
            this.pendingSeatChange=false;
            this.input.release();
            this.paused = false;
            this.viewmodel.setEquipped(false);
          }
          this.viewmodel.setEquipped(this.armed && !this.dead&&!this.drivingId);
          if(Array.isArray(st.p)&&st.p.length>=3&&st.p.every(Number.isFinite)){
            const resetView = !this.selfSnapSeen || enteringLive || respawned;
            const teleported = this.lastSelfTeleportSerial !== st.teleportSerial;
            this.lastSelfTeleportSerial = st.teleportSerial;
            this.selfSnap.set(st.p[0],st.p[1],st.p[2]);this.selfSnapSeen=true;
            if(!this.dead&&!this.drivingId){
              const ack=Number.isFinite(st.ackInput)?Number(st.ackInput):0;
              if(!resetView&&!teleported&&ack<this.lastReconciledInputSeq)continue;
              this.lastReconciledInputSeq=ack;
              const predicted=!resetView&&!teleported?this.predictedAtSeq.find(p=>p.seq===ack):undefined;
              this.pendingInputs=resetView||teleported?[]:this.pendingInputs.filter(c=>c.seq>ack);
              // An exact historical match confirms the prediction. Never copy a
              // past jump/ground/stance state into the current local controller.
              if(predicted&&matchesPredictedMovement(predicted,st)){
                while(this.predictedAtSeq.length&&this.predictedAtSeq[0].seq<ack)this.predictedAtSeq.shift();
                continue;
              }
              this.reconciliationCameraPosition.copy(this.camera.position);
              this.reconciliationCameraRotation.copy(this.camera.rotation);
              const previousX=this.controller.position.x,previousY=this.controller.position.y,previousZ=this.controller.position.z;
              const yaw = resetView && Number.isFinite(st.yaw) ? st.yaw : this.controller.yaw;
              const pitch = resetView && Number.isFinite(st.pitch) ? st.pitch : this.controller.pitch;
              if (teleported) this.controller.teleport(this.selfSnap, yaw);
              replayMovementFromAuthority(this.controller,st,this.pendingInputs,this.predictedAtSeq,this.arena,this.simulation.step);
              this.controller.yaw=yaw;this.controller.pitch=pitch;
              // Replay must not publish its historical view between render ticks.
              // The next fixed step rebuilds the camera from current local look.
              // The controller now sits on the host-rebased prediction, but the
              // camera was rendering the pre-snap pose. Keep the old pose for the
              // next few frames (visual-only offset) so corrections do not show as
              // a rubber-band; hard snaps (teleport/respawn/very large error) skip it.
              const jumpX=this.controller.position.x-previousX,jumpY=this.controller.position.y-previousY,jumpZ=this.controller.position.z-previousZ;
              const jumpDistance=Math.hypot(jumpX,jumpZ);
              if(resetView||teleported||jumpDistance>1.4||Math.abs(jumpY)>1.2){
                this.predictionOffset.set(0,0,0);
                this.controller.refreshCamera(this.arena);
              }else{
                this.camera.position.copy(this.reconciliationCameraPosition);
                this.camera.rotation.copy(this.reconciliationCameraRotation);
                this.predictionOffset.x-=jumpX;this.predictionOffset.y-=jumpY;this.predictionOffset.z-=jumpZ;
                const length=this.predictionOffset.length();
                if(length>2.2)this.predictionOffset.multiplyScalar(2.2/length);
              }
            }else this.predictionOffset.set(0,0,0);
          }
          continue;
        }
        let r = this.remotes.get(st.id);
        if (!r) {
          this.addPlayer(st.id, typeof st.name==='string'?st.name:'PLAYER', st.team === 'blue' ? 'blue' : 'orange');
          r = this.remotes.get(st.id);
        }
        if (!r) continue;
        if (Array.isArray(st.p) && st.p.length >= 3) {
          r.target.set(Number(st.p[0]) || 0, Number(st.p[1]) || 0, Number(st.p[2]) || 0);
          r.sampleTime=this.simulationNow;
          if(Array.isArray(st.velocity)&&st.velocity.length===3&&st.velocity.every(Number.isFinite))r.velocity.fromArray(st.velocity);
          else r.velocity.set(0,0,0);
        }
        if(r.spawnSerial!==st.spawnSerial||r.teleportSerial!==st.teleportSerial){
          r.spawnSerial=st.spawnSerial;r.teleportSerial=st.teleportSerial;
          r.rig.root.position.copy(r.target);r.renderedYaw=undefined;r.renderedPitch=undefined;
        }
        r.yaw = Number(st.yaw) || 0;
        r.pitch = Number(st.pitch) || 0;
        r.moving = !!st.moving;
        r.sprinting = !!st.sprinting;
        r.crouching = !!st.crouching;r.prone=!!st.prone;r.lean=Number.isFinite(st.lean)?THREE.MathUtils.clamp(Number(st.lean),-1,1):0;
        r.climbing=!!st.climbing;r.mantleTime=st.motion?.mantle?.elapsed??-1;r.grounded=st.grounded!==false;r.swimming = !!st.swimming;r.vehicleId=typeof st.vehicleId==='string'?st.vehicleId:null;r.vehicleSeat=st.vehicleSeat??0;
        r.combatAction=st.combatAction==='fire'||st.combatAction==='reload'||st.combatAction==='aim'?st.combatAction:undefined;this.updateRemoteWeapon(r,String(st.selection?.weaponId??'m16'));
        if (Number.isFinite(st.health)) r.health = Math.ceil(st.health);
        r.protectedUntil = this.simulationNow + (Number.isFinite(st.protectionMs) ? st.protectionMs : 0);
        r.dead = !!st.dead;
        r.seen = true;
        r.rig.root.visible = !r.dead;
      }
      for(const id of this.remotes.keys())if(!present.has(id))this.removePlayer(id);
      return;
    }
    if (msg.t === 'state' && !this.isHost) {
      const id = fromPeerId || '';
      if (!id || id === this.localNetId) return;
      let r = this.remotes.get(id);
      if (!r) {
        this.addPlayer(id, 'PLAYER', msg.team === 'blue' ? 'blue' : 'orange');
        r = this.remotes.get(id);
      }
      if (!r) return;
      const p = msg.p;
      if (!Array.isArray(p) || p.length < 3) return;
      r.target.set(Number(p[0]) || 0, Number(p[1]) || 0, Number(p[2]) || 0);
      r.yaw = Number(msg.yaw) || 0;
      r.pitch = Number(msg.pitch) || 0;
      r.moving = !!msg.moving;
      r.sprinting = !!msg.sprinting;
      r.crouching = !!msg.crouching;
      r.lean = Number.isFinite(msg.lean)?THREE.MathUtils.clamp(Number(msg.lean),-1,1):0;
      r.seen = true;
      r.rig.root.visible = true;
    }
  }

  syncPeers(peers:{id:string;name:string}[]){
    if(!this.isHost)return;const ids=new Set(peers.map(p=>p.id));
    for(const h of [...this.hosted.values()])if(!h.bot&&!ids.has(h.id))this.removePlayer(h.id);
    for(const peer of peers){if(peer.id===this.localNetId||this.hosted.has(peer.id))continue;const team=this.assignedTeam(peer.id) ?? this.nextGuestTeam(),bot=[...this.hosted.values()].find(h=>h.bot&&h.team===team);if(bot)this.removePlayer(bot.id);this.addPlayer(peer.id,peer.name,team);}
    if(this.botsEnabled&&this.phase==='live')this.fillBots();this.tryReady();
  }
  private removePlayer(id:string){const h=this.hosted.get(id);if(h?.vehicleId){const v=this.vehicles.find(v=>v.id===h.vehicleId);if(v)this.unseat(v,h.vehicleSeat,id);}this.hosted.delete(id);const r=this.remotes.get(id);if(r){this.cinematicShadows?.unregisterModel(r.rig.root);r.rig.dispose();r.rig.root.removeFromParent();this.remotes.delete(id);}this.nameplates.get(id)?.remove();this.nameplates.delete(id);this.readyPeers.delete(id);}

  private updateRemoteWeapon(r:RemoteAvatar,id:string){if(r.weaponId===id||!getWeapon(id))return;const old=r.rig;r.rig=createBlockyCharacter(r.team,{weapon:true,batched:true,weaponId:id});this.registerShadowModel(r.rig.root);r.rig.root.position.copy(old.root.position);r.rig.root.rotation.copy(old.root.rotation);this.scene.add(r.rig.root);old.root.removeFromParent();this.cinematicShadows?.unregisterModel(old.root);old.dispose();r.weaponId=id;}

  suicide(){
    if(this.dead||this.phase!=='live'||this.winner)return;
    if(this.isHost){this.recentDamage.delete(this.localNetId);this.die(this.localNetId);this.registerEvent({id:this.nextEventId++,kind:'death',text:'你已自杀',points:0,at:this.simulationNow,targetId:this.localNetId,attackerName:this.localName});}
    else this.net?.send({t:'suicide',matchId:this.matchId});
  }

  private die(id:string){
    const local=id===this.localNetId,h=this.hosted.get(id);
    if(!local&&!h)return;
    if(local||h?.stowedPrimary)this.restorePrimary(h);
    const controller=local?this.controller:h!.controller;
    if(this.isHost)this.battleDanger.record(local?this.myTeam:h!.team,controller.position.x,controller.position.z,this.simulationNow);
    const vehicle=this.vehicles.find(v=>v.id===(local?this.drivingId:h!.vehicleId));
    if(vehicle){
      this.unseat(vehicle,local?this.vehicleSeat:h!.vehicleSeat,id);
      this.placeAfterExit(controller,vehicle);
    }
    const serial=local?this.localSpawnSerial:h!.spawnSerial;
    const drift=controller.impactVelocity.clone();drift.y=Math.max(0,controller.velocity.y);
    this.createBody(id+':'+serial,local?this.myTeam:h!.team,controller.position,controller.yaw+Math.PI,!!h?.bot,drift,this.simulationNow);
    if(local){
      this.health=0;this.dead=true;this.respawnAt=this.simulationNow+5000;this.protectedUntil=0;
      this.clearLocalVehicle();this.ads=false;this.reloading=false;this.paused=false;this.input.release();
    }else{
      h!.dead=true;h!.health=0;h!.respawnAt=this.simulationNow+5000;h!.protectedUntil=0;
      h!.vehicleId=null;h!.respawnChoice='base';h!.input.clear();h!.pendingInputs=[];
      const r=this.remotes.get(id);if(r){r.dead=true;r.health=0;}
    }
    this.hudDirty=true;
  }

  private createBody(id:string,team:NetTeam,p:THREE.Vector3,yaw:number,ammo:boolean,drift:THREE.Vector3,start:number,dropsAmmo=ammo,ammoTakenAt?:number){
    if(this.bodies.has(id))return;
    const rig=createBlockyCharacter(team,{weapon:false,batched:true});
    this.registerShadowModel(rig.root);
    rig.root.rotation.order='YXZ';
    const origin=p.clone(),age=Math.max(0,(this.simulationNow-start)/1000);
    rig.root.position.copy(origin);
    const body:Body={rig,origin,yaw,start,drift:drift.clone(),fallSpeed:age>1.2?0:drift.y,ammo,ammoTakenAt};
    if(dropsAmmo){
      body.magazine=new THREE.Mesh(this.magazineGeometry,this.magazineMaterial);
      body.magazine.name='dropped-magazine';
      this.scene.add(body.magazine);
    }
    this.scene.add(rig.root);this.bodies.set(id,body);
    this.poseBody(body,0,age);
  }

  private poseBody(body:Body,dt:number,age:number){
    const {rig,origin,yaw,drift}=body;
    const x=origin.x+drift.x*dt,z=origin.z+drift.z*dt;
    if(!this.arena.blockedAt?.(x,z,.23,origin.y+.1,.45)){origin.x=x;origin.z=z;}
    drift.multiplyScalar(Math.exp(-dt*4));
    const y=this.arena.supportAt?.(origin.x,origin.z,origin.y+.23)??this.arena.heightAt?.(origin.x,origin.z)??0;
    if(dt>0&&(origin.y>y+.002||body.fallSpeed>0)){body.fallSpeed-=18*dt;origin.y=Math.max(y,origin.y+body.fallSpeed*dt);}
    else if(dt>0){body.fallSpeed=0;if(Number.isFinite(y))origin.y=y;}
    applyCharacterAction(rig,'death',age);
    const back=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
    const tip=origin.clone().addScaledVector(back,1.42);
    const ground=this.arena.supportAt?.(tip.x,tip.z,origin.y+.6)??origin.y;
    const settle=THREE.MathUtils.smoothstep(age,.4,.95),slope=Number.isFinite(ground)?THREE.MathUtils.clamp(Math.atan2(ground-origin.y,1.42),-.38,.32):0;
    rig.root.rotation.x+=slope*settle;rig.root.rotation.y=yaw;
    rig.root.position.add(origin);
    this.placeMagazine(body);
  }

  private placeMagazine(body:Body){
    const magazine=body.magazine;
    if(!magazine)return;
    magazine.visible=body.ammo;
    if(!body.ammo)return;
    const side=new THREE.Vector3(Math.cos(body.yaw),0,-Math.sin(body.yaw));
    const hip=body.rig.bones.hips.getWorldPosition(new THREE.Vector3());
    const p=magazine.position.copy(hip).addScaledVector(side,.48);
    if(this.arena.blockedAt?.(p.x,p.z,.12,body.origin.y+.06,.28))p.copy(hip).addScaledVector(side,-.48);
    const surface=this.arena.supportAt?.(p.x,p.z,body.origin.y+.6)??this.arena.heightAt?.(p.x,p.z);
    p.y=(surface!==undefined&&Number.isFinite(surface)?surface:body.origin.y)+.17;
    magazine.rotation.set(.12,body.yaw,-.25);
  }

  private updateBodies(dt:number){
    for(const [id,body] of this.bodies){
      const age=(this.simulationNow-body.start)/1000;
      if(!body.ammo&&this.simulationNow-(body.ammoTakenAt??body.start)>22000){this.removeBody(id,body);continue;}
      if(age<1.2||(this.isHost&&(body.fallSpeed!==0||body.drift.lengthSq()>.004)))this.poseBody(body,this.isHost?dt:0,age);
      body.rig.root.visible=body.origin.distanceToSquared(this.camera.position)<550**2;
    }
  }

  private removeBody(id:string,body:Body){
    body.magazine?.removeFromParent();
    this.cinematicShadows?.unregisterModel(body.rig.root);
    body.rig.root.removeFromParent();
    body.rig.dispose();
    this.bodies.delete(id);this.lastVehicleImpact.delete('body:'+id);
  }

  private clearBodies(){
    for(const [id,body] of this.bodies)this.removeBody(id,body);
  }

  private aimedAmmo():HudState['aimedAmmo']{
    if(this.phase!=='live'||this.dead||this.drivingId||this.paused||this.overlayOpen||this.winner)return;
    const eye=this.camera.getWorldPosition(new THREE.Vector3());
    const ray=new THREE.Ray(eye,this.camera.getWorldDirection(new THREE.Vector3()));
    const hit=new THREE.Vector3(),onBody=new THREE.Vector3();
    let nearest=9;
    let status:HudState['aimedAmmo'];
    for(const body of this.bodies.values()){
      if(!body.magazine||body.origin.distanceToSquared(eye)>11**2)continue;
      const hips=body.rig.bones.hips.getWorldPosition(new THREE.Vector3());
      const head=body.rig.bones.head.getWorldPosition(new THREE.Vector3());
      if(ray.distanceSqToSegment(hips,head,hit,onBody)>.33**2)continue;
      const distance=eye.distanceTo(hit);
      if(distance>=nearest||this.arena.lineBlocked?.(eye,onBody))continue;
      nearest=distance;
      status=body.ammo?'available':'taken';
    }
    return status;
  }

  private showAmmoPickup(rounds:number){
    const now=this.simulationNow;
    this.ammoPickup=(this.ammoPickupUntil-now>1400?this.ammoPickup:0)+rounds;
    this.ammoPickupUntil=now+1800;
    this.hudDirty=true;
  }

  private updateAmmoPickups(now:number){
    if(!this.isHost||this.phase!=='live'||this.winner||now<this.nextAmmoPickup)return;
    this.nextAmmoPickup=now+100;
    const collectors=[];
    if(!this.dead&&!this.drivingId&&!this.overlayOpen&&!this.paused&&this.weapon.reserve>0)collectors.push({
      id:this.localNetId,position:this.controller.position,rounds:this.weapon.reserve,grant:(rounds:number)=>{this.reserve+=rounds;},
    });
    for(const h of this.hosted.values()){
      if(h.dead||h.vehicleId||h.overlayOpen)continue;
      const weapon=getWeapon(h.selection.weaponId)!;
      if(weapon.reserve===0||h.bot&&h.reserve>=weapon.magazine)continue;
      collectors.push({id:h.id,position:h.controller.position,rounds:weapon.reserve,grant:(rounds:number)=>{h.reserve+=rounds;}});
    }
    const gains=new Map<string,number>();
    for(const body of this.bodies.values()){
      if(!body.ammo||!body.magazine||now-body.start<650)continue;
      const pickup=body.magazine.position;
      let nearest=1.45**2;
      let collector:typeof collectors[number]|undefined;
      for(const candidate of collectors){
        const distance=candidate.position.distanceToSquared(pickup);
        if(distance>=nearest)continue;
        const from=candidate.position.clone().add(new THREE.Vector3(0,.85,0));
        if(this.arena.lineBlocked?.(from,pickup))continue;
        nearest=distance;
        collector=candidate;
      }
      if(!collector)continue;
      body.ammo=false;body.ammoTakenAt=now;body.magazine.visible=false;
      collector.grant(collector.rounds);
      gains.set(collector.id,(gains.get(collector.id)??0)+collector.rounds);
    }
    for(const [id,rounds] of gains){
      if(id===this.localNetId)this.showAmmoPickup(rounds);
      else if(!this.hosted.get(id)?.bot)this.net?.send({t:'lootAck',matchId:this.matchId,peerId:id,rounds});
    }
  }

  private applyRemoteAction(r: RemoteAvatar, action: CharacterAction, time: number, dt: number) {
    if (action !== r.action) {
      const from: RemoteAvatar['blendFrom'] = {};
      for (const [name, bone] of Object.entries(r.rig.bones)) {
        from![name] = { rx: bone.rotation.x, ry: bone.rotation.y, rz: bone.rotation.z, px: bone.position.x, py: bone.position.y, pz: bone.position.z };
      }
      r.blendFrom = from;
      r.blendT = 0;
      r.action = action;
    }
    applyCharacterAction(r.rig, action, time);
    if(r.combatAction&&action!=='climb'&&action!=='mantle'&&action!=='vehicle_sit'&&action!=='crawl'&&action!=='prone_idle'){const names=['hipL','kneeL','ankleL','hipR','kneeR','ankleR'] as const,legs=names.map(n=>({position:r.rig.bones[n].position.clone(),rotation:r.rig.bones[n].rotation.clone()}));const world=r.rig.root.position.clone();applyCharacterAction(r.rig,r.combatAction,r.combatAction==='fire'?time%.16:time%2.3);r.rig.root.position.copy(world);names.forEach((n,i)=>{r.rig.bones[n].position.copy(legs[i].position);r.rig.bones[n].rotation.copy(legs[i].rotation);});}
    r.rig.bones.torso.rotation.x-=r.renderedPitch??r.pitch;
    const lean=r.lean??0;
    if(Math.abs(lean)>.01){
      // Upper body only: legs stay planted, the rifle follows the torso.
      r.rig.bones.torso.rotation.z-=lean*.35;
      r.rig.bones.torso.position.x+=lean*.035;
    }

    if (r.blendFrom && r.blendT < 0.22) {
      const t = Math.min(1, r.blendT / 0.22);
      const a = t * t * (3 - 2 * t);
      for (const [name, from] of Object.entries(r.blendFrom)) {
        const bone = r.rig.bones[name as keyof typeof r.rig.bones];
        if (!bone) continue;
        bone.rotation.x = from.rx + (bone.rotation.x - from.rx) * a;
        bone.rotation.y = from.ry + (bone.rotation.y - from.ry) * a;
        bone.rotation.z = from.rz + (bone.rotation.z - from.rz) * a;
        bone.position.x = from.px + (bone.position.x - from.px) * a;
        bone.position.y = from.py + (bone.position.y - from.py) * a;
        bone.position.z = from.pz + (bone.position.z - from.pz) * a;
      }
      r.blendT += dt;
      if (r.blendT >= 0.22) r.blendFrom = null;
    }
  }

  private updateRemotes(dt: number) {
    for (const r of this.remotes.values()) {
      if (!r.seen) continue;
      const root=r.rig.root;
      // Only interpolate toward received poses; extrapolating a lead caused
      // visible backwards slides when newer snapshots arrived after a burst.
      smoothRemotePosition(root.position,r.target,r.velocity.length(),dt);
      r.renderedPitch=THREE.MathUtils.damp(r.renderedPitch??r.pitch,r.pitch,55,dt);
      r.renderedYaw=(r.renderedYaw??r.yaw)+angleDelta(r.yaw,r.renderedYaw??r.yaw)*(1-Math.exp(-dt*55));
      if(r.dead){r.rig.root.visible=false;continue;}
      r.rig.setSpawnProtected(this.isHost ? this.isSpawnProtected(r.id,this.simulationNow) : this.simulationNow < r.protectedUntil);
      const vehicle=this.vehicles.find(v=>v.id===r.vehicleId&&!v.destroyed);
      if(vehicle){this.poseRider(r.rig,vehicle,r.vehicleSeat,r.time);continue;}
      // 只要在相机视锥内就渲染；距离只由 Three 的 frustum cull 决定，不再按 550 m 隐藏。
      r.rig.root.visible = true;
      // 远景 LOD：>220 m 只摆位置/朝向，不跑骨骼动画；实体仍渲染。
      if(r.target.distanceToSquared(this.camera.position)>220*220){
        r.rig.root.position.copy(r.target);
        r.rig.root.rotation.y=(r.renderedYaw??r.yaw)+Math.PI;
        continue;
      }
      const strideSpeed=r.prone?1.25:r.crouching?2.8:r.sprinting?7.9:5.3;
      const stride=r.moving&&!r.climbing?Math.hypot(r.velocity.x,r.velocity.z)/(r.swimming?2.7:strideSpeed):1;
      r.time+=dt*THREE.MathUtils.clamp(stride,.2,1.35);
      const worldPosition=r.rig.root.position.clone();
      r.airTime=r.grounded?0:r.airTime+dt;
      // 姿态切换要播约 1.1s 的「手撑地再起身」过渡，不再瞬间切换蹲/趴。
      const stanceNow:StancePose=r.prone?'prone':r.crouching?'crouch':'stand';
      if(r.stance===undefined){r.stance=stanceNow;r.stanceT=1;}
      else if(r.stance!==stanceNow){r.stanceFrom=r.stance;r.stance=stanceNow;r.stanceT=0;}
      if(r.stanceT!==undefined&&r.stanceT<1)r.stanceT=Math.min(1,r.stanceT+dt/STANCE_TRANSITION_SECONDS);
      const transitioning=r.stanceT!==undefined&&r.stanceT<1&&!!r.stanceFrom&&r.mantleTime<0&&!r.climbing&&!r.vehicleId;
      if(transitioning&&r.stanceFrom&&r.stance){
        const order:StancePose[]=['stand','crouch','prone'];
        const direction=order.indexOf(r.stance)>order.indexOf(r.stanceFrom)?'down':'up';
        applyStanceTransition(r.rig,r.stanceT!,r.stanceFrom,r.stance,direction);
      }else{
        this.applyRemoteAction(r,r.mantleTime>=0?'mantle':r.climbing?'climb':r.swimming?(r.moving?'swim':'swim_idle'):!r.grounded?'jump':r.prone?(r.moving?'crawl':'prone_idle'):r.crouching?(r.moving?'crouch_walk':'crouch_idle'):r.moving?(r.sprinting?'run':'walk'):'idle',r.mantleTime>=0?r.mantleTime:!r.grounded&&!r.swimming?r.airTime:r.time,dt);
      }
      r.rig.root.position.copy(worldPosition);
      r.rig.root.rotation.y = (r.renderedYaw??r.yaw) + Math.PI;
      if(!transitioning&&!r.prone&&(r.combatAction==='aim'||r.combatAction==='fire'))alignCharacterAim(r.rig,r.renderedYaw??r.yaw,r.renderedPitch??r.pitch);
    }
  }

  private hudState(now: number): HudState {
    const lootCrate = this.localLootCrate();
    return {
      phase: this.phase,
      canStart:this.isHost&&this.worldReady,multiplayer:!!this.net,ads:this.ads||this.viewmodel.adsAmount>.15,adsBlend:this.viewmodel.adsAmount,renderSize:`${this.presentation.target.width}×${this.presentation.target.height}`,caliber:this.weapon.id==='amr'?'.50':this.weapon.id==='rpg'?'84 MM HEAT':this.weapon.id==='flamethrower'?'FUEL':this.weapon.className==='shotgun'?'12 GA':this.weapon.className==='smg'?'9 / .45':this.weapon.className==='sniper'?'.338':this.weapon.id==='akm'||this.weapon.id==='mk14'?'7.62':'5.56',
      vehicle:this.vehicleHud(now),aimedAmmo:this.aimedAmmo(),ammoPickup:now<this.ammoPickupUntil?this.ammoPickup:undefined,
      overlayOpen: this.overlayOpen,
      mapOpen:this.mapOpen&&!this.paused&&!this.overlayOpen&&!this.winner,
      prepSeconds: Math.ceil(this.prepSeconds),
      armed: this.armed,
      ammo: this.ammo,
      reserve: this.reserve,
      reloading: this.reloading,
      health: this.health,
      protectionSeconds: this.dead ? 0 : Math.ceil(THREE.MathUtils.clamp(this.protectedUntil - now, 0, RESPAWN_PROTECTION_MS) / 1000),
      hurtFlash: this.hurtFlash,
      burnBlind: this.burnBlindIntensity(now),
      paused: this.paused,
      pointerLocked: this.input.pointerLocked,
      score: this.score,
      hitmarker: now < this.hitmarkerUntil,
      banner: now < this.bannerUntil,
      weaponName: this.weapon.name,
      team: this.myTeam,
      blueScore: this.scores.blue,
      orangeScore: this.scores.orange,
      captures: this.caps.map((c) => ({ id: c.id, owner: c.owner, progress: c.progress })),
      vehiclePads: this.vehiclePadStates(),
      scoreMax: 1000,
      mapName: this.arena.name ?? '训练场',
      matchSeconds: Math.max(0, Math.ceil(this.matchRemaining)),
      winner: this.winner,
      inWater: this.controller.inWater,
      underwater: this.controller.underwater,
      scope: this.ads ? this.viewmodel.adsZoom : 1,
      fireMode:this.armed&&!this.dead&&!this.drivingId?this.fireMode:undefined,
      fireModeNotice:this.armed&&!this.dead&&!this.drivingId&&!this.paused&&!this.overlayOpen&&!this.mapOpen&&now<this.fireModeNoticeUntil?this.fireMode:undefined,
      driving: !!this.drivingId,
      vehiclePrompt: this.controller.outOfBoundsSeconds>0?`正在离开战区 · ${Math.max(0,Math.ceil(6-this.controller.outOfBoundsSeconds))}秒内返回`:this.controller.recoveryNotice>0?'已返回最近安全位置':this.controller.climbing?'攀爬中 · 前进/后退键上下 · 跳跃键离开':this.nearbyLadder()?'面向梯子 · 前进爬上 / 后退爬下':this.drivingId ? 'E 离开载具 · 数字键换座 · B 切换炮弹'  : lootCrate ? `E 拾取${this.crateLabel(lootCrate.weaponId)}` : (this.ferryPrompt() || (this.nearestVehicle() ? 'E 进入载具' : '')),
      dead: this.dead,
      respawnSeconds: Math.max(0, Math.ceil((this.respawnAt - now) / 1000)),
      respawnChoice: this.dead ? this.resolveRespawnChoice(this.myTeam) : this.respawnChoice,
      respawnOptions: this.availableRespawns(this.myTeam),
      events: this.localEvents(now),
      minimap: {
        x: this.controller.position.x,
        z: this.controller.position.z,
        yaw: this.drivingId?Math.atan2(-this.camera.getWorldDirection(new THREE.Vector3()).x,-this.camera.getWorldDirection(new THREE.Vector3()).z):this.controller.yaw,
        others: (() => {
          const raw = this.isHost
            ? [...this.hosted.values()].map((h) => ({ x: h.controller.position.x, z: h.controller.position.z,y:h.controller.position.y, team: h.team, dead: h.dead }))
            : [...this.remotes.values()].map((r) => ({ x: r.rig.root.position.x, z: r.rig.root.position.z,y:r.target.y, team: r.team, dead: r.dead }));
          const eye = this.camera.position;
          return raw.map((o) => ({
            ...o,
            spotted: o.team === this.myTeam ? true : (() => {
              // only draw what this player can actually see right now
              const d=new THREE.Vector3(o.x-eye.x,0,o.z-eye.z),f=this.camera.getWorldDirection(new THREE.Vector3());f.y=0;f.normalize();if(d.length()>100||d.normalize().dot(f)<.45)return false;
              const gy = o.y??this.arena.heightAt?.(o.x,o.z)??0;
              return !this.sightBlocked(eye,new THREE.Vector3(o.x,gy+1.35,o.z));
            })(),
          }));
        })(),
        caps: this.caps.map((c) => ({ id: c.id, x: c.x, z: c.z, owner: c.owner, progress: c.progress })),
        vehicles: this.vehicles.filter((v) => !v.destroyed).map((v) => ({ id: v.id, kind: v.kind, team: v.team, x: v.x, z: v.z })),
        crates: this.lootCrates.filter((c) => c.model.visible).map((c) => ({ id: c.id, weaponId: c.weaponId, x: c.model.position.x, z: c.model.position.z })),
        plan: this.arena.minimapPlan,
        palette: this.arena.minimapPalette,
        colors: this.arena.minimapColors,
        ortho: this.tacticalOrtho,
        worldSize: this.arena.worldSize ?? 64,
        minX:this.arena.bounds.minX<0?this.arena.bounds.minX:0,minZ:this.arena.bounds.minZ<0?this.arena.bounds.minZ:0,
      },
      killFeed: this.killFeed.filter((k) => now - k.at < 6000 || k.at === 0).slice(0, 4).map((k) => ({ text: k.text, kind: k.kind })),
      message: this.hostSuspended?'房主窗口已进入后台，对局暂停':this.phase === 'prep'
        ? (this.overlayOpen ? '选择装备' : '整备阶段 · 全图自由移动 · 未持武器')
        : this.dead
          ? (this.simulationNow < this.respawnAt
            ? `阵亡 · ${Math.max(0, Math.ceil((this.respawnAt - this.simulationNow) / 1000))} 秒后可部署`
            : '阵亡 · 点击“部署”复活')
          : (this.reloading ? '换弹中' : ''),
    };
  }

  private updateNameplates() {
    const seen = new Set<string>();
    for (const r of this.remotes.values()) {
      if (r.id === this.localNetId || r.dead || r.vehicleId&&this.vehicles.some(v=>v.id===r.vehicleId&&enclosedVehicle(v.kind))) continue;
      const h = this.hosted.get(r.id);
      const hp = h ? h.health : r.health;
      if (hp <= 0) continue;
      const pos = new THREE.Vector3();
      r.rig.bones.head.getWorldPosition(pos);
      pos.y += 0.24;
      const dist = this.camera.position.distanceTo(pos);
      if (dist > 55) continue;
      if (r.team !== this.myTeam && this.sightBlocked(this.camera.position,pos)) continue;
      pos.project(this.camera);
      if (pos.z > 1 || pos.x < -1.05 || pos.x > 1.05 || pos.y < -1.05 || pos.y > 1.05) continue;
      seen.add(r.id);
      let el = this.nameplates.get(r.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'nameplate';
        el.innerHTML = '<span class="np-name"></span><span class="np-hp"><i></i></span>';
        this.nameplateLayer.appendChild(el);
        this.nameplates.set(r.id, el);
      }
      el.classList.toggle('friendly', r.team === this.myTeam);
      el.classList.toggle('enemy', r.team !== this.myTeam);
      el.style.left = `${((pos.x + 1) / 2) * 100}%`;
      el.style.top = `${((1 - pos.y) / 2) * 100}%`;
      const name = el.querySelector('.np-name') as HTMLElement;
      const bar = el.querySelector('.np-hp i') as HTMLElement;
      name.textContent = r.name;
      bar.style.width = `${Math.max(0, Math.min(100, hp))}%`;
    }
    for (const [id, el] of this.nameplates) {
      if (!seen.has(id)) { el.remove(); this.nameplates.delete(id); }
    }
  }

  private nearbyLadder(){const p=this.controller.position;return this.arena.ladders?.find(l=>Math.hypot(p.x-l.x,p.z-l.z)<1.25&&p.y>=l.bottom-.2&&p.y<=l.top+.4);}
  private nearestVehicle() {
    let best: VehicleState | null = null;
    let bd = 6.5;
    for (const v of this.vehicles) {
      if (!this.canBoard(v,this.myTeam,this.controller.position))continue;
      const d = Math.hypot(v.x - this.controller.position.x, v.z - this.controller.position.z);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  private nearbyLootCrate(controller:PlayerController){
    return this.lootCrates.find(crate=>crate.model.visible&&crate.model.position.distanceToSquared(controller.position)<2.6**2&&
      !this.arena.lineBlocked?.(controller.position.clone().add(new THREE.Vector3(0,.9,0)),crate.model.position));
  }

  private isSpecialWeaponId(id:string){return id==='amr'||id==='rpg'||id==='rocket'||id==='flamethrower';}

  /** 特殊武器（AMR/RPG/喷火器）每次都从 crate 定义取，未知 id 返回 undefined。 */
  private specialWeaponFor(id:string){return id==='amr'?AMR_WEAPON:id==='rocket'||id==='rpg'?RPG_WEAPON:id==='flamethrower'?FLAME_WEAPON:undefined;}
  private crateLabel(id:string){return id==='amr'?'反器材狙击枪':id==='rocket'?'火箭筒':id==='flamethrower'?'喷火器':'特殊武器';}

  private localLootCrate(){
    if(this.drivingId||this.phase!=='live'||this.paused||this.overlayOpen||this.dead||this.winner||
      this.specialWeaponFor(this.weapon.id)||this.reloading||this.hostSuspended||this.controller.climbing||this.controller.mantle)return;
    return this.nearbyLootCrate(this.controller);
  }

  /** Returns true when the key actually interacted, so E can double as lean-right otherwise. */
  private interact():boolean{
    const crate=this.localLootCrate();
    if(crate){
      if(this.isHost)this.pickupLoot(crate.id,this.localNetId);
      else this.net?.send({t:'pickupLoot',matchId:this.matchId,id:crate.id});
      return true;
    }
    const ferry=this.nearbyFerryDock(this.controller);
    if(ferry?.canRequest){
      if(this.isHost)this.ferrySystem?.requestById(ferry.id);
      else this.net?.send({t:'ferryCall',matchId:this.matchId,id:ferry.id});
      return true;
    }
    const before=this.drivingId??null;
    this.toggleVehicle();
    return (this.drivingId??null)!==before;
  }

  private pickupLoot(id:string,playerId:string){
    if(!this.isHost||!this.worldReady||this.phase!=='live'||this.hostSuspended||this.winner)return;
    const local=playerId===this.localNetId,h=this.hosted.get(playerId);
    const controller=local?this.controller:h?.controller;
    if(!controller||controller.climbing||controller.mantle)return;
    if(local?(this.dead||this.drivingId||this.overlayOpen||this.paused||this.reloading||this.stowedPrimary):
      (h?.bot||h?.dead||h?.vehicleId||h?.overlayOpen||h?.reloadEnd||h?.stowedPrimary))return;
    const crate=this.nearbyLootCrate(controller);
    if(crate?.id!==id)return;
    const def=this.specialWeaponFor(crate.weaponId);
    if(!def)return;
    crate.model.visible=false;
    const readyAt=this.simulationNow+300;
    if(h){
      h.stowedPrimary={weaponId:h.selection.weaponId,ammo:h.ammo,reserve:h.reserve};
      h.selection={...h.selection,weaponId:def.id};
      h.ammo=def.magazine;h.reserve=0;h.nextFire=Math.max(h.nextFire,readyAt);
    }else{
      this.stowedPrimary={weaponId:this.weapon.id,ammo:this.ammo,reserve:this.reserve};
      this.equipWeapon(def);
      this.ammo=def.magazine;this.reserve=0;this.nextFireAt=Math.max(this.nextFireAt,readyAt);
    }
    this.hudDirty=true;
  }

  private restorePrimary(h?:HostedGuest){
    const primary=h?h.stowedPrimary:this.stowedPrimary;
    if(!primary)return;
    if(h){
      h.selection={...h.selection,weaponId:primary.weaponId};
      h.ammo=primary.ammo;h.reserve=primary.reserve;h.stowedPrimary=undefined;
    }else{
      this.equipWeapon(getWeapon(primary.weaponId)!);
      this.ammo=primary.ammo;this.reserve=primary.reserve;this.stowedPrimary=undefined;
    }
  }

  /**
   * 建立一个载具对象（模型 + 武器 + 运行时状态）。初始 32 辆与自动刷新的动态车共用，
   * 动态车 id 由刷新管理器生成，保证全局唯一。
   */
  private buildVehicleState(def:{id:string;kind:string;team:NetTeam|'neutral';x:number;y:number;z:number;yaw:number}){
    const model = buildVehicleModel(def.kind as VehicleModelId,true);
    this.registerShadowModel(model);
    model.position.set(def.x,def.y,def.z);
    model.rotation.y = def.yaw;
    this.scene.add(model);
    const hp = vehicleHealth(def.kind);
    const guns=(model.userData.machineGuns??[]) as THREE.Object3D[];
    let gunIndex=0;
    const weapons=(getVehicle(def.kind)?.weapons??[]).map(id=>{
      const cannon=isCannon(id),mount=(cannon?model.userData.barrel:guns[gunIndex++]) as THREE.Object3D;
      const muzzle=cannon?model.userData.muzzle:new THREE.Object3D();
      if(!cannon){muzzle.position.set(0,.02,.592);mount.add(muzzle);}
      const auto=id==='vehicle_autocannon_30';
      return {id,mount,muzzle,ammo:cannon?(auto?250:30):240,nextFire:0,yaw:0,pitch:0,aimYaw:def.yaw,aimPitch:0,spread:0,lastFire:0};
    });
    const maxShells=weapons.some(w=>w.id==='vehicle_autocannon_30')?250:30;
    const vehicle:VehicleState={ weapons,seats:Array(1+weapons.length).fill(null),id:def.id,kind:def.kind,team:def.team,model,x:def.x,z:def.z,yaw:def.yaw,speed:0,turretYaw:0,turretPitch:0,yawVelocity:0,pitchVelocity:0,aimYaw:def.yaw,aimPitch:0,health:hp,maxHealth:hp,ammo:maxShells,shell:'ap',nextFire:0,destroyed:false };
    this.vehicles.push(vehicle);
    return vehicle;
  }

  /** 车位精确刷新位姿：只取车位中心，不做 22 m 环形搜索。 */
  private vehiclePadPose(pad:{kind:string;x:number;z:number;angle:number}){
    const contact=vehicleContact(this.motionWorld,vehicleSize(pad.kind),pad.x,pad.z,pad.angle);
    const fallback=this.arena.vehicleGroundAt?.(pad.x,pad.z)??this.arena.heightAt?.(pad.x,pad.z)??0;
    return {x:pad.x,y:Number.isFinite(contact.y)?contact.y:fallback,z:pad.z};
  }

  /**
   * 车位净空检测（玩家/建筑/其他车含残骸/水/坡度）。刷新失败时管理器按 2 s 重试。
   * ignoreIds：本轮会被移除/覆盖的载具（车位自己的旧残骸），不参与阻挡。
   */
  private vehiclePadClear(pad:VehiclePadSpec,ignoreIds:readonly string[]=[]):boolean{
    const size=vehicleSize(pad.kind),world=this.motionWorld;
    const deck=vehicleDeck(world,pad.x,pad.z);
    if(!Number.isFinite(deck))return false;
    if(this.arena.waterAt?.(pad.x,pad.z,deck))return false;
    // 建筑/台阶/坡度/水与 9 点贴地：与物理步进同一套判定。
    if(vehiclePoseBlocked(world,size,{x:pad.x,z:pad.z,yaw:pad.angle},{from:{x:pad.x,z:pad.z,yaw:pad.angle},ignoreId:ignoreIds[0]}))return false;
    const contact=vehicleContact(world,size,pad.x,pad.z,pad.angle);
    const bottom=contact.y,top=contact.y+size.h;
    const ignore=new Set(ignoreIds);
    // vehiclePoseBlocked 的 vehicleBlocks 跳过残骸；车位净空必须连残骸也算。
    for(const v of this.vehicles){
      if(ignore.has(v.id))continue;
      const other=vehicleSize(v.kind),otherBottom=v.model.position.y;
      if(boxesOverlapXZ({x:pad.x,z:pad.z,w:size.w,d:size.d,rot:pad.angle,bottom,top},{x:v.x,z:v.z,w:other.w,d:other.d,rot:v.yaw,bottom:otherBottom,top:otherBottom+other.h}))return false;
    }
    // 玩家站在车位里也不能刷车。
    const fx=Math.sin(pad.angle),fz=Math.cos(pad.angle),rx=Math.cos(pad.angle),rz=-Math.sin(pad.angle);
    const halfW=size.w*.5+.9,halfD=size.d*.5+.9;
    for(const person of [{dead:this.dead,controller:this.controller},...this.hosted.values()]){
      if(person.dead)continue;
      const p=person.controller.position;
      if(p.y>top+2||p.y+1.8<bottom)continue;
      const dx=p.x-pad.x,dz=p.z-pad.z;
      if(Math.abs(dx*rx+dz*rz)<=halfW&&Math.abs(dx*fx+dz*fz)<=halfD)return false;
    }
    return true;
  }

  /** 执行管理器下发的 spawn：动态车获得唯一 id，host 广播 vehSpawn 供客机补建。 */
  private spawnPadVehicle(action:Extract<SpawnAction,{type:'spawn'}>){
    if(this.vehicles.some(v=>v.id===action.vehicleId))return;
    const pose=this.vehiclePadPose({kind:action.kind,x:action.x,z:action.z,angle:action.angle});
    const vehicle=this.buildVehicleState({id:action.vehicleId,kind:action.kind,team:action.team,x:pose.x,y:pose.y,z:pose.z,yaw:action.angle});
    if(this.isHost&&this.net)this.net.send({t:'vehSpawn',matchId:this.matchId,vehicle:{id:vehicle.id,kind:vehicle.kind,team:vehicle.team,x:vehicle.x,y:vehicle.model.position.y,z:vehicle.z,yaw:vehicle.yaw,padId:action.padId}});
  }

  /** 从世界与载具表里彻底移除一个载具对象（含座位上的玩家；模型释放）。 */
  private removeVehicle(id:string,reason:'reset'|'limit'|'respawn'){
    const index=this.vehicles.findIndex(v=>v.id===id);
    if(index<0)return;
    const vehicle=this.vehicles[index];
    if(this.drivingId===vehicle.id){this.placeAfterExit(this.controller,vehicle);this.clearLocalVehicle();}
    for(const h of this.hosted.values()){
      if(h.vehicleId!==vehicle.id)continue;
      this.placeAfterExit(h.controller,vehicle);
      h.vehicleId=null;h.vehThrottle=0;h.vehSteer=0;h.vehicleOrder=undefined;
    }
    vehicle.seats.fill(null);
    this.lastVehicleImpact.delete(vehicle.id);
    vehicle.model.removeFromParent();
    vehicle.model.userData.dispose?.();
    this.vehicles.splice(index,1);
    this.hudDirty=true;
  }

  /** host 自动刷新推进（200 ms 节流）：弃车/毁损/净空/上限全部在管理器里。 */
  private updateVehicleSpawns(now:number){
    const manager=this.vehicleSpawnManager;
    if(!manager||!this.isHost||this.phase!=='live'||this.winner)return;
    if(now<this.nextVehicleSpawnCheck)return;
    this.nextVehicleSpawnCheck=now+SPAWN_DEFAULTS.tickMs;
    const snapshot:VehicleSync[]=this.vehicles.map(v=>({id:v.id,x:v.x,z:v.z,destroyed:v.destroyed}));
    const result=manager.update(now,snapshot,(pad,ignoreIds)=>this.vehiclePadClear(pad,ignoreIds));
    for(const action of result.actions){
      if(action.type==='remove')this.removeVehicle(action.vehicleId,action.reason);
      else this.spawnPadVehicle(action);
    }
  }

  /** 车位三态：host 由管理器给，客机用主机 snap 下发的一份。 */
  private vehiclePadStates():HudState['vehiclePads']{
    return this.isHost?(this.vehicleSpawnManager?.states()??[]):this.netPadStates;
  }

  /** snap 用的车位状态节流：有变化或每 2 s 才带一次，避免每帧多 1–2 KB。 */
  private padSnapshotForNet(now:number):HudState['vehiclePads']{
    const pads=this.vehiclePadStates()??[];
    if(!pads.length)return undefined;
    const signature=pads.map(p=>`${p.id},${p.state},${p.seconds??''}`).join(';');
    if(signature===this.lastPadSignature&&now<this.nextPadSyncAt)return undefined;
    this.lastPadSignature=signature;this.nextPadSyncAt=now+2000;
    return pads;
  }

  private vehicleSpawn(kind:string,x:number,z:number,yaw:number){
    const size=vehicleSize(kind),world=this.motionWorld;
    // Wide clearance ring search: pads are only markers, and the authored map has
    // hedges/wrecks near several of them. A culled spawn must not leave the hull
    // (let alone the barrel) inside a hedge, on a slope or across a foundation lip.
    let fallback:{x:number;y:number;z:number;score:number}|undefined;
    const consider=(px:number,pz:number,radius:number)=>{
      const deck=vehicleDeck(world,px,pz);
      if(!Number.isFinite(deck))return undefined;
      if(this.arena.waterAt?.(px,pz,deck))return undefined;
      const contact=vehicleContact(world,size,px,pz,yaw);
      let high=-Infinity,low=Infinity;
      for(const [side,end] of HULL_SUPPORT_POINTS){
        const h=vehicleDeck(world,px+side*size.w*.5*Math.cos(yaw)+end*size.d*.5*Math.sin(yaw),
          pz-side*size.w*.5*Math.sin(yaw)+end*size.d*.5*Math.cos(yaw));
        high=Math.max(high,h);low=Math.min(low,h);
      }
      const grade=high-low-maxVehicleGrade(size);
      // Hull must fit, the barrel needs margin against hedges, and the pose must not
      // already be inside another vehicle or a foundation that the AI has to climb.
      if(vehiclePoseBlocked(world,size,{x:px,z:pz,yaw},{from:{x:px,z:pz,yaw}}))return {x:px,y:contact.y,z:pz,score:1e3+grade+radius};
      if(this.arena.footprintBlocked?.(px,pz,size.w+1.5,size.d+1.5,yaw,contact.y+.56,size.h))return undefined;
      if(this.vehicles.some(v=>{const other=vehicleSize(v.kind);return boxesOverlapXZ({x:px,z:pz,w:size.w,d:size.d,rot:yaw,bottom:contact.y,top:contact.y+size.h},{x:v.x,z:v.z,w:other.w,d:other.d,rot:v.yaw,bottom:contact.y,top:contact.y+other.h});}))return undefined;
      return {x:px,y:contact.y,z:pz,score:radius+grade*.5};
    };
    for(let radius=0;radius<=22;radius+=1)for(let i=0;i<(radius?24:1);i++){
      const angle=i*Math.PI/12,px=x+Math.cos(angle)*radius,pz=z+Math.sin(angle)*radius;
      const spot=consider(px,pz,radius);
      if(spot&&spot.score<1e3)return {x:spot.x,y:spot.y,z:spot.z};
      if(spot&&(!fallback||spot.score<fallback.score))fallback=spot;
    }
    if(fallback)return {x:fallback.x,y:fallback.y,z:fallback.z};
    return {x,y:vehicleDeck(world,x,z),z};
  }

  private canBoard(v:VehicleState,team:NetTeam,pos:THREE.Vector3){
    return !v.destroyed&&v.seats.includes(null)&&(v.team===team||v.team==='neutral')&&
      Math.hypot(v.x-pos.x,v.z-pos.z)<=6.5&&Math.abs(v.model.position.y-pos.y)<2.5&&
      !this.arena.lineBlocked?.(pos.clone().add(new THREE.Vector3(0,1.35,0)),v.model.position.clone().add(new THREE.Vector3(0,1.35,0)));
  }

  private unseat(v:VehicleState,seat:number,id:string){
    if(v.seats[seat]===id)v.seats[seat]=null;
  }

  private moveSeat(v:VehicleState,id:string,previous:number,next:number){
    if(!Number.isInteger(next)||v.seats[next]!==null||v.seats[previous]!==id)return false;
    this.unseat(v,previous,id);v.seats[next]=id;
    return true;
  }

  private boardLocal(v:VehicleState,seat:number){
    this.drivingId=v.id;this.vehicleSeat=seat;this.pendingInputs=[];
    const weapon=v.weapons[seat-1];
    this.vehicleViewYaw=v.yaw+(weapon?(isCannon(weapon.id)?v.turretYaw:weapon.yaw):0);
    this.vehicleViewPitch=weapon?(isCannon(weapon.id)?v.turretPitch:weapon.pitch):0;
    this.ads=false;this.reloading=false;this.viewmodel.setEquipped(false);
    this.controller.teleport(this.seatPosition(v,seat),v.yaw+Math.PI);this.hudDirty=true;
  }

  private clearLocalVehicle(){
    this.drivingId=null;this.vehicleSeat=0;this.armed=!this.dead&&this.phase==='live';
    this.viewmodel.setEquipped(this.armed);this.hudDirty=true;
  }

  private selectVehicleSeat(seat:number){
    const v=this.vehicles.find(v=>v.id===this.drivingId);
    if(!v||v.seats[seat]!==null||this.pendingSeatChange)return;
    if(!this.isHost){this.pendingSeatChange=true;this.net?.send({t:'veh',matchId:this.matchId,action:'seat',seat});return;}
    if(this.moveSeat(v,this.localNetId,this.vehicleSeat,seat))this.boardLocal(v,seat);
  }

  private toggleVehicle(){
    if(this.phase!=='live'||this.overlayOpen||this.paused||this.dead||this.controller.climbing||this.pendingSeatChange)return;
    const current=this.vehicles.find(v=>v.id===this.drivingId),v=current??this.nearestVehicle();
    if(!v)return;
    if(!this.isHost){this.pendingSeatChange=true;this.net?.send({t:'veh',matchId:this.matchId,action:current?'exit':'enter',id:v.id});return;}
    if(current){
      const exitSpeed=Math.abs(current.speed);
      this.unseat(current,this.vehicleSeat,this.localNetId);this.placeAfterExit(this.controller,current);this.clearLocalVehicle();
      this.applyExitDamage(this.controller,exitSpeed,true);
    }else{
      const seat=v.seats.indexOf(null);v.seats[seat]=this.localNetId;this.boardLocal(v,seat);
    }
  }

  private placeAfterExit(controller:PlayerController,v:VehicleState){
    const size=vehicleSize(v.kind),deck=vehicleDeck(this.motionWorld,v.x,v.z);
    const valid=(x:number,z:number)=>{
      const y=this.arena.supportAt?.(x,z,v.model.position.y+1.05)??this.arena.heightAt?.(x,z)??NaN;
      if(!Number.isFinite(y))return null;
      // Never step off a bridge/wall into water or down a cliff just to leave the hull.
      if(this.arena.waterAt?.(x,z,y))return null;
      if(Math.abs(y-deck)>1.35)return null;
      if(this.arena.playerBlocked?.(x,z,.39,y,1.8,controller.entityId))return null;
      return y;
    };
    // Prefer the hull's flanks and rear (the nose is usually against the obstacle).
    const base=v.yaw+Math.PI;
    for(const [turn,offset] of [[0,0.55],[Math.PI/2,0.3],[-Math.PI/2,0.3],[Math.PI,0.55],[Math.PI/3,0.45],[-Math.PI/3,0.45],[Math.PI*2/3,0.45],[-Math.PI*2/3,0.45],[Math.PI/4,0.7],[-Math.PI/4,0.7],[Math.PI*3/4,0.7],[-Math.PI*3/4,0.7]] as const){
      const angle=base+turn,radius=Math.hypot(size.w,size.d)*.5+offset;
      const x=v.x+Math.cos(angle)*radius,z=v.z+Math.sin(angle)*radius;
      const y=valid(x,z);
      if(y!==null){controller.teleport(new THREE.Vector3(x,y,z),v.yaw+Math.PI);return;}
    }
    const spot=this.safeSpot(v.x+Math.cos(v.yaw)*4,v.z-Math.sin(v.yaw)*4);
    const y=valid(spot.x,spot.z)??(this.arena.navigationHeight?.(spot.x,spot.z)??0);
    controller.teleport(new THREE.Vector3(spot.x,y,spot.z),v.yaw+Math.PI);
  }

  private seatPosition(v:VehicleState,seat:number){
    const points:Record<string,number[][]>={
      motorcycle:[[0,.31,-.22]],
      jeep:[[-.41,.18,-.12],[0,.92,-1.20]],
      apc:[[-.48,1.14,.92],[.55,1.43,-.38]],
      ifv:[[-.52,1.11,1.04],[0,1.8,-.24]],
      light_tank:[[-.47,1.06,.91],[-.3,1.26,-.32],[.46,1.35,.14]],
      mbt:[[-.55,1.16,1.22],[-.39,1.45,.08],[.57,1.44,.28],[-.59,1.59,-1.06]],
    };
    const [x,y,z]=points[v.kind]?.[seat]??[0,.6,0];
    return v.model.localToWorld(new THREE.Vector3(x,enclosedVehicle(v.kind)?.38:y,z));
  }

  private poseRider(rig:CharacterRig,v:VehicleState,seat:number,time:number){
    applyCharacterAction(rig,'vehicle_sit',time);
    rig.root.position.copy(this.seatPosition(v,seat));
    rig.root.quaternion.copy(v.model.quaternion);
    if(seat>0){const weapon=v.weapons[seat-1];if(weapon)rig.root.rotateY(isCannon(weapon.id)?v.turretYaw:weapon.yaw);}
    rig.root.visible=!enclosedVehicle(v.kind);
  }

  private updateSeatedPlayer(){
    const v=this.vehicles.find(v=>v.id===this.drivingId&&!v.destroyed);
    if(!v||this.dead){if(this.seatedPlayer)this.seatedPlayer.root.visible=false;return;}
    if(!this.seatedPlayer){
      this.seatedPlayer=createBlockyCharacter(this.myTeam,{weapon:false,batched:true});
      this.registerShadowModel(this.seatedPlayer.root);
      this.scene.add(this.seatedPlayer.root);
    }
    this.poseRider(this.seatedPlayer,v,this.vehicleSeat,this.simulationNow/1000);
    this.seatedPlayer.setSpawnProtected(this.isSpawnProtected(this.localNetId,this.simulationNow));
  }

  private vehicleImpact(v:VehicleState,nx:number,nz:number,yaw:number,size:ReturnType<typeof vehicleSize>,ground:number){
    const speed=Math.abs(v.speed),now=this.simulationNow,c=Math.cos(yaw),s=Math.sin(yaw);
    const forward=new THREE.Vector3(s,0,c).multiplyScalar(Math.sign(v.speed));
    for(const [id,body] of this.bodies){
      const p=body.origin,dx=p.x-nx,dz=p.z-nz;
      if(Math.abs(dx*c-dz*s)>size.w/2+.35||Math.abs(dx*s+dz*c)>size.d/2+.55||p.y>ground+size.h||p.y+.55<ground)continue;
      const key='body:'+id;
      if(now-(this.lastVehicleImpact.get(key)??-Infinity)<350)continue;
      this.lastVehicleImpact.set(key,now);
      const side=Math.sign(dx*c-dz*s)||1;
      body.drift.copy(forward).add(new THREE.Vector3(c*side*.65,0,-s*side*.65)).normalize().multiplyScalar(Math.max(1.5,speed*.85));
      if(speed>5)body.fallSpeed=Math.max(body.fallSpeed,1.6+speed*.29);
    }
    for(const person of [{id:this.localNetId,controller:this.controller,dead:this.dead,vehicleId:this.drivingId},...this.hosted.values()]){
      if(person.dead||person.vehicleId)continue;
      const p=person.controller.position,dx=p.x-nx,dz=p.z-nz;
      if(Math.abs(dx*c-dz*s)>size.w/2+.38||Math.abs(dx*s+dz*c)>size.d/2+.38||p.y>ground+size.h||p.y+1.6<ground)continue;
      const sign=Math.sign(v.speed),lateral=dx*c-dz*s,longitudinal=dx*s+dz*c;
      const side=Math.sign(lateral)||1,sideDepth=size.w/2+.4-Math.abs(lateral),endDepth=size.d/2+.4-Math.abs(longitudinal);
      const front=endDepth<sideDepth&&longitudinal*sign>=0;
      const normal=front?new THREE.Vector3(s*sign,0,c*sign):new THREE.Vector3(c*side,0,-s*side);
      const moved=p.clone().addScaledVector(normal,(front?endDepth:sideDepth)+.025);
      if(!this.arena.playerBlocked?.(moved.x,moved.z,.38,p.y,1.8,person.id))p.copy(moved);
      const push=normal.addScaledVector(new THREE.Vector3(s*sign,0,c*sign),.45).normalize();
      person.controller.impactVelocity.copy(push).multiplyScalar(Math.max(2.5,speed*.9));
      const damage=pedestrianImpactDamage(speed);
      if(now-(this.lastVehicleImpact.get(person.id)??-Infinity)<500&&damage<100)continue;
      this.lastVehicleImpact.set(person.id,now);
      if(damage>0){
        if(speed>6){person.controller.velocity.y=2+speed*.27;person.controller.grounded=false;}
        this.applyCombatHit({kind:'player',id:person.id,distance:0,point:p.clone()},v.seats[0]??'',{...AMMO.rifle,damage},now,true);
        v.health=Math.max(0,v.health-damage*.07);
      }
    }
  }

  /** The world the vehicle physics, route planner and AI share. */
  private get motionWorld():MotionWorld{
    return this.vehicleMotionWorld??={
      bounds:this.arena.bounds,
      ground:(x,z)=>this.arena.vehicleGroundAt?.(x,z)??this.arena.heightAt?.(x,z)??0,
      footprintBlocked:(x,z,w,d,yaw,feet,height,terrain)=>this.arena.footprintBlocked?.(x,z,w,d,yaw,feet,height,terrain)??false,
      supportAt:(x,z,maxY)=>this.arena.supportAt?.(x,z,maxY)??this.arena.heightAt?.(x,z)??0,
      heightAt:(x,z)=>this.arena.heightAt?.(x,z)??0,
      waterAt:(x,z,feet)=>this.arena.waterAt?.(x,z,feet)??null,
      vehiclePerformance:(kind)=>this.arena.vehiclePerformance?.(kind),
      vehicleBlocks:(pose,hull,ground,ignoreId,knownTeam)=>this.vehicles.some(other=>{
        if(other.destroyed||other.id===ignoreId||(knownTeam&&other.team!==knownTeam))return false;
        const size=vehicleSize(other.kind),bottom=other.model.position.y;
        return bottom+size.h>ground&&bottom<ground+hull.h&&boxesOverlapXZ(
          {x:pose.x,z:pose.z,w:hull.w,d:hull.d,rot:pose.yaw,bottom:ground,top:ground+hull.h},
          {x:other.x,z:other.z,w:size.w,d:size.d,rot:other.yaw,bottom,top:bottom+size.h});
      }),
    };
  }

  private vehiclePathBlocked(v:VehicleState,nx:number,nz:number,yaw:number){
    return vehiclePoseBlocked(this.motionWorld,vehicleSize(v.kind),{x:nx,z:nz,yaw},
      {from:{x:v.x,z:v.z,yaw:v.yaw},pitch:v.model.rotation.x,roll:v.model.rotation.z,ignoreId:v.id});
  }

  private driveVehicle(v:VehicleState,throttle:number,steer:number,_turret:number,dt:number){
    const size=vehicleSize(v.kind),ground=v.model.position.y;
    if(this.winchOut(v,throttle,steer,dt)){
      const contact=vehicleContact(this.motionWorld,size,v.x,v.z,v.yaw);
      v.model.position.set(v.x,contact.y,v.z);
      v.model.rotation.set(contact.pitch,v.yaw,contact.roll);
      v.model.updateMatrixWorld(true);
      return new THREE.Vector3(Math.sin(v.yaw),0,Math.cos(v.yaw));
    }
    const step=advanceVehiclePose(this.motionWorld,v,v.kind,throttle,steer,dt,v.id);
    if(step.blocked){
      const crashSpeed=Math.abs(step.impactSpeed);
      const lastCrash=this.lastVehicleCrash.get(v.id)??-Infinity;
      // 高速压过坎/突起/矮墙时，motion 会连续几帧报 blocked；旧逻辑按帧叠平方伤害，
      // 30 m/s 过坎即 300+ 血，连撞几帧直接爆炸。现在：
      //  · 12 m/s 以下只是地形磕碰，不掉血；
      //  · 单次最多掉 10% 最大血；
      //  · 同一辆车 1.4 s 内只结算一次；
      //  · 掠射滑行（motion 现在会保留大部分速度）不算撞车，不结算伤害。
      if(this.isHost&&crashSpeed>12&&Math.abs(v.speed)<crashSpeed*.35&&this.simulationNow-lastCrash>1400){
        const maxHp=vehicleHealth(v.kind);
        const damage=Math.min(maxHp*.10,Math.max(0,(crashSpeed-12)**2*.10));
        if(damage>=1){v.health=Math.max(0,v.health-damage);this.lastVehicleCrash.set(v.id,this.simulationNow);if(!v.health)this.destroyVehicle(v,v.seats[0]??'');}
      }
    }else if(this.isHost&&Math.abs(v.speed)>.4){
      this.vehicleImpact(v,v.x,v.z,v.yaw,size,ground);
    }
    const contact=step.contact;
    const drawY=THREE.MathUtils.clamp(THREE.MathUtils.damp(v.model.position.y,contact.y,14,dt),contact.y-.45,contact.y+.45);
    v.model.position.set(v.x,Number.isFinite(drawY)?drawY:contact.y,v.z);
    v.model.rotation.order='YXZ';
    v.model.rotation.set(
      THREE.MathUtils.damp(v.model.rotation.x,THREE.MathUtils.clamp(contact.pitch,-.7,.7),10,dt),
      v.yaw,
      THREE.MathUtils.damp(v.model.rotation.z,THREE.MathUtils.clamp(contact.roll,-.7,.7),10,dt));
    v.model.updateMatrixWorld(true);
    if(v.model.userData.turret)this.updateTurret(v,dt);
    const wheels=v.model.userData.wheels as THREE.Object3D[]|undefined;if(wheels)for(const w of wheels)w.rotation.x+=v.speed*dt/.4;
    const tracks=v.model.userData.trackMaterials as THREE.MeshStandardMaterial[]|undefined;if(tracks){const updated=new Set<THREE.Texture>();for(const m of tracks)if(m.map&&!updated.has(m.map)){m.map.offset.y+=v.speed*dt*2.2;updated.add(m.map);}}
    v.model.updateMatrixWorld(true);
    const fwd=new THREE.Vector3(Math.sin(v.yaw),0,Math.cos(v.yaw));
    return fwd;
  }


  /**
   * Last-resort unstick: a hull that has demanded throttle for >2.2 s without
   * moving even one frame is geometrically pinched (AI recovery has already
   * failed). Pull it towards the nearest clear pose at walking pace, then let the
   * normal motion take over. This is the guarantee that no tank can stay wedged.
   */
  private winchOut(v:VehicleState,throttle:number,steer:number,dt:number){
    if(throttle===0&&steer===0){v.stallSince=0;v.winchYaw=v.yaw;return false;}
    // Pivoting counts as movement: a tracked hull may legitimately hold position
    // while it turns. Only a hull that neither moves nor turns is pinched.
    const turned=v.winchYaw!==undefined&&Math.abs(angleDelta(v.yaw,v.winchYaw))>.002;
    v.winchYaw=v.yaw;
    if(Math.abs(v.speed)>.3||turned){v.stallSince=0;return false;}
    v.stallSince=(v.stallSince??0)+dt*1000;
    if(v.stallSince<2200)return false;
    const free=findFreeVehiclePose(this.motionWorld,vehicleSize(v.kind),v.x,v.z,v.yaw,3.5,v.id);
    if(!free){v.stallSince=0;return false;}
    const dx=free.x-v.x,dz=free.z-v.z,d=Math.hypot(dx,dz);
    if(d<.05){v.stallSince=0;return false;}
    const step=Math.min(.12,d);
    v.x+=dx/d*step;v.z+=dz/d*step;v.yaw=free.yaw;v.speed=0;
    v.winchCount=(v.winchAt&&this.simulationNow-v.winchAt<30000?(v.winchCount??0):0)+1;
    v.winchAt=this.simulationNow;
    v.winchExhausted=(v.winchCount??0)>=3;
    if(d<.3)v.stallSince=0;
    return true;
  }

  private updateTurret(v:VehicleState,dt:number){
    const localIntent=directionFor(v.aimYaw,v.aimPitch).applyQuaternion(v.model.quaternion.clone().invert());
    const yawAxis={angle:v.turretYaw,velocity:v.yawVelocity};
    advanceAxis(yawAxis,Math.atan2(localIntent.x,localIntent.z),dt,.8,1.6,-Infinity,Infinity,true);v.turretYaw=yawAxis.angle;v.yawVelocity=yawAxis.velocity;
    // Rear deck limits depression; hull pitch/roll are included in the transform.
    const depression=Math.abs(v.turretYaw)>2.2?-.04:-.16,pitchAxis={angle:v.turretPitch,velocity:v.pitchVelocity};
    advanceAxis(pitchAxis,Math.atan2(localIntent.y,Math.hypot(localIntent.x,localIntent.z)),dt,.45,.9,depression,.48);v.turretPitch=pitchAxis.angle;v.pitchVelocity=pitchAxis.velocity;
    if(v.model.userData.turret)(v.model.userData.turret as THREE.Object3D).rotation.y=v.turretYaw;
    if(v.model.userData.barrel){const barrel=v.model.userData.barrel as THREE.Object3D;barrel.rotation.x=-v.turretPitch;v.model.userData.kick=THREE.MathUtils.damp(v.model.userData.kick??0,0,14,dt);barrel.position.z=(v.model.userData.barrelRestZ??barrel.position.z)-v.model.userData.kick;}
  }

  private chaseCamera(v:VehicleState,dt:number,_steer=0){
    const dir=directionFor(this.vehicleViewYaw,this.vehicleViewPitch);
    const pivot=new THREE.Vector3(v.x,v.model.position.y+2.4,v.z),desired=pivot.clone().addScaledVector(dir,-8).add(new THREE.Vector3(0,2,0));
    const delta=desired.clone().sub(pivot),len=delta.length();delta.normalize();const obstruction=this.arena.rayDistance?.(pivot,delta,len)??Infinity;if(obstruction<len)desired.copy(pivot).addScaledVector(delta,Math.max(.4,obstruction-.4));
    desired.y=Math.max(desired.y,(this.arena.heightAt?.(desired.x,desired.z)??0)+.4);
    this.camera.position.copy(desired);this.camera.lookAt(desired.clone().add(dir));this.controller.position.copy(this.seatPosition(v,this.vehicleSeat));
    this.vehicleFov=70;this.viewmodel.setEquipped(false);
  }
  private vehicleHud(now:number):HudState['vehicle']{
    const v=this.vehicles.find(v=>v.id===this.drivingId);
    if(!v)return null;
    const weapon=v.weapons[this.vehicleSeat-1],cannon=!!weapon&&isCannon(weapon.id);
    const actual={x:50,y:50,visible:false};
    let blocked=false;
    if(weapon){
      this.camera.updateMatrixWorld(true);
      const origin=weapon.muzzle.getWorldPosition(new THREE.Vector3());
      // 人类炮手的弹道已经收敛到屏幕中心（相机准星射线）；可见准星必须显示
      // 同一个落点，否则「炮管方向投影」会落在中心下方，弹着看起来偏高。
      actual.x=50;actual.y=50;actual.visible=true;
      blocked=!!this.arena.lineBlocked?.(weapon.mount.getWorldPosition(new THREE.Vector3()),origin);
    }
    return {name:this.vehicleLabel(v.kind),health:Math.ceil(v.health),maxHealth:v.maxHealth,speed:v.speed*3.6,
      seat:this.vehicleSeat,seats:v.seats.map((id,i)=>({label:i?VEHICLE_WEAPON_NAMES[v.weapons[i-1].id]:'驾驶位',occupied:!!id})),
      cannon,weapon:weapon?VEHICLE_WEAPON_NAMES[weapon.id]:'',yaw:v.yaw,turretYaw:v.turretYaw,pitch:v.turretPitch,
      ammo:cannon?v.ammo:weapon?.ammo??0,shell:cannon?v.shell.toUpperCase():'',reload:Math.max(0,((cannon?v.nextFire:weapon?.nextFire??0)-now)/1000),
      actual,blocked};
  }

  private setVehicleAim(v:VehicleState,seat:number,yaw:number,pitch:number){
    const weapon=v.weapons[seat-1];if(!weapon||!Number.isFinite(yaw)||!Number.isFinite(pitch))return;
    weapon.aimYaw=yaw;weapon.aimPitch=THREE.MathUtils.clamp(pitch,-.5,.7);
    if(isCannon(weapon.id)){v.aimYaw=weapon.aimYaw;v.aimPitch=weapon.aimPitch;}
    else this.orientMachineGun(v,weapon);
  }

  private orientMachineGun(v:VehicleState,weapon:VehicleState['weapons'][number]){
    const local=directionFor(weapon.aimYaw,weapon.aimPitch).applyQuaternion(v.model.quaternion.clone().invert());
    weapon.yaw=Math.atan2(local.x,local.z);
    weapon.pitch=THREE.MathUtils.clamp(Math.asin(local.y),v.kind==='apc'?-.42:-.26,.7);
    weapon.mount.rotation.set(-weapon.pitch,weapon.yaw,0,'YXZ');
  }

  private updateVehicle(dt:number,look:{x:number;y:number},active:boolean){
    const v=this.vehicles.find(v=>v.id===this.drivingId);
    if(!v||v.destroyed){this.clearLocalVehicle();return;}
    if(active){
      this.vehicleViewYaw=angleDelta(this.vehicleViewYaw-look.x*.0022*getSettings().sensitivity,0);
      this.vehicleViewPitch=THREE.MathUtils.clamp(this.vehicleViewPitch-look.y*.0022*getSettings().sensitivity*(getSettings().invertY?-1:1),-.5,.7);
      if(this.isHost||!isCannon(v.weapons[this.vehicleSeat-1]?.id))this.setVehicleAim(v,this.vehicleSeat,this.vehicleViewYaw,this.vehicleViewPitch);
    }
    if(this.isHost&&this.vehicleSeat===0){
      const throttle=active?Number(this.input.down('KeyW'))-Number(this.input.down('KeyS')):0;
      const steer=active?Number(this.input.down('KeyA'))-Number(this.input.down('KeyD')):0;
      this.driveVehicle(v,throttle,steer,0,dt);
    }
    this.chaseCamera(v,dt);
  }

  private updateHostedVehicle(h:HostedGuest,dt:number){
    const v=this.vehicles.find(v=>v.id===h.vehicleId);
    if(!v||v.destroyed||h.dead){h.vehicleId=null;return;}
    if(h.vehicleSeat===0){
      const active=h.bot||this.simulationNow-h.lastInput<=600;
      // Release the following brake at standstill; AI decisions are held over
      // several physics steps and a negative pedal must not start reversing.
      const throttle=(h.vehicleBraking&&Math.abs(v.speed)<.35)||(h.trafficFollowing&&v.speed<.35&&h.vehThrottle<0)?0:h.vehThrottle;
      this.driveVehicle(v,active?throttle:0,active?h.vehSteer:0,0,dt);
    }
    h.controller.position.copy(this.seatPosition(v,h.vehicleSeat));h.yaw=v.yaw+Math.PI;
  }

  private vehicleLabel(kind: string) {
    return kind === 'motorcycle' ? '摩托车' : kind === 'jeep' ? '吉普' : kind === 'apc' ? '装甲车' : kind === 'ifv' ? '步战车' : kind === 'light_tank' ? '轻型坦克' : '主战坦克';
  }

  private fireVehicleFor(shooterId:string){
    const h=this.hosted.get(shooterId),v=this.vehicles.find(v=>v.id===(h?.vehicleId??(shooterId===this.localNetId?this.drivingId:null)));
    const seat=h?.vehicleSeat??this.vehicleSeat,weapon=v?.weapons[seat-1];
    if(!v||!weapon||v.seats[seat]!==shooterId||v.destroyed||!this.worldReady||this.hostSuspended||this.winner||this.phase!=='live'||(h?h.dead||h.overlayOpen:this.dead||this.paused||this.overlayOpen))return;
    const now=this.simulationNow,cannon=isCannon(weapon.id),autoCannon=weapon.id==='vehicle_autocannon_30';
    if(cannon?(now<v.nextFire||v.ammo<=0):(now<weapon.nextFire||weapon.ammo<=0))return;
    const origin=weapon.muzzle.getWorldPosition(new THREE.Vector3()),dir=weapon.muzzle.getWorldDirection(new THREE.Vector3());
    const breech=weapon.mount.getWorldPosition(new THREE.Vector3());
    if(this.arena.lineBlocked?.(breech,origin))return;
    // 30 mm 机关炮用独立弹道（低单发伤害 + 按装甲分档）；120 mm 保持原数值。
    const def=cannon?(autoCannon?(v.shell==='ap'?AMMO.ac30_ap:AMMO.ac30_he):AMMO[v.shell]):AMMO.vehicle_mg;
    // 人类射手：把弹道收敛到屏幕正中的白色准星。追尾相机在车后上方，炮口与相机有
    // 明显视差，直接沿炮管方向打会显得偏低；再按命中距离补偿重力下坠。
    if(!h?.bot){
      const aimDir=shooterId===this.localNetId?this.camera.getWorldDirection(new THREE.Vector3())
        :directionFor(isCannon(weapon.id)?v.turretYaw:weapon.aimYaw,isCannon(weapon.id)?v.turretPitch:weapon.aimPitch);
      let eye:THREE.Vector3;
      if(shooterId===this.localNetId)eye=this.camera.position.clone();
      else{
        const pivot=new THREE.Vector3(v.x,v.model.position.y+2.4,v.z);
        eye=pivot.clone().addScaledVector(aimDir,-8).add(new THREE.Vector3(0,2,0));
      }
      const surface=this.arena.raySurface?.(eye,aimDir,def.maxRange);
      const target=surface?eye.clone().addScaledVector(aimDir,surface.distance):eye.clone().addScaledVector(aimDir,def.maxRange);
      const distance=target.distanceTo(origin);
      target.y+=.5*9.81*def.gravityScale*(distance/def.muzzleVelocity)**2;
      dir.copy(target.sub(origin).normalize());
    }
    const profile=spreadProfile(def.id);
    // Bots already aim with their own error cone — don't stack weapon spread on top of it.
    if(profile&&!h?.bot){
      const spread=Math.max(weapon.spread,profile.first);
      jitterDirection(dir,spread,()=>this.random());
      weapon.spread=Math.min(profile.max,spread+profile.perShot);
      weapon.lastFire=now;
    }
    if(cannon){
      v.nextFire=now+(autoCannon?105:(v.kind==='mbt'?5000:3400));v.ammo--;v.model.userData.kick=.29;
      this.launch(shooterId,origin,dir,def);this.audio.cannon();
    }else{
      weapon.nextFire=now+105;weapon.ammo--;
      this.launch(shooterId,origin,dir,def);this.audio.shot();
    }
    weapon.lastFire=now;if(h)h.lastShotAt=now;
    this.hudDirty=true;
  }
  private fireVehicle(){
    if(!this.drivingId||this.vehicleSeat===0||this.pendingSeatChange)return;
    if(this.isHost){this.fireVehicleFor(this.localNetId);return;}
    const now=performance.now();if(now<this.vehicleNextFire)return;
    this.vehicleNextFire=now+90;
    this.net?.send({t:'vehFire',matchId:this.matchId,id:this.drivingId,seat:this.vehicleSeat});
  }

  private recordAssist(targetName:string){
    this.score+=2;
    const event:GameEvent={id:this.nextEventId++*-1,kind:'assist',text:'助攻 '+targetName,points:2,at:this.simulationNow};
    this.events.unshift(event);
    this.events=this.events.slice(0,32);
    this.addPersonalEvent(event);
    this.hudDirty=true;
  }

  /** Add an already-addressed event to this client's personal feed (dedup by id). */
  private addPersonalEvent(event:GameEvent){
    if(this.personalEvents.some((entry)=>entry.id===event.id))return;
    this.personalEvents.unshift(event);
    this.personalEvents=this.personalEvents.slice(0,16);
  }

  /**
   * Deliver a kill/death/vehicle event to the humans it concerns over the reliable
   * channel. The snapshot still carries the global list, but it is capped and a
   * bot-kill burst used to evict the guest's own kill before it arrived.
   */
  private deliverPersonalEvent(event:GameEvent){
    if(event.actorId===this.localNetId||event.targetId===this.localNetId)this.addPersonalEvent(event);
    if(!this.isHost||!this.net)return;
    for(const [id,h] of this.hosted){
      if(h.bot||(id!==event.actorId&&id!==event.targetId))continue;
      this.net.send({t:'personalEvent',matchId:this.matchId,peerId:id,event});
    }
  }

  private registerEvent(event:GameEvent){
    this.events.unshift(event);
    this.events=this.events.slice(0,32);
    this.deliverPersonalEvent(event);
  }

  private pushEvent(kind: 'capture', text: string, points: number) {
    this.events.unshift({ id: this.nextEventId++, kind, text, points, at: this.simulationNow });
    this.events = this.events.slice(0, 32);
  }

  /** Event feed as seen by THIS client: own kills/deaths/assists/vehicle kills + global captures. */
  private localEvents(now:number){
    const captures=this.events.filter((event)=>event.kind==='capture');
    const merged=[...this.personalEvents,...captures].sort((a,b)=>b.at-a.at);
    return localFeedLines(merged,this.localNetId,now);
  }

  private applyRenderScale(){
    if(this.lite){
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(64,64);
      this.presentation.resize(64,64,1);
      return;
    }
    const {dpr}=nativeRenderSize(window.innerWidth,window.innerHeight,window.devicePixelRatio);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(window.innerWidth,window.innerHeight);
    const canvas=this.renderer.domElement;
    this.presentation.resize(canvas.width,canvas.height,1);
  }

  private *shadowCasters(){
    for(const vehicle of this.vehicles)if(!vehicle.destroyed)yield vehicle.model;
    for(const remote of this.remotes.values())yield remote.rig.root;
    for(const body of this.bodies.values())yield body.rig.root;
    if(this.seatedPlayer)yield this.seatedPlayer.root;
  }

  private renderFrame(now:number){
    this.camera.updateMatrixWorld(true);
    this.updateProjectileVisuals();
    if(this.shadows?.mesh.visible)this.shadows.update([
      ...this.vehicles.filter(v=>!v.destroyed).map(v=>({x:v.x,z:v.z,y:v.model.position.y,w:vehicleSize(v.kind).w*1.4,d:vehicleSize(v.kind).d*1.2})),
      ...[...this.remotes.values()].filter(r=>r.rig.root.visible&&!r.vehicleId).map(r=>({x:r.target.x,z:r.target.z,y:r.target.y,w:1.1,d:1.1})),
    ]);
    const sun=this.sunShadows;
    if(sun){
      if(sun.enabled)sun.update(this.camera,now,this.shadowCasters());
      if(now>=this.nextWeaponLightSample){
        this.nextWeaponLightSample=now+125;
        const shadeActive=sun.enabled||!!this.cinematicShadows;
        const hit=shadeActive?this.arena.rayDistance?.(this.camera.position,sun.direction,90):undefined;
        this.weaponShadeTarget=rayBlocked(hit,90)?1:0;
      }
      this.weaponShade=THREE.MathUtils.damp(this.weaponShade,this.weaponShadeTarget,10,THREE.MathUtils.clamp((now-this.lastRender)/1000,0,.1));
      this.viewmodel.setSunLighting(sun.direction,this.weaponShade);
    }
    if(this.cinematicShadows){
      this.cinematicShadows.update(now);
      if(now>=this.nextSunOcclusionCheck){
        this.nextSunOcclusionCheck=now+250;
        const hit=this.arena.rayDistance?.(this.camera.position,this.sunDirection,500);
        this.sunOccluded=rayBlocked(hit,500);
      }
    }
    this.cinematicLighting?.update(now,this.camera,this.arena);
    this.lastRender=now;
    this.presentation.render(this.renderer,this.scene,this.camera,this.viewmodel,{
      now,motionBlur:getSettings().motionBlur,adsAmount:this.viewmodel.adsAmount,
      sunDirection:this.sunDirection,sunOccluded:this.sunOccluded,
      sunRadiance:this.sunRadiance,sunShadows:this.cinematicShadows?.shadowEntries,
    });
  }

  /** Screenshot/audit free camera. Debug only; gameplay authority is untouched. */
  auditView(x:number,y:number,z:number,yaw=0,pitch=0){this.auditCamera={x,y,z,yaw,pitch};this.viewmodel?.setEquipped(false);}
  auditClearView(){this.auditCamera=undefined;this.viewmodel?.setEquipped(this.phase==='live'&&this.armed&&!this.dead&&!this.drivingId);}
  /** Performance evidence for the browser audit (same 60 Hz simulate path). */
  auditPerf(){
    const sorted=[...this.simCostSamples].sort((a,b)=>a-b);
    const q=(p:number)=>sorted.length?sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]:0;
    const r=this.renderer.info;
    return {drawCalls:r.render.calls,triangles:r.render.triangles,points:r.render.points,lines:r.render.lines,geometries:r.memory.geometries,textures:r.memory.textures,programs:r.programs?.length??0,simSamples:this.simCostSamples.length,simAvg:sorted.length?this.simCostSamples.reduce((a,b)=>a+b,0)/this.simCostSamples.length:0,simP50:q(.5),simP95:q(.95),simP99:q(.99),simMax:sorted.length?sorted[sorted.length-1]:0,players:1+this.hosted.size,remotes:this.remotes.size,vehicles:this.vehicles.length,canvas:this.renderer.getContext().drawingBufferWidth+'x'+this.renderer.getContext().drawingBufferHeight};
  }
  /** Debug-only lighting switch for the audit screenshots; same code path as the settings UI. */
  auditLighting(quality:'off'|'low'|'medium'|'high'|'ultra'){saveSettings({...getSettings(),lightingQuality:quality});this.applyGraphics();return this.lightingDebug();}

  private loop = (frameTime?:number) => {
    if(this.disposed||this.frameFailed)return;
    try{this.tick(frameTime);}catch(err){this.frameFailed=true;this.input.release();this.callbacks.onError?.(`游戏已停止：${String((err as Error)?.message||err)}。请重试或返回大厅。`);return;}
    this.raf=requestAnimationFrame(this.loop);
  };

  private tick=(frameTime?:number)=>{
    const elapsed=this.clock.getDelta(),now=performance.now();this.frameLimit=getSettings().frameLimit||Infinity;
    if(this.contextLost||this.frameFailed)return;
    if(!this.worldReady){
      if(this.localLoaded&&now-this.lastReadyAt>500){this.lastReadyAt=now;if(this.isHost)this.tryReady();else this.net?.send({t:'ready',matchId:this.matchId});}
      this.sendSnapshot(frameTime??now);return;
    }
    if(!this.activated){this.sendSnapshot(frameTime??now);if(this.worldReady&&now-this.lastHudAt>=100){this.lastHudAt=now;this.callbacks.onHud(this.hudState(this.simulationNow));}return;}
    // Only host match time is wall-clock based (`updateCapture`); if the tab was
    // frozen/slept, shift the deadline by the part this frame will not simulate.
    // Otherwise reopening the tab after a few minutes ends the match instantly.
    if(this.isHost&&this.matchDeadline>0){
      const paused=unsimulatedGapMs(elapsed,this.simulation.step);
      if(paused>0)this.matchDeadline+=paused;
    }
    if(!this.winner)this.simulation.advance(elapsed,dt=>{this.simulationNow+=dt*1000;const t0=performance.now();this.simulate(dt);const cost=performance.now()-t0;this.simCostSamples.push(cost);if(this.simCostSamples.length>900)this.simCostSamples.splice(0,this.simCostSamples.length-900);});
    else this.simulation.reset();
    const frame=frameTime??now;
    const render=!this.lite&&this.renderSchedule.due(frame,this.frameLimit);
    if(!this.winner&&(render||this.lite)){
      // Use presentation time so catch-up physics ticks cannot stack corrections into one visible frame.
      const dt=this.lastRemoteFrame?Math.min(Math.max(0,frame-this.lastRemoteFrame)/1000,1/Math.min(30,this.frameLimit)):0;
      this.lastRemoteFrame=frame;
      this.updateRemotes(dt);
    }
    this.sendSnapshot(frame);
    if(now-this.lastHudAt>=100){this.hudDirty=false;this.lastHudAt=now;this.callbacks.onHud(this.hudState(this.simulationNow));}
    if(now-this.lastNames>=100){this.lastNames=now;this.updateNameplates();}
    if(this.auditCamera){const a=this.auditCamera;this.camera.position.set(a.x,a.y,a.z);this.camera.rotation.set(a.pitch,a.yaw,0);this.camera.updateMatrixWorld(true);this.viewmodel?.setEquipped(false);}
    if(render)this.renderFrame(now);
  };

  private simulate(dt:number){
    const now=this.simulationNow;
    this.updateFerries(dt);
    this.arena.updateAmbient?.(dt,now);
    this.hurtFlash=Math.max(0,this.hurtFlash-dt*2.8);this.weaponRecoil.update(dt);this.recoilPitch=this.weaponRecoil.pitch.value;this.recoilYaw=this.weaponRecoil.yaw.value;
    if(this.predictionOffset.lengthSq()>1e-8){
      this.predictionOffset.multiplyScalar(1-predictionOffsetDecay(this.predictionOffset,this.controller.velocity,dt));
      if(this.predictionOffset.lengthSq()<1e-6)this.predictionOffset.set(0,0,0);
    }
    if(this.phase==='prep'){
      this.prepSeconds=Math.max(0,(this.prepDeadline-now)/1000);
      if(this.prepSeconds<=0&&this.isHost)this.startLive();
    }
    const active=!this.hostSuspended&&!this.mapOpen&&!this.overlayOpen&&!this.dead&&!this.paused&&this.input.pointerLocked&&!this.winner;
    const presses=this.input.consumePresses();
    if(getSettings().adsHold)this.adsIntent=this.input.mouse.right&&active;else if(active&&(presses.right||this.input.mouse.right&&!this.lastRight))this.adsIntent=!this.adsIntent;
    this.lastRight=this.input.mouse.right;
    if(!active||this.drivingId)this.adsIntent=false;
    this.controller.sprintAllowed=!this.adsIntent;this.controller.aiming=this.adsIntent;
    const settings=getSettings();
    const reference=Math.tan(THREE.MathUtils.degToRad(settings.fov/2));
    const current=Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2));
    this.controller.lookScale=THREE.MathUtils.lerp(1,settings.adsSensitivity,this.viewmodel.adsAmount)*Math.min(1,current/reference);
    const crouch=this.input.down('ControlLeft'),prone=this.input.down('KeyZ'),space=this.input.down('Space');
    if(!space)this.standUpGuard=false;
    if(!crouch)this.ignoreCrouchUntilRelease=false;
    if(!prone)this.ignoreProneUntilRelease=false;
    const pos=this.controller.position,water=this.arena.waterAt?.(pos.x,pos.z,pos.y);
    const swimming=!!water&&pos.y<water.surface-.015&&water.surface-water.bottom>=SWIM_DEPTH;
    let stoodUp=false;
    if(!this.armed||this.dead||this.drivingId||swimming||this.controller.climbing)this.stance='stand';
    else if(active){
      // Space first stands up from a low stance; it never jumps straight out of one.
      if(presses.codes.includes('Space')&&!this.standUpGuard&&(this.stance==='crouch'||this.stance==='prone')){
        if(this.stance==='crouch')this.ignoreCrouchUntilRelease=true;else this.ignoreProneUntilRelease=true;
        this.stance='stand';this.standUpGuard=true;stoodUp=true;
      }else{
        if((presses.codes.includes('KeyZ')||prone&&!this.proneDown)&&!this.ignoreProneUntilRelease)this.stance=settings.proneHold||this.stance==='prone'?'stand':'prone';
        if((presses.codes.includes('ControlLeft')||crouch&&!this.crouchDown)&&!this.ignoreCrouchUntilRelease)this.stance=settings.crouchHold||this.stance==='crouch'?'stand':'crouch';
      }
    }
    this.crouchDown=crouch;this.proneDown=prone;
    let keys=this.input.canonicalKeys().filter(k=>!['ControlLeft','ControlRight','KeyC','KeyZ'].includes(k));
    if(stoodUp||this.standUpGuard)keys=keys.filter(k=>k!=='Space');
    else if(presses.codes.includes('Space')&&!keys.includes('Space'))keys.push('Space');
    const stanceKey=swimming?null:(settings.proneHold&&prone&&!this.ignoreProneUntilRelease)||this.stance==='prone'?'KeyZ':
      (settings.crouchHold&&crouch&&!this.ignoreCrouchUntilRelease)||this.stance==='crouch'?'ControlLeft':null;
    if(stanceKey)keys.push(stanceKey);
    // Prone no longer locks movement against aiming/firing: crawling with a rifle
    // ready is allowed. Reloading cannot ADS, so it also keeps the full walk speed.
    this.controller.sprintAllowed=!this.adsIntent;
    this.controller.aiming=this.adsIntent&&!this.reloading;
    const look=this.input.consumeLook(),snapshot={down:(code:string)=>keys.includes(code),consumeLook:()=>look};
    if(this.drivingId){
      this.updateVehicle(dt,look,active);
    }else if(this.net&&!this.isHost){
      this.controller.update(dt,snapshot,this.arena,active,!this.dead);
      if(!this.dead){
        const seq=++this.inputSequence;
        this.pendingInputs.push({seq,keys:active?keys:stanceKey?[stanceKey]:[],yaw:this.controller.yaw,pitch:this.controller.pitch,ads:this.adsIntent,aiming:this.controller.aiming,active,epoch:this.lastSelfTeleportSerial});
        if(this.pendingInputs.length>MAX_PREDICTED_INPUTS)this.pendingInputs.shift();
        this.predictedAtSeq.push(capturePredictedMovement(this.controller,seq));
        if(this.predictedAtSeq.length>MAX_PREDICTED_INPUTS+6)this.predictedAtSeq.shift();
      }
    }else this.controller.update(dt,snapshot,this.arena,active,!this.dead);
    if(!this.drivingId)this.viewmodel.setEquipped(this.armed&&!this.dead&&!this.controller.climbing);
    if(!this.drivingId)this.camera.rotation.set(
      this.controller.pitch+this.recoilPitch+this.controller.bob*.16,
      this.controller.yaw+this.recoilYaw+this.controller.bobSide*.14,
      (this.controller.bobSide*.43+this.weaponRecoil.cameraRoll)*settings.shake,
    );
    // Visual-only reconciliation offset (guest prediction). Never fed back into
    // the controller, collision or hit tests.
    if(!this.drivingId&&this.predictionOffset.lengthSq()>1e-8)this.camera.position.add(this.predictionOffset);
    // 火在脸上的镜头反馈：只滚转 + 毫米级位置抖动，不改变准星射线方向。
    const burn=this.burnBlindIntensity(now);
    if(burn>0&&!this.dead&&!this.drivingId){
      const t=now*.001, s1=Math.sin(t*23.1), s2=Math.sin(t*41.9);
      this.camera.rotation.z+=(s1*.011+s2*.006)*burn;
      this.camera.position.x+=s2*.009*burn;
      this.camera.position.y+=s1*.007*burn;
    }
    if(active)this.viewmodel.addSway(look.x,look.y);
    if(this.isHost&&this.botsEnabled&&this.phase==='live'&&now>=this.nextBotCrewAssignmentAt){
      this.nextBotCrewAssignmentAt=now+6000;this.assignArmoredCrews(now);
    }
    if(this.isHost)for(const h of this.hosted.values()){
      if(h.reloadEnd&&now>=h.reloadEnd){const w=getWeapon(h.selection.weaponId)!,take=Math.min(w.magazine-h.ammo,h.reserve);h.ammo+=take;h.reserve-=take;h.reloadEnd=0;}
      this.updateBotAI(h,now);
      if(h.vehicleId){
        this.updateHostedVehicle(h,dt);
      }else if(!h.dead&&h.bot){
        h.controller.yaw=h.yaw;h.controller.pitch=h.pitch;
        h.controller.update(dt,h.input,this.arena,!h.overlayOpen&&!this.winner);
      }else if(!h.dead){
        // Credits accumulate even during a short network outage, allowing the
        // host to catch up without granting more total simulation than wall time.
        const wall=performance.now(),previous=h.inputCreditAt??wall;
        h.inputCredit=Math.min(60,(h.inputCredit??6)+Math.max(0,wall-previous)/(1000/60));
        h.inputCreditAt=wall;
        if(now-h.lastInput>GUEST_INPUT_TIMEOUT_MS&&h.pendingInputs.length===0){
          h.input.clear();
          // Keep the pose and all physics at inputSeq. Advancing gravity/steps
          // without advancing that ack corrupts the next reconciliation, even
          // on a loss-free connection delayed by a browser send queue.
        }else{
          // Wall-clock credits bound guest simulation to 60 Hz even if a peer
          // floods commands; at most three steps run per host tick when catching up.
          const steps=Math.min(3,Math.floor(h.inputCredit),h.pendingInputs.length);
          for(let i=0;i<steps;i++){
            const command=h.pendingInputs.shift()!;
            h.inputCredit-=1;h.inputSeq=command.seq;
            // Commands created before a teleport/deployment cannot move the new body.
            if(command.epoch!==undefined&&command.epoch!==h.controller.teleportSerial)continue;
            h.input.setKeys(command.keys);h.yaw=command.yaw;h.pitch=command.pitch;
            simulateMovementCommand(h.controller,command,this.arena,dt,false,!h.overlayOpen&&!this.winner);
          }
          // With no command, keep the acked pose unchanged: it must describe
          // exactly the last simulated input, not an extrapolated held key.
        }
      }
      if(h.bot&&!h.vehicleId){
        // Never let an AI walk over/through the perimeter fence; the generic
        // 6 s out-of-bounds recovery is far too late for a visible bot.
        const b=this.arena.bounds, x=THREE.MathUtils.clamp(h.controller.position.x,b.minX+3,b.maxX-3), z=THREE.MathUtils.clamp(h.controller.position.z,b.minZ+3,b.maxZ-3);
        if(x!==h.controller.position.x||z!==h.controller.position.z){h.controller.position.x=x;h.controller.position.z=z;h.controller.velocity.x=0;h.controller.velocity.z=0;h.path.length=0;h.nextPath=0;}
      }
      const r=this.remotes.get(h.id);if(r){r.target.copy(h.controller.position);if(r.teleportSerial!==h.controller.teleportSerial){r.teleportSerial=h.controller.teleportSerial;r.rig.root.position.copy(r.target);r.renderedYaw=undefined;r.renderedPitch=undefined;}r.velocity.copy(h.controller.velocity);r.yaw=this.bodyYaw(h.controller);r.pitch=h.controller.pitch;r.moving=h.controller.moving;r.sprinting=h.controller.sprinting;r.crouching=h.controller.crouched;r.prone=h.controller.prone;r.lean=h.controller.lean;r.climbing=h.controller.climbing;r.mantleTime=h.controller.mantle?.elapsed??-1;r.grounded=h.controller.grounded;r.swimming=h.controller.swimming;r.vehicleId=h.vehicleId;r.vehicleSeat=h.vehicleSeat;r.combatAction=h.reloadEnd?'reload':now-h.lastShotAt<160?'fire':h.targetId?'aim':undefined;this.updateRemoteWeapon(r,h.selection.weaponId);r.dead=h.dead;r.health=h.health;r.seen=true;
        const stance=h.controller.prone?'prone':h.controller.crouched?'crouch':'stand';
        if(r.stance===undefined){r.stance=stance;r.stanceT=1;}
        else if(r.stance!==stance){r.stanceFrom=r.stance;r.stance=stance;r.stanceT=0;}
      }
    }
    if(this.isHost)for(const v of this.vehicles){
      if(v.destroyed)continue;
      if(!v.seats[0]&&(Math.abs(v.speed)>.01||v.seats.some(Boolean)))this.driveVehicle(v,0,0,0,dt);
      for(const w of v.weapons){
        const shellDef=isCannon(w.id)?(w.id==='vehicle_autocannon_30'?(v.shell==='ap'?AMMO.ac30_ap:AMMO.ac30_he):AMMO[v.shell]):AMMO.vehicle_mg;
        const profile=spreadProfile(shellDef.id);
        if(profile&&w.spread>profile.first&&w.lastFire){
          w.spread=recoverSpread(profile,w.spread,Math.max(0,(now-w.lastFire)/1000),dt);
        }
        if(isCannon(w.id))continue;
        this.orientMachineGun(v,w);
      }
    }
    // 车位自动刷新（host only，200 ms 节流）：弃车/毁损/净空/40 上限都在管理器里判定。
    if(this.isHost)this.updateVehicleSpawns(now);
    this.ads=this.adsIntent&&!this.controller.climbing&&!this.controller.mantle&&!this.reloading&&!this.viewmodel.blocked;
    if(this.controller.climbing||this.controller.mantle){this.burstRemaining=0;this.reloading=false;}
    const ads=this.phase==='live'&&active&&!this.drivingId&&this.ads;this.viewmodel.setAds(ads);
    const targetFov=this.drivingId?this.vehicleFov:ads?opticFov(this.viewmodel.adsZoom):getSettings().fov;
    this.camera.fov=THREE.MathUtils.damp(this.camera.fov,targetFov,12,dt);this.camera.updateProjectionMatrix();const probe=this.viewmodel.obstructionProbe(new THREE.Vector3(),this.adsIntent).sub(this.camera.position),reach=probe.length(),nearWall=this.arena.rayDistance?.(this.camera.position,probe.normalize(),reach+.25)??Infinity;this.viewmodel.setObstruction(Number.isFinite(nearWall)&&!this.controller.sprinting?THREE.MathUtils.clamp((reach+.25-nearWall)/.35,0,1):0);this.viewmodel.setMotion(Math.hypot(this.controller.velocity.x,this.controller.velocity.z),this.controller.mantle);this.viewmodel.setLean(this.controller.lean);this.viewmodel.update(dt,this.controller.bob,this.controller.sprinting,this.input.mouse.left||now-this.lastLocalShotAt<160,this.controller.gaitPhase);this.updateFx(dt);this.updateVehicleFx(dt);
    const held=this.input.mouse.left,pressed=presses.left||held&&!this.lastLeft;
    if(!held||presses.left)this.triggerNeedsRelease=false;
    if(active&&this.drivingId){
      this.burstRemaining=0;
      if(held||pressed)this.fireVehicle();
    }else if(active&&this.phase==='live'&&this.armed&&!this.reloading&&!this.controller.climbing&&
             !this.controller.mantle&&!this.viewmodel.blocked&&!this.triggerNeedsRelease){
      const mode=FIRE_MODES[this.fireMode];
      if(mode.shots>1&&pressed&&!this.burstRemaining)this.burstRemaining=mode.shots;
      const firing=mode.shots===0?held||pressed:mode.shots===1?pressed:this.burstRemaining>0;
      if(firing&&now>=this.nextFireAt){
        const before=this.ammo;
        this.fire();
        if(mode.shots>1){
          if(this.ammo===0&&before===0)this.burstRemaining=0;
          else if(this.ammo<before)this.burstRemaining--;
        }
      }
    }else this.burstRemaining=0;
    this.lastLeft=held;
    this.updateBodies(dt);
    this.updateAmmoPickups(now);
    this.updateSeatedPlayer();
    if(this.phase==='live'&&this.reloading&&now>=this.reloadEnd)this.finishReload();
    this.tactical?.update(dt,this.arena,(id,p)=>{if(this.isHost)this.explode(id,p,5,120);});this.updateSupply(now);
    this.updateProjectiles(dt,now);this.updateTargets(now);this.updateCapture(dt,now);this.updateRespawns(now);
  }

  private sendSnapshot(now:number){
    if(!this.net||now<this.nextNetAt-.75)return;
    const active=this.activated&&this.phase==='live'&&!this.winner&&(!this.isHost||this.net.fastStatePath);
    // Cap large host fan-out near the old bandwidth budget. Guests still send their own input at 60 Hz.
    const guestCount=this.isHost?this.net.peers.length:0;
    const interval=liveNetworkInterval(this.isHost,active,guestCount,this.hosted.size+1);
    this.nextNetAt=this.nextNetAt&&now-this.nextNetAt<interval?this.nextNetAt+interval:now+interval;
    if(this.isHost){const states=[this.stateFor(this.localNetId,this.controller,this.myTeam,true)];for(const h of this.hosted.values())states.push(this.stateFor(h.id,h.controller,h.team));
      this.net.send({t:'snap',matchId:this.matchId,seq:++this.snapSequence,worldReady:this.worldReady,phase:this.phase,prepSeconds:this.prepSeconds,states,scores:this.scores,captures:this.caps.map(c=>({id:c.id,owner:c.owner,progress:c.progress})),events:this.events.filter(e=>e.kind!=='assist').slice(0,8).map(e=>({id:e.id,kind:e.kind,text:e.text,points:e.points,actorId:e.actorId,targetId:e.targetId,attackerName:e.attackerName,targetName:e.targetName,targetLabel:e.targetLabel,team:e.team})),matchRemaining:this.matchRemaining,winner:this.winner,hostSuspended:this.hostSuspended,
        lootTaken:this.lootCrates.length?this.lootCrates.filter(crate=>!crate.model.visible).map(crate=>crate.id):undefined,
        bodies:[...this.bodies].map(([id,b])=>({id,p:b.origin.toArray(),yaw:b.yaw,team:b.rig.team,ammo:b.ammo,dropsAmmo:!!b.magazine,takenAge:b.ammoTakenAt===undefined?undefined:this.simulationNow-b.ammoTakenAt,age:this.simulationNow-b.start})),
        vehicles:this.vehicles.map(v=>({id:v.id,kind:v.kind,team:v.team,x:v.x,y:v.model.position.y,z:v.z,yaw:v.yaw,pitch:v.model.rotation.x,roll:v.model.rotation.z,turretYaw:v.turretYaw,turretPitch:v.turretPitch,health:v.health,ammo:v.ammo,shell:v.shell,nextFireSeconds:Math.max(0,(v.nextFire-this.simulationNow)/1000),speed:v.speed,seats:v.seats,weapons:v.weapons.map(w=>({ammo:w.ammo,yaw:w.yaw,pitch:w.pitch,reload:Math.max(0,(w.nextFire-this.simulationNow)/1000)})),destroyed:v.destroyed})),ferries:this.ferrySystem?.snapshots(),vehiclePads:this.padSnapshotForNet(this.simulationNow),killFeed:this.killFeed.filter(k=>this.simulationNow-k.at<6000).map(k=>({text:k.text,team:k.team,kind:k.kind}))});
    }else if(this.worldReady){const active=!this.hostSuspended&&!this.mapOpen&&!this.paused&&!this.dead&&!this.overlayOpen&&this.input.pointerLocked;
      if(this.drivingId){const v=this.vehicles.find(v=>v.id===this.drivingId);this.net.send({t:'vehInput',matchId:this.matchId,id:this.drivingId,seat:this.vehicleSeat,throttle:active?(Number(this.input.down('KeyW'))-Number(this.input.down('KeyS'))):0,steer:active?(Number(this.input.down('KeyA'))-Number(this.input.down('KeyD'))):0,aimYaw:this.vehicleViewYaw,aimPitch:this.vehicleViewPitch,shell:v?.shell});}
      else {
        // Send the complete bounded window, including the newest input. Sending
        // only its oldest 24 commands caps recovery at 24 / RTT ticks per second
        // and creates an ever-growing backlog after a short stall.
        const commands=this.pendingInputs.slice();
        if(commands.length)this.net.send({t:'inputs',matchId:this.matchId,commands});
      }
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resizeHandler);
    window.removeEventListener('keydown', this.keyHandler);
    window.removeEventListener('blur', this.blurHandler);
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    document.removeEventListener('pointerlockchange', this.lockHandler);
    document.removeEventListener('webkitpointerlockchange', this.lockHandler);
    this.input.release();
    this.input.dispose();
    this.cinematicShadows?.dispose();
    for(const f of this.ferries)f.visual.dispose();this.ferries.length=0;this.ferrySystem=undefined;
    for(const r of this.remotes.values())r.rig.dispose();
    this.seatedPlayer?.dispose();
    this.clearBodies();
    this.magazineGeometry.dispose();this.magazineMaterial.dispose();
    this.impacts.dispose();
    for(const v of this.vehicles)v.model.userData.dispose?.();
    this.cinematicLighting?.disable();
    disposeObject(this.scene,true);this.arena.scene.clear();this.viewmodel.dispose();this.presentation.dispose();this.audio.dispose();this.nameplateLayer.remove();
    this.sunShadows?.dispose();
    this.vehicleSpawnManager=undefined;this.netPadStates=[];
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
