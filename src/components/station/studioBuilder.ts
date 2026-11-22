import * as THREE from 'three';

export interface StudioRefs {
  chairSwivel: THREE.Group;
  monitorLeftTex: THREE.CanvasTexture;
  monitorRightTex: THREE.CanvasTexture;
  monitorLeftCtx: CanvasRenderingContext2D;
  monitorRightCtx: CanvasRenderingContext2D;
  arcadeScreenTex: THREE.CanvasTexture;
  arcadeScreenCtx: CanvasRenderingContext2D;
  towerLedMat: THREE.MeshStandardMaterial;
  steamParticles: THREE.Mesh[];
  espressoSteamParticles: THREE.Mesh[];
  plantLeaves: THREE.Group;
  sprite: SpriteRefs;
  cat: CatRefs;
  clickTargets: THREE.Object3D[];
}

export interface CatRefs {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  headGroup: THREE.Group;
  tailGroup: THREE.Group;
  frontLeftLeg: THREE.Group;
  frontRightLeg: THREE.Group;
  backLeftLeg: THREE.Group;
  backRightLeg: THREE.Group;
  eyeLeftMat: THREE.MeshBasicMaterial;
  eyeRightMat: THREE.MeshBasicMaterial;
}

export interface SpriteRefs {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  headGroup: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  heldMug: THREE.Group;
  eyeLeftMat: THREE.MeshBasicMaterial;
  eyeRightMat: THREE.MeshBasicMaterial;
  visorLightMat: THREE.MeshStandardMaterial;
}

function createFloorGridTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#151922';
  ctx.fillRect(0, 0, 512, 512);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
  ctx.lineWidth = 2;
  const step = 64;
  for (let i = 0; i <= 512; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

function createStoryboardTexture(cardIndex: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 320;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1B2230';
  ctx.fillRect(0, 0, 256, 320);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, 248, 312);

  const accents = ['#F59E0B', '#06B6D4', '#E2E8F0', '#38BDF8'];
  const accent = accents[cardIndex % accents.length];

  ctx.fillStyle = '#0F131B';
  ctx.fillRect(20, 22, 216, 150);

  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(36, 36, 184, 122);
  ctx.setLineDash([]);

  ctx.fillStyle = accent;
  ctx.fillRect(36, 195, 130, 12);
  ctx.fillStyle = '#475569';
  ctx.fillRect(36, 220, 180, 10);
  ctx.fillRect(36, 240, 150, 10);
  ctx.fillRect(36, 260, 110, 10);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createMarqueeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0B1220';
  ctx.fillRect(0, 0, 256, 64);
  ctx.strokeStyle = '#F59E0B';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, 248, 56);
  ctx.fillStyle = '#FBBF24';
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CUT ARCADE', 128, 33);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function drawArcadeScreen(
  ctx: CanvasRenderingContext2D,
  isPlaying: boolean,
  phase: number,
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.fillStyle = '#070B14';
  ctx.fillRect(0, 0, w, h);

  // Subtle scanline grid
  ctx.fillStyle = 'rgba(6, 182, 212, 0.08)';
  for (let y = 0; y < h; y += 8) {
    ctx.fillRect(0, y, w, 2);
  }

  // Top score bar
  ctx.fillStyle = '#F59E0B';
  ctx.font = 'bold 16px monospace';
  ctx.fillText(isPlaying ? '1P  04280' : 'INSERT COIN', 16, 26);

  // Retro brick-breaker blocks
  const blockColors = ['#F59E0B', '#06B6D4', '#38BDF8', '#E2E8F0'];
  for (let row = 0; row < 4; row++) {
    ctx.fillStyle = blockColors[row];
    for (let col = 0; col < 6; col++) {
      if (isPlaying && (row + col + Math.floor(phase * 2)) % 7 === 0) continue;
      ctx.fillRect(18 + col * 36, 44 + row * 16, 30, 10);
    }
  }

  // Moving paddle and bouncing ball
  const paddleX = w * 0.5 + Math.sin(phase * (isPlaying ? 4.2 : 1.3)) * (w * 0.28) - 28;
  ctx.fillStyle = '#22D3EE';
  ctx.fillRect(paddleX, h - 28, 56, 10);

  const ballX = w * 0.5 + Math.cos(phase * (isPlaying ? 5.1 : 1.7)) * (w * 0.34);
  const ballY = 122 + Math.abs(Math.sin(phase * (isPlaying ? 3.8 : 1.4))) * 62;
  ctx.fillStyle = '#FBBF24';
  ctx.fillRect(ballX - 5, ballY - 5, 10, 10);
}

