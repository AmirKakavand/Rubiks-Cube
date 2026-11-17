"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useFrame, useLoader, useThree, ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/Addons.js";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

export type Axis = "x" | "y" | "z";

export interface Move {
  axis: Axis;
  layer: -1 | 0 | 1;
  dir: 1 | -1; // 1 = +90 deg, -1 = -90 deg
  notation: string;
}

interface RubiksCubeProps {
  moveQueue: Move[];
  onMoveComplete: (completedMove: Move) => void;
  onQueueMove: (move: Move) => void;
  onCubeStateChange: (isSolved: boolean) => void;
  onSnapFeedback?: (isScrambleMove: boolean) => void;
  isScrambling?: boolean;
}

interface CubeletRecord {
  object: THREE.Object3D;
  initialPos: THREE.Vector3;
  initialQuat: THREE.Quaternion;
  logicalGrid: THREE.Vector3; // (-1, 0, 1) coordinates
}

const AXES_VECTORS: Record<Axis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

export function moveToNotation(axis: Axis, layer: -1 | 0 | 1, dir: 1 | -1): string {
  if (axis === "y" && layer === 1) return dir === -1 ? "U" : "U'";
  if (axis === "y" && layer === -1) return dir === 1 ? "D" : "D'";
  if (axis === "x" && layer === 1) return dir === -1 ? "R" : "R'";
  if (axis === "x" && layer === -1) return dir === 1 ? "L" : "L'";
  if (axis === "z" && layer === 1) return dir === -1 ? "F" : "F'";
  if (axis === "z" && layer === -1) return dir === 1 ? "B" : "B'";
  return `${axis.toUpperCase()}${layer}${dir > 0 ? "+" : "-"}`;
}

/**
 * Tactile magnetic-detent easing curve:
 * Accelerates briskly, slightly overshoots 1.0 (~4%), and snaps back firmly into place.
 */
