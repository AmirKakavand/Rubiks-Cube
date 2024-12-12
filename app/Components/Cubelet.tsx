import React from 'react'
import { Object3D, Object3DEventMap } from 'three'

interface IProps {
    cubeletMeshData: Object3D<Object3DEventMap>
}

const Cubelet = ({cubeletMeshData}: IProps) => {
  return (
    <primitive
          object={cubeletMeshData}
          position={[0, 0, 0]}
          scale={3}
          rotation={[0, 0, 0]}
        />
  )
}

export default Cubelet