export function drawMonitorScreen(
  ctx: CanvasRenderingContext2D,
  mode: 'idle' | 'working',
  phase: number,
  side: 'left' | 'right',
  stageText?: string,
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  ctx.fillStyle = '#090D14';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#141B26';
  ctx.fillRect(0, 0, w, 24);
  ctx.fillStyle = mode === 'working' ? '#F59E0B' : '#06B6D4';
  ctx.fillRect(12, 8, 48, 8);

  if (mode === 'idle') {
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 16; x < w - 16; x += 6) {
      const y = h * 0.52 + Math.sin(x * 0.04 + phase * 1.4 + (side === 'right' ? 1.5 : 0)) * 18;
      if (x === 16) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = '#64748B';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(side === 'left' ? 'STANDBY DECK' : '9:16 SAFE ZONE', 20, 56);
    return;
  }

  if (side === 'left') {
    ctx.fillStyle = '#F3F4F6';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(stageText || 'EDITING TIMELINE', 16, 52);

    const bars = 24;
    const bw = (w - 32) / bars;
    for (let i = 0; i < bars; i++) {
      const barH = 16 + Math.abs(Math.sin(phase * 5 + i * 0.55)) * 54;
      ctx.fillStyle = i % 3 === 0 ? '#F59E0B' : '#06B6D4';
      ctx.fillRect(16 + i * bw, 138 - barH, bw - 4, barH);
    }

    ctx.fillStyle = '#1E293B';
    ctx.fillRect(16, 152, w - 32, 24);
    ctx.fillStyle = '#06B6D4';
    ctx.fillRect(20, 156, 70, 16);
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(96, 156, 95, 16);
    ctx.fillRect(198, 156, 65, 16);
  } else {
    const previewW = 74;
    const previewH = 128;
    ctx.fillStyle = '#111827';
    ctx.fillRect(w - previewW - 18, 36, previewW, previewH);
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 2;
    ctx.strokeRect(w - previewW - 18, 36, previewW, previewH);

    ctx.fillStyle = '#F59E0B';
    const capW = 44 + Math.sin(phase * 6) * 8;
    ctx.fillRect(w - previewW - 18 + (previewW - capW) / 2, 128, capW, 10);

    const widths = [110, 88, 124, 72, 105, 92];
    widths.forEach((lw, idx) => {
      ctx.fillStyle = idx % 2 === 0 ? '#38BDF8' : '#94A3B8';
      const pulseOffset = Math.sin(phase * 4 + idx) * 6;
      ctx.fillRect(16, 44 + idx * 20, Math.max(40, lw + pulseOffset), 8);
    });
  }
}

