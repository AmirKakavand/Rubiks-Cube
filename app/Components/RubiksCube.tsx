"use client";
import { OrbitControls } from "@react-three/drei";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/Addons.js";
import { Suspense, useState, useEffect } from "react";
import { Object3D, Object3DEventMap } from "three";
import Cubelet from "./Cubelet";

const RubiksCube = () => {
  const model = useLoader(GLTFLoader, "/models/Rubiks_Cube.glb");
  // Log the model if it exists
  useEffect(() => {
    if (model) {
      // console.log(model);
    }
  }, [model]);

  // let cubelets: Object3D[] = [];
  const [cubelets, setCubelets] = useState<Object3D[]>([])

  const [faces, setFaces] = useState<Object3D[]>([]);

  useEffect(() => {
    if (model && model.scene) {
      // Cubelets
      // cubelets = model.scene.children as Object3D[];
      setCubelets(model.scene.children as Object3D[])
      // console.log(cubelets);

      // IDs for filtering
      const H1_IDs = [15, 16, 21, 10, 22, 23, 2, 3];

      // Filter cubelets based on IDs
      const H1 = cubelets && cubelets.filter((cubelet) => H1_IDs.includes(cubelet.id));

      // setFaces(faces.push(H1))
      setFaces(prevFaces => {
        const updatedFaces = [...prevFaces, ...H1]; // Combine previous faces with new ones
        console.log("Updated faces:", H1); // Log the updated faces state
        return updatedFaces; // Return the new state
      });
    }
  }, [model]);

  return (
    <Suspense fallback={null}>
      {cubelets && cubelets.map((cubelet) => (
        <Cubelet key={cubelet.id} cubeletMeshData={cubelet} />
      ))}
      <OrbitControls />
    </Suspense>
  );
};

export default RubiksCube;
