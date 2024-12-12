"use client";
import { OrbitControls } from "@react-three/drei";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/Addons.js";
import { Suspense, useState, useEffect } from "react";
import { Object3D, Object3DEventMap } from 'three'
import Cubelet from "./Cubelet";

const RubiksCube = () => {
  const model = useLoader(GLTFLoader, "/models/Rubiks_Cube.glb");
  // Log the model if it exists
  useEffect(() => {
    if (model) {
        console.log(model);
    }
}, [model]);

const [faces, setFaces] = useState([])

useEffect(() => {
  if (model && model.scene) {
    // Cubelets
    const cubelets: Object3D[] = model.scene.children as Object3D[];

    // IDs for filtering
    const H1_IDs = [15, 16, 21, 10, 22, 23, 2, 3];

    // Filter cubelets based on IDs
    const H1 = cubelets.filter(cubelet => H1_IDs.includes(cubelet.id));

    setFaces(faces.H1)

}
}, [model])
  
  // Cubelets
  // const cubelets:Object3D<Object3DEventMap>[] = model.scene.children;
  
  // const H1_IDs = [15, 16, 21, 10, 22, 23, 2, 3, 5]

  // const [faces, setFaces] = useState[
  //   h1: {children: cubelets.filter(cubelet => H1_IDs.includes(cubelet.id))}
  // ]

  return (
      <Suspense fallback={null}>
        {cubelets.map((cubelet) => <Cubelet key={cubelet.id} cubeletMeshData={cubelet} />)}
        <OrbitControls />
      </Suspense>
  );
};

export default RubiksCube;