export function buildIsometricStudio(scene: THREE.Scene, isSoftwareGl: boolean): StudioRefs {
  const clickTargets: THREE.Object3D[] = [];

  const matFloor = new THREE.MeshStandardMaterial({
    map: createFloorGridTexture(),
    roughness: 0.85,
    metalness: 0.08,
  });
  const matWall = new THREE.MeshStandardMaterial({
    color: 0x1a202c,
    roughness: 0.9,
    metalness: 0.05,
  });
  const matSlat = new THREE.MeshStandardMaterial({
    color: 0x5c4033,
    roughness: 0.72,
    metalness: 0.05,
  });
  const matDarkMetal = new THREE.MeshStandardMaterial({
    color: 0x222936,
    roughness: 0.35,
    metalness: 0.75,
  });
  const matBrushedSteel = new THREE.MeshStandardMaterial({
    color: 0x8b95a5,
    roughness: 0.25,
    metalness: 0.85,
  });
  const matWood = new THREE.MeshStandardMaterial({
    color: 0x7a563b,
    roughness: 0.65,
    metalness: 0.05,
  });
  const matSofa = new THREE.MeshStandardMaterial({
    color: 0x2c3647,
    roughness: 0.88,
    metalness: 0.02,
  });
  const matPillowAmber = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.85,
    metalness: 0.02,
  });
  const matPillowSlate = new THREE.MeshStandardMaterial({
    color: 0x3b495e,
    roughness: 0.85,
    metalness: 0.02,
  });
  const matPlant = new THREE.MeshStandardMaterial({
    color: 0x2e6f57,
    roughness: 0.7,
    metalness: 0.02,
  });
  const matCeramic = new THREE.MeshStandardMaterial({
    color: 0xe5e7eb,
    roughness: 0.3,
    metalness: 0.05,
  });

  // 1. Studio Slab & Cutaway Walls
  const studioGroup = new THREE.Group();

  const baseSlab = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.36, 7.6), matDarkMetal);
  baseSlab.position.set(0, -0.18, 0);
  baseSlab.receiveShadow = true;
  studioGroup.add(baseSlab);

  const floorTop = new THREE.Mesh(new THREE.BoxGeometry(7.36, 0.04, 7.36), matFloor);
  floorTop.position.set(0, 0.02, 0);
  floorTop.receiveShadow = true;
  studioGroup.add(floorTop);

  const loungeRug = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 0.02, 2.3),
    new THREE.MeshStandardMaterial({ color: 0x202734, roughness: 0.95, metalness: 0 }),
  );
  loungeRug.position.set(-1.55, 0.045, 1.35);
  loungeRug.receiveShadow = true;
  studioGroup.add(loungeRug);

  const backWall = new THREE.Mesh(new THREE.BoxGeometry(7.6, 3.2, 0.2), matWall);
  backWall.position.set(0, 1.6, -3.7);
  backWall.receiveShadow = true;
  studioGroup.add(backWall);

  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.2, 7.6), matWall);
  leftWall.position.set(-3.7, 1.6, 0);
  leftWall.receiveShadow = true;
  studioGroup.add(leftWall);

  const slatGeo = new THREE.BoxGeometry(0.09, 2.5, 0.06);
  const slatMesh = new THREE.InstancedMesh(slatGeo, matSlat, 18);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 18; i++) {
    dummy.position.set(-0.2 + i * 0.2, 1.55, -3.57);
    dummy.updateMatrix();
    slatMesh.setMatrixAt(i, dummy.matrix);
  }
  slatMesh.computeBoundingSphere();
  studioGroup.add(slatMesh);

  // 2. Editing Desk Station (Zone: desk)
  const deskGroup = new THREE.Group();
  deskGroup.position.set(1.55, 0, -1.75);

  const deskTop = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 1.05), matWood);
  deskTop.position.set(0, 0.78, 0);
  deskTop.castShadow = !isSoftwareGl;
  deskTop.receiveShadow = true;
  deskGroup.add(deskTop);

  [
    [-1.08, 0.38, -0.42],
    [1.08, 0.38, -0.42],
    [-1.08, 0.38, 0.42],
    [1.08, 0.38, 0.42],
  ].forEach(([lx, ly, lz]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.76, 0.07), matDarkMetal);
    leg.position.set(lx, ly, lz);
    leg.castShadow = !isSoftwareGl;
    deskGroup.add(leg);
  });

  const deskMat = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.015, 0.44),
    new THREE.MeshStandardMaterial({ color: 0x151922, roughness: 0.9 }),
  );
  deskMat.position.set(0, 0.825, 0.14);
  deskGroup.add(deskMat);

  const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.025, 0.16), matBrushedSteel);
  keyboard.position.set(-0.08, 0.845, 0.14);
  deskGroup.add(keyboard);

  const monitorLeftCanvas = document.createElement('canvas');
  monitorLeftCanvas.width = 320;
  monitorLeftCanvas.height = 192;
  const monitorLeftCtx = monitorLeftCanvas.getContext('2d')!;
  drawMonitorScreen(monitorLeftCtx, 'idle', 0, 'left');
  const monitorLeftTex = new THREE.CanvasTexture(monitorLeftCanvas);
  monitorLeftTex.colorSpace = THREE.SRGBColorSpace;

  const monitorRightCanvas = document.createElement('canvas');
  monitorRightCanvas.width = 320;
  monitorRightCanvas.height = 192;
  const monitorRightCtx = monitorRightCanvas.getContext('2d')!;
  drawMonitorScreen(monitorRightCtx, 'idle', 0, 'right');
  const monitorRightTex = new THREE.CanvasTexture(monitorRightCanvas);
  monitorRightTex.colorSpace = THREE.SRGBColorSpace;

  const buildMonitor = (x: number, rotY: number, tex: THREE.CanvasTexture) => {
    const mon = new THREE.Group();
    mon.position.set(x, 1.24, -0.24);
    mon.rotation.y = rotY;
    const standPost = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.42, 10), matDarkMetal);
    standPost.position.set(0, -0.22, -0.04);
    mon.add(standPost);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.54, 0.045), matDarkMetal);
    housing.castShadow = !isSoftwareGl;
    mon.add(housing);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.86, 0.48),
      new THREE.MeshBasicMaterial({ map: tex }),
    );
    screen.position.set(0, 0, 0.025);
    mon.add(screen);
    return mon;
  };

  deskGroup.add(buildMonitor(-0.48, 0.16, monitorLeftTex));
  deskGroup.add(buildMonitor(0.48, -0.16, monitorRightTex));

  [-1.02, 1.02].forEach((sx) => {
    const spk = new THREE.Group();
    spk.position.set(sx, 0.98, -0.22);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 0.22), matDarkMetal);
    const woofer = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.065, 0.02, 16),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4, metalness: 0.5 }),
    );
    woofer.rotation.x = Math.PI / 2;
    woofer.position.set(0, -0.04, 0.11);
    spk.add(box, woofer);
    deskGroup.add(spk);
  });

  const lampGroup = new THREE.Group();
  lampGroup.position.set(-0.96, 0.82, 0.24);
  const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.04, 14), matDarkMetal);
  const lampStem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.42, 8), matBrushedSteel);
  lampStem.position.set(0, 0.21, 0);
  const lampHead = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.14, 14), matDarkMetal);
  lampHead.position.set(0.08, 0.4, 0);
  lampHead.rotation.z = -0.5;
  const lampBulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24 }),
  );
  lampBulb.position.set(0.11, 0.36, 0);
  lampGroup.add(lampBase, lampStem, lampHead, lampBulb);
  deskGroup.add(lampGroup);

  const chairSwivel = new THREE.Group();
  chairSwivel.position.set(1.55, 0, -0.82);
  const chairBase = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.06, 12), matDarkMetal);
  chairBase.position.y = 0.06;
  const chairPole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.38, 10), matBrushedSteel);
  chairPole.position.y = 0.26;
  const chairSeat = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.08, 0.52), matSofa);
  chairSeat.position.y = 0.46;
  chairSeat.castShadow = !isSoftwareGl;
  const chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.56, 0.08), matSofa);
  chairBack.position.set(0, 0.76, 0.24);
  chairBack.castShadow = !isSoftwareGl;
  chairSwivel.add(chairBase, chairPole, chairSeat, chairBack);
  studioGroup.add(chairSwivel);

  const deskHit = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 1.8, 1.6),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  deskHit.position.set(0, 0.9, 0.25);
  deskHit.userData.zone = 'desk';
  deskGroup.add(deskHit);
  clickTargets.push(deskHit);
  studioGroup.add(deskGroup);

  // 3. Render Tower
  const towerGroup = new THREE.Group();
  towerGroup.position.set(2.95, 0, -2.55);
  const towerBody = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.92, 0.54), matDarkMetal);
  towerBody.position.y = 0.46;
  towerBody.castShadow = !isSoftwareGl;
  const towerLedMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    emissive: 0x06b6d4,
    emissiveIntensity: 0.15,
    roughness: 0.3,
  });
  const towerLed = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.66, 0.02), towerLedMat);
  towerLed.position.set(-0.12, 0.48, 0.275);
  towerGroup.add(towerBody, towerLed);
  studioGroup.add(towerGroup);

  // 4. Resting Lounge (Zone: lounge)
  const loungeGroup = new THREE.Group();
  loungeGroup.position.set(-1.95, 0, 1.35);
  loungeGroup.rotation.y = Math.PI / 2;

  const sofaBase = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.22, 0.88), matWood);
  sofaBase.position.set(0, 0.16, 0);
  sofaBase.castShadow = !isSoftwareGl;
  const cushion1 = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.18, 0.76), matSofa);
  cushion1.position.set(-0.44, 0.34, 0.03);
  const cushion2 = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.18, 0.76), matSofa);
  cushion2.position.set(0.44, 0.34, 0.03);
  const sofaBack = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.56, 0.22), matSofa);
  sofaBack.position.set(0, 0.54, -0.34);
  sofaBack.castShadow = !isSoftwareGl;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.36, 0.88), matSofa);
  armL.position.set(-0.88, 0.42, 0);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.36, 0.88), matSofa);
  armR.position.set(0.88, 0.42, 0);
  const pillow1 = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.28, 0.12), matPillowAmber);
  pillow1.position.set(-0.58, 0.54, -0.14);
  pillow1.rotation.set(-0.2, 0.2, 0.08);
  const pillow2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.12), matPillowSlate);
  pillow2.position.set(0.6, 0.53, -0.14);
  pillow2.rotation.set(-0.2, -0.25, -0.08);

  loungeGroup.add(sofaBase, cushion1, cushion2, sofaBack, armL, armR, pillow1, pillow2);

  const loungeHit = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 1.2, 1.3),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  loungeHit.position.set(0, 0.6, 0.15);
  loungeHit.userData.zone = 'lounge';
  loungeGroup.add(loungeHit);
  clickTargets.push(loungeHit);
  studioGroup.add(loungeGroup);

  // Coffee table + Ceramic Mug + Steam Particles
  const coffeeTable = new THREE.Group();
  coffeeTable.position.set(-0.82, 0, 1.38);
  const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.05, 24), matWood);
  tableTop.position.y = 0.36;
  tableTop.castShadow = !isSoftwareGl;
  const tableLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.16, 0.34, 16), matDarkMetal);
  tableLeg.position.y = 0.17;
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.048, 0.11, 12), matCeramic);
  mug.position.set(0.08, 0.44, -0.05);
  coffeeTable.add(tableTop, tableLeg, mug);

  const steamParticles: THREE.Mesh[] = [];
  const steamGeo = new THREE.SphereGeometry(0.025, 8, 8);
  const steamMat = new THREE.MeshBasicMaterial({
    color: 0xe2e8f0,
    transparent: true,
    opacity: 0.35,
  });
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(steamGeo, steamMat.clone());
    p.position.set(0.08 + (i - 1) * 0.02, 0.54 + i * 0.08, -0.05);
    coffeeTable.add(p);
    steamParticles.push(p);
  }
  studioGroup.add(coffeeTable);

  // Potted Studio Plant
  const plantGroup = new THREE.Group();
  plantGroup.position.set(-2.95, 0, 2.75);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.38, 16), matCeramic);
  pot.position.y = 0.19;
  pot.castShadow = !isSoftwareGl;
  const plantLeaves = new THREE.Group();
  plantLeaves.position.y = 0.36;
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.45, 5), matPlant);
    leaf.position.set(Math.cos(angle) * 0.12, 0.24 + (i % 2) * 0.08, Math.sin(angle) * 0.12);
    leaf.rotation.set(Math.sin(angle) * 0.45, angle, -Math.cos(angle) * 0.45);
    plantLeaves.add(leaf);
  }
  plantGroup.add(pot, plantLeaves);
  studioGroup.add(plantGroup);

  // Warm Floor Lamp beside sofa
  const floorLamp = new THREE.Group();
  floorLamp.position.set(-2.95, 0, 0.15);
  const flBase = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.04, 16), matDarkMetal);
  flBase.position.y = 0.02;
  const flPole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.9, 10), matBrushedSteel);
  flPole.position.y = 0.95;
  const flShade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.24, 0.28, 16),
    new THREE.MeshStandardMaterial({
      color: 0xfde68a,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.45,
      roughness: 0.5,
    }),
  );
  flShade.position.y = 1.85;
  floorLamp.add(flBase, flPole, flShade);
  studioGroup.add(floorLamp);

  // 5. Espresso Bar & Coffee Machine (Zone: coffee, left wall facing +X)
  const coffeeStation = new THREE.Group();
  coffeeStation.position.set(-3.2, 0, -0.78);

  const barCabinet = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.78, 0.96), matDarkMetal);
  barCabinet.position.y = 0.39;
  barCabinet.castShadow = !isSoftwareGl;
  barCabinet.receiveShadow = true;
  const barTop = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.06, 1.02), matWood);
  barTop.position.y = 0.81;
  barTop.castShadow = !isSoftwareGl;

  // Espresso machine body
  const espressoBody = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.44, 0.46), matBrushedSteel);
  espressoBody.position.set(-0.04, 1.06, 0.05);
  espressoBody.castShadow = !isSoftwareGl;
  const espressoRoof = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.48), matDarkMetal);
  espressoRoof.position.set(-0.04, 1.29, 0.05);
  // Drip tray & brew bay
  const dripTray = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.34), matDarkMetal);
  dripTray.position.set(0.18, 0.865, 0.05);
  const groupHead = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 12), matDarkMetal);
  groupHead.position.set(0.16, 1.14, 0.05);
  const portafilter = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.16, 8), matWood);
  portafilter.rotation.z = Math.PI / 2;
  portafilter.position.set(0.24, 1.11, 0.05);
  const brewCup = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.04, 0.1, 12), matCeramic);
  brewCup.position.set(0.16, 0.94, 0.05);
  const cupStack = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.042, 0.1, 12), matCeramic);
  cupStack.position.set(-0.04, 1.36, -0.06);
  const powerLed = new THREE.Mesh(
    new THREE.SphereGeometry(0.02, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xf59e0b }),
  );
  powerLed.position.set(0.18, 1.22, 0.21);

  // Espresso steam wisps
  const espressoSteamParticles: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const ep = new THREE.Mesh(steamGeo, steamMat.clone());
    ep.position.set(0.16, 1.02 + i * 0.07, 0.05);
    coffeeStation.add(ep);
    espressoSteamParticles.push(ep);
  }

  coffeeStation.add(
    barCabinet,
    barTop,
    espressoBody,
    espressoRoof,
    dripTray,
    groupHead,
    portafilter,
    brewCup,
    cupStack,
    powerLed,
  );

  const coffeeHit = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 1.6, 1.15),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  coffeeHit.position.set(0.05, 0.8, 0);
  coffeeHit.userData.zone = 'coffee';
  coffeeStation.add(coffeeHit);
  clickTargets.push(coffeeHit);
  studioGroup.add(coffeeStation);

  // 6. Retro-Modern Arcade Console (Zone: arcade, left wall facing +X)
  const arcadeGroup = new THREE.Group();
  arcadeGroup.position.set(-3.16, 0, -2.18);

  const cabBase = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.82, 0.72), matDarkMetal);
  cabBase.position.y = 0.41;
  cabBase.castShadow = !isSoftwareGl;
  const cabUpper = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.92, 0.72), matDarkMetal);
  cabUpper.position.set(-0.07, 1.28, 0);
  cabUpper.castShadow = !isSoftwareGl;
  const cabMarqueeBox = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.24, 0.74), matDarkMetal);
  cabMarqueeBox.position.set(0.02, 1.84, 0);
  const marqueeFace = new THREE.Mesh(
    new THREE.PlaneGeometry(0.66, 0.18),
    new THREE.MeshBasicMaterial({ map: createMarqueeTexture() }),
  );
  marqueeFace.rotation.y = Math.PI / 2;
  marqueeFace.position.set(0.395, 1.84, 0);

  // Side accent stripes
  const sideStripeMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.25,
    roughness: 0.4,
  });
  const stripeFront = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.65, 0.03), sideStripeMat);
  stripeFront.position.set(0.25, 0.9, 0.365);
  const stripeBack = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.65, 0.03), sideStripeMat);
  stripeBack.position.set(0.25, 0.9, -0.365);

  // Animated Arcade CRT/OLED Screen
  const arcadeCanvas = document.createElement('canvas');
  arcadeCanvas.width = 256;
  arcadeCanvas.height = 224;
  const arcadeScreenCtx = arcadeCanvas.getContext('2d')!;
  drawArcadeScreen(arcadeScreenCtx, false, 0);
  const arcadeScreenTex = new THREE.CanvasTexture(arcadeCanvas);
  arcadeScreenTex.colorSpace = THREE.SRGBColorSpace;

  const arcadeScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.56, 0.48),
    new THREE.MeshBasicMaterial({ map: arcadeScreenTex }),
  );
  arcadeScreen.rotation.y = Math.PI / 2;
  arcadeScreen.rotation.z = 0.22; // Slight ergonomic tilt upward
  arcadeScreen.position.set(0.25, 1.38, 0);

  // Angled Control Deck + Joystick + Arcade Buttons
  const controlDeck = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.68), matSofa);
  controlDeck.position.set(0.28, 0.96, 0);
  controlDeck.rotation.z = -0.14;

  const stickShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.1, 8), matBrushedSteel);
  stickShaft.position.set(0.28, 1.04, -0.14);
  const stickBall = new THREE.Mesh(
    new THREE.SphereGeometry(0.036, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3 }),
  );
  stickBall.position.set(0.28, 1.1, -0.14);

  const btnColors = [0x06b6d4, 0xf59e0b, 0x22d3ee, 0xe2e8f0];
  btnColors.forEach((col, bi) => {
    const btn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.024, 0.02, 10),
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.35 }),
    );
    btn.position.set(
      0.26 + (bi % 2) * 0.07,
      1.01,
      0.06 + Math.floor(bi / 2) * 0.09,
    );
    arcadeGroup.add(btn);
  });

  // Coin door plate
  const coinDoor = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.32, 0.28), matBrushedSteel);
  coinDoor.position.set(0.38, 0.42, 0);

  arcadeGroup.add(
    cabBase,
    cabUpper,
    cabMarqueeBox,
    marqueeFace,
    stripeFront,
    stripeBack,
    arcadeScreen,
    controlDeck,
    stickShaft,
    stickBall,
    coinDoor,
  );

  const arcadeHit = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 2.0, 0.95),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  arcadeHit.position.set(0.05, 1.0, 0);
  arcadeHit.userData.zone = 'arcade';
  arcadeGroup.add(arcadeHit);
  clickTargets.push(arcadeHit);
  studioGroup.add(arcadeGroup);

  // 7. Storyboard & Trend Wall (Zone: storyboard)
  const storyboardGroup = new THREE.Group();
  storyboardGroup.position.set(-1.65, 0, -3.52);

  const credenza = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.52, 0.48), matWood);
  credenza.position.set(0, 0.26, 0.28);
  credenza.castShadow = !isSoftwareGl;
  storyboardGroup.add(credenza);

  const boardRail = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.35, 0.05), matDarkMetal);
  boardRail.position.set(0, 1.65, 0);
  storyboardGroup.add(boardRail);

  for (let i = 0; i < 4; i++) {
    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(0.44, 0.56),
      new THREE.MeshBasicMaterial({ map: createStoryboardTexture(i) }),
    );
    card.position.set(-0.74 + i * 0.49, 1.68 + (i % 2 === 0 ? 0.08 : -0.06), 0.032);
    storyboardGroup.add(card);
  }

  const storyHit = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 2.2, 1.0),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  storyHit.position.set(0, 1.1, 0.4);
  storyHit.userData.zone = 'storyboard';
  storyboardGroup.add(storyHit);
  clickTargets.push(storyHit);
  studioGroup.add(storyboardGroup);

  scene.add(studioGroup);

  // 8. Articulated AI Editor Sprite Character
  const sprite = buildEditorSprite(isSoftwareGl);
  sprite.root.position.set(-0.4, 0, 0.55);
  scene.add(sprite.root);

  const spriteHit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 1.35, 10),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  spriteHit.position.set(0, 0.68, 0);
  spriteHit.userData.zone = 'sprite';
  sprite.root.add(spriteHit);
  clickTargets.push(spriteHit);

  // 9. Articulated Studio Cat Companion (Pixel)
  const cat = buildStudioCat(isSoftwareGl);
  cat.root.position.set(-1.35, 0, 1.65);
  scene.add(cat.root);

  const catHit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.32, 0.68, 10),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  catHit.position.set(0, 0.34, 0);
  catHit.userData.zone = 'cat';
  cat.root.add(catHit);
  clickTargets.push(catHit);

  return {
    chairSwivel,
    monitorLeftTex,
    monitorRightTex,
    monitorLeftCtx,
    monitorRightCtx,
    arcadeScreenTex,
    arcadeScreenCtx,
    towerLedMat,
    steamParticles,
    espressoSteamParticles,
    plantLeaves,
    sprite,
    cat,
    clickTargets,
  };
}

