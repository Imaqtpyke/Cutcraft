import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { JobStage } from '../../types/editor';
import { CAT_CHATTER, getWorkingChatter, IDLE_CHATTER, type StudioZone } from './chatterData';
import { buildIsometricStudio, drawArcadeScreen, drawMonitorScreen } from './studioBuilder';

interface StationSceneProps {
  activeStage: JobStage | null;
  activeStageLabel?: string;
  chatterEnabled?: boolean;
  onZoneTap?: (zone: StudioZone) => void;
}

type PersonPose =
  | 'stand'
  | 'sit_lounge'
  | 'sit_desk'
  | 'inspect'
  | 'drink_coffee'
  | 'play_arcade'
  | 'pet_cat';

interface Waypoint {
  zone: StudioZone;
  pos: THREE.Vector3;
  lookAngle: number;
  sitOffsetY: number;
  pose: PersonPose;
}

type CatGoalKind =
  | 'rug_nap'
  | 'sofa_watch'
  | 'arcade_watch'
  | 'coffee_sniff'
  | 'desk_floor'
  | 'center_stretch'
  | 'greet_person'
  | 'being_petted';

type CatPose = 'nap' | 'sit' | 'stand' | 'greet' | 'petted';

interface CatWaypoint {
  kind: CatGoalKind;
  pos: THREE.Vector3;
  lookAngle: number;
  pose: CatPose;
}

const WAYPOINTS: Record<Exclude<StudioZone, 'cat'>, Waypoint> = {
  desk: {
    zone: 'desk',
    pos: new THREE.Vector3(1.55, 0, -0.82),
    lookAngle: Math.PI,
    sitOffsetY: 0.16,
    pose: 'sit_desk',
  },
  lounge: {
    zone: 'lounge',
    pos: new THREE.Vector3(-1.82, 0, 1.35),
    lookAngle: Math.PI / 2,
    sitOffsetY: 0.14,
    pose: 'sit_lounge',
  },
  coffee: {
    zone: 'coffee',
    pos: new THREE.Vector3(-2.35, 0, -0.78),
    lookAngle: -Math.PI / 2,
    sitOffsetY: 0,
    pose: 'drink_coffee',
  },
  arcade: {
    zone: 'arcade',
    pos: new THREE.Vector3(-2.22, 0, -2.18),
    lookAngle: -Math.PI / 2,
    sitOffsetY: 0,
    pose: 'play_arcade',
  },
  storyboard: {
    zone: 'storyboard',
    pos: new THREE.Vector3(-1.55, 0, -2.55),
    lookAngle: Math.PI,
    sitOffsetY: 0,
    pose: 'inspect',
  },
  center: {
    zone: 'center',
    pos: new THREE.Vector3(0.05, 0, 0.55),
    lookAngle: 0.4,
    sitOffsetY: 0,
    pose: 'stand',
  },
};

const CAT_STATIC_SPOTS: Array<Omit<CatWaypoint, 'pos'> & { pos: [number, number, number] }> = [
  { kind: 'rug_nap', pos: [-1.15, 0, 1.85], lookAngle: 0.6, pose: 'nap' },
  { kind: 'sofa_watch', pos: [-0.95, 0, 0.65], lookAngle: -0.9, pose: 'sit' },
  { kind: 'arcade_watch', pos: [-2.25, 0, -1.52], lookAngle: -Math.PI / 2 - 0.3, pose: 'sit' },
  { kind: 'coffee_sniff', pos: [-2.35, 0, -0.15], lookAngle: -Math.PI / 2 - 0.25, pose: 'stand' },
  { kind: 'desk_floor', pos: [0.68, 0, -0.78], lookAngle: Math.PI * 0.75, pose: 'sit' },
  { kind: 'center_stretch', pos: [-0.25, 0, 0.18], lookAngle: 0.35, pose: 'stand' },
];

const IDLE_ZONES: StudioZone[] = [
  'coffee',
  'arcade',
  'lounge',
  'storyboard',
  'center',
  'desk',
  'cat',
];

function isWorkingStage(stage: JobStage | null): boolean {
  return (
    stage === 'queued' ||
    stage === 'ingesting' ||
    stage === 'transcribing' ||
    stage === 'researching' ||
    stage === 'directing' ||
    stage === 'rendering_draft' ||
    stage === 'exporting_hd'
  );
}

