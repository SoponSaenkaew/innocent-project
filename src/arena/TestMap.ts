import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

export interface DynamicPhysicsObject {
  mesh: THREE.Mesh | THREE.Group;
  body: RAPIER.RigidBody;
  initialPos: THREE.Vector3;
  initialRot: THREE.Quaternion;
}

export class TestMap {
  private scene: THREE.Scene;
  private world: RAPIER.World;
  public mapGroup = new THREE.Group();
  public dynamicObjects: DynamicPhysicsObject[] = [];

  constructor(scene: THREE.Scene, world: RAPIER.World) {
    this.scene = scene;
    this.world = world;
    this.scene.add(this.mapGroup);
    this.buildMap();
  }

  public setVisible(visible: boolean): void {
    this.mapGroup.visible = visible;
  }

  /**
   * Generates a natural offroad dirt/gravel test ground texture with subtle range grid markings.
   * Completely replaces the black asphalt tarmac with an authentic military proving ground surface.
   */
  private createOffroadTerrainTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // 1. Warm earthy proving ground base (dirt/gravel)
    ctx.fillStyle = '#2d2922';
    ctx.fillRect(0, 0, 512, 512);

    // 2. Procedural gravel & dirt speckle noise
    for (let i = 0; i < 2800; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const r = Math.random() * 1.8 + 0.5;
      const val = Math.floor(Math.random() * 25 + 38);
      ctx.fillStyle = `rgb(${val + 10}, ${val + 5}, ${val})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Subtle range coordinates grid
    ctx.strokeStyle = '#3d372e';
    ctx.lineWidth = 1.5;
    for (let i = 0; i <= 512; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }

    // 4. Major sector demarcation lines
    ctx.strokeStyle = '#4e463a';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, 512, 512);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(64, 64);
    tex.anisotropy = 8;
    return tex;
  }

  public addStaticBox(
    size: THREE.Vector3,
    pos: THREE.Vector3,
    rotEuler: THREE.Euler,
    color: number,
    friction = 0.85,
    restitution = 0.05
  ): THREE.Mesh {
    const quat = new THREE.Quaternion().setFromEuler(rotEuler);

    const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.8,
      metalness: 0.15,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.quaternion.copy(quat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.mapGroup.add(mesh);

    // Dark edge highlights for architectural facet definition
    const edgeGeo = new THREE.EdgesGeometry(geo);
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x181410,
      transparent: true,
      opacity: 0.45,
    });
    mesh.add(new THREE.LineSegments(edgeGeo, edgeMat));

    const bodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
    const body = this.world.createRigidBody(bodyDesc);

    const colDesc = RAPIER.ColliderDesc.cuboid(size.x * 0.5, size.y * 0.5, size.z * 0.5)
      .setFriction(friction)
      .setRestitution(restitution);
    this.world.createCollider(colDesc, body);

    return mesh;
  }

  /**
   * Adds a rounded sinusoidal bump / washboard crest
   */
  public addSinusoidalBump(
    width: number,
    radius: number,
    xPos: number,
    zPos: number,
    color = 0x854d0e,
    friction = 0.95
  ): THREE.Mesh {
    const geo = new THREE.CylinderGeometry(radius, radius, width, 24);
    geo.rotateZ(Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.75,
      metalness: 0.2,
    });
    const mesh = new THREE.Mesh(geo, mat);
    // Embedded slightly so the arc meets ground seamlessly
    const yPos = 0.02;
    mesh.position.set(xPos, yPos, zPos);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.mapGroup.add(mesh);

    const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    const bodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(xPos, yPos, zPos)
      .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
    const body = this.world.createRigidBody(bodyDesc);

    const colDesc = RAPIER.ColliderDesc.cylinder(width * 0.5, radius).setFriction(friction);
    this.world.createCollider(colDesc, body);

    return mesh;
  }

  /**
   * Adds transverse timber logs (Corduroy road obstacles)
   */
  public addTimberLog(
    length: number,
    radius: number,
    pos: THREE.Vector3,
    rotY = 0,
    color = 0x713f12
  ): void {
    const geo = new THREE.CylinderGeometry(radius, radius, length, 16);
    geo.rotateZ(Math.PI / 2);
    geo.rotateY(rotY);

    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.85,
      metalness: 0.1,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.mapGroup.add(mesh);

    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, Math.PI / 2));
    const bodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
    const body = this.world.createRigidBody(bodyDesc);

    const colDesc = RAPIER.ColliderDesc.cylinder(length * 0.5, radius).setFriction(0.95);
    this.world.createCollider(colDesc, body);
  }

  /**
   * Adds an irregular rock boulder for rock-crawling
   */
  public addBoulder(
    size: THREE.Vector3,
    pos: THREE.Vector3,
    rotEuler: THREE.Euler,
    color = 0x57534e
  ): void {
    const geo = new THREE.DodecahedronGeometry(size.x * 0.5, 0);
    geo.scale(1, size.y / size.x, size.z / size.x);

    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.9,
      metalness: 0.1,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.rotation.copy(rotEuler);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.mapGroup.add(mesh);

    const quat = new THREE.Quaternion().setFromEuler(rotEuler);
    const bodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
    const body = this.world.createRigidBody(bodyDesc);

    const colDesc = RAPIER.ColliderDesc.cuboid(size.x * 0.45, size.y * 0.45, size.z * 0.45).setFriction(0.95);
    this.world.createCollider(colDesc, body);
  }

  /**
   * Adds a side-camber embankment (road tilted sideways along roll axis)
   */
  public addSideCamberRoad(
    width: number,
    length: number,
    angleDeg: number,
    pos: THREE.Vector3,
    color = 0x44403c
  ): void {
    const rollRad = THREE.MathUtils.degToRad(angleDeg);
    const slabT = 0.8;
    const yCenter = pos.y + (width * 0.5) * Math.sin(Math.abs(rollRad));

    this.addStaticBox(
      new THREE.Vector3(width, slabT, length),
      new THREE.Vector3(pos.x, yCenter, pos.z),
      new THREE.Euler(0, 0, rollRad),
      color,
      0.95
    );

    // Retaining embankment edge curb
    const curbW = 0.5;
    const curbH = 0.6;
    const curbX = pos.x - (width * 0.5) * Math.cos(rollRad);
    this.addStaticBox(
      new THREE.Vector3(curbW, curbH, length),
      new THREE.Vector3(curbX, yCenter + 0.3, pos.z),
      new THREE.Euler(0, 0, rollRad),
      0xd97706,
      0.9
    );
  }

  private addRampWithPlateau(
    xPos: number,
    zStart: number,
    angleDeg: number,
    rampLen: number,
    plateauLen: number,
    width: number,
    rampColor: number,
    plateauColor: number,
    hasDescent = true
  ): void {
    const theta = THREE.MathUtils.degToRad(angleDeg);
    const T = 0.8;
    const H = rampLen * Math.sin(theta);
    const zRun = rampLen * Math.cos(theta);

    // 1. Ascent Ramp
    const ascentYc = (rampLen / 2) * Math.sin(theta) - (T / 2) * Math.cos(theta);
    const ascentZc = zStart + (rampLen / 2) * Math.cos(theta) + (T / 2) * Math.sin(theta);

    this.addStaticBox(
      new THREE.Vector3(width, T, rampLen),
      new THREE.Vector3(xPos, ascentYc, ascentZc),
      new THREE.Euler(-theta, 0, 0),
      rampColor,
      0.95
    );

    // 2. Plateau Summit
    const plateauZStart = zStart + zRun;
    const plateauZEnd = plateauZStart + plateauLen;
    const plateauZc = plateauZStart + plateauLen * 0.5;
    const plateauThickness = H + 0.6;
    const plateauYc = H - plateauThickness * 0.5;

    this.addStaticBox(
      new THREE.Vector3(width, plateauThickness, plateauLen),
      new THREE.Vector3(xPos, plateauYc, plateauZc),
      new THREE.Euler(0, 0, 0),
      plateauColor,
      0.95
    );

    // 3. Descent Ramp
    if (hasDescent) {
      const descentYc = H - (rampLen / 2) * Math.sin(theta) - (T / 2) * Math.cos(theta);
      const descentZc = plateauZEnd + (rampLen / 2) * Math.cos(theta) - (T / 2) * Math.sin(theta);

      this.addStaticBox(
        new THREE.Vector3(width, T, rampLen),
        new THREE.Vector3(xPos, descentYc, descentZc),
        new THREE.Euler(theta, 0, 0),
        rampColor,
        0.95
      );
    }

    // Safety Curbs on Plateau
    const curbW = 0.40;
    const curbH = 0.45;
    const curbColor = 0xf59e0b;
    const curbLeftX = xPos + width * 0.5 - curbW * 0.5;
    const curbRightX = xPos - width * 0.5 + curbW * 0.5;
    const curbYc = H + curbH * 0.5;

    this.addStaticBox(new THREE.Vector3(curbW, curbH, plateauLen), new THREE.Vector3(curbLeftX, curbYc, plateauZc), new THREE.Euler(0, 0, 0), curbColor, 0.9);
    this.addStaticBox(new THREE.Vector3(curbW, curbH, plateauLen), new THREE.Vector3(curbRightX, curbYc, plateauZc), new THREE.Euler(0, 0, 0), curbColor, 0.9);
  }

  public addDynamicCrate(
    size: THREE.Vector3,
    pos: THREE.Vector3,
    color = 0xd97706,
    mass = 120
  ): DynamicPhysicsObject {
    const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.65,
      metalness: 0.25,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.mapGroup.add(mesh);

    const edgeGeo = new THREE.EdgesGeometry(geo);
    mesh.add(new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.6 })));

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setLinearDamping(0.4)
      .setAngularDamping(0.6);
    const body = this.world.createRigidBody(bodyDesc);

    const colDesc = RAPIER.ColliderDesc.cuboid(size.x * 0.5, size.y * 0.5, size.z * 0.5)
      .setDensity(mass / (size.x * size.y * size.z))
      .setFriction(0.8)
      .setRestitution(0.15);
    this.world.createCollider(colDesc, body);

    const obj: DynamicPhysicsObject = {
      mesh,
      body,
      initialPos: pos.clone(),
      initialRot: new THREE.Quaternion().identity(),
    };
    this.dynamicObjects.push(obj);
    return obj;
  }

  public addDynamicBarrel(
    radius: number,
    height: number,
    pos: THREE.Vector3,
    color = 0xef4444,
    mass = 85
  ): DynamicPhysicsObject {
    const geo = new THREE.CylinderGeometry(radius, radius, height, 18);
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.45,
      metalness: 0.4,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.mapGroup.add(mesh);

    // Hazard rim rings
    const ringGeo = new THREE.TorusGeometry(radius * 1.01, 0.02, 8, 24);
    ringGeo.rotateX(Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    const ringTop = new THREE.Mesh(ringGeo, ringMat);
    ringTop.position.y = height * 0.35;
    mesh.add(ringTop);
    const ringBtm = new THREE.Mesh(ringGeo, ringMat);
    ringBtm.position.y = -height * 0.35;
    mesh.add(ringBtm);

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setLinearDamping(0.35)
      .setAngularDamping(0.5);
    const body = this.world.createRigidBody(bodyDesc);

    const colDesc = RAPIER.ColliderDesc.cylinder(height * 0.5, radius)
      .setDensity(mass / (Math.PI * radius * radius * height))
      .setFriction(0.85)
      .setRestitution(0.2);
    this.world.createCollider(colDesc, body);

    const obj: DynamicPhysicsObject = {
      mesh,
      body,
      initialPos: pos.clone(),
      initialRot: new THREE.Quaternion().identity(),
    };
    this.dynamicObjects.push(obj);
    return obj;
  }

  public addTargetStand(pos: THREE.Vector3, labelText: string): void {
    const targetW = 1.4;
    const targetH = 2.0;
    const targetD = 0.12;

    this.addStaticBox(
      new THREE.Vector3(targetW * 1.2, 0.25, 0.8),
      new THREE.Vector3(pos.x, 0.125, pos.z),
      new THREE.Euler(0, 0, 0),
      0x1e293b
    );

    const geo = new THREE.BoxGeometry(targetW, targetH, targetD);
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(128, 128, 110, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(128, 128, 75, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(128, 128, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(labelText, 128, 235);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.2 });
    const mesh = new THREE.Mesh(geo, mat);
    const targetY = 0.25 + targetH * 0.5;
    mesh.position.set(pos.x, targetY, pos.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.mapGroup.add(mesh);

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, targetY, pos.z)
      .setLinearDamping(0.3)
      .setAngularDamping(0.5);
    const body = this.world.createRigidBody(bodyDesc);

    const colDesc = RAPIER.ColliderDesc.cuboid(targetW * 0.5, targetH * 0.5, targetD * 0.5)
      .setDensity(60 / (targetW * targetH * targetD))
      .setFriction(0.8);
    this.world.createCollider(colDesc, body);

    this.dynamicObjects.push({
      mesh,
      body,
      initialPos: new THREE.Vector3(pos.x, targetY, pos.z),
      initialRot: new THREE.Quaternion().identity(),
    });
  }

  private addZoneBanner(pos: THREE.Vector3, text: string, subText: string, color = 0xf59e0b): void {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 160;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(0, 0, 512, 160);
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 504, 152);
    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, 256, 60);
    ctx.fillStyle = '#38e578';
    ctx.font = '26px monospace';
    ctx.fillText(subText, 256, 120);

    const tex = new THREE.CanvasTexture(canvas);
    const geo = new THREE.PlaneGeometry(10, 3.2);
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos.x, pos.y + 4.0, pos.z);
    this.mapGroup.add(mesh);

    // Support posts
    this.addStaticBox(new THREE.Vector3(0.4, 5.5, 0.4), new THREE.Vector3(pos.x - 4.8, 2.75, pos.z), new THREE.Euler(0, 0, 0), 0x292524);
    this.addStaticBox(new THREE.Vector3(0.4, 5.5, 0.4), new THREE.Vector3(pos.x + 4.8, 2.75, pos.z), new THREE.Euler(0, 0, 0), 0x292524);
  }

  private buildMap(): void {
    // Proving Ground Dimensions: 320m x 320m
    const mapSize = 320;

    // 1. Natural Dirt / Gravel Proving Ground (No black asphalt!)
    const floorGeo = new THREE.BoxGeometry(mapSize, 2, mapSize);
    const floorMat = new THREE.MeshStandardMaterial({
      map: this.createOffroadTerrainTexture(),
      roughness: 0.88,
      metalness: 0.1,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.y = -1;
    floorMesh.receiveShadow = true;
    this.mapGroup.add(floorMesh);

    const floorBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, -1, 0);
    const floorBody = this.world.createRigidBody(floorBodyDesc);
    const floorCollider = RAPIER.ColliderDesc.cuboid(mapSize * 0.5, 1, mapSize * 0.5).setFriction(0.92);
    this.world.createCollider(floorCollider, floorBody);

    // 2. Perimeter Boundary Berms (Height 3.5m)
    const wallThickness = 2.5;
    const wallHeight = 3.5;
    const wallColor = 0x292524;
    const half = mapSize * 0.5;

    this.addStaticBox(new THREE.Vector3(mapSize, wallHeight, wallThickness), new THREE.Vector3(0, wallHeight * 0.5, half), new THREE.Euler(0, 0, 0), wallColor);
    this.addStaticBox(new THREE.Vector3(mapSize, wallHeight, wallThickness), new THREE.Vector3(0, wallHeight * 0.5, -half), new THREE.Euler(0, 0, 0), wallColor);
    this.addStaticBox(new THREE.Vector3(wallThickness, wallHeight, mapSize), new THREE.Vector3(half, wallHeight * 0.5, 0), new THREE.Euler(0, 0, 0), wallColor);
    this.addStaticBox(new THREE.Vector3(wallThickness, wallHeight, mapSize), new THREE.Vector3(-half, wallHeight * 0.5, 0), new THREE.Euler(0, 0, 0), wallColor);

    // 3. Central Staging Pad (X: 0, Z: 0)
    // Authentic solid military concrete apron with amber borders (no ugly wireframe slicing through scene)
    const padW = 16;
    const padD = 16;
    const padGeo = new THREE.BoxGeometry(padW, 0.04, padD);
    const padMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.72,
      metalness: 0.18,
    });
    const padMesh = new THREE.Mesh(padGeo, padMat);
    padMesh.position.set(0, 0.02, 0);
    padMesh.receiveShadow = true;
    this.mapGroup.add(padMesh);

    const padEdgeGeo = new THREE.EdgesGeometry(padGeo);
    const padEdgeMat = new THREE.LineBasicMaterial({ color: 0xd97706 });
    padMesh.add(new THREE.LineSegments(padEdgeGeo, padEdgeMat));

    // =========================================================================
    // ZONE 1 (NORTH: Z = 15 to 145): ADVANCED SUSPENSION & CORRUGATION CORRIDOR
    // (Replaced the black runway with 3 distinct suspension proving lanes!)
    // =========================================================================
    this.addZoneBanner(new THREE.Vector3(0, 0, 16), '⚡ SUSPENSION PROVING CORRIDOR', 'L-MOGULS | C-WASHBOARD & WAVES | R-TIMBER LOGS');

    // LANE A (LEFT: X = -16, Z = 25..140): Staggered Moguls (ลูกระนาดสลับซ้าย-ขวา)
    // Alternate bumps on left and right track to force suspension articulation with clear center belly channel
    for (let i = 0; i < 30; i++) {
      const zPos = 25 + i * 2.8;
      const isLeftTrack = i % 2 === 0;
      // Bumps width 1.6m placed under left or right track, leaving a 0.8m center clearance for belly
      const bumpX = isLeftTrack ? -16 - 1.2 : -16 + 1.2;
      const bumpRadius = 0.12 + (i % 3) * 0.025; // 12cm to 17cm smooth rounded moguls
      this.addSinusoidalBump(1.6, bumpRadius, bumpX, zPos, isLeftTrack ? 0xd97706 : 0xb45309, 0.95);
    }

    // LANE B (CENTER: X = 0, Z = 25..140):
    // Part B1: Washboard Corrugations (ลูกระนาดความถี่สูง 24 ลูก ทดสอบการสั่นสะเทือน)
    for (let i = 0; i < 24; i++) {
      const zPos = 25 + i * 1.3;
      const radius = 0.07 + (i % 2) * 0.02; // 7cm to 9cm high-frequency ripples
      this.addSinusoidalBump(10, radius, 0, zPos, 0x854d0e, 0.95);
    }

    // Part B2: Large Rolling Camelback Whoops (ลูกระนาดคลื่นอูฐใหญ่ต่อเนื่อง 12 ลูก)
    for (let i = 0; i < 12; i++) {
      const zPos = 58 + i * 3.4;
      const radius = 0.15 + (i % 3) * 0.03; // 15cm to 21cm smooth rolling waves
      this.addSinusoidalBump(10, radius, 0, zPos, i % 2 === 0 ? 0xca8a04 : 0xa16207, 0.95);
    }

    // Part B3: High Breakover Ridge Crest (สันคันดินทดสอบท้องรถ)
    const ridgeH = 0.55;
    const ridgeLen = 5.0;
    this.addStaticBox(new THREE.Vector3(10, 0.6, ridgeLen), new THREE.Vector3(0, ridgeH * 0.5, 102), new THREE.Euler(-Math.atan2(ridgeH, ridgeLen), 0, 0), 0xd97706);
    this.addStaticBox(new THREE.Vector3(10, 0.6, 1.5), new THREE.Vector3(0, ridgeH, 104.5), new THREE.Euler(0, 0, 0), 0xb45309);
    this.addStaticBox(new THREE.Vector3(10, 0.6, ridgeLen), new THREE.Vector3(0, ridgeH * 0.5, 107), new THREE.Euler(Math.atan2(ridgeH, ridgeLen), 0, 0), 0xd97706);

    // LANE C (RIGHT: X = +16, Z = 25..140): Corduroy Timber Log Highway (ถนนท่อนซุงขวางทาง)
    // Closely spaced timber logs half-buried in ground: tracks rumble smoothly across multiple logs at once!
    for (let i = 0; i < 60; i++) {
      const zPos = 25 + i * 1.1; // 1.1m spacing: a 3m tank is supported on 3 logs at all times!
      const logRadius = 0.11 + (i % 4) * 0.02; // 11cm to 17cm log radius
      const skewAngle = (i % 3 - 1) * 0.04;
      this.addTimberLog(9.0, logRadius, new THREE.Vector3(16, 0.02, zPos), skewAngle, i % 2 === 0 ? 0x78350f : 0x92400e);
    }

    // =========================================================================
    // ZONE 2 (EAST: X = 45 to 140): POWERTRAIN & GRADEABILITY CHALLENGE PARK
    // (4 gradient slopes from 10° to 35° + 3-tier staircase + skyway overpass)
    // =========================================================================
    this.addZoneBanner(new THREE.Vector3(80, 0, -42), '🏔️ POWERTRAIN & HILL-CLIMB PARK', '10° CRUISE | 20° HILL | 30° STEEP | 35° CLIFF | 3-TIER STEPS');

    // Lane 1: 10° Gentle Cruise Slope (Blue: Tests high-gear momentum)
    this.addRampWithPlateau(52, -35, 10, 26, 12, 9, 0x1d4ed8, 0x1e40af, true);

    // Lane 2: 20° Standard Hill-Climb (Amber: Tests mid-gear auto shift)
    this.addRampWithPlateau(65, -30, 20, 18, 12, 9, 0xd97706, 0xb45309, true);

    // Lane 3: 30° Extreme Steep Wall (Crimson: Tests Gear 1 low-end torque)
    this.addRampWithPlateau(78, -25, 30, 15, 10, 9, 0xb91c1c, 0x991b1b, true);

    // Lane 4: 35° Ultimate Cliff Ascent (Hazard Gold: Tests maximum crawler torque & adhesion)
    this.addRampWithPlateau(91, -22, 35, 14, 10, 9, 0xeab308, 0xca8a04, true);

    // Lane 5: 3-Tier Stepped Staircase (X: 104, Z: -25..15)
    // Step heights: 0.25m, 0.45m, 0.65m
    const stepW = 9;
    const stepL = 7;
    this.addStaticBox(new THREE.Vector3(stepW, 0.25, stepL), new THREE.Vector3(104, 0.25 * 0.5, -20), new THREE.Euler(0, 0, 0), 0x57534e);
    this.addStaticBox(new THREE.Vector3(stepW, 0.50, stepL), new THREE.Vector3(104, 0.50 * 0.5, -13), new THREE.Euler(0, 0, 0), 0x44403c);
    this.addStaticBox(new THREE.Vector3(stepW, 0.75, stepL), new THREE.Vector3(104, 0.75 * 0.5, -6), new THREE.Euler(0, 0, 0), 0x292524);

    // Skyway Overpass Bridge spanning across (X: 122, Z: -20..35)
    const bridgeH = 4.8;
    const bridgeW = 8.5;
    this.addStaticBox(new THREE.Vector3(bridgeW, 0.8, 16), new THREE.Vector3(122, bridgeH * 0.5, -28), new THREE.Euler(-Math.atan2(bridgeH, 16), 0, 0), 0x44403c);
    this.addStaticBox(new THREE.Vector3(bridgeW, 0.8, 35), new THREE.Vector3(122, bridgeH, 0), new THREE.Euler(0, 0, 0), 0x292524);
    this.addStaticBox(new THREE.Vector3(bridgeW, 0.8, 16), new THREE.Vector3(122, bridgeH * 0.5, 28), new THREE.Euler(Math.atan2(bridgeH, 16), 0, 0), 0x44403c);

    // =========================================================================
    // ZONE 3 (WEST: X = -45 to -140): SIDE-SLOPE CAMBER & MOBILITY PROVING
    // (Side-tilt rollover tests, rock-crawling boulder field & anti-tank trench)
    // =========================================================================
    this.addZoneBanner(new THREE.Vector3(-80, 0, -42), '🛡️ MOBILITY & ROCK CRAWLING', 'SIDE-CAMBER 18°/24° | ROCK GARDEN | ANTI-TANK TRENCH');

    // 1. Side-Slope Camber Roads (ทางลาดเอียงข้าง 18° และ 24°)
    // Vehicles drive laterally along contour to test side-slip, track adhesion & rollover center of gravity!
    this.addSideCamberRoad(8.0, 50, 18, new THREE.Vector3(-55, 0, 0), 0x44403c);
    this.addSideCamberRoad(7.5, 45, -24, new THREE.Vector3(-72, 0, 0), 0x292524);

    // 2. Rock-Crawling Boulder Field (ดงหินภูเขาขรุขระ 28 ก้อน)
    // Staggered rocks of varying sizes and rotations to test road wheel articulation & ground clearance!
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 4; col++) {
        const bx = -90 - col * 6.5 + (row % 2) * 2.5;
        const bz = -28 + row * 8.5;
        const sizeX = 1.2 + Math.random() * 0.8;
        const sizeY = 0.45 + (row % 3) * 0.15; // 45cm to 75cm rock heights
        const sizeZ = 1.2 + Math.random() * 0.8;
        const rotY = Math.random() * Math.PI;
        const rotZ = (Math.random() - 0.5) * 0.25;
        this.addBoulder(
          new THREE.Vector3(sizeX, sizeY, sizeZ),
          new THREE.Vector3(bx, sizeY * 0.45, bz),
          new THREE.Euler(0, rotY, rotZ),
          col % 2 === 0 ? 0x57534e : 0x44403c
        );
      }
    }

    // 3. Anti-Tank Trench Crossing (X: -125, Z: -25..25)
    // 2.8m ditch width to test track bridge length!
    const ditchW = 2.8;
    const ditchDepth = 1.4;
    const ditchLen = 42;
    this.addStaticBox(new THREE.Vector3(4, ditchDepth, ditchLen), new THREE.Vector3(-125 - ditchW * 0.5 - 2, ditchDepth * 0.5, 0), new THREE.Euler(0, 0, 0), 0x292524);
    this.addStaticBox(new THREE.Vector3(4, ditchDepth, ditchLen), new THREE.Vector3(-125 + ditchW * 0.5 + 2, ditchDepth * 0.5, 0), new THREE.Euler(0, 0, 0), 0x292524);

    // Trench hazard markers
    for (let z = -18; z <= 18; z += 6) {
      const markGeo = new THREE.PlaneGeometry(0.6, 3);
      const markMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
      const markL = new THREE.Mesh(markGeo, markMat);
      markL.rotation.x = -Math.PI / 2;
      markL.position.set(-125 - ditchW * 0.5 - 0.4, ditchDepth + 0.02, z);
      this.mapGroup.add(markL);
      const markR = new THREE.Mesh(markGeo, markMat);
      markR.rotation.x = -Math.PI / 2;
      markR.position.set(-125 + ditchW * 0.5 + 0.4, ditchDepth + 0.02, z);
      this.mapGroup.add(markR);
    }

    // =========================================================================
    // ZONE 4 (SOUTH: Z = -20 to -145): LOW-FRICTION MUD BASIN & DEMOLITION
    // (Slippery mud slough + destructible dynamic physics crates, barrels & targets)
    // =========================================================================
    this.addZoneBanner(new THREE.Vector3(0, 0, -20), '💥 MUD SLOUGH & DEMOLITION RANGE', 'LOW-FRICTION SLIPPERY MUD (0.28) | TARGET PRACTICE | CRATES');

    // 1. Slippery Mud Slough Basin (X: -25 to +25, Z: -28 to -55)
    // Low friction (0.28) wet mud basin where tracks slip, spin, and test differential drive power!
    const mudW = 46;
    const mudLen = 28;
    const mudGeo = new THREE.PlaneGeometry(mudW, mudLen);
    const mudMat = new THREE.MeshStandardMaterial({
      color: 0x1c1917, // wet dark swamp/mud earth
      roughness: 0.4,
      metalness: 0.3,
    });
    const mudMesh = new THREE.Mesh(mudGeo, mudMat);
    mudMesh.rotation.x = -Math.PI / 2;
    mudMesh.position.set(0, 0.015, -42);
    this.mapGroup.add(mudMesh);

    // Mud physics collider with slippery 0.28 friction
    const mudBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0.01, -42);
    const mudBody = this.world.createRigidBody(mudBodyDesc);
    const mudCollider = RAPIER.ColliderDesc.cuboid(mudW * 0.5, 0.02, mudLen * 0.5).setFriction(0.28);
    this.world.createCollider(mudCollider, mudBody);

    // 2. Destructible / Blastable Dynamic Crates
    this.buildCratePyramid(new THREE.Vector3(0, 0, -68), 3);
    this.buildCratePyramid(new THREE.Vector3(-16, 0, -96), 3);
    this.buildCratePyramid(new THREE.Vector3(16, 0, -96), 3);

    // 3. Cluster of Explosive Fuel Drums (Z: -82, X: 0)
    for (let rx = -2; rx <= 2; rx++) {
      for (let rz = -2; rz <= 2; rz++) {
        const barrelPos = new THREE.Vector3(rx * 1.1, 0.5, -82 + rz * 1.1);
        this.addDynamicBarrel(0.38, 0.95, barrelPos, 0xef4444, 85);
      }
    }

    // 4. Knockdown Silhouette Targets at 45m, 80m, 120m
    this.addTargetStand(new THREE.Vector3(-8, 0, -56), '45m TARGET');
    this.addTargetStand(new THREE.Vector3(8, 0, -56), '45m TARGET');
    this.addTargetStand(new THREE.Vector3(-10, 0, -92), '80m TARGET');
    this.addTargetStand(new THREE.Vector3(10, 0, -92), '80m TARGET');
    this.addTargetStand(new THREE.Vector3(0, 0, -128), '120m SNIPER');
  }

  private buildCratePyramid(baseCenter: THREE.Vector3, rows: number): void {
    const crateSize = new THREE.Vector3(0.95, 0.95, 0.95);
    for (let r = 0; r < rows; r++) {
      const count = rows - r;
      const startX = baseCenter.x - ((count - 1) * 1.05) / 2;
      const y = baseCenter.y + 0.95 * 0.5 + r * 1.0;
      for (let c = 0; c < count; c++) {
        const x = startX + c * 1.05;
        this.addDynamicCrate(crateSize, new THREE.Vector3(x, y, baseCenter.z), 0xd97706, 110);
      }
    }
  }

  public update(): void {
    // Synchronize visual Three.js meshes with Rapier dynamic rigid bodies
    for (const obj of this.dynamicObjects) {
      const t = obj.body.translation();
      const r = obj.body.rotation();
      obj.mesh.position.set(t.x, t.y, t.z);
      obj.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  public resetDynamicObjects(): void {
    for (const obj of this.dynamicObjects) {
      obj.body.setTranslation(
        { x: obj.initialPos.x, y: obj.initialPos.y, z: obj.initialPos.z },
        true
      );
      obj.body.setRotation(
        {
          x: obj.initialRot.x,
          y: obj.initialRot.y,
          z: obj.initialRot.z,
          w: obj.initialRot.w,
        },
        true
      );
      obj.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      obj.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      obj.mesh.position.copy(obj.initialPos);
      obj.mesh.quaternion.copy(obj.initialRot);
    }
  }
}