function buildEditorSprite(isSoftwareGl: boolean): SpriteRefs {
  const root = new THREE.Group();

  const matSuit = new THREE.MeshStandardMaterial({
    color: 0x263142,
    roughness: 0.72,
    metalness: 0.12,
  });
  const matAccent = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.4,
    metalness: 0.2,
  });
  const matHeadShell = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.32,
    metalness: 0.25,
  });
  const matVisor = new THREE.MeshStandardMaterial({
    color: 0x0b0f17,
    roughness: 0.12,
    metalness: 0.65,
  });
  const matHeadphone = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.4,
    metalness: 0.6,
  });

  const contactShadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.28, 20),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    }),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.045;
  root.add(contactShadow);

  const bodyGroup = new THREE.Group();
  bodyGroup.position.y = 0.04;
  root.add(bodyGroup);

  const makeLeg = (x: number) => {
    const leg = new THREE.Group();
    leg.position.set(x, 0.34, 0);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.14, 6, 10), matSuit);
    thigh.position.y = -0.14;
    thigh.castShadow = !isSoftwareGl;
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.19), matHeadShell);
    shoe.position.set(0, -0.3, 0.03);
    leg.add(thigh, shoe);
    return leg;
  };
  const leftLeg = makeLeg(-0.11);
  const rightLeg = makeLeg(0.11);
  bodyGroup.add(leftLeg, rightLeg);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.22, 8, 14), matSuit);
  torso.position.y = 0.56;
  torso.castShadow = !isSoftwareGl;
  const chestBadge = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.03), matAccent);
  chestBadge.position.set(0, 0.61, 0.19);
  bodyGroup.add(torso, chestBadge);

  const makeArm = (x: number) => {
    const arm = new THREE.Group();
    arm.position.set(x, 0.68, 0);
    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.18, 6, 10), matSuit);
    sleeve.position.y = -0.13;
    sleeve.castShadow = !isSoftwareGl;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 10), matHeadShell);
    hand.position.y = -0.26;
    arm.add(sleeve, hand);
    return arm;
  };
  const leftArm = makeArm(-0.24);
  const rightArm = makeArm(0.24);

  // Held ceramic coffee mug attached to right hand (visible only when drinking coffee)
  const heldMug = new THREE.Group();
  heldMug.position.set(0, -0.3, 0.06);
  const heldCupBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.048, 0.04, 0.1, 12),
    new THREE.MeshStandardMaterial({ color: 0xf3f4f6, roughness: 0.3 }),
  );
  const heldCoffeeTop = new THREE.Mesh(
    new THREE.CircleGeometry(0.042, 12),
    new THREE.MeshBasicMaterial({ color: 0x4b2e1e }),
  );
  heldCoffeeTop.rotation.x = -Math.PI / 2;
  heldCoffeeTop.position.y = 0.048;
  heldMug.add(heldCupBody, heldCoffeeTop);
  heldMug.visible = false;
  rightArm.add(heldMug);

  bodyGroup.add(leftArm, rightArm);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.94, 0);
  const cranium = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.36), matHeadShell);
  cranium.castShadow = !isSoftwareGl;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.04), matVisor);
  visor.position.set(0, -0.01, 0.175);

  const eyeLeftMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
  const eyeRightMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.055, 0.02), eyeLeftMat);
  eyeL.position.set(-0.08, 0, 0.195);
  const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.055, 0.02), eyeRightMat);
  eyeR.position.set(0.08, 0, 0.195);

  const headband = new THREE.Mesh(
    new THREE.TorusGeometry(0.23, 0.025, 8, 20, Math.PI),
    matHeadphone,
  );
  headband.position.y = 0.02;
  const cupL = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 14), matAccent);
  cupL.rotation.z = Math.PI / 2;
  cupL.position.set(-0.23, -0.01, 0);
  const cupR = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 14), matAccent);
  cupR.rotation.z = Math.PI / 2;
  cupR.position.set(0.23, -0.01, 0);

  const visorLightMat = new THREE.MeshStandardMaterial({
    color: 0x06b6d4,
    emissive: 0x06b6d4,
    emissiveIntensity: 0.7,
  });
  const antennaBeacon = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.03), visorLightMat);
  antennaBeacon.position.set(0, 0.185, 0);

  headGroup.add(cranium, visor, eyeL, eyeR, headband, cupL, cupR, antennaBeacon);
  bodyGroup.add(headGroup);

  return {
    root,
    bodyGroup,
    headGroup,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    heldMug,
    eyeLeftMat,
    eyeRightMat,
    visorLightMat,
  };
}

