"use client"
import { Canvas } from "@react-three/fiber";
import RubiksCube from "./Components/RubiksCube";

export default function Home() {
  return (
    <div style={{ height: "100vh" }}>
      <Canvas style={{backgroundColor: "#aaa"}}>
        <ambientLight intensity={1} />
        <pointLight position={[3, 3, 5]} intensity={20} />
        <pointLight position={[-3, -3, 5]} intensity={20} />
        <RubiksCube />
      </Canvas>
    </div>
  );
}