function tactileSnapEase(t: number): number {
  if (t >= 1) return 1;
  const c1 = 1.45;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

const RubiksCube: React.FC<RubiksCubeProps> = ({
  moveQueue,
  onMoveComplete,
  onQueueMove,
  onCubeStateChange,
  onSnapFeedback,
  isScrambling = false,
}) => {
  const modelPath =
    process.env.NODE_ENV === "production"
      ? "/Rubiks-Cube/models/Rubiks_Cube.glb"
      : "/models/Rubiks_Cube.glb";

  const gltf = useLoader(GLTFLoader, modelPath);
  const { camera, size } = useThree();

  const rootGroupRef = useRef<THREE.Group>(null);
  const pivotGroupRef = useRef<THREE.Group>(null);
  const orbitRef = useRef<OrbitControlsImpl>(null);

  const cubeletsRef = useRef<CubeletRecord[]>([]);
  const [ready, setReady] = useState(false);
  const hasFramedCameraRef = useRef(false);

  // Sync props into refs for 60fps access without stale closures
  const moveQueueRef = useRef<Move[]>(moveQueue);
  moveQueueRef.current = moveQueue;

  const onMoveCompleteRef = useRef(onMoveComplete);
  onMoveCompleteRef.current = onMoveComplete;

  const onQueueMoveRef = useRef(onQueueMove);
  onQueueMoveRef.current = onQueueMove;

  const onCubeStateChangeRef = useRef(onCubeStateChange);
  onCubeStateChangeRef.current = onCubeStateChange;

  const onSnapFeedbackRef = useRef(onSnapFeedback);
  onSnapFeedbackRef.current = onSnapFeedback;

  const isScramblingRef = useRef(isScrambling);
  isScramblingRef.current = isScrambling;

  // Synchronous gesture lock + cooldown to prevent double-rotations on fast touchscreens
  const gestureLockRef = useRef(false);
  const lastMoveTimestampRef = useRef(0);

  // Active animation state
  const activeAnimRef = useRef<{
    move: Move;
    progress: number;
    targetAngle: number;
    selected: CubeletRecord[];
    snapTriggered: boolean;
  } | null>(null);

  // Screen-space + 3D pointer drag state
  const dragStateRef = useRef<{
    active: boolean;
    pointerId: number;
    startScreen: THREE.Vector2;
    normal: THREE.Vector3;
    gridPos: THREE.Vector3;
    hitPoint: THREE.Vector3;
  } | null>(null);

  // Automatically frame camera distance based on viewport aspect ratio (fixes huge mobile zoom)
  useEffect(() => {
    if (hasFramedCameraRef.current) return;
    const aspect = size.width / Math.max(1, size.height);
    // Base direction from origin
    const baseDir = new THREE.Vector3(5.6, 4.8, 6.4).normalize();
    // On narrow portrait screens (aspect ~0.46), pull camera back so horizontal FOV comfortably fits the cube
    const distance = aspect < 1 ? THREE.MathUtils.clamp(8.6 / Math.pow(aspect, 0.65), 10.5, 16.5) : 9.6;
    camera.position.copy(baseDir.multiplyScalar(distance));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    hasFramedCameraRef.current = true;
  }, [size.width, size.height, camera]);

  // Initialize and normalize the loaded GLB model on mount
  useEffect(() => {
    if (!gltf || !gltf.scene || !rootGroupRef.current) return;

    const clonedScene = gltf.scene.clone(true);

    const overallBox = new THREE.Box3().setFromObject(clonedScene);
    const overallCenter = new THREE.Vector3();
    const overallSize = new THREE.Vector3();
    overallBox.getCenter(overallCenter);
    overallBox.getSize(overallSize);

    const maxDim = Math.max(overallSize.x, overallSize.y, overallSize.z) || 1;
    const targetScale = 3.2 / maxDim;

    while (rootGroupRef.current.children.length > 0) {
      rootGroupRef.current.remove(rootGroupRef.current.children[0]);
    }

    const records: CubeletRecord[] = [];
    const rawChildren = [...clonedScene.children];
    const step = 3.2 / 3;

    rawChildren.forEach((child) => {
      child.traverse((node) => {
        if ((node as THREE.Mesh).isMesh) {
          const mesh = node as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          if (mesh.material) {
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            mats.forEach((m) => {
              if ("roughness" in m) (m as THREE.MeshStandardMaterial).roughness = 0.26;
              if ("metalness" in m) (m as THREE.MeshStandardMaterial).metalness = 0.08;
            });
          }
        }
      });

      child.position.sub(overallCenter).multiplyScalar(targetScale);
      child.scale.multiplyScalar(targetScale);
      child.updateMatrixWorld(true);

      const pieceBox = new THREE.Box3().setFromObject(child);
      const pieceCenter = new THREE.Vector3();
      pieceBox.getCenter(pieceCenter);

      const gx = THREE.MathUtils.clamp(Math.round(pieceCenter.x / step), -1, 1) as -1 | 0 | 1;
      const gy = THREE.MathUtils.clamp(Math.round(pieceCenter.y / step), -1, 1) as -1 | 0 | 1;
      const gz = THREE.MathUtils.clamp(Math.round(pieceCenter.z / step), -1, 1) as -1 | 0 | 1;

      rootGroupRef.current!.add(child);

      records.push({
        object: child,
        initialPos: child.position.clone(),
        initialQuat: child.quaternion.clone(),
        logicalGrid: new THREE.Vector3(gx, gy, gz),
      });
    });

    cubeletsRef.current = records;
    setReady(true);
    onCubeStateChangeRef.current(true);
  }, [gltf]);

  // Global pointerup/pointercancel safety net
  useEffect(() => {
    const handleGlobalPointerUp = () => {
      dragStateRef.current = null;
      if (orbitRef.current) {
        orbitRef.current.enabled = true;
      }
    };

    window.addEventListener("pointerup", handleGlobalPointerUp);
    window.addEventListener("pointercancel", handleGlobalPointerUp);
    return () => {
      window.removeEventListener("pointerup", handleGlobalPointerUp);
      window.removeEventListener("pointercancel", handleGlobalPointerUp);
    };
  }, []);

  // Keyboard controls (U, D, L, R, F, B + Shift for prime)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.repeat) return; // Prevent holding key from firing double turns

      const key = e.key.toUpperCase();
      const inv = e.shiftKey ? -1 : 1;

      const keyMap: Record<string, { axis: Axis; layer: -1 | 0 | 1; baseDir: 1 | -1 }> = {
        U: { axis: "y", layer: 1, baseDir: -1 },
        D: { axis: "y", layer: -1, baseDir: 1 },
        R: { axis: "x", layer: 1, baseDir: -1 },
        L: { axis: "x", layer: -1, baseDir: 1 },
        F: { axis: "z", layer: 1, baseDir: -1 },
        B: { axis: "z", layer: -1, baseDir: 1 },
      };

      const mapped = keyMap[key];
      if (mapped) {
        const dir = (mapped.baseDir * inv) as 1 | -1;
        onQueueMoveRef.current({
          axis: mapped.axis,
          layer: mapped.layer,
          dir,
          notation: moveToNotation(mapped.axis, mapped.layer, dir),
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Check if all cubelets match their initial position & orientation
  const checkIfSolved = useCallback(() => {
    const step = 3.2 / 3;
    for (const rec of cubeletsRef.current) {
      if (rec.initialPos.lengthSq() < 0.01) continue;
      if (rec.object.position.distanceTo(rec.initialPos) > step * 0.25) {
        return false;
      }
      if (rec.object.quaternion.angleTo(rec.initialQuat) > 0.15) {
        return false;
      }
    }
    return true;
  }, []);

  // 60fps animation loop with tactile magnetic detent snap
  useFrame((_, delta) => {
    if (!ready || !rootGroupRef.current || !pivotGroupRef.current) return;

    const queue = moveQueueRef.current;

    if (!activeAnimRef.current && queue.length > 0) {
      const nextMove = queue[0];
      const selected = cubeletsRef.current.filter(
        (rec) => Math.round(rec.logicalGrid[nextMove.axis]) === nextMove.layer
      );

      pivotGroupRef.current.rotation.set(0, 0, 0);
      pivotGroupRef.current.updateMatrixWorld(true);

      selected.forEach((rec) => {
        pivotGroupRef.current!.attach(rec.object);
      });

      activeAnimRef.current = {
        move: nextMove,
        progress: 0,
        targetAngle: (Math.PI / 2) * nextMove.dir,
        selected,
        snapTriggered: false,
      };
    }

    const anim = activeAnimRef.current;
    if (anim) {
      const isFastScramble = queue.length > 2;
      const speed = isFastScramble ? 12.5 : 6.4;
      anim.progress = Math.min(1, anim.progress + delta * speed);

      // Use snappy overshoot curve on user turns, smooth ease-out during rapid scramble
      const eased = isFastScramble
        ? 1 - Math.pow(1 - anim.progress, 3)
        : tactileSnapEase(anim.progress);

      pivotGroupRef.current.rotation[anim.move.axis] = anim.targetAngle * eased;
      pivotGroupRef.current.updateMatrixWorld(true);

      // Trigger haptic + mechanical click right as the slice crosses the 90-degree detent (~82%)
      if (!anim.snapTriggered && anim.progress >= 0.82) {
        anim.snapTriggered = true;
        onSnapFeedbackRef.current?.(isScramblingRef.current);
      }

      if (anim.progress >= 1) {
        pivotGroupRef.current.rotation[anim.move.axis] = anim.targetAngle;
        pivotGroupRef.current.updateMatrixWorld(true);

        const step = 3.2 / 3;
        const rotQuat = new THREE.Quaternion().setFromAxisAngle(
          AXES_VECTORS[anim.move.axis],
          anim.targetAngle
        );

        anim.selected.forEach((rec) => {
          rootGroupRef.current!.attach(rec.object);

          rec.object.position.set(
            Math.round(rec.object.position.x / step) * step,
            Math.round(rec.object.position.y / step) * step,
            Math.round(rec.object.position.z / step) * step
          );

          rec.logicalGrid.applyQuaternion(rotQuat);
          rec.logicalGrid.set(
            THREE.MathUtils.clamp(Math.round(rec.logicalGrid.x), -1, 1),
            THREE.MathUtils.clamp(Math.round(rec.logicalGrid.y), -1, 1),
            THREE.MathUtils.clamp(Math.round(rec.logicalGrid.z), -1, 1)
          );
        });

        pivotGroupRef.current.rotation.set(0, 0, 0);
        const completed = anim.move;
        activeAnimRef.current = null;
        gestureLockRef.current = false;
        lastMoveTimestampRef.current = performance.now();

        onCubeStateChangeRef.current(checkIfSolved());
        onMoveCompleteRef.current(completed);
      }
    }
  });

  // Project a 3D direction at `origin` into 2D screen pixels
  const projectDirectionToScreen = (origin: THREE.Vector3, dir3D: THREE.Vector3) => {
    const p1 = origin.clone().project(camera);
    const p2 = origin.clone().add(dir3D).project(camera);
    return new THREE.Vector2(
      ((p2.x - p1.x) * size.width) / 2,
      (-(p2.y - p1.y) * size.height) / 2
    );
  };

  // Start touch/mouse drag on a cube face
  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    // Ignore secondary touches (pinch-to-zoom) or locked animations
    if (!e.isPrimary) return;
    if (gestureLockRef.current || activeAnimRef.current || moveQueueRef.current.length > 0) return;
    if (performance.now() - lastMoveTimestampRef.current < 120) return;
    if (!e.face) return;

    e.stopPropagation();

    let clickedObj: THREE.Object3D | null = e.object;
    let matchedRecord: CubeletRecord | undefined;
    while (clickedObj) {
      matchedRecord = cubeletsRef.current.find((r) => r.object === clickedObj);
      if (matchedRecord) break;
      clickedObj = clickedObj.parent;
    }

    if (!matchedRecord) return;

    const worldNormal = e.face.normal
      .clone()
      .transformDirection(e.object.matrixWorld)
      .normalize();

    const absX = Math.abs(worldNormal.x);
    const absY = Math.abs(worldNormal.y);
    const absZ = Math.abs(worldNormal.z);
    const snappedNormal = new THREE.Vector3();
    if (absX >= absY && absX >= absZ) snappedNormal.set(Math.sign(worldNormal.x), 0, 0);
    else if (absY >= absX && absY >= absZ) snappedNormal.set(0, Math.sign(worldNormal.y), 0);
    else snappedNormal.set(0, 0, Math.sign(worldNormal.z));

    dragStateRef.current = {
      active: true,
      pointerId: e.pointerId,
      startScreen: new THREE.Vector2(e.clientX, e.clientY),
      normal: snappedNormal,
      gridPos: matchedRecord.logicalGrid.clone(),
      hitPoint: e.point.clone(),
    };

    if (orbitRef.current) {
      orbitRef.current.enabled = false;
    }
  };

  // Screen-space swipe matching with synchronous lock so one swipe never queues twice
  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    const drag = dragStateRef.current;
    if (!drag || !drag.active || e.pointerId !== drag.pointerId) return;
    if (gestureLockRef.current) return;

    e.stopPropagation();

    const screenDelta = new THREE.Vector2(
      e.clientX - drag.startScreen.x,
      e.clientY - drag.startScreen.y
    );

    if (screenDelta.length() < 22) return;

    // Immediately lock gesture synchronously before React renders
    gestureLockRef.current = true;
    dragStateRef.current = null;
    if (orbitRef.current) orbitRef.current.enabled = true;

    const swipeNorm = screenDelta.clone().normalize();

    const tangentAxes: Axis[] = (["x", "y", "z"] as Axis[]).filter(
      (ax) => Math.abs(drag.normal[ax]) < 0.5
    );

    let bestAxis: Axis = tangentAxes[0];
    let bestSign: 1 | -1 = 1;
    let bestAlignment = -1;

    for (const ax of tangentAxes) {
      const worldDir = AXES_VECTORS[ax];
      const screenDir = projectDirectionToScreen(drag.hitPoint, worldDir);
      if (screenDir.lengthSq() < 1e-4) continue;
      screenDir.normalize();

      const dot = swipeNorm.dot(screenDir);
      if (Math.abs(dot) > bestAlignment) {
        bestAlignment = Math.abs(dot);
        bestAxis = ax;
        bestSign = dot >= 0 ? 1 : -1;
      }
    }

    const swipeDir3D = AXES_VECTORS[bestAxis].clone().multiplyScalar(bestSign);
    const rotAxisVec = new THREE.Vector3().crossVectors(drag.normal, swipeDir3D);
    if (rotAxisVec.lengthSq() < 0.5) {
      gestureLockRef.current = false;
      return;
    }

    let rotAxis: Axis = "y";
    let rotDir: 1 | -1 = 1;

    if (Math.abs(rotAxisVec.x) > 0.5) {
      rotAxis = "x";
      rotDir = Math.sign(rotAxisVec.x) as 1 | -1;
    } else if (Math.abs(rotAxisVec.y) > 0.5) {
      rotAxis = "y";
      rotDir = Math.sign(rotAxisVec.y) as 1 | -1;
    } else {
      rotAxis = "z";
      rotDir = Math.sign(rotAxisVec.z) as 1 | -1;
    }

    const layer = THREE.MathUtils.clamp(Math.round(drag.gridPos[rotAxis]), -1, 1) as -1 | 0 | 1;

    onQueueMoveRef.current({
      axis: rotAxis,
      layer,
      dir: rotDir,
      notation: moveToNotation(rotAxis, layer, rotDir),
    });
  };

  const releaseDrag = () => {
    dragStateRef.current = null;
    if (orbitRef.current) {
      orbitRef.current.enabled = true;
    }
  };

  const isPortrait = size.width < size.height;

  return (
    <>
      <group
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={releaseDrag}
        onPointerCancel={releaseDrag}
      >
        <group ref={rootGroupRef} />
        <group ref={pivotGroupRef} />
      </group>

      <OrbitControls
        ref={orbitRef}
        enablePan={false}
        minDistance={isPortrait ? 7.5 : 5.5}
        maxDistance={isPortrait ? 18 : 14}
        dampingFactor={0.08}
        enableDamping
        rotateSpeed={0.85}
      />
    </>
  );
};

export default RubiksCube;