function clampToStudioFloor(vec: THREE.Vector3): THREE.Vector3 {
  vec.x = THREE.MathUtils.clamp(vec.x, -2.5, 2.55);
  vec.z = THREE.MathUtils.clamp(vec.z, -2.55, 2.45);
  // Keep clear of the desk footprint if approaching from the front
  if (vec.x > 0.2 && vec.z < -1.05) {
    vec.z = -1.0;
  }
  return vec;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const _projVec = new THREE.Vector3();
const _catProjVec = new THREE.Vector3();

export function StationScene({
  activeStage,
  activeStageLabel,
  chatterEnabled = true,
  onZoneTap,
}: StationSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const catBubbleRef = useRef<HTMLDivElement | null>(null);

  const [webglFailed, setWebglFailed] = useState(false);
  const [chatterText, setChatterText] = useState<string>(IDLE_CHATTER.lounge[0]);
  const [bubbleVisible, setBubbleVisible] = useState(true);
  const [catChatterText, setCatChatterText] = useState<string>(CAT_CHATTER.nap[0]);
  const [catBubbleVisible, setCatBubbleVisible] = useState(false);

  const stageRef = useRef<JobStage | null>(activeStage);
  const stageLabelRef = useRef<string | undefined>(activeStageLabel);
  const onZoneTapRef = useRef(onZoneTap);

  useEffect(() => {
    stageRef.current = activeStage;
    stageLabelRef.current = activeStageLabel;
    if (activeStage && isWorkingStage(activeStage)) {
      setChatterText(getWorkingChatter(activeStage));
      setBubbleVisible(true);
    } else if (activeStage === 'ready' || activeStage === 'completed' || activeStage === 'error') {
      setChatterText(getWorkingChatter(activeStage));
      setBubbleVisible(true);
    }
  }, [activeStage, activeStageLabel]);

  useEffect(() => {
    onZoneTapRef.current = onZoneTap;
  }, [onZoneTap]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas');
        const gl = probe.getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        alpha: false,
      });
    } catch {
      setWebglFailed(true);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x0d1015, 1);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1015);
    scene.fog = new THREE.FogExp2(0x0d1015, 0.022);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const aspect = width / height;
    const frustum = width < 640 ? 9.6 : 8.2;
    const camera = new THREE.OrthographicCamera(
      (-frustum * aspect) / 2,
      (frustum * aspect) / 2,
      frustum / 2,
      -frustum / 2,
      0.1,
      80,
    );
    camera.position.set(12, 10.5, 12);
    camera.lookAt(0, 0.7, 0);

    const hemi = new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.75);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff1d6, 1.85);
    keyLight.position.set(7, 12, 6);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    const d = 5.5;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 28;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.65);
    rimLight.position.set(-7, 6, -7);
    scene.add(rimLight);

    const deskGlow = new THREE.PointLight(0xf59e0b, 1.1, 4.2, 2);
    deskGlow.position.set(1.3, 1.4, -1.6);
    scene.add(deskGlow);

    const loungeGlow = new THREE.PointLight(0xfbbf24, 0.9, 4.5, 2);
    loungeGlow.position.set(-2.7, 1.85, 0.25);
    scene.add(loungeGlow);

    const arcadeGlow = new THREE.PointLight(0x06b6d4, 0.85, 3.2, 2);
    arcadeGlow.position.set(-2.6, 1.45, -2.18);
    scene.add(arcadeGlow);

    const studio = buildIsometricStudio(scene, isSoftwareGl);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.7, 0);
    controls.enablePan = false;
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minZoom = 0.72;
    controls.maxZoom = 1.65;
    controls.minPolarAngle = Math.PI / 5;
    controls.maxPolarAngle = Math.PI / 2.6;
    controls.minAzimuthAngle = 0.15;
    controls.maxAzimuthAngle = Math.PI / 2 - 0.15;
    controls.update();

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Person Sprite state
    let currentWaypoint: Waypoint = { ...WAYPOINTS.center, pos: WAYPOINTS.center.pos.clone() };
    let nextRoamIn = 2.5;
    let isMoving = false;
    let monitorDrawAccum = 0;
    let blinkTimer = 3.0;
    let isBlinking = false;

    // Cat Sprite state
    let catGoal: CatWaypoint = {
      kind: 'rug_nap',
      pos: new THREE.Vector3(-1.35, 0, 1.65),
      lookAngle: 0.6,
      pose: 'nap',
    };
    let catNextRoamIn = 3.5;
    let catMoving = false;
    let catBlinkTimer = 2.4;
    let catBlinking = false;

    const sendPersonToCat = () => {
      const catPos = studio.cat.root.position;
      const spPos = studio.sprite.root.position;
      const toPerson = new THREE.Vector3(spPos.x - catPos.x, 0, spPos.z - catPos.z);
      if (toPerson.lengthSq() < 0.01) toPerson.set(0.6, 0, 0.6);
      toPerson.normalize();

      const standPos = clampToStudioFloor(
        new THREE.Vector3(catPos.x + toPerson.x * 0.62, 0, catPos.z + toPerson.z * 0.62),
      );
      const lookAtCat = Math.atan2(catPos.x - standPos.x, catPos.z - standPos.z);

      currentWaypoint = {
        zone: 'cat',
        pos: standPos,
        lookAngle: lookAtCat,
        sitOffsetY: 0,
        pose: 'pet_cat',
      };
      isMoving = true;
      nextRoamIn = 7.5 + Math.random() * 4;

      // Freeze the cat at its current spot so the person walks cleanly to it and gets a happy purr
      const lookAtPerson = Math.atan2(standPos.x - catPos.x, standPos.z - catPos.z);
      catGoal = {
        kind: 'being_petted',
        pos: catPos.clone(),
        lookAngle: lookAtPerson,
        pose: 'petted',
      };
      catMoving = false;
      catNextRoamIn = 7.5 + Math.random() * 4;

      setChatterText(pickRandom(IDLE_CHATTER.cat));
      setBubbleVisible(true);
      setCatChatterText(pickRandom(CAT_CHATTER.petted));
      setCatBubbleVisible(true);
    };

    const pickNextIdleZone = (preferred?: StudioZone) => {
      const candidates = IDLE_ZONES.filter((z) => z !== currentWaypoint.zone);
      const zone = preferred || pickRandom(candidates);
      if (zone === 'cat') {
        sendPersonToCat();
        return;
      }

      const wp = WAYPOINTS[zone];
      currentWaypoint = {
        ...wp,
        pos: wp.pos.clone(),
      };
      isMoving = true;
      nextRoamIn = 6.5 + Math.random() * 5.5;
      setChatterText(pickRandom(IDLE_CHATTER[zone]));
      setBubbleVisible(true);
    };

    const sendCatToPerson = (workingNow: boolean) => {
      const spPos = studio.sprite.root.position;
      const offsetX = workingNow ? -0.72 : 0.45;
      const offsetZ = workingNow ? 0.15 : 0.48;
      const goalPos = clampToStudioFloor(new THREE.Vector3(spPos.x + offsetX, 0, spPos.z + offsetZ));
      const lookAtPerson = Math.atan2(spPos.x - goalPos.x, spPos.z - goalPos.z);

      catGoal = {
        kind: 'greet_person',
        pos: goalPos,
        lookAngle: lookAtPerson,
        pose: 'greet',
      };
      catMoving = true;
      catNextRoamIn = 7 + Math.random() * 5;
      setCatChatterText(
        workingNow ? pickRandom(CAT_CHATTER.watchWork) : pickRandom(CAT_CHATTER.greetPerson),
      );
      setCatBubbleVisible(true);
    };

    const pickNextCatBehavior = (workingNow: boolean) => {
      // Cat often goes to greet/keep company with the person sprite!
      const roll = Math.random();
      if (roll < (workingNow ? 0.55 : 0.4)) {
        sendCatToPerson(workingNow);
        return;
      }

      const spotPool = workingNow
        ? CAT_STATIC_SPOTS.filter((s) => s.kind === 'desk_floor' || s.kind === 'rug_nap')
        : CAT_STATIC_SPOTS.filter((s) => s.kind !== catGoal.kind);

      const spot = pickRandom(spotPool.length > 0 ? spotPool : CAT_STATIC_SPOTS);
      catGoal = {
        kind: spot.kind,
        pos: new THREE.Vector3(...spot.pos),
        lookAngle: spot.lookAngle,
        pose: spot.pose,
      };
      catMoving = true;
      catNextRoamIn = 6 + Math.random() * 5.5;

      if (spot.kind === 'rug_nap') {
        setCatChatterText(pickRandom(CAT_CHATTER.nap));
        setCatBubbleVisible(true);
      } else if (spot.kind === 'arcade_watch') {
        setCatChatterText(pickRandom(CAT_CHATTER.arcade));
        setCatBubbleVisible(true);
      } else if (spot.kind === 'coffee_sniff') {
        setCatChatterText(pickRandom(CAT_CHATTER.coffee));
        setCatBubbleVisible(true);
      } else if (spot.kind === 'desk_floor') {
        setCatChatterText(pickRandom(CAT_CHATTER.watchWork));
        setCatBubbleVisible(true);
      } else {
        setCatBubbleVisible(false);
      }
    };

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };

    const handlePointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const handlePointerUp = (e: PointerEvent) => {
      const moved = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (moved > 8) return;

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const hits = raycaster.intersectObjects(studio.clickTargets, false);
      if (hits.length > 0) {
        const zone = hits[0].object.userData.zone as StudioZone | 'sprite' | undefined;
        if (!zone) return;

        if (isWorkingStage(stageRef.current)) {
          if (zone === 'cat') {
            sendCatToPerson(true);
          } else {
            setChatterText(getWorkingChatter(stageRef.current!));
            setBubbleVisible(true);
          }
          return;
        }

        if (zone === 'sprite') {
          setChatterText(pickRandom(IDLE_CHATTER[currentWaypoint.zone]));
          setBubbleVisible(true);
        } else {
          pickNextIdleZone(zone);
          onZoneTapRef.current?.(zone);
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);

    const handleContextLost = (ev: Event) => {
      ev.preventDefault();
      setWebglFailed(true);
    };
    const handleContextRestored = () => {
      setWebglFailed(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      const asp = w / h;
      const fr = w < 640 ? 9.6 : 8.2;
      camera.left = (-fr * asp) / 2;
      camera.right = (fr * asp) / 2;
      camera.top = fr / 2;
      camera.bottom = -fr / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObs = new ResizeObserver(handleResize);
    resizeObs.observe(container);

    const clock = new THREE.Clock();
    let frameId = 0;
    let paused = document.hidden;

    const handleVisibility = () => {
      paused = document.hidden;
      if (!paused) {
        clock.getDelta();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const tick = () => {
      if (paused) {
        frameId = requestAnimationFrame(tick);
        return;
      }

      const delta = Math.min(0.1, clock.getDelta());
      const elapsed = clock.getElapsedTime();
      const working = isWorkingStage(stageRef.current);

      // 1. Person Sprite Autonomous & Working Update
      if (working && currentWaypoint.zone !== 'desk') {
        currentWaypoint = { ...WAYPOINTS.desk, pos: WAYPOINTS.desk.pos.clone() };
        isMoving = true;
      }

      if (!working && !isMoving) {
        nextRoamIn -= delta;
        if (nextRoamIn <= 0) {
          pickNextIdleZone();
        }
      }

      const sp = studio.sprite;
      const pos = sp.root.position;
      const target = currentWaypoint.pos;
      const dx = target.x - pos.x;
      const dz = target.z - pos.z;
      const dist = Math.hypot(dx, dz);

      const isPlayingArcade = !isMoving && currentWaypoint.pose === 'play_arcade' && !working;
      const isDrinkingCoffee = !isMoving && currentWaypoint.pose === 'drink_coffee' && !working;
      sp.heldMug.visible = isDrinkingCoffee;

      if (dist > 0.06) {
        isMoving = true;
        const speed = working ? 2.4 : 1.35;
        const step = Math.min(dist, speed * delta);
        pos.x += (dx / dist) * step;
        pos.z += (dz / dist) * step;

        const moveAngle = Math.atan2(dx, dz);
        sp.root.rotation.y = THREE.MathUtils.damp(sp.root.rotation.y, moveAngle, 9, delta);
        sp.bodyGroup.position.y = THREE.MathUtils.damp(sp.bodyGroup.position.y, 0.04, 10, delta);
        sp.bodyGroup.rotation.x = THREE.MathUtils.damp(sp.bodyGroup.rotation.x, 0, 10, delta);

        const walkCycle = elapsed * (working ? 12 : 8);
        sp.leftLeg.rotation.x = Math.sin(walkCycle) * 0.55;
        sp.rightLeg.rotation.x = -Math.sin(walkCycle) * 0.55;
        sp.leftArm.rotation.x = -Math.sin(walkCycle) * 0.45;
        sp.rightArm.rotation.x = Math.sin(walkCycle) * 0.45;
        sp.headGroup.rotation.x = 0;
        sp.headGroup.rotation.y = 0;
      } else {
        isMoving = false;
        pos.x = THREE.MathUtils.damp(pos.x, target.x, 8, delta);
        pos.z = THREE.MathUtils.damp(pos.z, target.z, 8, delta);

        let angleDiff = currentWaypoint.lookAngle - sp.root.rotation.y;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        sp.root.rotation.y += angleDiff * (1 - Math.exp(-8 * delta));

        sp.bodyGroup.position.y = THREE.MathUtils.damp(
          sp.bodyGroup.position.y,
          0.04 + currentWaypoint.sitOffsetY,
          8,
          delta,
        );

        const catGreetingNearby =
          !working &&
          !catMoving &&
          catGoal.kind === 'greet_person' &&
          Math.hypot(studio.cat.root.position.x - pos.x, studio.cat.root.position.z - pos.z) < 0.95;

        if (currentWaypoint.pose === 'sit_desk') {
          sp.bodyGroup.rotation.x = THREE.MathUtils.damp(sp.bodyGroup.rotation.x, 0, 10, delta);
          sp.leftLeg.rotation.x = THREE.MathUtils.damp(sp.leftLeg.rotation.x, -1.25, 10, delta);
          sp.rightLeg.rotation.x = THREE.MathUtils.damp(sp.rightLeg.rotation.x, -1.25, 10, delta);
          const typeSpeed = working ? 18 : 4;
          const typeAmp = working ? 0.16 : 0.04;
          sp.leftArm.rotation.x = -1.05 + Math.sin(elapsed * typeSpeed) * typeAmp;
          sp.rightArm.rotation.x = -1.05 + Math.cos(elapsed * typeSpeed) * typeAmp;
          sp.headGroup.rotation.x = working ? 0.08 + Math.sin(elapsed * 3) * 0.04 : 0.04;
          sp.headGroup.rotation.y = working ? Math.sin(elapsed * 1.8) * 0.22 : 0;
        } else if (currentWaypoint.pose === 'sit_lounge') {
          sp.bodyGroup.rotation.x = THREE.MathUtils.damp(sp.bodyGroup.rotation.x, 0, 10, delta);
          sp.leftLeg.rotation.x = THREE.MathUtils.damp(sp.leftLeg.rotation.x, -1.15, 10, delta);
          sp.rightLeg.rotation.x = THREE.MathUtils.damp(sp.rightLeg.rotation.x, -1.15, 10, delta);
          sp.leftArm.rotation.x = THREE.MathUtils.damp(sp.leftArm.rotation.x, -0.35, 8, delta);
          sp.rightArm.rotation.x = THREE.MathUtils.damp(sp.rightArm.rotation.x, -0.35, 8, delta);
          sp.headGroup.rotation.y = Math.sin(elapsed * 0.9) * 0.18;
          sp.headGroup.rotation.x = Math.sin(elapsed * 1.4) * 0.04;
        } else if (currentWaypoint.pose === 'drink_coffee') {
          sp.bodyGroup.rotation.x = THREE.MathUtils.damp(sp.bodyGroup.rotation.x, 0, 10, delta);
          sp.leftLeg.rotation.x = THREE.MathUtils.damp(sp.leftLeg.rotation.x, 0, 8, delta);
          sp.rightLeg.rotation.x = THREE.MathUtils.damp(sp.rightLeg.rotation.x, 0, 8, delta);
          sp.leftArm.rotation.x = THREE.MathUtils.damp(sp.leftArm.rotation.x, 0.1, 8, delta);
          const sipWave = Math.max(0, Math.sin(elapsed * 1.6));
          sp.rightArm.rotation.x = -0.85 - sipWave * 0.85;
          sp.headGroup.rotation.x = -sipWave * 0.22;
          sp.headGroup.rotation.y = Math.sin(elapsed * 0.7) * 0.12;
        } else if (currentWaypoint.pose === 'play_arcade') {
          sp.bodyGroup.rotation.x = THREE.MathUtils.damp(sp.bodyGroup.rotation.x, 0.08, 10, delta);
          sp.leftLeg.rotation.x = THREE.MathUtils.damp(sp.leftLeg.rotation.x, 0, 8, delta);
          sp.rightLeg.rotation.x = THREE.MathUtils.damp(sp.rightLeg.rotation.x, 0, 8, delta);
          sp.leftArm.rotation.x = -1.05 + Math.sin(elapsed * 14) * 0.14;
          sp.rightArm.rotation.x = -1.05 + Math.cos(elapsed * 19) * 0.16;
          sp.headGroup.rotation.x = -0.06 + Math.sin(elapsed * 5) * 0.04;
          sp.headGroup.rotation.y = Math.sin(elapsed * 2.4) * 0.14;
        } else if (currentWaypoint.pose === 'pet_cat') {
          // Lean down gently and stroke the cat
          sp.bodyGroup.rotation.x = THREE.MathUtils.damp(sp.bodyGroup.rotation.x, 0.26, 8, delta);
          sp.leftLeg.rotation.x = THREE.MathUtils.damp(sp.leftLeg.rotation.x, 0, 8, delta);
          sp.rightLeg.rotation.x = THREE.MathUtils.damp(sp.rightLeg.rotation.x, 0, 8, delta);
          sp.leftArm.rotation.x = THREE.MathUtils.damp(sp.leftArm.rotation.x, -0.15, 8, delta);
          sp.rightArm.rotation.x = -1.15 + Math.sin(elapsed * 5.2) * 0.22;
          sp.headGroup.rotation.x = 0.25 + Math.sin(elapsed * 2.2) * 0.05;
          sp.headGroup.rotation.y = Math.sin(elapsed * 1.4) * 0.1;
        } else if (currentWaypoint.pose === 'inspect') {
          sp.bodyGroup.rotation.x = THREE.MathUtils.damp(sp.bodyGroup.rotation.x, 0, 10, delta);
          sp.leftLeg.rotation.x = THREE.MathUtils.damp(sp.leftLeg.rotation.x, 0, 8, delta);
          sp.rightLeg.rotation.x = THREE.MathUtils.damp(sp.rightLeg.rotation.x, 0, 8, delta);
          sp.leftArm.rotation.x = THREE.MathUtils.damp(sp.leftArm.rotation.x, -0.2, 8, delta);
          sp.rightArm.rotation.x = THREE.MathUtils.damp(sp.rightArm.rotation.x, -0.65, 8, delta);
          sp.headGroup.rotation.x = -0.18;
          sp.headGroup.rotation.y = Math.sin(elapsed * 1.1) * 0.28;
        } else {
          sp.bodyGroup.rotation.x = THREE.MathUtils.damp(
            sp.bodyGroup.rotation.x,
            catGreetingNearby ? 0.14 : 0,
            8,
            delta,
          );
          sp.leftLeg.rotation.x = THREE.MathUtils.damp(sp.leftLeg.rotation.x, 0, 8, delta);
          sp.rightLeg.rotation.x = THREE.MathUtils.damp(sp.rightLeg.rotation.x, 0, 8, delta);
          sp.leftArm.rotation.x = Math.sin(elapsed * 1.6) * 0.08;
          sp.rightArm.rotation.x = catGreetingNearby
            ? -0.95 + Math.sin(elapsed * 5) * 0.2
            : -Math.sin(elapsed * 1.6) * 0.08;
          sp.headGroup.rotation.x = catGreetingNearby ? 0.28 : 0;
          sp.headGroup.rotation.y = Math.sin(elapsed * 0.8) * 0.22;
        }
      }

      blinkTimer -= delta;
      if (blinkTimer <= 0) {
        isBlinking = !isBlinking;
        blinkTimer = isBlinking ? 0.12 : 2.5 + Math.random() * 2.8;
      }
      const eyeColor = working ? 0xf59e0b : 0x22d3ee;
      sp.eyeLeftMat.color.setHex(eyeColor);
      sp.eyeRightMat.color.setHex(eyeColor);
      sp.visorLightMat.emissive.setHex(eyeColor);
      const eyeScaleY = isBlinking ? 0.15 : 1.0;
      sp.headGroup.children.forEach((child) => {
        if (
          child instanceof THREE.Mesh &&
          (child.material === sp.eyeLeftMat || child.material === sp.eyeRightMat)
        ) {
          child.scale.y = eyeScaleY;
        }
      });

      // 2. Studio Cat Autonomous & Two-Way Interaction Update
      const cat = studio.cat;
      if (!catMoving) {
        catNextRoamIn -= delta;
        if (catNextRoamIn <= 0) {
          pickNextCatBehavior(working);
        }
      }

      const cPos = cat.root.position;
      const cTarget = catGoal.pos;
      const cdx = cTarget.x - cPos.x;
      const cdz = cTarget.z - cPos.z;
      const cDist = Math.hypot(cdx, cdz);

      if (cDist > 0.06) {
        catMoving = true;
        const catSpeed = catGoal.kind === 'greet_person' ? 1.45 : 1.05;
        const cStep = Math.min(cDist, catSpeed * delta);
        cPos.x += (cdx / cDist) * cStep;
        cPos.z += (cdz / cDist) * cStep;

        const catAngle = Math.atan2(cdx, cdz);
        cat.root.rotation.y = THREE.MathUtils.damp(cat.root.rotation.y, catAngle, 10, delta);
        cat.bodyGroup.position.y = THREE.MathUtils.damp(cat.bodyGroup.position.y, 0.04, 10, delta);
        cat.bodyGroup.rotation.x = THREE.MathUtils.damp(cat.bodyGroup.rotation.x, 0, 10, delta);

        const trot = elapsed * 12;
        cat.frontLeftLeg.rotation.x = Math.sin(trot) * 0.55;
        cat.backRightLeg.rotation.x = Math.sin(trot) * 0.55;
        cat.frontRightLeg.rotation.x = -Math.sin(trot) * 0.55;
        cat.backLeftLeg.rotation.x = -Math.sin(trot) * 0.55;
        cat.tailGroup.rotation.z = Math.sin(elapsed * 5) * 0.25;
        cat.tailGroup.rotation.x = 0.2;
        cat.headGroup.rotation.set(0, 0, 0);
      } else {
        catMoving = false;
        cPos.x = THREE.MathUtils.damp(cPos.x, cTarget.x, 8, delta);
        cPos.z = THREE.MathUtils.damp(cPos.z, cTarget.z, 8, delta);

        let cAngleDiff = catGoal.lookAngle - cat.root.rotation.y;
        while (cAngleDiff > Math.PI) cAngleDiff -= Math.PI * 2;
        while (cAngleDiff < -Math.PI) cAngleDiff += Math.PI * 2;
        cat.root.rotation.y += cAngleDiff * (1 - Math.exp(-8 * delta));

        if (catGoal.pose === 'nap') {
          cat.bodyGroup.position.y = THREE.MathUtils.damp(cat.bodyGroup.position.y, -0.06, 6, delta);
          cat.bodyGroup.rotation.x = THREE.MathUtils.damp(cat.bodyGroup.rotation.x, 0, 6, delta);
          cat.frontLeftLeg.rotation.x = THREE.MathUtils.damp(cat.frontLeftLeg.rotation.x, 0.8, 6, delta);
          cat.frontRightLeg.rotation.x = THREE.MathUtils.damp(cat.frontRightLeg.rotation.x, 0.8, 6, delta);
          cat.backLeftLeg.rotation.x = THREE.MathUtils.damp(cat.backLeftLeg.rotation.x, -0.8, 6, delta);
          cat.backRightLeg.rotation.x = THREE.MathUtils.damp(cat.backRightLeg.rotation.x, -0.8, 6, delta);
          cat.headGroup.rotation.x = 0.22 + Math.sin(elapsed * 1.3) * 0.03;
          cat.headGroup.rotation.y = Math.sin(elapsed * 0.5) * 0.08;
          cat.headGroup.rotation.z = 0.12;
          cat.tailGroup.rotation.z = Math.sin(elapsed * 1.4) * 0.18;
        } else if (catGoal.pose === 'petted') {
          cat.bodyGroup.position.y = THREE.MathUtils.damp(cat.bodyGroup.position.y, 0.02, 8, delta);
          cat.bodyGroup.rotation.x = THREE.MathUtils.damp(cat.bodyGroup.rotation.x, -0.12, 8, delta);
          cat.frontLeftLeg.rotation.x = THREE.MathUtils.damp(cat.frontLeftLeg.rotation.x, 0, 8, delta);
          cat.frontRightLeg.rotation.x = THREE.MathUtils.damp(cat.frontRightLeg.rotation.x, 0, 8, delta);
          cat.backLeftLeg.rotation.x = THREE.MathUtils.damp(cat.backLeftLeg.rotation.x, -0.45, 8, delta);
          cat.backRightLeg.rotation.x = THREE.MathUtils.damp(cat.backRightLeg.rotation.x, -0.45, 8, delta);
          cat.headGroup.rotation.x = -0.22 + Math.sin(elapsed * 3.8) * 0.08;
          cat.headGroup.rotation.z = Math.sin(elapsed * 2.6) * 0.16;
          cat.tailGroup.rotation.z = Math.sin(elapsed * 7) * 0.38;
        } else if (catGoal.pose === 'greet') {
          cat.bodyGroup.position.y = THREE.MathUtils.damp(cat.bodyGroup.position.y, 0.04, 8, delta);
          cat.bodyGroup.rotation.x = THREE.MathUtils.damp(cat.bodyGroup.rotation.x, -0.08, 8, delta);
          cat.frontLeftLeg.rotation.x = THREE.MathUtils.damp(cat.frontLeftLeg.rotation.x, 0, 8, delta);
          // Playful raised paw wave!
          cat.frontRightLeg.rotation.x = -0.95 + Math.sin(elapsed * 7) * 0.25;
          cat.backLeftLeg.rotation.x = THREE.MathUtils.damp(cat.backLeftLeg.rotation.x, -0.25, 8, delta);
          cat.backRightLeg.rotation.x = THREE.MathUtils.damp(cat.backRightLeg.rotation.x, -0.25, 8, delta);
          cat.headGroup.rotation.x = -0.28 + Math.sin(elapsed * 3) * 0.06;
          cat.headGroup.rotation.z = Math.sin(elapsed * 2.4) * 0.14;
          cat.tailGroup.rotation.z = Math.sin(elapsed * 6) * 0.35;
        } else if (catGoal.pose === 'sit') {
          cat.bodyGroup.position.y = THREE.MathUtils.damp(cat.bodyGroup.position.y, 0.02, 8, delta);
          cat.bodyGroup.rotation.x = THREE.MathUtils.damp(cat.bodyGroup.rotation.x, -0.18, 8, delta);
          cat.frontLeftLeg.rotation.x = THREE.MathUtils.damp(cat.frontLeftLeg.rotation.x, 0.18, 8, delta);
          cat.frontRightLeg.rotation.x = THREE.MathUtils.damp(cat.frontRightLeg.rotation.x, 0.18, 8, delta);
          cat.backLeftLeg.rotation.x = THREE.MathUtils.damp(cat.backLeftLeg.rotation.x, -0.65, 8, delta);
          cat.backRightLeg.rotation.x = THREE.MathUtils.damp(cat.backRightLeg.rotation.x, -0.65, 8, delta);
          cat.headGroup.rotation.x = 0.12;
          cat.headGroup.rotation.y = Math.sin(elapsed * 1.1) * 0.22;
          cat.headGroup.rotation.z = 0;
          cat.tailGroup.rotation.z = Math.sin(elapsed * 2.5) * 0.24;
        } else {
          cat.bodyGroup.position.y = THREE.MathUtils.damp(cat.bodyGroup.position.y, 0.04, 8, delta);
          cat.bodyGroup.rotation.x = THREE.MathUtils.damp(cat.bodyGroup.rotation.x, 0, 8, delta);
          cat.frontLeftLeg.rotation.x = THREE.MathUtils.damp(cat.frontLeftLeg.rotation.x, 0, 8, delta);
          cat.frontRightLeg.rotation.x = THREE.MathUtils.damp(cat.frontRightLeg.rotation.x, 0, 8, delta);
          cat.backLeftLeg.rotation.x = THREE.MathUtils.damp(cat.backLeftLeg.rotation.x, 0, 8, delta);
          cat.backRightLeg.rotation.x = THREE.MathUtils.damp(cat.backRightLeg.rotation.x, 0, 8, delta);
          cat.headGroup.rotation.y = Math.sin(elapsed * 1.2) * 0.24;
          cat.headGroup.rotation.z = 0;
          cat.tailGroup.rotation.z = Math.sin(elapsed * 3) * 0.25;
        }
      }

      catBlinkTimer -= delta;
      if (catBlinkTimer <= 0) {
        catBlinking = !catBlinking;
        catBlinkTimer = catBlinking ? 0.14 : 2.2 + Math.random() * 2.6;
      }
      const catEyeScaleY = catGoal.pose === 'nap' && !catMoving ? 0.16 : catBlinking ? 0.16 : 1.0;
      cat.headGroup.children.forEach((child) => {
        if (
          child instanceof THREE.Mesh &&
          (child.material === cat.eyeLeftMat || child.material === cat.eyeRightMat)
        ) {
          child.scale.y = catEyeScaleY;
        }
      });

      // 3. Environment Animations
      studio.steamParticles.forEach((p, idx) => {
        const t = (elapsed * 0.55 + idx * 0.33) % 1;
        p.position.y = 0.52 + t * 0.36;
        p.position.x = 0.08 + Math.sin(elapsed * 2 + idx) * 0.03;
        (p.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.35;
      });
      studio.espressoSteamParticles.forEach((p, idx) => {
        const t = (elapsed * 0.7 + idx * 0.33) % 1;
        p.position.y = 1.0 + t * 0.32;
        p.position.x = 0.16 + Math.sin(elapsed * 2.5 + idx) * 0.025;
        (p.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.42;
      });

      studio.plantLeaves.rotation.z = Math.sin(elapsed * 1.2) * 0.025;

      const renderingNow =
        stageRef.current === 'rendering_draft' || stageRef.current === 'exporting_hd';
      studio.towerLedMat.emissive.setHex(renderingNow ? 0xf59e0b : 0x06b6d4);
      studio.towerLedMat.emissiveIntensity = working
        ? 0.65 + Math.sin(elapsed * 5) * 0.35
        : 0.12;

      monitorDrawAccum += delta;
      if (monitorDrawAccum > 0.1) {
        monitorDrawAccum = 0;
        const mode = working ? 'working' : 'idle';
        drawMonitorScreen(
          studio.monitorLeftCtx,
          mode,
          elapsed,
          'left',
          stageLabelRef.current?.slice(0, 22).toUpperCase(),
        );
        drawMonitorScreen(studio.monitorRightCtx, mode, elapsed, 'right');
        studio.monitorLeftTex.needsUpdate = true;
        studio.monitorRightTex.needsUpdate = true;

        drawArcadeScreen(studio.arcadeScreenCtx, isPlayingArcade, elapsed);
        studio.arcadeScreenTex.needsUpdate = true;
      }

      controls.update();
      renderer.render(scene, camera);

      const rect = renderer.domElement.getBoundingClientRect();

      if (bubbleRef.current) {
        _projVec.copy(sp.root.position);
        _projVec.y += 1.48 + (isMoving ? 0 : currentWaypoint.sitOffsetY);
        _projVec.project(camera);
        const sx = ((_projVec.x + 1) / 2) * rect.width;
        const sy = ((-_projVec.y + 1) / 2) * rect.height;
        const clampedX = Math.max(120, Math.min(rect.width - 120, sx));
        const clampedY = Math.max(76, Math.min(rect.height - 160, sy));
        bubbleRef.current.style.transform = `translate3d(${clampedX}px, ${clampedY}px, 0) translate(-50%, -100%)`;
      }

      if (catBubbleRef.current) {
        _catProjVec.copy(cat.root.position);
        _catProjVec.y += 0.72;
        _catProjVec.project(camera);
        const cx = ((_catProjVec.x + 1) / 2) * rect.width;
        const cy = ((-_catProjVec.y + 1) / 2) * rect.height;
        const clampedCx = Math.max(95, Math.min(rect.width - 95, cx));
        const clampedCy = Math.max(76, Math.min(rect.height - 150, cy));
        catBubbleRef.current.style.transform = `translate3d(${clampedCx}px, ${clampedCy}px, 0) translate(-50%, -100%)`;
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObs.disconnect();
      document.removeEventListener('visibilitychange', handleVisibility);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
      controls.dispose();
      studio.monitorLeftTex.dispose();
      studio.monitorRightTex.dispose();
      studio.arcadeScreenTex.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  if (webglFailed) {
    return (
      <div className="relative flex h-full w-full items-center justify-center bg-[#0D1015] p-6 text-center">
        <div className="max-w-md rounded-lg border border-white/10 bg-[#141821] p-6">
          <p className="font-display text-lg font-semibold text-white">2.5D Studio Standby</p>
          {chatterEnabled && <p className="mt-2 text-sm text-slate-400">{chatterText}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0D1015]">
      <div ref={mountRef} className="h-full w-full touch-none" />

      {chatterEnabled && bubbleVisible && (
        <div
          ref={bubbleRef}
          className="pointer-events-auto absolute top-0 left-0 z-10 max-w-[230px] sm:max-w-[270px] transition-opacity duration-200"
          style={{ willChange: 'transform' }}
        >
          <button
            type="button"
            onClick={() => setBubbleVisible(false)}
            aria-label="Dismiss editor chatter"
            className="w-full rounded-lg border border-white/15 bg-[#141821]/95 px-3 py-2 text-left text-xs leading-relaxed text-slate-100 shadow-lg hover:border-amber-400/50 focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            <span className="block font-medium text-amber-400">
              {isWorkingStage(activeStage) ? 'Editor Working' : 'Studio Idle'}
            </span>
            <span className="mt-0.5 block text-slate-200">{chatterText}</span>
          </button>
        </div>
      )}

      {chatterEnabled && catBubbleVisible && (
        <div
          ref={catBubbleRef}
          className="pointer-events-auto absolute top-0 left-0 z-10 max-w-[190px] transition-opacity duration-200"
          style={{ willChange: 'transform' }}
        >
          <button
            type="button"
            onClick={() => setCatBubbleVisible(false)}
            aria-label="Dismiss studio cat chatter"
            className="w-full rounded-lg border border-cyan-400/25 bg-[#141821]/95 px-2.5 py-1.5 text-left text-[11px] leading-snug text-slate-100 shadow-lg hover:border-cyan-400/60 focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            <span className="block font-medium text-cyan-300">Pixel (Cat)</span>
            <span className="mt-0.5 block text-slate-200">{catChatterText}</span>
          </button>
        </div>
      )}
    </div>
  );
}