function buildStudioCat(isSoftwareGl: boolean): CatRefs {
  const root = new THREE.Group();

  const matFur = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.78,
    metalness: 0.04,
  });
  const matCream = new THREE.MeshStandardMaterial({
    color: 0xf5ebe0,
    roughness: 0.8,
    metalness: 0.02,
  });
  const matEarInner = new THREE.MeshStandardMaterial({
    color: 0xe5989b,
    roughness: 0.8,
    metalness: 0.02,
  });
  const matCollar = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.45,
    metalness: 0.3,
  });
  const matTag = new THREE.MeshStandardMaterial({
    color: 0x22d3ee,
    emissive: 0x06b6d4,
    emissiveIntensity: 0.45,
    roughness: 0.3,
  });
  const matNose = new THREE.MeshBasicMaterial({ color: 0x334155 });

  const contactShadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.2, 16),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    }),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.045;
  root.add(contactShadow);

  const bodyGroup = new THREE.Group();
  bodyGroup.position.y = 0.04;
  root.add(bodyGroup);

  // Horizontal torso oriented along +Z
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.115, 0.24, 8, 12), matFur);
  torso.rotation.x = Math.PI / 2;
  torso.position.set(0, 0.22, 0);
  torso.castShadow = !isSoftwareGl;
  bodyGroup.add(torso);

  const chestPatch = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 10), matCream);
  chestPatch.scale.set(0.95, 1.0, 0.7);
  chestPatch.position.set(0, 0.21, 0.14);
  bodyGroup.add(chestPatch);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.016, 6, 16), matCollar);
  collar.rotation.x = Math.PI / 2.3;
  collar.position.set(0, 0.29, 0.14);
  const tag = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), matTag);
  tag.position.set(0, 0.24, 0.23);
  bodyGroup.add(collar, tag);

  // 4 articulated legs with cream paws
  const makeCatLeg = (x: number, z: number) => {
    const leg = new THREE.Group();
    leg.position.set(x, 0.17, z);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.09, 6, 8), matFur);
    upper.position.y = -0.075;
    upper.castShadow = !isSoftwareGl;
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 8), matCream);
    paw.scale.set(1, 0.72, 1.2);
    paw.position.set(0, -0.145, 0.012);
    leg.add(upper, paw);
    return leg;
  };
  const frontLeftLeg = makeCatLeg(-0.07, 0.12);
  const frontRightLeg = makeCatLeg(0.07, 0.12);
  const backLeftLeg = makeCatLeg(-0.07, -0.12);
  const backRightLeg = makeCatLeg(0.07, -0.12);
  bodyGroup.add(frontLeftLeg, frontRightLeg, backLeftLeg, backRightLeg);

  // Articulated curved tail
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, 0.25, -0.18);
  const tailSeg1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.026, 0.16, 6, 8), matFur);
  tailSeg1.position.set(0, 0.08, -0.06);
  tailSeg1.rotation.x = -0.6;
  const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), matCream);
  tailTip.position.set(0, 0.17, -0.11);
  tailGroup.add(tailSeg1, tailTip);
  bodyGroup.add(tailGroup);

  // Head + ears + blinking eyes
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.36, 0.18);

  const cranium = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.19), matFur);
  cranium.castShadow = !isSoftwareGl;
  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.065, 0.06), matCream);
  muzzle.position.set(0, -0.04, 0.095);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 6), matNose);
  nose.position.set(0, -0.022, 0.125);

  const makeEar = (x: number, rotZ: number) => {
    const ear = new THREE.Group();
    ear.position.set(x, 0.11, 0.01);
    ear.rotation.z = rotZ;
    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.048, 0.095, 4), matFur);
    outer.rotation.y = Math.PI / 4;
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.06, 4), matEarInner);
    inner.rotation.y = Math.PI / 4;
    inner.position.set(0, -0.005, 0.016);
    ear.add(outer, inner);
    return ear;
  };
  const earL = makeEar(-0.072, 0.16);
  const earR = makeEar(0.072, -0.16);

  const eyeLeftMat = new THREE.MeshBasicMaterial({ color: 0xfde68a });
  const eyeRightMat = new THREE.MeshBasicMaterial({ color: 0xfde68a });
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.038, 0.015), eyeLeftMat);
  eyeL.position.set(-0.05, 0.01, 0.096);
  const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.038, 0.015), eyeRightMat);
  eyeR.position.set(0.05, 0.01, 0.096);

  const pupilL = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.028, 0.016), matNose);
  pupilL.position.set(-0.05, 0.01, 0.098);
  const pupilR = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.028, 0.016), matNose);
  pupilR.position.set(0.05, 0.01, 0.098);

  headGroup.add(cranium, muzzle, nose, earL, earR, eyeL, eyeR, pupilL, pupilR);
  bodyGroup.add(headGroup);

  return {
    root,
    bodyGroup,
    headGroup,
    tailGroup,
    frontLeftLeg,
    frontRightLeg,
    backLeftLeg,
    backRightLeg,
    eyeLeftMat,
    eyeRightMat,
  };
}
